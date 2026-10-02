"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Link2,
  Loader2,
  Plug,
  RefreshCw,
  Search,
  ShieldCheck,
  Unplug,
  WifiOff,
} from "lucide-react";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";
import { useTimeZone } from "@/components/time-zone-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Hint } from "@/components/hint";
import { formatAsAt } from "@/lib/live/format";
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
  // Near-live (read-only positions and balance)
  nearLive: boolean;
  lastBalance: number | null;
  lastLiveAt: string | null;
  lastLiveError: string | null;
  liveHealth: "live" | "stale" | "waiting" | "rejected" | "off";
}

const DEMO_LINE = "The demo desk is look-around only. Create a free account to save your own.";

interface DiscoveredAccount {
  id: string;
  name: string;
  balance?: number;
  canTrade?: boolean;
}

function relativeTime(iso: string, timeZone: string): string {
  const then = new Date(iso).getTime();
  if (!isFinite(then)) return "—";
  const diffMin = Math.round((Date.now() - then) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return formatDateTime(iso, timeZone);
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
  // "Reconnect" on a rejected key fills the form below and focuses the key field.
  const [reconnect, setReconnect] = React.useState<{ username: string; nonce: number } | null>(
    null
  );

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
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-4 w-4 text-muted-foreground" />
            Broker API — TopstepX (ProjectX)
          </CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            A read-only link: TradeOS pulls your filled trades, open positions and balance
            in. It can never place, change or cancel an order, and it can never move money.
          </p>
        </div>
        <Hint label="TradeOS only reads fills, open positions and your balance. It never places, changes or cancels an order.">
          <span tabIndex={0} className="inline-flex shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Badge variant="outline">Read-only</Badge>
          </span>
        </Hint>
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
              <Skeleton className="h-[116px] w-full md:h-14" />
              <Skeleton className="h-[116px] w-full md:h-14" />
            </div>
          ) : connections.length === 0 ? (
            !loadError && (
              <EmptyState
                className="rounded-lg border border-dashed border-border py-8"
                icon={<Link2 className="h-5 w-5" />}
                title="No broker connections yet"
                description="Link a TopstepX account below and your fills, open positions and balance come in read-only. Warnings can then show up within a minute."
              />
            )
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border bg-surface-raised">
              {connections.map((c) => (
                <ConnectionRow
                  key={c.id}
                  connection={c}
                  onChanged={refreshAll}
                  onReconnect={() =>
                    setReconnect({ username: c.username, nonce: Date.now() })
                  }
                />
              ))}
            </div>
          )}
        </div>

        <Separator />

        {/* Connect flow */}
        <ConnectFlow onConnected={refreshAll} reconnect={reconnect} />

        <p className="text-2xs text-muted-foreground">
          Requires a TopstepX API key (Settings → API in TopstepX) — never your broker
          password. The key is encrypted at rest and only ever used to read: fills sync
          every 30 minutes and on demand, and with Near-live updates on, positions and
          balance are read about every minute. No order is ever placed. Disconnect any
          time; your imported trades stay in your journal.
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
  onReconnect,
}: {
  connection: BrokerConnection;
  onChanged: () => Promise<void>;
  onReconnect: () => void;
}) {
  const timeZone = useTimeZone();
  const [syncing, setSyncing] = React.useState(false);
  const [syncResult, setSyncResult] = React.useState<string | null>(null);
  const [syncError, setSyncError] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const [removeError, setRemoveError] = React.useState<string | null>(null);
  const [switching, setSwitching] = React.useState(false);
  const [switchError, setSwitchError] = React.useState<string | null>(null);
  const [switchResult, setSwitchResult] = React.useState<string | null>(null);
  const [demoLine, setDemoLine] = React.useState(false);
  const rejected = connection.liveHealth === "rejected";

  async function onToggleNearLive(next: boolean) {
    setSwitching(true);
    setSwitchError(null);
    setSwitchResult(null);
    setDemoLine(false);
    try {
      const res = await fetch("/api/connectors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: connection.id, nearLive: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        if (json?.code === "demo") setDemoLine(true);
        else setSwitchError("Couldn't change that. Check your connection and try again.");
        return;
      }
      setSwitchResult(
        next
          ? "Near-live updates are on. Checking about every minute."
          : "Near-live updates are off. Trades still sync every 30 minutes. Updates stop at the next check."
      );
      await onChanged();
    } catch {
      setSwitchError("Couldn't change that. Check your connection and try again.");
    } finally {
      setSwitching(false);
    }
  }

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
          {rejected ? (
            <Badge variant="loss">Key rejected</Badge>
          ) : (
            <Badge variant={connection.status === "connected" ? "profit" : "loss"}>
              {connection.status === "connected" ? "Connected" : "Sync error"}
            </Badge>
          )}
        </div>
        <p className="mt-0.5 truncate text-2xs text-muted-foreground">
          → {connection.accountName} · Last sync{" "}
          <span className="tabular">
            {connection.lastSyncAt ? relativeTime(connection.lastSyncAt, timeZone) : "never"}
          </span>
        </p>
        <LiveLine connection={connection} timeZone={timeZone} />
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

        {/* Near-live switch: one line of words, the switch at the reading end. */}
        <div className="mt-2 flex min-h-[52px] items-center justify-between gap-3 md:min-h-9">
          <Hint
            label={
              rejected
                ? "Reconnect first. Live updates stay off until TradeOS has a working key."
                : "Turn this off if you only want your fills synced every 30 minutes. Positions and open-loss warnings won't update live."
            }
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">Near-live updates</p>
              <p className="text-2xs text-muted-foreground">
                Reads your open positions and balance about every 60 seconds (not faster), so
                warnings can appear within about a minute.
              </p>
            </div>
          </Hint>
          <Switch
            checked={connection.nearLive && !rejected}
            onCheckedChange={onToggleNearLive}
            loading={switching}
            disabled={rejected}
            aria-label={`Near-live updates for ${connection.externalAccountName}`}
          />
        </div>
        {switchResult && (
          <p className="mt-0.5 flex items-center gap-1 text-2xs text-muted-foreground" role="status" aria-live="polite">
            <CheckCircle2 className="h-3 w-3" /> {switchResult}
          </p>
        )}
        {switchError && (
          <p className="mt-1 flex items-start gap-1 text-2xs text-loss">
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
            <span>{switchError}</span>
          </p>
        )}
        {demoLine && (
          <p className="mt-1 text-2xs text-muted-foreground" role="status">
            {DEMO_LINE}{" "}
            <Link href="/register" className="text-primary underline underline-offset-2">
              Create a free account
            </Link>
          </p>
        )}
      </div>

      <div className="flex w-full shrink-0 items-center gap-2 md:w-auto">
        {rejected && (
          <Button variant="secondary" size="sm" onClick={onReconnect} className="h-11 md:h-8">
            Reconnect
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={onSync}
          disabled={syncing}
          className="h-11 gap-1.5 md:h-8"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
          {syncing ? "Syncing…" : "Sync now"}
        </Button>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-11 gap-1.5 text-muted-foreground md:h-8">
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

// The live status line under each connection: fresh, waiting, unreachable,
// key rejected, or off. Colour is always paired with an icon and words.
function LiveLine({
  connection: c,
  timeZone,
}: {
  connection: BrokerConnection;
  timeZone: string;
}) {
  const balance =
    c.lastBalance != null ? (
      <span className="tabular text-muted-foreground"> · Balance {formatCurrency(c.lastBalance)}</span>
    ) : null;
  const at = c.lastLiveAt ? formatAsAt(c.lastLiveAt, timeZone) : null;
  if (c.liveHealth === "rejected") {
    return (
      <p className="mt-1 flex items-start gap-1 text-2xs text-loss">
        <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
        <span>TopstepX rejected this key. Reconnect to resume.</span>
      </p>
    );
  }
  if (!c.nearLive || c.liveHealth === "off") {
    return (
      <p className="mt-1 text-2xs text-muted-foreground">
        Near-live updates are off. Trades still sync every 30 minutes. Last sync{" "}
        <span className="tabular">
          {c.lastSyncAt ? formatAsAt(c.lastSyncAt, timeZone) : "never"}
        </span>
        .
      </p>
    );
  }
  if (c.liveHealth === "waiting") {
    return (
      <p className="mt-1 flex items-center gap-1 text-2xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Live: waiting for the first update…
      </p>
    );
  }
  if (c.liveHealth === "stale") {
    return (
      <p className="mt-1 flex items-start gap-1 text-2xs tabular text-warning">
        <WifiOff className="mt-px h-3 w-3 shrink-0" />
        <span>
          Can&apos;t reach TopstepX.{at ? ` Last updated ${at}.` : ""}
          {balance}
        </span>
      </p>
    );
  }
  return (
    <p className="mt-1 flex items-start gap-1 text-2xs tabular">
      <CheckCircle2 className="mt-px h-3 w-3 shrink-0" />
      <span>
        Live: checking every minute. Last updated {at ?? "just now"}
        {balance}
      </span>
    </p>
  );
}

// ---------------------------------------------------------------------------
// Connect flow — discover, pick, connect
// ---------------------------------------------------------------------------

function ConnectFlow({
  onConnected,
  reconnect,
}: {
  onConnected: () => Promise<void>;
  reconnect: { username: string; nonce: number } | null;
}) {
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
  const keyRef = React.useRef<HTMLInputElement>(null);
  const formRef = React.useRef<HTMLDivElement>(null);
  const [reconnectNote, setReconnectNote] = React.useState(false);

  // "Reconnect" on a rejected key: fill the username, scroll here, focus the key field.
  React.useEffect(() => {
    if (!reconnect) return;
    setUsername(reconnect.username);
    setReconnectNote(true);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    keyRef.current?.focus();
  }, [reconnect]);

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
    <div ref={formRef} className="space-y-4">
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
              ref={keyRef}
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="••••••••••••"
              autoComplete="off"
            />
          </div>
        </div>
        {reconnectNote && (
          <p className="text-xs text-muted-foreground">
            Paste a fresh key from TopstepX. Live updates for this account stay off until you
            reconnect.
          </p>
        )}
        {/* Said plainly, before anything is pressed: this is a notice, never a blocker. */}
        <div className="flex items-start gap-2 rounded-md border border-border bg-surface-raised px-3 py-2">
          <Hint label="Topstep's API keys can't be limited to reading. TradeOS has no order feature at all, and a test proves it.">
            <span tabIndex={0} className="mt-0.5 inline-flex rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </span>
          </Hint>
          <p className="text-xs text-foreground">
            This key can also place orders on TopstepX. TradeOS only reads your positions, fills
            and balance. It never places, changes or cancels an order. You can revoke the key on
            TopstepX at any time.
          </p>
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
      {success !== null && (
        <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
          Near-live updates are on. You can turn them off here any time.
        </p>
      )}
    </div>
  );
}
