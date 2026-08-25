import { PrismaClient } from "@prisma/client";

// Reuse the client across hot reloads in dev to avoid exhausting connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Scaling note — connection pool tuning (no change needed for a single instance):
// Prisma opens its own pool per process. When TradeOS runs as several instances,
// the total connections = pool size × instance count, which can exceed Postgres's
// `max_connections`. Two levers, both via the DATABASE_URL (so no code change):
//   1. Cap each process's pool explicitly, e.g. `?connection_limit=5`, sized so
//      (limit × instances) stays comfortably under the DB's max_connections.
//   2. Prefer a POOLED url (PgBouncer / the provider's pooler, e.g. Supabase/Neon
//      pooled endpoint) and add `?pgbouncer=true` so Prisma disables prepared
//      statements that a transaction pooler can't keep. A single local Postgres
//      instance in dev doesn't need any of this. Set these on Railway when
//      horizontally scaled — nothing here changes.

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
