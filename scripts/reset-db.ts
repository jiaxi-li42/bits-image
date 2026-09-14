import { config } from "dotenv";
config({ path: ".env.local" });
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { deleteImageObjects } from "../modules/storage";

async function main() {
  const rows = await db.select().from(schema.images).all();
  console.log(`Found ${rows.length} image(s) to remove.`);
  for (const r of rows) {
    try {
      await db.update(schema.images).set({ deletedAt: new Date(), purgingAt: new Date() })
        .where(eq(schema.images.id, r.id));
      await deleteImageObjects(r.r2Key);
    } catch (err) {
      console.warn(`R2 delete failed for ${r.hash}:`, err);
      process.exitCode = 1;
      continue;
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
