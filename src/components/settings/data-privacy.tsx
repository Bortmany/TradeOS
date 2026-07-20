"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CONFIRM_WORD = "DELETE";

export function DataPrivacy() {
  const router = useRouter();
  const [exporting, setExporting] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onExport() {
    setError(null);
    setExporting(true);
    try {
      const res = await fetch("/api/profile/export");
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(json?.error ?? "Could not export your data.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tradeos-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  async function onDelete(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch("/api/profile/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Could not delete your account.");
        return;
      }
      // The account is gone and the session cookie is cleared — leave the app.
      router.push("/");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium">Export your data</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Download everything you&apos;ve stored — profile, accounts, trades, rulebooks,
          prop trackers, backtests and market datasets — as one JSON file.
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-2 gap-1.5"
          onClick={onExport}
          disabled={exporting}
        >
          <Download className="h-4 w-4" />
          {exporting ? "Preparing…" : "Export data"}
        </Button>
      </div>

      <div className="border-t border-border pt-5">
        <p className="text-sm font-medium text-loss">Delete account</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Permanently removes your account and all of its data — trades, rulebooks,
          scores, and any broker connections. This cannot be undone.
        </p>

        {!confirming ? (
          <Button
            variant="destructive"
            size="sm"
            className="mt-2"
            onClick={() => setConfirming(true)}
          >
            Delete account…
          </Button>
        ) : (
          <form onSubmit={onDelete} className="mt-3 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="deleteConfirm">
                Type <span className="font-semibold">{CONFIRM_WORD}</span> to confirm
              </Label>
              <Input
                id="deleteConfirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={CONFIRM_WORD}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deletePassword">Your password</Label>
              <Input
                id="deletePassword"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                disabled={deleting || confirmText !== CONFIRM_WORD || password.length === 0}
              >
                {deleting ? "Deleting…" : "Permanently delete my account"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setConfirming(false);
                  setConfirmText("");
                  setPassword("");
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-sm text-loss">
          <AlertTriangle className="h-4 w-4" /> {error}
        </p>
      )}
    </div>
  );
}
