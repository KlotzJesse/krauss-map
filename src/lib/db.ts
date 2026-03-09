import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as relations from "./schema/relations";
import * as schema from "./schema/schema";

const connectionString = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema: { ...schema, ...relations } });
