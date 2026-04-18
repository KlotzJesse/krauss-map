import path from "path";

import * as dotenv from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const DATABASE_URL = process.env.DATABASE_URL!;
const client = postgres(DATABASE_URL);
const db = drizzle(client);

async function main() {
  await db.execute(
    sql`ALTER TABLE area_layers ADD COLUMN IF NOT EXISTS group_name varchar(255)`
  );
  console.log("Migration complete: group_name column added");
  await client.end();
}

main().catch(console.error);
