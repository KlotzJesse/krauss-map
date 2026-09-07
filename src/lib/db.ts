import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as relations from "./schema/relations";
import * as schema from "./schema/schema";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

const connectionString = process.env.DATABASE_URL!;

// DATABASE_URL points at Supabase's transaction-mode pooler (port 6543),
// which multiplexes: every connection this pool opens holds a pooler slot for
// the lifetime of a transaction. On Vercel each concurrent lambda gets its own
// pool, so `max` is a per-instance figure — 20 x N instances is a lot of slots
// for a request that issues at most a handful of parallel queries. `min: 0`
// because a frozen lambda holding an idle connection helps nobody.
//
// In dev, Next.js HMR recreates modules on every change, which would build a
// new Pool each time; persisting it on `global` keeps the connection alive
// across reloads.
const pool =
  global.__pgPool ??
  new Pool({
    connectionString,
    min: 0,
    max: 5,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") {
  global.__pgPool = pool;
}

export const db = drizzle(pool, { schema: { ...schema, ...relations } });
