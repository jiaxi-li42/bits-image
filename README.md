# Bits Image

A shared cloud image library for individuals and studios: upload, organise, search, browse, download, and manage deleted images.

## Features and scope

- Next.js 16 App Router, React 19, and TypeScript; Turso/libSQL with Drizzle stores metadata, and Cloudflare R2 stores images.
- Library contains active images; Inbox contains untagged images; Organised contains tagged images. Adding an image to a folder does not change this classification.
- Images can have multiple tags and folders. Folders support three levels; adding to a child also adds its ancestors.
- Device uploads, page drag-and-drop, and CLI ingestion share SHA-256 and approximate dHash duplicate detection.
- Masonry pagination, an image viewer, automatic metadata saving, full-text search, and bulk management.
- One shared library protected by a six-digit passcode; no individual accounts, roles, or private user libraries.
- PWA installation, pull-to-refresh, and an offline unlock page; no offline gallery.
- Clipboard, remote URL, system share-target ingestion, and AI classification are not implemented. Source URL is metadata only.
- The web uploader accepts JPEG, PNG, WebP, and AVIF. Storage processing also accepts GIF; complete animation support is outside this repair.
- Browser and CLI uploads support files up to 50 MiB. Browser file bytes go directly to private R2; Vercel receives small metadata/finalization requests.

## Local setup

Requirements: Node.js 24.x, pnpm 10.28.0, a Turso database, and an R2 bucket. Use the same Node major in local development, CI and Vercel. `.nvmrc` and `engines.node` record the required version; Node type declarations also use version 24.

Select Node 24 with your Node version manager, then activate pnpm 10.28.0 with Corepack if available, or install that exact pnpm version. `packageManager` pins it and `.npmrc` rejects mismatched engines/package managers. These files do not replace an existing system Node installation.

Dependency installation allows build scripts only for `esbuild`, `sharp`, and `unrs-resolver`, as recorded in `pnpm-workspace.yaml`. Other dependency scripts remain blocked. Install development dependencies for builds: shadcn supplies a build-time stylesheet.

1. Create a Turso database and obtain its URL and access token.
2. Create a private R2 bucket and API credentials with object read/write access to that bucket.
3. Install the locked dependencies and copy the environment template:

```sh
pnpm install --frozen-lockfile
```

PowerShell:

```powershell
Copy-Item .env.example .env.local
```

macOS/Linux:

```sh
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Purpose |
|---|---|
| TURSO_DATABASE_URL | Database URL; isolated local development can use a file: path |
| TURSO_AUTH_TOKEN | Remote database token; leave empty for local SQLite |
| R2_ACCOUNT_ID | Cloudflare account ID |
| R2_ACCESS_KEY_ID | R2 API access key ID |
| R2_SECRET_ACCESS_KEY | R2 API secret access key |
| R2_BUCKET | Bucket name; defaults to bits-image |
| APP_PASSCODE | A six-digit passcode of your choice; required in production |
| CRON_SECRET | An independent random secret for scheduled cleanup |

`.env.local` is excluded from Git; `.env.example` contains only empty values or placeholders.
Development permits access without a passcode; production requires one. Rotating the passcode invalidates existing access cookies.

4. Confirm that the configuration points to the intended database, apply existing migrations, and start:

```sh
pnpm db:migrate
pnpm dev
```

Open [localhost:3000](http://localhost:3000) and unlock the library.

## Database migrations

**Initialisation and deployment must run the complete `db:migrate` migration chain.**
Do not substitute `drizzle-kit push`: the FTS5 table and triggers are created by handwritten SQL and are not represented in the Drizzle schema.

- New environments do not need `db:generate`. Generate a new migration only after a deliberate schema change during development.
- Commit migration SQL, `meta/_journal.json`, and snapshots. Do not rewrite applied migrations.
- `0004_trash_and_folder_cascade` adds a deletion-in-progress marker and rebuilds the folder table with cascading parent deletion. It preserves folders and image associations, and rolls back if foreign-key violations are found.
- Before upgrading an existing environment, back up the database, test the migration on a copy, and pause application writes. Migrate before starting the new application version.
- `scripts/check-tables.ts` lists tables and migration records; it does not replace migration verification.

## Image storage and ingestion

```sh
pnpm ingest path/to/image.png
```

The web finalization endpoint and CLI share size validation, SHA/dHash duplicate detection, metadata, and failure cleanup.
Perceptual hashing is a heuristic and can miss or misidentify matches. The existing algorithm and threshold are retained; not every format conversion is guaranteed to match.
After CLI ingestion, refresh open pages; the sidebar cache may require an application restart.

Browser uploads require a configured passcode, including during local development. The browser hashes and uploads one file at a time. Exact duplicates skip file transfer while retaining folder/tag assignment. Failed entries can be retried with **Upload / retry**.

`POST /api/uploads` requires the access cookie and same-origin requests. It issues a 15-minute ticket bound to the current shared passcode session (there are no individual accounts). The signed R2 PUT constrains the temporary key, exact length, SHA-256 checksum, content type and conditional creation. Finalization verifies the actual bytes and image format before writing permanent objects and metadata. Changing the passcode invalidates outstanding tickets. Temporary objects are removed after finalization; the daily cleanup catches abandoned uploads older than 24 hours.

Configure the bucket's **CORS Policy** in Cloudflare before using the browser uploader. The production rule is:

```json
[
  {
    "AllowedOrigins": ["https://bits-image.vercel.app"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type", "x-amz-checksum-sha256", "if-none-match"],
    "MaxAgeSeconds": 3600
  }
]
```

For another deployment or local development, add its exact origin (for example `http://localhost:3000`) to the allowed origins. Preserve other existing rules. Do not enable public bucket access. Object read/write credentials may not have permission to edit bucket configuration.

Each new upload attempt owns its storage paths, so a failed concurrent import cannot delete another request's files:

- Original: `originals/<sha256>/<attempt-id>`
- Thumbnails: `thumbs/grid/<sha256>/<attempt-id>.webp` (400px) and `thumbs/detail/…` (1200px)
- Legacy `originals/<sha256>` paths and matching thumbnails remain supported without moving files.
- Temporary direct uploads: `uploads/<timestamp>/<attempt-id>`; never referenced by image rows.

Use the database's `r2_key` as the original path; do not derive physical paths from the hash alone.
Failed uploads attempt to remove their own objects. If storage or database access also fails, logs identify paths requiring inspection rather than risking deletion of committed data.

`pnpm db:reset` permanently removes all images and their objects. It is a maintenance command, not an initialisation step. Failed object deletions leave records in Trash for retry.

## Trash and scheduled cleanup

- Images become unrestorable exactly 30 days after deletion. Only unexpired images whose permanent deletion has not started can be restored.
- Permanent deletion marks the record first, deletes its R2 objects, and removes the database row only after all object deletions succeed.
- Partial failures display Deletion pending and cannot be restored. Manual deletion and the scheduled job can retry them.
- Expired images display Expired until a cleanup invocation removes them.

The cleanup endpoint is `GET /api/cron/purge-trash`. It requires `Authorization: Bearer <CRON_SECRET>`.
A missing server secret returns 503; missing or incorrect credentials return 401. A library passcode cookie does not authorise cleanup.

`vercel.json` schedules daily cleanup at 03:00 UTC. On Vercel Hobby, invocation occurs within the 03:00–03:59 UTC window, rather than at an exact minute ([scheduling limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)). Configure CRON_SECRET in the project's Production environment before deploying the schedule.
Vercel attaches the secret to scheduled requests automatically; see the [official documentation](https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).
Other hosting environments must configure their own scheduler.

Each invocation processes at most 50 trashed images and 50 abandoned temporary uploads. Failures return 503 and leave failed deletions retryable. If a backlog develops, run additional authenticated invocations manually or use a hosting plan that supports more frequent scheduling.
The first invocation also processes existing expired images. Keep secrets out of the repository and public URLs.

## Deployment and checks

This application requires a Node.js server; it cannot be deployed as a static export.

Configure the environment, migrate the target database, and then build and start:

```sh
pnpm build
pnpm start
```

`pnpm build` gates compilation on `pnpm check` (zero-warning ESLint, route type generation and TypeScript) and the isolated audit tests. Vercel uses the explicit pnpm 10.28.0 install/build commands in vercel.json and must run Node 24.x. After a build, `pnpm test:auth` checks the real production server against an isolated database. See [stage 2 manual acceptance](STAGE-2-TEST-CHECKLIST.md) for remaining user-run checks.

The Service Worker registers only in production mode; use build + start to check PWA installation and offline behavior.
The build uses next/font/google and needs access to the Google Fonts service.

`test:audit` uses temporary SQLite, generated fixtures, and mocked R2. It covers migrations, FTS, both ingestion entry points, concurrent rollback, retention boundaries, and cleanup authentication without touching production data.

## Project structure

- `app/`: pages, image access/download routes, and the cleanup endpoint
- `modules/`: ingestion, classification, browsing, management, authentication, and PWA
- `db/`: schema, client, and complete SQL migrations
- `components/ui/`: UI primitives
- `scripts/`: import, verification, and maintenance commands

[PLAN.md](PLAN.md) is a historical plan, not a list of implemented features. [SETUP.md](SETUP.md) points to this guide.
