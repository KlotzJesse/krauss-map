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

// In dev mode Next.js HMR recreates modules on every change, which would
// create a new Pool (and a new Neon cold-start ~1200ms) each time.
// Persisting the pool on `global` keeps the TCP connection alive across reloads.
const pool =
  global.__pgPool ??
  new Pool({
    connectionString,
    min: 1,
    max: 20,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") {
  global.__pgPool = pool;
}

export const db = drizzle(pool, { schema: { ...schema, ...relations } });
