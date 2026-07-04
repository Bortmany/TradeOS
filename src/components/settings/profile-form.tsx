"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
];

export function ProfileForm({
  displayName,
  timezone,
}: {
  displayName: string;
  timezone: string;
}) {
  const router = useRouter();
  const [name, setName] = React.useState(displayName);
  const [tz, setTz] = React.useState(timezone);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name, timezone: tz }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Could not save profile.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="displayName">Display name</Label>
        <Input
          id="displayName"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          placeholder="Your name"
          maxLength={80}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Timezone</Label>
        <Select
          value={tz}
          onValueChange={(v) => {
            setTz(v);
            setSaved(false);
          }}
        >
          <SelectTrigger className="sm:w-[280px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIMEZONES.map((z) => (
              <SelectItem key={z} value={z}>
                {z.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-2xs text-muted-foreground">
          Used to bucket trades by session, weekday, and time of day.
        </p>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-sm text-loss">
          <AlertTriangle className="h-4 w-4" /> {error}
        </p>
      )}
      {saved && (
        <p className="flex items-center gap-1.5 text-sm text-profit">
          <CheckCircle2 className="h-4 w-4" /> Saved.
        </p>
      )}

      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
