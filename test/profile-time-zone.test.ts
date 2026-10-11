// Profile save — the display zone is validated (spec test 2, part 2).
//
// Calls the REAL PATCH /api/profile handler against the throwaway SQLite
// database with a settable "who is signed in" (same approach as the backtest
// ownership tests). An unknown zone is refused with the plain message and the
// stored zone is untouched; Asia/Muscat is accepted and saved.

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

const { session } = vi.hoisted(() => ({
  session: { current: null as null | Record<string, unknown> },
}));

vi.mock("@/lib/auth", () => ({
  withUser:
    (handler: (user: unknown, ...args: unknown[]) => Promise<Response>) =>
    async (...args: unknown[]) => {
      if (!session.current) return new Response("Unauthorized", { status: 401 });
      return handler(session.current, ...args);
    },
}));

import { PATCH } from "@/app/api/profile/route";
import { resetRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";

const DB_URL = process.env.DATABASE_URL ?? "";
if (DB_URL.includes("dev.db")) {
  throw new Error(`Refusing to run: DATABASE_URL points at the dev database (${DB_URL}).`);
}

const email = `tz-profile-${Date.now()}@example.com`;
let userId = "";

const patch = (body: unknown) =>
  PATCH(
    new Request("http://localhost/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );

async function storedZone(): Promise<string | undefined> {
  return (await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }))?.timezone;
}

beforeAll(async () => {
  const u = await prisma.user.create({
    data: { email, passwordHash: "x", displayName: "Zone Tester", plan: "pro" },
  });
  userId = u.id;
  session.current = {
    id: u.id,
    email,
    displayName: "Zone Tester",
    plan: "pro",
    billingStatus: "active",
    timezone: u.timezone,
    trialEndsAt: null,
  };
});

beforeEach(() => resetRateLimit(`profile:write:user:${userId}`));

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
});

describe("PATCH /api/profile — time zone", () => {
  it("starts on the New York default", async () => {
    expect(await storedZone()).toBe("America/New_York");
  });

  it("rejects an unknown zone with the plain message and keeps the saved zone", async () => {
    const res = await patch({ displayName: "Zone Tester", timezone: "Mars/Olympus_Mons" });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: false,
      field: "timezone",
      error: "That time zone isn't recognised. Pick one from the list.",
    });
    expect(await storedZone()).toBe("America/New_York");
  });

  it("rejects an empty or wrongly-cased zone too", async () => {
    for (const bad of ["", "asia/muscat", "Asia/Muscat; DROP TABLE"]) {
      const res = await patch({ timezone: bad });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("That time zone isn't recognised. Pick one from the list.");
    }
    expect(await storedZone()).toBe("America/New_York");
  });

  it("accepts Asia/Muscat and saves it", async () => {
    const res = await patch({ displayName: "Zone Tester", timezone: "Asia/Muscat" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await storedZone()).toBe("Asia/Muscat");
  });

  it("a name-only save leaves the zone alone", async () => {
    const res = await patch({ displayName: "Renamed" });
    expect(res.status).toBe(200);
    expect(await storedZone()).toBe("Asia/Muscat");
  });

  it("refuses signed-out requests", async () => {
    const saved = session.current;
    session.current = null;
    try {
      const res = await patch({ timezone: "Asia/Tokyo" });
      expect(res.status).toBe(401);
    } finally {
      session.current = saved;
    }
    expect(await storedZone()).toBe("Asia/Muscat");
  });
});
