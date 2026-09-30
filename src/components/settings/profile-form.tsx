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
import { NAME_EXAMPLE } from "@/lib/validation";
import { cn, TIME_ZONE_OPTIONS, timeZoneOptionLabel } from "@/lib/utils";

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
  const [zoneError, setZoneError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  // The saved zone is always offered (and selected), even if it isn't one of
  // the listed cities.
  const options = TIME_ZONE_OPTIONS.includes(timezone)
    ? TIME_ZONE_OPTIONS
    : [timezone, ...TIME_ZONE_OPTIONS];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setZoneError(null);
    setSaved(false);
    setBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Only send the zone when it changed, so a name-only save never trips
        // over an older saved zone.
        body: JSON.stringify({
          displayName: name,
          ...(tz !== timezone ? { timezone: tz } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        if (json.field === "timezone") setZoneError(json.error);
        else setError(json.error ?? "Could not save profile.");
        return;
      }
      setSaved(true);
      // Re-render the server pages so every time on screen moves to the new zone.
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
          placeholder={NAME_EXAMPLE}
          maxLength={80}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="timezone">Timezone</Label>
        <Select
          value={tz}
          onValueChange={(v) => {
            setTz(v);
            setSaved(false);
            setZoneError(null);
          }}
        >
          <SelectTrigger
            id="timezone"
            className={cn("sm:w-[280px]", zoneError && "border-loss")}
            aria-invalid={zoneError ? true : undefined}
            aria-describedby="timezone-help"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((z) => (
              <SelectItem key={z} value={z}>
                {timeZoneOptionLabel(z)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {zoneError && <p className="text-xs text-loss">{zoneError}</p>}
        <p id="timezone-help" className="text-xs text-muted-foreground">
          This changes the clock the app shows. Your rules and discipline score are still graded
          on New York trading-session time, so your score does not change.
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
