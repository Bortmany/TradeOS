"use client";

// The MT5 live link card (Import page). Only rendered when the owner has switched
// MT5 on (the page decides on the server; while off there is no card at all).
// Accepts the READ-ONLY investor password only: the server checks the account
// afterwards and refuses a trading password. The password goes straight to the
// server, is never kept in this component after a refusal, and never shown again.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronDown, Plug, RefreshCw, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Hint } from "@/components/hint";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NEW_ACCOUNT = "__new__";

const DEMO_LINE = "The demo desk is look-around only. Create a free account to save your own.";

interface Props {
  /** Pro or Elite with an active subscription (decided on the server). */
  planAllowed: boolean;
  /** MT5 links this trader has now, and the most they may have. */
  count: number;
  max: number;
  /** The trader's own US-dollar accounts the link can attach to (not linked to a broker yet). */
  accounts: { id: string; name: string }[];
}

function ErrorPanel({ message, extra }: { message: string; extra?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-loss/30 bg-loss-muted px-3 py-2" role="alert">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-loss" />
      <div>
        <p className="text-sm text-loss">{message}</p>
        {extra && <p className="text-xs text-loss">{extra}</p>}
      </div>
    </div>
  );
}

export function Mt5LiveCard({ planAllowed, count, max, accounts }: Props) {
  const router = useRouter();
  const [server, setServer] = React.useState("");
  const [login, setLogin] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [touched, setTouched] = React.useState({ server: false, login: false, password: false });
  const [step, setStep] = React.useState<0 | 1 | 2>(0); // 0 idle, 1 connecting, 2 checking read-only
  const [error, setError] = React.useState<{ message: string; extra?: string } | null>(null);
  const [success, setSuccess] = React.useState(false);
  const [whyOpen, setWhyOpen] = React.useState(false);
  const [linked, setLinked] = React.useState(count);
  const [target, setTarget] = React.useState<string>(NEW_ACCOUNT);
  const [notes, setNotes] = React.useState<string[]>([]);
  const [usedIds, setUsedIds] = React.useState<string[]>([]);
  const choices = accounts.filter((a) => !usedIds.includes(a.id));
  const pwRef = React.useRef<HTMLInputElement>(null);

  const atLimit = linked >= max;
  const busy = step !== 0;
  const locked = !planAllowed || atLimit;

  const errors = {
    server: server.trim() ? null : "Enter your server name.",
    login: /^\d{1,12}$/.test(login.trim()) ? null : "Enter your MT5 login number (digits only).",
    password: password ? null : "Enter your investor password.",
  };
  const touch = (k: keyof typeof touched) => setTouched((t) => ({ ...t, [k]: true }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ server: true, login: true, password: true });
    setError(null);
    setSuccess(false);
    setNotes([]);
    if (errors.server || errors.login || errors.password) return;

    setStep(1);
    const timer = setTimeout(() => setStep(2), 4000); // the server does both steps in one request
    try {
      const res = await fetch("/api/connectors/mt5", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          server: server.trim(),
          login: login.trim(),
          password,
          ...(target !== NEW_ACCOUNT ? { accountId: target } : {}),
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        code?: string;
        clearPassword?: boolean;
        notes?: string[];
      };
      if (!res.ok || !json.ok) {
        if (json.code === "demo") {
          setError({ message: DEMO_LINE });
        } else if (json.code === "trading_rights" || json.clearPassword) {
          setError({
            message: "That is a trading password. Please connect with the investor password instead.",
            extra: "We removed it straight away and saved nothing.",
          });
          setPassword("");
          pwRef.current?.focus();
        } else {
          setError({ message: json.error ?? "Connection failed." });
        }
        return;
      }
      setPassword("");
      setServer("");
      setLogin("");
      setTouched({ server: false, login: false, password: false });
      setSuccess(true);
      setNotes(Array.isArray(json.notes) ? json.notes : []);
      if (target !== NEW_ACCOUNT) setUsedIds((ids) => [...ids, target]);
      setTarget(NEW_ACCOUNT);
      setLinked((n) => n + 1);
      window.dispatchEvent(new Event("tradeos:connections-changed"));
      router.refresh();
    } catch {
      setError({ message: "We couldn't reach our MT5 bridge. Try again in a minute." });
    } finally {
      clearTimeout(timer);
      setStep(0);
    }
  }

  const fieldClass = (bad: boolean) => cn("h-11 text-base md:h-9 md:text-sm", bad && "border-loss");

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-4 w-4 text-muted-foreground" />
            MT5 live link
          </CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Link a MetaTrader 5 account read-only, so your open positions, balance and warnings
            update like TopstepX. Up to {max} MT5 accounts.
          </p>
        </div>
        <Hint label="Investor password only. TradeOS only reads fills, open positions and your balance. It never places, changes or cancels an order.">
          <span tabIndex={0} className="inline-flex shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Badge variant="outline">Read-only</Badge>
          </span>
        </Hint>
      </CardHeader>
      <CardContent className="space-y-4">
        {!planAllowed ? (
          <div className="space-y-2">
            <p className="text-sm">MT5 live links are on paid plans.</p>
            <Link href="/settings/billing" className="text-sm text-primary underline underline-offset-2">
              See plans
            </Link>
            <div>
              <Hint label="Available on paid plans" wrap>
                <Button type="button" variant="secondary" disabled className="h-11 w-full md:h-9 md:w-auto">
                  Connect MT5
                </Button>
              </Hint>
            </div>
          </div>
        ) : atLimit ? (
          <div className="space-y-2">
            <p className="text-sm">
              You&apos;ve linked {max} MT5 accounts, the most your plan allows. Disconnect one to add
              another.
            </p>
            <Hint label="You've reached the most MT5 accounts your plan allows." wrap>
              <Button type="button" variant="secondary" disabled className="h-11 w-full md:h-9 md:w-auto">
                Connect MT5
              </Button>
            </Hint>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3" noValidate>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="mt5-server">Server name</Label>
                <Input
                  id="mt5-server"
                  value={server}
                  onChange={(e) => setServer(e.target.value)}
                  onBlur={() => touch("server")}
                  placeholder="e.g. ICMarketsSC-Live01"
                  autoComplete="off"
                  disabled={busy}
                  aria-invalid={touched.server && !!errors.server}
                  className={fieldClass(touched.server && !!errors.server)}
                />
                {touched.server && errors.server ? (
                  <p className="text-xs text-loss">{errors.server}</p>
                ) : (
                  <p className="text-2xs text-muted-foreground">Shown at the top of your MT5 login window.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mt5-login">MT5 login number</Label>
                <Input
                  id="mt5-login"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  onBlur={() => touch("login")}
                  placeholder="e.g. 51234567"
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={busy}
                  aria-invalid={touched.login && !!errors.login}
                  className={fieldClass(touched.login && !!errors.login)}
                />
                {touched.login && errors.login ? (
                  <p className="text-xs text-loss">{errors.login}</p>
                ) : (
                  <p className="text-2xs text-muted-foreground">The number you sign in to MT5 with.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Hint label="Only the read-only investor password works here.">
                  <Label htmlFor="mt5-password">Investor password</Label>
                </Hint>
                <Input
                  id="mt5-password"
                  ref={pwRef}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => touch("password")}
                  placeholder="••••••••"
                  autoComplete="off"
                  disabled={busy}
                  aria-invalid={touched.password && !!errors.password}
                  className={fieldClass(touched.password && !!errors.password)}
                />
                {touched.password && errors.password && (
                  <p className="text-xs text-loss">{errors.password}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5 sm:max-w-sm">
              <Label htmlFor="mt5-account">Journal account</Label>
              <Select value={target} onValueChange={setTarget} disabled={busy}>
                <SelectTrigger id="mt5-account" className="h-11 md:h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NEW_ACCOUNT}>New account (named after your MT5 login)</SelectItem>
                  {choices.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-2xs text-muted-foreground">
                Already imported this account from an MT5 report file? Pick it here so the same trades are
                never counted twice.
              </p>
            </div>

            <p className="text-xs text-foreground">
              Use your read-only investor password. TradeOS refuses the main trading password. Your
              prop firm can give you the investor password.
            </p>
            <div>
              <button
                type="button"
                onClick={() => setWhyOpen((o) => !o)}
                aria-expanded={whyOpen}
                aria-controls="mt5-why"
                className="inline-flex items-center gap-1 rounded-sm text-xs text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Why only the investor password?
                <ChevronDown className={cn("h-3 w-3 transition-transform", whyOpen && "rotate-180")} />
              </button>
              {whyOpen && (
                <p id="mt5-why" className="mt-1.5 text-xs text-muted-foreground">
                  Your MT5 account has two passwords. The main one can place and close trades. The
                  investor password can only look. TradeOS only accepts the looking one, so TradeOS
                  could never trade for you, even by mistake or if the password leaked. Your broker
                  or prop firm gives you the investor password, often in the account email.
                </p>
              )}
            </div>

            <div className="flex items-start gap-2 rounded-md border border-border bg-surface-raised px-3 py-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <p className="text-xs text-foreground">
                TradeOS doesn&apos;t keep this password. It goes straight to MetaApi, the bridge that
                reads your MT5 account for us, and MetaApi holds it. Disconnecting removes it there too.
              </p>
            </div>

            <Button type="submit" disabled={busy || locked} className="h-11 w-full gap-1.5 md:h-9 md:w-auto">
              {busy && <RefreshCw className="h-4 w-4 animate-spin" />}
              {step === 1 ? "Connecting…" : step === 2 ? "Checking that this login is read-only…" : "Check and connect"}
            </Button>
          </form>
        )}

        {error && <ErrorPanel message={error.message} extra={error.extra} />}
        {success && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-4 py-3" role="status">
            <CheckCircle2 className="h-4 w-4 text-profit" />
            <div>
              <p className="text-sm">Connected. Reading your MT5 account, read-only.</p>
              {notes.map((n) => (
                <p key={n} className="text-xs text-muted-foreground">
                  {n}
                </p>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
