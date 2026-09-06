"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Link2,
  Plug,
  RefreshCw,
  Search,
  Unplug,
} from "lucide-react";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FIRMS } from "@/lib/connectors/firms";

// ---------------------------------------------------------------------------
// Types — mirror the /api/connectors contracts exactly.
// ---------------------------------------------------------------------------

interface BrokerConnection {
  id: string;
  broker: string;
  username: string;
  baseUrl: string;
  externalAccountId: string;
  externalAccountName: string;
  accountId: string;
  accountName: string;
  status: "connected" | "error";
  lastSyncAt: string | null;
  lastError: string | null;
}

interface DiscoveredAccount {
  id: string;
  name: string;
  balance?: number;
  canTrade?: boolean;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!isFinite(then)) return "—";
  const diffMin = Math.round((Date.now() - then) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return formatDateTime(iso);
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-loss/30 bg-loss-muted px-3 py-2">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-loss" />
      <p className="text-sm text-loss">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export function BrokerConnect() {
  const router = useRouter();
  const [connections, setConnections] = React.useState<BrokerConnection[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/connectors");
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setLoadError(json.error ?? "Could not load broker connections.");
        setConnections([]);
        return;
      }
      setConnections(json.connections as BrokerConnection[]);
    } catch {
      setLoadError("Network error while loading connections.");
      setConnections([]);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const refreshAll = React.useCallback(async () => {
    await load();
    router.refresh();
  }, [load, router]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-muted-foreground" />
          Broker API — TopstepX (ProjectX)
        </CardTitle>
        <Badge variant="outline">Sync only</Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Existing connections */}
        <div className="space-y-2">
          <p className="text-2xs uppercase tracking-wide text-muted-foreground">
            Connected accounts
          </p>
          {loadError && <ErrorPanel message={loadError} />}
          {connections === null ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : connections.length === 0 ? (
            !loadError && (
              <EmptyState
                className="rounded-lg border border-dashed border-border py-8"
                icon={<Link2 className="h-5 w-5" />}
                title="No broker connections yet"
                description="Link a TopstepX account below to sync fills automatically — no CSV wrangling."
              />
            )
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border bg-surface-raised">
              {connections.map((c) => (
                <ConnectionRow key={c.id} connection={c} onChanged={refreshAll} />
              ))}
            </div>
          )}
        </div>

        <Separator />

        {/* Connect flow */}
        <ConnectFlow onConnected={refreshAll} />

        <p className="text-2xs text-muted-foreground">
          Requires a TopstepX API key (Settings → API in TopstepX). Credentials are
          encrypted at rest. Trades sync automatically on a schedule and on demand —
          no orders are ever placed.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Connection row — sync + disconnect
// ---------------------------------------------------------------------------

function ConnectionRow({
  connection,
  onChanged,
}: {
  connection: BrokerConnection;
  onChanged: () => Promise<void>;
}) {
  const [syncing, setSyncing] = React.useState(false);
  const [syncResult, setSyncResult] = React.useState<string | null>(null);
  const [syncError, setSyncError] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const [removeError, setRemoveError] = React.useState<string | null>(null);

  async function onSync() {
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);
    try {
      const res = await fetch("/api/connectors/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: connection.id }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setSyncError(json.error ?? "Sync failed.");
        return;
      }
      setSyncResult(`+${json.imported} trades imported`);
      await onChanged();
    } catch {
      setSyncError("Network error during sync.");
    } finally {
      setSyncing(false);
    }
  }

  async function onDisconnect() {
    setRemoving(true);
    setRemoveError(null);
    try {
      const res = await fetch("/api/connectors", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: connection.id }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setRemoveError(json.error ?? "Could not disconnect.");
        return;
      }
      setConfirmOpen(false);
      await onChanged();
    } catch {
      setRemoveError("Network error. Please try again.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3",
        connection.status === "error" && "bg-loss-muted/40"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{connection.externalAccountName}</p>
          <Badge variant={connection.status === "connected" ? "profit" : "loss"}>
            {connection.status === "connected" ? "Connected" : "Sync error"}
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-2xs text-muted-foreground">
          → {connection.accountName} · Last sync{" "}
          <span className="tabular">
            {connection.lastSyncAt ? relativeTime(connection.lastSyncAt) : "never"}
          </span>
        </p>
        {/* Failures stay fully readable — never truncated, never buried. */}
        {connection.status === "error" && connection.lastError && (
          <p className="mt-1 flex items-start gap-1 text-2xs text-loss">
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
            <span>{connection.lastError}</span>
          </p>
        )}
        {syncResult && (
          <p className="mt-0.5 flex items-center gap-1 text-2xs text-profit">
            <CheckCircle2 className="h-3 w-3" /> {syncResult}
          </p>
        )}
        {syncError && (
          <p className="mt-1 flex items-start gap-1 text-2xs text-loss">
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
            <span>{syncError}</span>
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onSync}
          disabled={syncing}
          className="gap-1.5"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
          {syncing ? "Syncing…" : "Sync now"}
        </Button>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
              <Unplug className="h-3.5 w-3.5" /> Disconnect
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Disconnect {connection.externalAccountName}?</DialogTitle>
              <DialogDescription>
                This removes the API link only. The linked account “
                {connection.accountName}” and every imported trade stay in your
                journal — nothing is deleted.
              </DialogDescription>
            </DialogHeader>
            {removeError && <ErrorPanel message={removeError} />}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirmOpen(false)}
                disabled={removing}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={onDisconnect} disabled={removing}>
                {removing ? "Disconnecting…" : "Disconnect"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connect flow — discover, pick, connect
// ---------------------------------------------------------------------------

function ConnectFlow({ onConnected }: { onConnected: () => Promise<void> }) {
  const [username, setUsername] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  // The firm picks the gateway address server-side — users never type a URL.
  const [firm, setFirm] = React.useState<string>(FIRMS[0].id);
  const [accounts, setAccounts] = React.useState<DiscoveredAccount[] | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [discovering, setDiscovering] = React.useState(false);
  const [connecting, setConnecting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<number | null>(null);

  async function onDiscover(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setAccounts(null);
    setSelectedId(null);
    if (!username.trim() || !apiKey.trim()) {
      setError("Enter your TopstepX username and API key.");
      return;
    }
    setDiscovering(true);
    try {
      const res = await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "discover",
          firm,
          username: username.trim(),
          apiKey,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Could not reach TopstepX with those credentials.");
        return;
      }
      setAccounts(json.accounts as DiscoveredAccount[]);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setDiscovering(false);
    }
  }

  async function onConnect() {
    if (!selectedId || !accounts) return;
    const picked = accounts.find((a) => a.id === selectedId);
    if (!picked) return;
    setError(null);
    setConnecting(true);
    try {
      const res = await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "connect",
          firm,
          username: username.trim(),
          apiKey,
          externalAccountId: picked.id,
          externalAccountName: picked.name,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Connection failed.");
        return;
      }
      setSuccess(json.imported as number);
      // Drop credentials and discovery state — never keep the key around.
      setApiKey("");
      setAccounts(null);
      setSelectedId(null);
      await onConnected();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-2xs uppercase tracking-wide text-muted-foreground">
        Add a connection
      </p>

      {/* Step 1 — credentials */}
      <form onSubmit={onDiscover} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="bc-firm">Firm</Label>
            <Select value={firm} onValueChange={setFirm} disabled={discovering}>
              <SelectTrigger id="bc-firm" aria-label="Firm">
                <SelectValue placeholder="Choose a firm" />
              </SelectTrigger>
              <SelectContent>
                {FIRMS.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bc-username">Username</Label>
            <Input
              id="bc-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. JohnDoe"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bc-apikey">API key</Label>
            <Input
              id="bc-apikey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="••••••••••••"
              autoComplete="off"
            />
          </div>
        </div>
        <Button type="submit" variant="secondary" disabled={discovering} className="gap-1.5">
          {discovering ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {discovering ? "Checking credentials…" : "Find accounts"}
        </Button>
      </form>

      {error && <ErrorPanel message={error} />}

      {/* Step 2 — pick an account */}
      {accounts && accounts.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Credentials check out, but no broker accounts were returned.
        </p>
      )}
      {accounts && accounts.length > 0 && (
        <div className="space-y-3">
          <p className="text-2xs uppercase tracking-wide text-muted-foreground">
            Pick an account to link
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {accounts.map((a) => {
              const selected = a.id === selectedId;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                    selected
                      ? "border-primary bg-primary/10"
                      : "border-border bg-surface-raised hover:border-primary/50"
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{a.name}</p>
                    {a.canTrade === false && (
                      <p className="text-2xs text-muted-foreground">Read-only</p>
                    )}
                  </div>
                  {typeof a.balance === "number" && (
                    <span className="tabular shrink-0 text-sm text-muted-foreground">
                      {formatCurrency(a.balance)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <Button onClick={onConnect} disabled={!selectedId || connecting} className="gap-1.5">
            {connecting ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
            {connecting ? "Connecting…" : "Connect & import"}
          </Button>
        </div>
      )}

      {/* Success panel */}
      {success !== null && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-profit" />
          <p className="text-sm font-medium">
            Connected. <span className="tabular text-profit">{success}</span> trades
            imported.
          </p>
        </div>
      )}
    </div>
  );
}
