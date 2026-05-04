"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db/client";
import type { Image } from "@/db/schema";
import { revalidateViewsOnly } from "@/lib/revalidate";

export type ImageMeta = Pick<
  Image,
  "id" | "title" | "description" | "sourceUrl"
>;

export async function getImageMeta(id: string): Promise<ImageMeta | null> {
  const row = await db
    .select({
      id: schema.images.id,
      title: schema.images.title,
      description: schema.images.description,
      sourceUrl: schema.images.sourceUrl,
    })
    .from(schema.images)
    .where(eq(schema.images.id, id))
    .get();
  return row ?? null;
}

const MetaSchema = z.object({
  title: z.string().trim().max(200).nullable(),
  description: z.string().trim().max(2000).nullable(),
  sourceUrl: z
    .string()
    .trim()
    .max(2000)
    .url()
    .nullable()
    .or(z.literal("").transform(() => null)),
});

export type UpdateResult =
  | { status: "ok" }
  | { status: "error"; message: string };

export async function updateImageMeta(
  id: string,
  input: { title: string | null; description: string | null; sourceUrl: string | null },
): Promise<UpdateResult> {
  const parsed = MetaSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { title, description, sourceUrl } = parsed.data;
  await db
    .update(schema.images)
    .set({
      title: title && title.length > 0 ? title : null,
      description: description && description.length > 0 ? description : null,
      sourceUrl: sourceUrl && sourceUrl.length > 0 ? sourceUrl : null,
    })
    .where(eq(schema.images.id, id));

  // Meta change doesn't move images between views or affect counts —
  // skip the shell-tag bust so the cached sidebar continues serving.
  revalidateViewsOnly();
  return { status: "ok" };
}
