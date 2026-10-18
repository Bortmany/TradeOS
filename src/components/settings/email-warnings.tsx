"use client";

// Settings "Email warnings" card: one on/off switch for an email copy of each
// new risk alert. If the owner hasn't switched email on yet, it says so plainly.

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

const DEMO_LINE = "The demo desk is look-around only. Create a free account to save your own.";

export function EmailWarnings({
  configured,
  initial,
  demo,
}: {
  configured: boolean;
  initial: boolean;
  demo: boolean;
}) {
  const [on, setOn] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function toggle(next: boolean) {
    setError(null);
    setNote(null);
    if (demo) {
      setError(DEMO_LINE);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailAlerts: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Couldn't save that. Please try again.");
        return;
      }
      setOn(next);
      setNote(next ? "Email warnings are on." : "Email warnings are off.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Email warnings</CardTitle>
          {!configured && <Badge variant="secondary">Not switched on yet</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="email-alerts-switch" className="text-sm">
            Email me when a new risk warning appears
          </label>
          <Switch
            id="email-alerts-switch"
            checked={on}
            loading={busy}
            onCheckedChange={toggle}
            aria-label="Email me when a new risk warning appears"
          />
        </div>
        {!configured && (
          <p className="text-sm text-muted-foreground">
            Your choice is saved, but no emails go out until the site owner sets up email.
          </p>
        )}
        {note && (
          <p role="status" className="text-sm text-profit">
            {note}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-loss">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
