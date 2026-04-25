import "server-only";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db/client";

export function buildFtsQuery(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const tokens = trimmed
    .split(/\s+/)
    .map((t) => t.replace(/["']/g, ""))
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `"${t}"*`).join(" ");
}

export async function searchImageIds(query: string): Promise<string[]> {
  const fts = buildFtsQuery(query);
  if (!fts) return [];
  const rows = await db.all<{ id: string }>(
    sql`SELECT i.id AS id
        FROM images_fts f
        JOIN ${schema.images} i ON i.rowid = f.rowid
        WHERE images_fts MATCH ${fts}
        ORDER BY rank`,
  );
  return rows.map((r) => r.id);
}
