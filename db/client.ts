import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

export { schema };

let _db: LibSQLDatabase<typeof schema> | null = null;

function getDb(): LibSQLDatabase<typeof schema> {
  if (_db) return _db;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) {
    throw new Error("TURSO_DATABASE_URL is not set");
  }
  const client = createClient({ url, authToken });
  _db = drizzle(client, { schema });
  return _db;
}

export const db = new Proxy({} as LibSQLDatabase<typeof schema>, {
  get(_, prop: string | symbol) {
    return Reflect.get(getDb(), prop);
  },
});
