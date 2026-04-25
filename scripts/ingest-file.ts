import { config } from "dotenv";
config({ path: ".env.local" });
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { uploadImage } from "../modules/storage";

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: pnpm tsx scripts/ingest-file.ts <path-to-image>");
    process.exit(1);
  }

  const buf = await readFile(path);
  console.log(`Uploading ${path} (${buf.length} bytes)…`);
  const uploaded = await uploadImage(buf);

  const existing = await db
    .select({ id: schema.images.id })
    .from(schema.images)
    .where(eq(schema.images.hash, uploaded.hash))
    .get();

  if (existing) {
    console.log(`Already exists as image id=${existing.id}`);
    return;
  }

  const id = randomUUID();
  await db.insert(schema.images).values({
    id,
    r2Key: uploaded.key,
    width: uploaded.width,
    height: uploaded.height,
    hash: uploaded.hash,
  });
  console.log(`Inserted image id=${id} hash=${uploaded.hash}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
