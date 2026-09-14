import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { ingestImage } from "../modules/ingestion/ingest";

async function main() {
  config({ path: process.env.DOTENV_CONFIG_PATH ?? ".env.local" });
  const path = process.argv[2];
  if (!path) throw new Error("Usage: pnpm ingest <path-to-image>");
  const result = await ingestImage(await readFile(path), basename(path));
  if (result.status === "error") throw new Error(result.message);
  console.log(result.status === "ok"
    ? `Inserted image id=${result.imageId}`
    : `Already exists as image id=${result.existingId}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
