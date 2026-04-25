import { config } from "dotenv";
config({ path: ".env.local" });
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { deleteAllForHash } from "../modules/storage";

async function main() {
  const rows = await db.select().from(schema.images).all();
  console.log(`Found ${rows.length} image(s) to remove.`);
  for (const r of rows) {
    try {
      await deleteAllForHash(r.hash);
    } catch (err) {
      console.warn(`R2 delete failed for ${r.hash}:`, err);
    }
    await db.delete(schema.images).where(eq(schema.images.id, r.id));
    console.log(`Removed id=${r.id}`);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
