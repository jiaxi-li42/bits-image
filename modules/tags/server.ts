"use server";

import { unstable_cache } from "next/cache";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { db, schema } from "@/db/client";
import type { Tag as DbTag } from "@/db/schema";
import { revalidateAllViews, SHELL_CACHE_TAG } from "@/lib/revalidate";

// UI-facing slice (omits createdAt — none of the consumers need it).
export type Tag = Pick<DbTag, "id" | "name">;
export type TagWithCount = Tag & { count: number };

const NameSchema = z.string().trim().min(1).max(64);

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

export type TagResult =
  | { status: "ok"; tag: Tag }
  | { status: "error"; message: string };

// Sidebar-shaped tag list with image counts. Cached + shell-tagged
// so it's shared across requests until a mutation calls
// `revalidateAllViews()` (which busts the shell tag).
const cachedListTags = unstable_cache(
  async (): Promise<TagWithCount[]> => {
    const rows = await db
      .select({
        id: schema.tags.id,
        name: schema.tags.name,
        count: sql<number>`count(${schema.imageTags.imageId})`,
      })
      .from(schema.tags)
      .leftJoin(schema.imageTags, eq(schema.imageTags.tagId, schema.tags.id))
      .groupBy(schema.tags.id)
      .orderBy(asc(schema.tags.name))
      .all();
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      count: Number(r.count),
    }));
  },
  ["tags:list"],
  { tags: [SHELL_CACHE_TAG] },
);

export async function listTags(): Promise<TagWithCount[]> {
  return cachedListTags();
}

export async function getTag(id: string): Promise<Tag | null> {
  const row = await db
    .select({ id: schema.tags.id, name: schema.tags.name })
    .from(schema.tags)
    .where(eq(schema.tags.id, id))
    .get();
  return row ?? null;
}

export async function listTagsForImage(imageId: string): Promise<Tag[]> {
  const rows = await db
    .select({ id: schema.tags.id, name: schema.tags.name })
    .from(schema.imageTags)
    .innerJoin(schema.tags, eq(schema.tags.id, schema.imageTags.tagId))
    .where(eq(schema.imageTags.imageId, imageId))
    .orderBy(asc(schema.tags.name))
    .all();
  return rows;
}

export async function createTag(
  name: string,
  options: { strict?: boolean } = {},
): Promise<TagResult> {
  const parsed = NameSchema.safeParse(name);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid name" };
  }
  const normalized = normalize(parsed.data);
  const existing = await db
    .select({ id: schema.tags.id, name: schema.tags.name })
    .from(schema.tags)
    .where(eq(schema.tags.name, normalized))
    .get();
  if (existing) {
    if (options.strict) {
      return { status: "error", message: "A tag with that name already exists" };
    }
    return { status: "ok", tag: existing };
  }

  const id = randomUUID();
  await db.insert(schema.tags).values({ id, name: normalized });
  revalidateAllViews();
  return { status: "ok", tag: { id, name: normalized } };
}

export async function renameTag(id: string, name: string): Promise<TagResult> {
  const parsed = NameSchema.safeParse(name);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid name" };
  }
  const normalized = normalize(parsed.data);
  const collision = await db
    .select({ id: schema.tags.id })
    .from(schema.tags)
    .where(and(eq(schema.tags.name, normalized)))
    .get();
  if (collision && collision.id !== id) {
    return { status: "error", message: "A tag with that name already exists" };
  }
  await db.update(schema.tags).set({ name: normalized }).where(eq(schema.tags.id, id));
  revalidateAllViews();
  return { status: "ok", tag: { id, name: normalized } };
}

export async function deleteTag(id: string): Promise<void> {
  await db.delete(schema.tags).where(eq(schema.tags.id, id));
  revalidateAllViews();
}

export async function assignTag(imageId: string, tagId: string): Promise<void> {
  await db
    .insert(schema.imageTags)
    .values({ imageId, tagId })
    .onConflictDoNothing()
    .run();
  revalidateAllViews();
}

export async function unassignTag(imageId: string, tagId: string): Promise<void> {
  await db
    .delete(schema.imageTags)
    .where(
      and(
        eq(schema.imageTags.imageId, imageId),
        eq(schema.imageTags.tagId, tagId),
      ),
    );
  revalidateAllViews();
}

export async function assignTagByName(
  imageId: string,
  name: string,
): Promise<TagResult> {
  const created = await createTag(name);
  if (created.status === "error") return created;
  await assignTag(imageId, created.tag.id);
  return created;
}
