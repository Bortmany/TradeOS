// Display time zone — the formatter is machine-independent (spec test 1) and
// bad stored zones fall back to New York without throwing (spec test 2, part 1).
//
// Approach: every case is checked under several MACHINE zones. Node re-reads
// process.env.TZ when it is assigned, so each case sets it, proves the machine
// zone really moved (Date#getTimezoneOffset changes), and prints the same fixed
// instant again. One extra case runs the formatter in child processes started
// with different TZ values, so the result can't depend on in-process caching.

import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  formatDateTime,
  formatDate,
  formatDayKey,
  formatDateRange,
  formatTime,
  resolveTimeZone,
  timeZoneLabel,
  timeZoneOptionLabel,
  isAllowedTimeZone,
  TIME_ZONE_LABELS,
  TIME_ZONE_OPTIONS,
  DEFAULT_TIME_ZONE,
} from "@/lib/utils";

const NB = " ";
const MACHINE_ZONES = ["UTC", "America/Los_Angeles", "Asia/Muscat", "Pacific/Kiritimati", "Pacific/Pago_Pago"];
const originalTZ = process.env.TZ;
afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
});

/** Run `fn` under each machine zone and return what it printed each time. */
function underMachineZones<T>(fn: () => T): T[] {
  const offsets = new Set<number>();
  const out: T[] = [];
  for (const z of MACHINE_ZONES) {
    process.env.TZ = z;
    offsets.add(new Date("2026-09-15T13:45:00Z").getTimezoneOffset());
    out.push(fn());
  }
  // Proof the machine zone really changed between runs.
  expect(offsets.size).toBeGreaterThan(1);
  return out;
}

function sameEverywhere<T>(fn: () => T): T {
  const results = underMachineZones(fn);
  for (const r of results) expect(r).toEqual(results[0]);
  return results[0];
}

// 2026-09-15 09:45 in New York (EDT, UTC-4) and 2026-12-15 09:45 (EST, UTC-5).
const SEP_FILL = new Date("2026-09-15T13:45:00Z");
const DEC_FILL = new Date("2026-12-15T14:45:00Z");

describe("formatDateTime prints in the given zone, whatever the machine zone", () => {
  it("New York reads ET (never EST/EDT) in summer and winter", () => {
    expect(sameEverywhere(() => formatDateTime(SEP_FILL, "America/New_York"))).toBe(
      `Sep 15, 9:45${NB}AM${NB}ET`
    );
    expect(sameEverywhere(() => formatDateTime(DEC_FILL, "America/New_York"))).toBe(
      `Dec 15, 9:45${NB}AM${NB}ET`
    );
  });

  it("Muscat on an EDT date: 09:45 New York is 5:45 PM GST", () => {
    expect(sameEverywhere(() => formatDateTime(SEP_FILL, "Asia/Muscat"))).toBe(
      `Sep 15, 5:45${NB}PM${NB}GST`
    );
    expect(sameEverywhere(() => formatTime(SEP_FILL, "Asia/Muscat"))).toBe(`5:45${NB}PM${NB}GST`);
  });

  it("Muscat on an EST date: 09:45 New York is 6:45 PM GST", () => {
    expect(sameEverywhere(() => formatDateTime(DEC_FILL, "Asia/Muscat"))).toBe(
      `Dec 15, 6:45${NB}PM${NB}GST`
    );
  });

  it("Tokyo and UTC", () => {
    expect(sameEverywhere(() => formatDateTime(SEP_FILL, "Asia/Tokyo"))).toBe(
      `Sep 15, 10:45${NB}PM${NB}JST`
    );
    expect(sameEverywhere(() => formatDateTime(SEP_FILL, "UTC"))).toBe(`Sep 15, 1:45${NB}PM${NB}UTC`);
  });

  it("date-line case: the same instant is a day apart in Kiritimati and Pago Pago", () => {
    const [kiri, pago] = sameEverywhere(() => [
      formatDateTime(SEP_FILL, "Pacific/Kiritimati"),
      formatDateTime(SEP_FILL, "Pacific/Pago_Pago"),
    ]);
    expect(kiri.startsWith("Sep 16, 3:45")).toBe(true); // UTC+14
    expect(pago.startsWith("Sep 15, 2:45")).toBe(true); // UTC-11
    // Sydney crosses midnight into the next day in December (AEDT).
    expect(sameEverywhere(() => formatDateTime(DEC_FILL, "Australia/Sydney"))).toBe(
      `Dec 16, 1:45${NB}AM${NB}AEDT`
    );
  });

  it("midnight rollover: 23:59 and 00:00 land on the right days, 12 AM not 0 AM", () => {
    const beforeMidnight = new Date("2026-09-16T03:59:00Z"); // 23:59 ET Sep 15
    const atMidnight = new Date("2026-09-16T04:00:00Z"); // 00:00 ET Sep 16
    expect(sameEverywhere(() => formatDateTime(beforeMidnight, "America/New_York"))).toBe(
      `Sep 15, 11:59${NB}PM${NB}ET`
    );
    expect(sameEverywhere(() => formatDateTime(atMidnight, "America/New_York"))).toBe(
      `Sep 16, 12:00${NB}AM${NB}ET`
    );
    expect(sameEverywhere(() => formatDate(atMidnight, "America/New_York"))).toBe("Sep 16, 2026");
    expect(sameEverywhere(() => formatDate(beforeMidnight, "America/New_York"))).toBe("Sep 15, 2026");
  });

  it("accepts ISO strings the same as Date objects", () => {
    expect(formatDateTime(SEP_FILL.toISOString(), "Asia/Muscat")).toBe(formatDateTime(SEP_FILL, "Asia/Muscat"));
  });
});

describe("the fixed label table", () => {
  const cases: [string, Date, string][] = [
    ["America/New_York", SEP_FILL, "ET"],
    ["America/New_York", DEC_FILL, "ET"],
    ["America/Chicago", SEP_FILL, "CT"],
    ["America/Denver", DEC_FILL, "MT"],
    ["America/Los_Angeles", SEP_FILL, "PT"],
    ["UTC", SEP_FILL, "UTC"],
    ["Europe/London", SEP_FILL, "BST"],
    ["Europe/London", DEC_FILL, "GMT"],
    ["Europe/Berlin", SEP_FILL, "CEST"],
    ["Europe/Berlin", DEC_FILL, "CET"],
    ["Asia/Tokyo", SEP_FILL, "JST"],
    ["Asia/Singapore", SEP_FILL, "SGT"],
    ["Australia/Sydney", SEP_FILL, "AEST"],
    ["Australia/Sydney", DEC_FILL, "AEDT"],
    ["Asia/Muscat", SEP_FILL, "GST"],
    ["Asia/Muscat", DEC_FILL, "GST"],
  ];
  it.each(cases)("%s on %s reads %s", (zone, at, label) => {
    expect(sameEverywhere(() => timeZoneLabel(zone, at))).toBe(label);
  });

  it("covers all eleven zones, Muscat included, and the picker reads City (LABEL)", () => {
    expect(Object.keys(TIME_ZONE_LABELS)).toHaveLength(11);
    expect(TIME_ZONE_OPTIONS).toContain("Asia/Muscat");
    expect(timeZoneOptionLabel("America/New_York")).toBe("New York (ET)");
    expect(timeZoneOptionLabel("Asia/Muscat")).toBe("Muscat (GST)");
    expect(timeZoneOptionLabel("Europe/London")).toBe("London (GMT/BST)");
  });

  it("a zone outside the table falls back to the runtime's short name", () => {
    const label = timeZoneLabel("Asia/Kolkata", SEP_FILL);
    expect(label.length).toBeGreaterThan(0);
    expect(formatDateTime(SEP_FILL, "Asia/Kolkata")).toBe(`Sep 15, 7:15${NB}PM${NB}${label}`);
  });
});

describe("day-only keys are New York calendar days and never shift", () => {
  it("prints the key's own date under every machine zone and every display zone", () => {
    for (const zone of ["America/New_York", "Asia/Muscat", "Asia/Tokyo", "Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
      expect(sameEverywhere(() => formatDate("2026-06-15", zone))).toBe("Jun 15, 2026");
      // The old `${key}T12:00:00` pattern is treated as the same day key.
      expect(sameEverywhere(() => formatDate("2026-06-15T12:00:00", zone, "weekday"))).toBe("Mon, Jun 15");
    }
    expect(sameEverywhere(() => formatDayKey("2026-01-01", "short"))).toBe("Jan 1");
    expect(formatDayKey("not-a-day")).toBe("—");
  });

  it("a report window reads 'Sep 9 – Sep 15 ET' with the label once at the end", () => {
    const from = new Date("2026-09-09T04:00:00Z");
    const to = new Date("2026-09-16T03:59:59Z");
    expect(sameEverywhere(() => formatDateRange(from, to, "America/New_York"))).toBe(
      `Sep 9 – Sep 15${NB}ET`
    );
  });
});

describe("the same text in a fresh process, whatever TZ it starts with", () => {
  it("child processes started in different machine zones print identically", () => {
    const utilsPath = fileURLToPath(new URL("../src/lib/utils.ts", import.meta.url));
    const tsx = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));
    const script = `import { formatDateTime, formatDate } from ${JSON.stringify(utilsPath)};
      const at = new Date("2026-09-15T13:45:00Z");
      console.log(JSON.stringify([formatDateTime(at, "America/New_York"), formatDateTime(at, "Asia/Muscat"), formatDate("2026-06-15", "Asia/Tokyo")]));`;
    const outputs = ["UTC", "Asia/Tokyo", "America/Los_Angeles"].map((tz) =>
      execFileSync(tsx, ["--eval", script], { env: { ...process.env, TZ: tz }, encoding: "utf8" }).trim()
    );
    for (const o of outputs) expect(o).toBe(outputs[0]);
    expect(JSON.parse(outputs[0])).toEqual([
      `Sep 15, 9:45${NB}AM${NB}ET`,
      `Sep 15, 5:45${NB}PM${NB}GST`,
      "Jun 15, 2026",
    ]);
  }, 60_000);
});

describe("bad stored zones fall back to New York without throwing", () => {
  it.each([["Mars/Olympus_Mons"], [""], ["   "], ["x".repeat(200)]])("resolveTimeZone(%j) is New York", (bad) => {
    expect(resolveTimeZone(bad)).toBe(DEFAULT_TIME_ZONE);
    expect(() => formatDateTime(SEP_FILL, bad)).not.toThrow();
    expect(formatDateTime(SEP_FILL, bad)).toBe(`Sep 15, 9:45${NB}AM${NB}ET`);
    expect(formatDate(SEP_FILL, bad)).toBe("Sep 15, 2026");
  });

  it("non-strings fall back too", () => {
    expect(resolveTimeZone(undefined)).toBe(DEFAULT_TIME_ZONE);
    expect(resolveTimeZone(null)).toBe(DEFAULT_TIME_ZONE);
    expect(resolveTimeZone(42)).toBe(DEFAULT_TIME_ZONE);
  });

  it("an invalid date prints a dash instead of throwing", () => {
    expect(formatDateTime("not a date", "Asia/Muscat")).toBe("—");
    expect(formatDate(new Date(NaN), "Asia/Muscat")).toBe("—");
  });

  it("the save list accepts the table and real IANA zones, rejects the rest", () => {
    expect(isAllowedTimeZone("Asia/Muscat")).toBe(true);
    expect(isAllowedTimeZone("UTC")).toBe(true);
    expect(isAllowedTimeZone("Europe/Paris")).toBe(true);
    expect(isAllowedTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(isAllowedTimeZone("")).toBe(false);
    expect(isAllowedTimeZone("asia/muscat")).toBe(false);
    expect(isAllowedTimeZone(7)).toBe(false);
  });
});
