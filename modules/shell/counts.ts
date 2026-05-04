import "server-only";
import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { SHELL_CACHE_TAG } from "@/lib/revalidate";

export type ViewCounts = {
  library: number;
  inbox: number;
  organised: number;
  trash: number;
};

const ZERO: ViewCounts = { library: 0, inbox: 0, organised: 0, trash: 0 };

// Single aggregate query reused across requests until a mutation invalidates
// the shell tag. Without the cache, every navigation re-runs the query
// because `revalidatePath("/", "layout")` fires on most mutations.
export const getViewCounts = unstable_cache(
  async (): Promise<ViewCounts> => {
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
  },
  ["shell:view-counts"],
  { tags: [SHELL_CACHE_TAG] },
);
