import "server-only";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db/client";

export type ViewCounts = {
  library: number;
  inbox: number;
  organised: number;
  trash: number;
};

const ZERO: ViewCounts = { library: 0, inbox: 0, organised: 0, trash: 0 };

export async function getViewCounts(): Promise<ViewCounts> {
  if (!process.env.TURSO_DATABASE_URL) return ZERO;

  try {
    const hasTag = sql<number>`EXISTS (SELECT 1 FROM ${schema.imageTags} WHERE ${schema.imageTags.imageId} = ${schema.images.id})`;

    const row = await db
      .select({
        library: sql<number>`COUNT(*) FILTER (WHERE ${schema.images.deletedAt} IS NULL)`,
        inbox: sql<number>`COUNT(*) FILTER (WHERE ${schema.images.deletedAt} IS NULL AND NOT ${hasTag})`,
        organised: sql<number>`COUNT(*) FILTER (WHERE ${schema.images.deletedAt} IS NULL AND ${hasTag})`,
        trash: sql<number>`COUNT(*) FILTER (WHERE ${schema.images.deletedAt} IS NOT NULL)`,
      })
      .from(schema.images)
      .get();

    return {
      library: Number(row?.library ?? 0),
      inbox: Number(row?.inbox ?? 0),
      organised: Number(row?.organised ?? 0),
      trash: Number(row?.trash ?? 0),
    };
  } catch (err) {
    console.error("getViewCounts failed:", err);
    return ZERO;
  }
}
