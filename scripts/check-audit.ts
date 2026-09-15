// Run with pnpm test:audit. Temporary SQLite + mocked R2 only; never loads .env.local.
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import Module, { createRequire } from "node:module";
import { mock } from "node:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import sharp from "sharp";

async function main() {
  const dir = await mkdtemp(join(tmpdir(), "bits-audit-"));
  process.env.TURSO_DATABASE_URL = `file:${join(dir, "audit.db").replaceAll("\\", "/")}`;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.R2_ACCOUNT_ID = "test";
  process.env.R2_ACCESS_KEY_ID = "test";
  process.env.R2_SECRET_ACCESS_KEY = "test";
  process.env.R2_BUCKET = "test";

  // Next's cache APIs require a running request. Stub only that boundary,
  // retaining real actions, queries, image processing and storage commands.
  const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
  const resolveModule = createRequire(join(process.cwd(), "scripts/check-audit.ts")).resolve;
  const originalLoad = loader._load;
  mock.method(loader, "_load", function (this: unknown, name: string, ...args: unknown[]) {
    if (name === "server-only") return {};
    if (name === "next/cache") return {
      unstable_cache: (fn: unknown) => fn, revalidatePath() {}, revalidateTag() {},
    };
    return originalLoad.call(this, name, ...args);
  });
  const client = createClient({ url: process.env.TURSO_DATABASE_URL });
  const fresh = createClient({ url: "file::memory:" });
  let closeAppDb = () => {};
  try {
    // Upgrade an existing 0003 database with nested folders + FTS content.
    const migrations = readMigrationFiles({ migrationsFolder: "db/migrations" });
    await client.migrate(migrations.slice(0, 4).flatMap((m) => m.sql));
    await client.execute("CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC)");
    const previous = migrations[3];
    await client.execute({ sql: "INSERT INTO __drizzle_migrations(hash,created_at) VALUES (?,?)", args: [previous.hash, previous.folderMillis] });
    await client.batch([
      "INSERT INTO images(id,r2_key,width,height,hash,title) VALUES ('legacy','originals/' || printf('%064d',0),10,10,printf('%064d',0),'sunflower')",
      "INSERT INTO folders(id,name) VALUES ('root','Root')",
      "INSERT INTO folders(id,name,parent_id) VALUES ('child','Child','root')",
      "INSERT INTO folders(id,name,parent_id) VALUES ('leaf','Leaf','child')",
      "INSERT INTO image_folders(image_id,folder_id) VALUES ('legacy','root'),('legacy','child'),('legacy','leaf')",
    ], "write");
    await migrate(drizzle(client), { migrationsFolder: "db/migrations" });
    assert.equal((await client.execute("SELECT * FROM image_folders")).rows.length, 3);
    assert.equal((await client.execute("PRAGMA foreign_key_check")).rows.length, 0);
    assert.equal((await client.execute("PRAGMA foreign_key_list(folders)")).rows[0].on_delete, "CASCADE");
    assert.equal((await client.execute("SELECT * FROM images_fts WHERE images_fts MATCH 'sunflower'")).rows.length, 1);
    const { deleteFolder } = await import("../modules/folders/server");
    const { db } = await import("../db/client");
    closeAppDb = () => (db as unknown as { $client: { close(): void } }).$client.close();
    await deleteFolder("root");
    assert.equal((await client.execute("SELECT * FROM folders")).rows.length, 0);
    assert.equal((await client.execute("SELECT * FROM image_folders")).rows.length, 0);
    assert.equal((await client.execute("SELECT * FROM images")).rows.length, 1);
    await client.execute("UPDATE images SET title='moonlight' WHERE id='legacy'");
    assert.equal((await client.execute("SELECT * FROM images_fts WHERE images_fts MATCH 'moonlight'")).rows.length, 1);
    await client.execute("DELETE FROM images WHERE id='legacy'");
    assert.equal((await client.execute("SELECT * FROM images_fts WHERE images_fts MATCH 'moonlight'")).rows.length, 0);
    await migrate(drizzle(fresh), { migrationsFolder: "db/migrations" });
    await migrate(drizzle(fresh), { migrationsFolder: "db/migrations" });
    assert.equal((await fresh.execute("PRAGMA foreign_key_check")).rows.length, 0);
    assert.equal((await fresh.execute("PRAGMA foreign_key_list(folders)")).rows[0].on_delete, "CASCADE");
    console.log("PASS: fresh migrations, existing-data upgrade, folder cascade, FTS insert/update/delete");

    const { getR2 } = await import("../modules/storage/client");
    const { imageObjectKey } = await import("../modules/storage/keys");
    const { sha256 } = await import("../modules/storage/hash");
    const objects = new Map<string, Buffer>();
    const contentTypes = new Map<string, string>();
    let failPut = false;
    let failDelete = false;
    let onDelete: (() => Promise<void>) | undefined;
    mock.method(getR2(), "send", async (command: { constructor: { name: string }; input: { Key: string; Body: Buffer; ContentType: string } }) => {
      const { Key, Body } = command.input;
      if (command.constructor.name === "PutObjectCommand") {
        if (failPut && Key.startsWith("thumbs/grid/")) throw new Error("Injected PUT failure");
        objects.set(Key, Body);
        contentTypes.set(Key, command.input.ContentType);
      } else if (command.constructor.name === "DeleteObjectCommand") {
        await onDelete?.();
        if (failDelete && Key.startsWith("originals/")) throw new Error("Injected DELETE failure");
        objects.delete(Key);
        contentTypes.delete(Key);
      } else if (command.constructor.name === "GetObjectCommand") {
        const data = objects.get(Key);
        if (!data) throw new Error("Object not found");
        return {
          ContentType: "image/png", ContentLength: data.length,
          Body: { transformToWebStream: () => new ReadableStream({ start(controller) { controller.enqueue(data); controller.close(); } }) },
        };
      } else if (command.constructor.name === "ListObjectsV2Command") {
        return { Contents: [...objects.keys()].filter((Key) => Key.startsWith("uploads/")).sort().map((Key) => ({ Key })) };
      } else throw new Error("Unexpected network command in isolated test");
      return {};
    });
    const { ingestImage, MAX_UPLOAD_BYTES } = await import("../modules/ingestion/ingest");
    const { prepareUpload, finalizeUpload, purgeExpiredUploads } = await import("../modules/ingestion/direct-upload");
    // Deterministic texture gives nontrivial dHash and reproducible re-encodes.
    const pixels = Buffer.from(Array.from({ length: 32 * 32 * 3 }, (_, i) => (i * 73 + Math.floor(i / 96) * 17) % 256));
    const { uploadImage, deleteImageObjects } = await import("../modules/storage/upload");
    for (const format of ["jpeg", "png", "webp", "gif", "avif"] as const) {
      const sample = await sharp(pixels, { raw: { width: 32, height: 32, channels: 3 } }).toFormat(format).toBuffer();
      const uploaded = await uploadImage(sample);
      assert.equal(uploaded.width, 32);
      assert.equal(uploaded.height, 32);
      assert.match(uploaded.phash, /^[0-9a-f]{16}$/);
      assert.equal(contentTypes.get(uploaded.key), `image/${format}`);
      assert.deepEqual(objects.get(uploaded.key), sample);
      for (const size of ["grid", "detail"] as const) {
        const thumb = await sharp(objects.get(imageObjectKey(uploaded.key, size))!).metadata();
        assert.equal(thumb.format, "webp");
        assert.equal(thumb.width, 32);
      }
      await deleteImageObjects(uploaded.key);
    }
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
    await assert.rejects(uploadImage(svg), /Unsupported image format/);
    const tiff = await sharp(pixels, { raw: { width: 32, height: 32, channels: 3 } }).tiff().toBuffer();
    await assert.rejects(uploadImage(tiff), /Unsupported image format/);
    assert.equal(objects.size, 0);
    console.log(`PASS: JPEG/PNG/WebP/GIF/AVIF uploads, MIME types, thumbnails; SVG/TIFF rejection (sharp ${sharp.versions.sharp}, libvips ${sharp.versions.vips}, libheif ${sharp.versions.heif})`);
    const png = await sharp(pixels, { raw: { width: 32, height: 32, channels: 3 } }).png().toBuffer();
    await client.batch([
      "INSERT INTO folders(id,name) VALUES ('upload-folder','Upload folder')",
      "INSERT INTO tags(id,name) VALUES ('upload-tag','upload-tag')",
    ], "write");
    const details = { filename: "texture.png", size: png.length, hash: sha256(png), folderId: "upload-folder", tagId: "upload-tag" };
    const grant = await prepareUpload(details, "test-owner");
    assert(grant.ticket && grant.url);
    const temporaryKey = new URL(grant.url).pathname.slice(1);
    assert(temporaryKey.startsWith("uploads/"));
    assert.equal(new URL(grant.url).searchParams.get("X-Amz-Expires"), "900");
    assert.match(new URL(grant.url).searchParams.get("X-Amz-SignedHeaders")!, /content-length/);
    assert(!Buffer.from(grant.ticket.split(".")[0], "base64url").toString().includes('"test-owner"'));
    objects.set(temporaryKey, png);
    await assert.rejects(finalizeUpload(grant.ticket, "wrong-owner"), /different session/);
    await assert.rejects(finalizeUpload(grant.ticket + "x", "test-owner"), /Invalid upload ticket/);
    const realNow = Date.now;
    const clock = mock.method(Date, "now", () => realNow() + 16 * 60 * 1000);
    await assert.rejects(finalizeUpload(grant.ticket, "test-owner"), /expired/);
    clock.mock.restore();
    assert(objects.has(temporaryKey), "Invalid tickets must never delete an object");
    const completed = await Promise.all([finalizeUpload(grant.ticket, "test-owner"), finalizeUpload(grant.ticket, "test-owner")]);
    assert.equal(completed.filter((result) => result.status === "ok").length, 1);
    assert.equal(completed.filter((result) => result.status === "duplicate").length, 1);
    assert.equal((await client.execute("SELECT * FROM image_folders WHERE folder_id='upload-folder'")).rows.length, 1);
    assert.equal((await client.execute("SELECT * FROM image_tags WHERE tag_id='upload-tag'")).rows.length, 1);
    assert(!objects.has(temporaryKey));
    assert.equal((await prepareUpload(details, "test-owner")).status, "duplicate");
    const wrongSize = await prepareUpload({ ...details, hash: "d".repeat(64), size: png.length + 1 }, "test-owner");
    assert(wrongSize.ticket && wrongSize.url);
    objects.set(new URL(wrongSize.url).pathname.slice(1), png);
    await assert.rejects(finalizeUpload(wrongSize.ticket, "test-owner"), /size does not match/);
    assert(!objects.has(new URL(wrongSize.url).pathname.slice(1)));
    await assert.rejects(prepareUpload({ ...details, size: MAX_UPLOAD_BYTES + 1 }, "test-owner"));
    await assert.rejects(prepareUpload({ ...details, size: 0 }, "test-owner"));
    const bad = await prepareUpload({ ...details, hash: "e".repeat(64) }, "test-owner");
    assert(bad.ticket && bad.url);
    objects.set(new URL(bad.url).pathname.slice(1), png);
    await assert.rejects(finalizeUpload(bad.ticket, "test-owner"), /checksum/);
    assert(!objects.has(new URL(bad.url).pathname.slice(1)));
    const oldKey = `uploads/${Date.now() - 25 * 60 * 60 * 1000}/00000000-0000-4000-8000-000000000000`;
    objects.set(oldKey, png);
    const freshKey = `uploads/${Date.now()}/00000000-0000-4000-8000-000000000000`;
    objects.set(freshKey, png);
    assert.deepEqual(await purgeExpiredUploads(), { uploadsRemoved: 1, uploadsFailed: 0 });
    assert(!objects.has(oldKey));
    assert(objects.has(freshKey));
    objects.delete(freshKey);
    console.log("PASS: direct upload expiry, session binding, tampering, signed limits, checksum verification, duplicate preflight, temporary cleanup");
    const row = (await client.execute("SELECT * FROM images")).rows[0];
    assert.equal(row.title, "texture");
    assert.equal(String(row.phash).length, 16);
    assert.equal(objects.size, 3);
    assert.deepEqual(await ingestImage(png, "renamed.png"), { status: "duplicate", existingId: row.id });
    const reencoded = await sharp(png).png({ compressionLevel: 0 }).toBuffer();
    assert.notEqual(sha256(reencoded), sha256(png));
    assert.equal((await ingestImage(reencoded, "reencoded.png")).status, "duplicate");
    assert.equal(objects.size, 3);
    assert.equal((await ingestImage(Buffer.alloc(0), "empty.png")).status, "error");
    assert.equal((await ingestImage(Buffer.alloc(MAX_UPLOAD_BYTES + 1), "large.png")).status, "error");
    assert.equal((await ingestImage(Buffer.from("not an image"), "bad.png")).status, "error");

    // Run the real CLI in a child process with a preload that blocks live R2.
    // Environment overrides dotenv's .env.local, keeping all data in this temp DB.
    const fixture = join(dir, "cli-texture.png");
    await writeFile(fixture, png);
    const envFile = join(dir, ".env");
    await writeFile(envFile, "");
    const preload = join(dir, "mock-r2.cjs");
    const commandLog = join(dir, "commands.jsonl");
    await writeFile(preload, `
      const { S3Client } = require(${JSON.stringify(resolveModule("@aws-sdk/client-s3"))});
      S3Client.prototype.send = async function(command) {
        if (!["PutObjectCommand", "DeleteObjectCommand"].includes(command.constructor.name)) throw new Error("Unexpected command");
        require("node:fs").appendFileSync(${JSON.stringify(commandLog)}, JSON.stringify(command.input.Key) + "\\n");
        return {};
      };
    `);
    const runCli = (file: string) => spawnSync(process.execPath, ["--require", preload, "--import", "tsx", "scripts/ingest-file.ts", file], {
      cwd: process.cwd(), env: { ...process.env, TURSO_AUTH_TOKEN: "", DOTENV_CONFIG_PATH: envFile }, encoding: "utf8",
    });
    const duplicateCli = runCli(fixture);
    assert.equal(duplicateCli.status, 0, duplicateCli.stderr);
    assert.match(duplicateCli.stdout, /Already exists/);

    const different = await sharp({ create: { width: 12, height: 12, channels: 3, background: "red" } }).png().toBuffer();
    const cliFixture = join(dir, "cli-new.png");
    await writeFile(cliFixture, different);
    const newCli = runCli(cliFixture);
    assert.equal(newCli.status, 0, newCli.stderr);
    assert.match(newCli.stdout, /Inserted image/);
    const cliRow = (await client.execute("SELECT * FROM images WHERE title='cli-new'")).rows[0];
    assert.equal(cliRow.hash, sha256(different));
    assert.equal(String(cliRow.phash).length, 16);
    assert.equal((await readFile(commandLog, "utf8")).trim().split("\n").length, 3);
    await client.execute("DELETE FROM images WHERE title='cli-new'");

    // Force a DB insert failure AFTER storage succeeds; only this attempt is removed.
    await client.execute("CREATE TRIGGER reject_test_import BEFORE INSERT ON images BEGIN SELECT RAISE(FAIL, 'Injected insert failure'); END");
    assert.equal((await ingestImage(different, "failure.png")).status, "error");
    assert.equal(objects.size, 3);
    await client.execute("DROP TRIGGER reject_test_import");
    failPut = true;
    assert.equal((await ingestImage(different, "partial.png")).status, "error");
    failPut = false;
    assert.equal(objects.size, 3);
    const concurrent = await Promise.all([ingestImage(different, "race.png"), ingestImage(different, "race.png")]);
    assert.equal(concurrent.filter((r) => r.status === "ok").length, 1);
    assert.equal(concurrent.filter((r) => r.status === "duplicate").length, 1);
    for (const stored of (await client.execute("SELECT r2_key FROM images")).rows) {
      for (const size of ["original", "grid", "detail"] as const) assert(objects.has(imageObjectKey(String(stored.r2_key), size)));
    }
    assert.equal(objects.size, 6);
    assert.equal(imageObjectKey(`originals/${sha256(png)}`, "grid"), `thumbs/grid/${sha256(png)}.webp`);
    assert.throws(() => imageObjectKey("../other-bucket", "grid"));
    const { GET: imageRoute } = await import("../app/api/img/[size]/[hash]/route");
    const { GET: downloadRoute } = await import("../app/api/download/[id]/route");
    const legacyHash = "f".repeat(64);
    const legacyKey = `originals/${legacyHash}`;
    await client.execute({
      sql: "INSERT INTO images(id,r2_key,width,height,hash,title) VALUES ('legacy-route',?,32,32,?,?)",
      args: [legacyKey, legacyHash, "\u6d77\u666f '()"],
    });
    for (const size of ["original", "grid", "detail"] as const) objects.set(imageObjectKey(legacyKey, size), png);
    for (const [id, hash, key] of [[String(row.id), String(row.hash), String(row.r2_key)], ["legacy-route", legacyHash, legacyKey]]) {
      for (const size of ["original", "grid", "detail"] as const) {
        const response = await imageRoute(new Request("http://localhost"), { params: Promise.resolve({ size, hash }) });
        assert.equal(response.status, 302);
        assert(new URL(response.headers.get("location")!).pathname.endsWith(imageObjectKey(key, size)));
      }
      const download = await downloadRoute(new Request("http://localhost"), { params: Promise.resolve({ id }) });
      assert.equal(download.status, 200);
      if (id === "legacy-route") {
        assert.equal(download.headers.get("content-disposition"),
          "attachment; filename=\"__ '().png\"; filename*=UTF-8''%E6%B5%B7%E6%99%AF%20%27%28%29.png");
      }
      assert.deepEqual(Buffer.from(await download.arrayBuffer()), png);
    }
    await client.execute("DELETE FROM images WHERE id='legacy-route'");
    for (const size of ["original", "grid", "detail"] as const) objects.delete(imageObjectKey(legacyKey, size));
    console.log("PASS: web + CLI ingestion, metadata, SHA/dHash dedup, validation, failed writes, concurrent rollback, legacy keys");

    const { restoreTrashImages, purgeTrash } = await import("../modules/manage/trash");
    const { TRASH_RETENTION_MS, trashDaysLeft } = await import("../modules/manage/retention");
    const now = Date.now();
    const cutoff = now - TRASH_RETENTION_MS;
    const imageId = String(row.id);
    for (const [deletedAt, expected] of [[cutoff + 1, 1], [cutoff, 0], [cutoff - 1, 0]]) {
      await client.execute({ sql: "UPDATE images SET deleted_at=? WHERE id=?", args: [deletedAt, imageId] });
      assert.equal((await restoreTrashImages([imageId], now)).restored, expected);
    }
    assert.equal(trashDaysLeft(cutoff + 1, now), 1);
    assert.equal(trashDaysLeft(cutoff, now), 0);
    assert.equal((await restoreTrashImages(["missing"], now)).restored, 0);
    await client.execute({ sql: "UPDATE images SET deleted_at=? WHERE id=?", args: [now, imageId] });
    assert.deepEqual(await purgeTrash({ expiredOnly: true, now }), { removed: 0, failed: 0 });
    // Start manual deletion of an unexpired image; restore must fail even if R2 fails.
    failDelete = true;
    onDelete = async () => assert.equal((await restoreTrashImages([imageId], now)).restored, 0);
    assert.deepEqual(await purgeTrash({ ids: [imageId], now }), { removed: 0, failed: 1 });
    onDelete = undefined;
    assert.equal((await client.execute({ sql: "SELECT * FROM images WHERE id=?", args: [imageId] })).rows.length, 1);
    failDelete = false;
    assert.deepEqual(await purgeTrash({ expiredOnly: true, now }), { removed: 1, failed: 0 });
    assert.equal((await restoreTrashImages([imageId], now)).restored, 0);
    assert.deepEqual(await purgeTrash({ ids: [imageId], now }), { removed: 0, failed: 0 });
    const active = (await client.execute("SELECT * FROM images")).rows[0];
    assert.deepEqual(await purgeTrash({ ids: [String(active.id)], now }), { removed: 0, failed: 0 });
    await client.execute({ sql: "UPDATE images SET deleted_at=? WHERE id=?", args: [cutoff, active.id] });
    assert.deepEqual(await purgeTrash({ expiredOnly: true, now }), { removed: 1, failed: 0 });
    assert.equal(objects.size, 0);
    console.log("PASS: 30-day boundaries, exact counts, active-image protection, deletion/restore race, failure retention + retry");

    const { GET } = await import("../app/api/cron/purge-trash/route");
    const { proxy } = await import("../proxy");
    const { NextRequest } = await import("next/server");
    delete process.env.CRON_SECRET;
    const request = (authorization?: string) => new Request("http://localhost/api/cron/purge-trash", {
      headers: authorization ? { authorization } : {},
    });
    assert.equal((await GET(request())).status, 503);
    process.env.CRON_SECRET = "test-cron-secret-1234567890";
    assert.equal((await GET(request())).status, 401);
    assert.equal((await GET(request("Bearer wrong"))).status, 401);
    assert.equal((await GET(request(`Bearer ${process.env.CRON_SECRET}`))).status, 200);
    process.env.APP_PASSCODE = "123456";
    assert.equal(proxy(new NextRequest("http://localhost/api/cron/purge-trash")).headers.get("x-middleware-next"), "1");
    assert.match(proxy(new NextRequest("http://localhost/library")).headers.get("location") ?? "", /unlock/);
    console.log("PASS: cron missing/wrong/valid secret, exact proxy exception, normal gate preserved");
  } catch (error) {
    console.error("Audit check failed", error);
    throw error;
  } finally {
    client.close();
    fresh.close();
    closeAppDb();
    mock.restoreAll();
    assert(dir.startsWith(join(tmpdir(), "bits-audit-")), "Cleanup must stay in the temporary test directory");
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
      .catch((error) => console.warn("Temporary test files could not yet be removed", dir, error));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
