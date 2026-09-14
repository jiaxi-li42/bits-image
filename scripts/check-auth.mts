// Run after next build: node --import tsx scripts/check-auth.mts.
// A real production server, temporary SQLite and fake credentials only.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

const dir = await mkdtemp(join(tmpdir(), "bits-auth-"));
const databaseUrl = `file:${join(dir, "auth.db").replaceAll("\\", "/")}`;
const client = createClient({ url: databaseUrl });
const sentinel = "PRIVATE_AUTH_CHECK_SENTINEL";
const origin = "http://127.0.0.1:3199";
let server: ReturnType<typeof spawn> | undefined;
try {
  await migrate(drizzle(client), { migrationsFolder: "db/migrations" });
  await client.execute({ sql: "INSERT INTO folders(id,name) VALUES ('auth-check',?)", args: [sentinel] });
  const manifest = JSON.parse(await readFile(".next/server/server-reference-manifest.json", "utf8"));
  const actionId = Object.entries(manifest.node as Record<string, { exportedName: string }>)
    .find(([, entry]) => entry.exportedName === "verifyPasscode")?.[0];
  assert(actionId, "The build must include the actual unlock action");
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3199"], {
    env: { ...process.env, NODE_ENV: "production", TURSO_DATABASE_URL: databaseUrl, TURSO_AUTH_TOKEN: "",
      APP_PASSCODE: "123456", CRON_SECRET: "isolated-auth-check-secret", R2_ACCOUNT_ID: "test",
      R2_ACCESS_KEY_ID: "test", R2_SECRET_ACCESS_KEY: "test", R2_BUCKET: "test" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  server.stdout?.on("data", (data) => { output += data; });
  server.stderr?.on("data", (data) => { output += data; });
  for (let attempt = 0; ; attempt++) {
    assert(server.exitCode === null && attempt < 100, `Test server did not start: ${output}`);
    if (output.includes("Ready in")) break;
    await delay(300);
  }
  const request = (path: string, init?: RequestInit) => fetch(origin + path, {
    ...init, redirect: "manual", signal: AbortSignal.timeout(30000),
  });
  const protectedPaths = ["/library", "/inbox", "/trash", "/api/download/missing",
    "/api/img/grid/" + "0".repeat(64), "/library.rsc", "/library.segments/_tree.segment.rsc"];
  for (const path of protectedPaths) {
    for (const headers of [{}, { RSC: "1", "Next-Router-Prefetch": "1" },
      { "x-middleware-subrequest": "proxy:proxy:proxy:proxy:proxy" }]) {
      const response = await request(path, { headers: headers as HeadersInit });
      assert.equal(response.status, 307, `${path} must run the passcode gate`);
      assert.match(response.headers.get("location") ?? "", /\/unlock/);
      assert(!(await response.text()).includes(sentinel));
    }
  }
  const unlock = await request("/unlock");
  assert.equal(unlock.status, 200);
  assert(!(await unlock.text()).includes(sentinel));
  const action = (code: string, path = "/unlock") => request(path, { method: "POST",
    headers: { "Next-Action": actionId, "Content-Type": "text/plain;charset=UTF-8", Origin: origin },
    body: JSON.stringify([code]),
  });
  const blockedAction = await action("123456", "/library");
  assert.equal(blockedAction.status, 307);
  assert.equal(blockedAction.headers.get("set-cookie"), null);
  const wrong = await action("654321");
  assert.equal(wrong.status, 200);
  assert.match(await wrong.text(), /Incorrect code/);
  assert.equal(wrong.headers.get("set-cookie"), null);
  const success = await action("123456");
  assert.equal(success.status, 200);
  const cookie = success.headers.get("set-cookie");
  assert(cookie && cookie.includes("bits-auth="));
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /SameSite=lax/i);
  for (const headers of [{}, { RSC: "1" }]) {
    const library = await request("RSC" in headers ? "/library?_rsc" : "/library", {
      headers: { ...headers, Cookie: cookie.split(";")[0] } as HeadersInit,
    });
    assert.equal(library.status, 200, `Unexpected authenticated redirect: ${library.headers.get("location")}`);
    assert((await library.text()).includes(sentinel), "Authenticated rendering must read the isolated database");
  }
  assert.equal((await request("/api/cron/purge-trash")).status, 401);
  assert.equal((await request("/api/cron/purge-trash", { headers: { Authorization: "Bearer isolated-auth-check-secret" } })).status, 200);
  assert.equal((await request("/api/cron/purge-trash/extra")).status, 307);
  console.log("PASS: production HTML/RSC/prefetch gates, real unlock action, secure cookie, authenticated rendering, exact cron exception");
} finally {
  if (server && server.exitCode === null) {
    const stopped = once(server, "exit");
    server.kill();
    await stopped;
  }
  client.close();
  assert(dir.startsWith(join(tmpdir(), "bits-auth-")));
  await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
