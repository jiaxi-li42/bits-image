"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { db, schema } from "@/db/client";
import type { Folder as DbFolder } from "@/db/schema";
import { MAX_FOLDER_DEPTH } from "./constants";

// UI-facing slice (omits createdAt — none of the consumers need it).
export type Folder = Pick<DbFolder, "id" | "name" | "parentId">;
export type FolderWithCount = Folder & { count: number };
export type FolderNode = FolderWithCount & {
  path: string; // "Inspiration / Portrait"
  depth: number;
};

const NameSchema = z.string().trim().min(1).max(64);

function revalidateAllViews() {
  revalidatePath("/", "layout");
}

export async function getFolderDepth(id: string): Promise<number> {
  return (await ancestorIds(id)).length;
}

export type FolderResult =
  | { status: "ok"; folder: Folder }
  | { status: "error"; message: string };

// Walk up the tree following parentId pointers. Bounded by depth limit.
// Exported so bulk operations (modules/manage/server.ts) can reuse it.
export async function ancestorIds(folderId: string): Promise<string[]> {
  const ids: string[] = [];
  let current: string | null = folderId;
  for (let i = 0; i < 32 && current; i++) {
    const row = await db
      .select({ parentId: schema.folders.parentId })
      .from(schema.folders)
      .where(eq(schema.folders.id, current))
      .get();
    if (!row || !row.parentId) break;
    ids.push(row.parentId);
    current = row.parentId;
  }
  return ids;
}

function buildTree(rows: FolderWithCount[]): FolderNode[] {
  const byParent = new Map<string | null, FolderWithCount[]>();
  for (const r of rows) {
    const key = r.parentId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(r);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name));
  }
  const out: FolderNode[] = [];
  const visit = (parent: string | null, depth: number, prefix: string) => {
    const kids = byParent.get(parent) ?? [];
    for (const k of kids) {
      const path = prefix ? `${prefix} / ${k.name}` : k.name;
      out.push({ ...k, path, depth });
      visit(k.id, depth + 1, path);
    }
  };
  visit(null, 0, "");
  return out;
}

export async function listFolders(): Promise<FolderNode[]> {
  const rows = await db
    .select({
      id: schema.folders.id,
      name: schema.folders.name,
      parentId: schema.folders.parentId,
      count: sql<number>`count(${schema.imageFolders.imageId})`,
    })
    .from(schema.folders)
    .leftJoin(
      schema.imageFolders,
      eq(schema.imageFolders.folderId, schema.folders.id),
    )
    .groupBy(schema.folders.id)
    .orderBy(asc(schema.folders.name))
    .all();
  const flat: FolderWithCount[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    parentId: r.parentId ?? null,
    count: Number(r.count),
  }));
  return buildTree(flat);
}

export async function getFolder(id: string): Promise<Folder | null> {
  const row = await db
    .select({
      id: schema.folders.id,
      name: schema.folders.name,
      parentId: schema.folders.parentId,
    })
    .from(schema.folders)
    .where(eq(schema.folders.id, id))
    .get();
  if (!row) return null;
  return { id: row.id, name: row.name, parentId: row.parentId ?? null };
}

export async function getFolderWithPath(
  id: string,
): Promise<{ folder: Folder; path: string; depth: number } | null> {
  const folder = await getFolder(id);
  if (!folder) return null;
  const ancestors = await ancestorIds(id);
  const depth = ancestors.length;
  if (ancestors.length === 0) return { folder, path: folder.name, depth };
  const rows = await db
    .select({ id: schema.folders.id, name: schema.folders.name })
    .from(schema.folders)
    .where(sql`${schema.folders.id} IN (${sql.join(ancestors.map((a) => sql`${a}`), sql`, `)})`)
    .all();
  const nameById = new Map(rows.map((r) => [r.id, r.name]));
  const ordered = ancestors
    .slice()
    .reverse()
    .map((aid) => nameById.get(aid) ?? "")
    .filter(Boolean);
  return { folder, path: [...ordered, folder.name].join(" / "), depth };
}

export async function listFoldersForImage(imageId: string): Promise<Folder[]> {
  const rows = await db
    .select({
      id: schema.folders.id,
      name: schema.folders.name,
      parentId: schema.folders.parentId,
    })
    .from(schema.imageFolders)
    .innerJoin(
      schema.folders,
      eq(schema.folders.id, schema.imageFolders.folderId),
    )
    .where(eq(schema.imageFolders.imageId, imageId))
    .orderBy(asc(schema.folders.name))
    .all();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    parentId: r.parentId ?? null,
  }));
}

export async function createFolder(
  name: string,
  parentId: string | null = null,
  options: { strict?: boolean } = {},
): Promise<FolderResult> {
  const parsed = NameSchema.safeParse(name);
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid name",
    };
  }
  const trimmed = parsed.data;
  if (parentId) {
    const parentDepth = await getFolderDepth(parentId);
    if (parentDepth >= MAX_FOLDER_DEPTH) {
      return {
        status: "error",
        message: "Folder nesting is limited to three levels",
      };
    }
  }
  const where = parentId
    ? and(eq(schema.folders.name, trimmed), eq(schema.folders.parentId, parentId))
    : and(eq(schema.folders.name, trimmed), sql`${schema.folders.parentId} IS NULL`);
  const existing = await db
    .select({
      id: schema.folders.id,
      name: schema.folders.name,
      parentId: schema.folders.parentId,
    })
    .from(schema.folders)
    .where(where)
    .get();
  if (existing) {
    if (options.strict) {
      return {
        status: "error",
        message: "A folder with that name already exists",
      };
    }
    return {
      status: "ok",
      folder: {
        id: existing.id,
        name: existing.name,
        parentId: existing.parentId ?? null,
      },
    };
  }

  const id = randomUUID();
  await db.insert(schema.folders).values({ id, name: trimmed, parentId });
  revalidateAllViews();
  return { status: "ok", folder: { id, name: trimmed, parentId } };
}

export async function renameFolder(
  id: string,
  name: string,
): Promise<FolderResult> {
  const parsed = NameSchema.safeParse(name);
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid name",
    };
  }
  const trimmed = parsed.data;
  const folder = await getFolder(id);
  if (!folder) return { status: "error", message: "Folder not found" };
  const collisionWhere = folder.parentId
    ? and(
        eq(schema.folders.name, trimmed),
        eq(schema.folders.parentId, folder.parentId),
      )
    : and(
        eq(schema.folders.name, trimmed),
        sql`${schema.folders.parentId} IS NULL`,
      );
  const collision = await db
    .select({ id: schema.folders.id })
    .from(schema.folders)
    .where(collisionWhere)
    .get();
  if (collision && collision.id !== id) {
    return {
      status: "error",
      message: "A sibling folder with that name already exists",
    };
  }
  await db
    .update(schema.folders)
    .set({ name: trimmed })
    .where(eq(schema.folders.id, id));
  revalidateAllViews();
  return {
    status: "ok",
    folder: { id, name: trimmed, parentId: folder.parentId },
  };
}

export async function deleteFolder(id: string): Promise<void> {
  // Migration 0003 added folders.parent_id via ALTER TABLE, which SQLite
  // applies with FK action NO ACTION — the schema's ON DELETE CASCADE never
  // took effect on disk. Cascade in app code: BFS down the tree, then delete
  // every descendant before the target.
  const all: string[] = [id];
  let frontier: string[] = [id];
  while (frontier.length > 0) {
    const rows = await db
      .select({ id: schema.folders.id })
      .from(schema.folders)
      .where(inArray(schema.folders.parentId, frontier))
      .all();
    frontier = rows.map((r) => r.id);
    all.push(...frontier);
  }
  await db.delete(schema.folders).where(inArray(schema.folders.id, all));
  revalidateAllViews();
}

// Bulk: assign N images to a folder (and its ancestors) in one insert.
// Returns how many images were already in the destination folder.
export async function addImagesToFolder(
  imageIds: string[],
  folderId: string,
): Promise<{ added: number; alreadyIn: number }> {
  const ids = imageIds.filter(Boolean);
  if (ids.length === 0) return { added: 0, alreadyIn: 0 };
  const existing = await db
    .select({ imageId: schema.imageFolders.imageId })
    .from(schema.imageFolders)
    .where(
      and(
        eq(schema.imageFolders.folderId, folderId),
        inArray(schema.imageFolders.imageId, ids),
      ),
    )
    .all();
  const alreadyIn = existing.length;
  const folderIds = [folderId, ...(await ancestorIds(folderId))];
  const rows = ids.flatMap((imageId) =>
    folderIds.map((fid) => ({ imageId, folderId: fid })),
  );
  await db
    .insert(schema.imageFolders)
    .values(rows)
    .onConflictDoNothing()
    .run();
  revalidateAllViews();
  return { added: ids.length - alreadyIn, alreadyIn };
}

export async function addImageToFolder(
  imageId: string,
  folderId: string,
): Promise<void> {
  await addImagesToFolder([imageId], folderId);
}

// Bulk: move N images out of `fromFolderId` (and its ancestors) into
// `toFolderId` (and its ancestors). Shared ancestors stay attached.
export async function moveImagesToFolder(
  imageIds: string[],
  fromFolderId: string,
  toFolderId: string,
): Promise<{ moved: number }> {
  const ids = imageIds.filter(Boolean);
  if (ids.length === 0 || fromFolderId === toFolderId) return { moved: 0 };
  const fromChain = [fromFolderId, ...(await ancestorIds(fromFolderId))];
  const toChain = [toFolderId, ...(await ancestorIds(toFolderId))];
  const toChainSet = new Set(toChain);
  const removeFolderIds = fromChain.filter((id) => !toChainSet.has(id));
  if (removeFolderIds.length > 0) {
    await db
      .delete(schema.imageFolders)
      .where(
        and(
          inArray(schema.imageFolders.imageId, ids),
          inArray(schema.imageFolders.folderId, removeFolderIds),
        ),
      );
  }
  const addRows = ids.flatMap((imageId) =>
    toChain.map((fid) => ({ imageId, folderId: fid })),
  );
  await db
    .insert(schema.imageFolders)
    .values(addRows)
    .onConflictDoNothing()
    .run();
  revalidateAllViews();
  return { moved: ids.length };
}

export async function removeImageFromFolder(
  imageId: string,
  folderId: string,
): Promise<void> {
  await db
    .delete(schema.imageFolders)
    .where(
      and(
        eq(schema.imageFolders.imageId, imageId),
        eq(schema.imageFolders.folderId, folderId),
      ),
    );
  revalidateAllViews();
}

export async function addImageToFolderByName(
  imageId: string,
  name: string,
  parentId: string | null = null,
): Promise<FolderResult> {
  const created = await createFolder(name, parentId);
  if (created.status === "error") return created;
  await addImageToFolder(imageId, created.folder.id);
  return created;
}
