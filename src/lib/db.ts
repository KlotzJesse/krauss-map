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

// DATABASE_URL points at Supabase's transaction-mode pooler (port 6543).
//
// `max: 20` is per lambda instance, not global. Lowering it to 5 to be
// gentler on pooler slots was tried and reverted: page latency through
// Vercel varies more between repeated runs of the same configuration than
// between configurations, so it could not be shown to help or hurt. Judge
// it on Supabase's pooler slot usage under real traffic, not on request
// timings. `min: 0` keeps a frozen lambda from pinning an idle connection.
//
// In dev, Next.js HMR recreates modules on every change, which would build a
// new Pool each time; persisting it on `global` keeps the connection alive
// across reloads.
const pool =
  global.__pgPool ??
  new Pool({
    connectionString,
    min: 0,
    max: 20,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") {
  global.__pgPool = pool;
}

export const db = drizzle(pool, { schema: { ...schema, ...relations } });
