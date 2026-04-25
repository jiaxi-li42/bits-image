import { config } from "dotenv";
import { createClient } from "@libsql/client";

async function main() {
  config({ path: ".env.local" });

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error("TURSO_DATABASE_URL not set");
  const client = createClient({ url, authToken });
  const r = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
  );
  for (const row of r.rows) console.log(row.name);
  console.log("---");
  const m = await client.execute(
    "SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY id",
  );
  for (const row of m.rows) console.log(row);
}
main();
