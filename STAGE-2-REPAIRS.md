# Stage 2 repair progress

Updated: 2026-09-14.

## Authorized scope

Implement S2-01 through S2-06 in order. Browser uploads must support 50 MiB through direct uploads to private R2 (S2-03). Standardize on Node 24 (S2-06). Keep project content in English. Pause before the next issue if remaining Codex usage is insufficient, then resume after reset. Do not start stage 3 before user acceptance. S2-07 is outside this repair authorization.

## S2-01: implemented and locally verified; deployment pending

- Updated Next.js and eslint-config-next from 16.2.4 to 16.3.5 together.
- Updated React and React DOM from 19.2.4 to 19.2.8, staying on the existing minor line.
- Regenerated pnpm-lock.yaml with pnpm 10.28.0, matching the observed production installer.
- Added `pnpm test:auth`, to run after a production build. It starts the actual Next.js production server against temporary SQLite with fake storage credentials and a test passcode. It checks HTML, RSC, segment-prefetch paths, middleware-subrequest headers, the real unlock Server Action, secure cookies, authenticated rendering and the exact cron authorization exception. No live database or bucket is used.

Validation: production build, TypeScript, existing isolated ingestion/trash/migration regression checks, and the new production-server authentication checks passed. The new test script passes ESLint. Full-repository lint remediation remains S2-05.

The updated framework normalizes authenticated RSC requests to include `_rsc`. The test uses that canonical request form. The framework also now ignores the unrelated parent-directory lockfile by default, with a warning; no S2-07 configuration change was made.

These changes have not been pushed or deployed yet. Resume by checking the local commit and deploying/verifying S2-01 before starting S2-02.

## Remaining sequence

1. S2-02: update direct sharp to 0.35.4; verify native libraries and representative JPEG/PNG/WebP/GIF/AVIF inputs, thumbnails and dHash. Next.js now pulls its own sharp 0.35.4, but the application's direct dependency remains 0.34.5 until this step. Check AVIF metadata naming (`heif` with AV1 compression) against the existing format allow-list rather than assuming the advertised AVIF path works.
2. S2-03: implement authenticated direct-to-private-R2 uploads up to 50 MiB, followed by server-side validation and finalization; preserve deduplication, folder/tag assignment and failure cleanup. Verify expiry, ownership, size/content validation and bucket CORS without making the bucket public.
3. S2-04: update relevant compatible/transitive packages, move shadcn to devDependencies while preserving its CSS import, remove unused better-sqlite3 types, and document residual audit findings. Avoid forced migration-tool overrides.
4. S2-05: fix source lint issues and enforce lint, types, isolated checks and build before production promotion.
5. S2-06: unify Node 24, matching types and version documentation; pin pnpm 10.28.0 and verify a frozen install/native dependencies.

## Resume notes

- Paused after local S2-01 validation because the five-hour window had 7% remaining. Reported reset: 2026-09-14 20:18:54 UTC (21:18:54 Europe/London).
- A one-run thread heartbeat is scheduled for 21:20 Europe/London under `resume-bits-image-stage-2-repairs`. Check current usage again when it runs; do not redeem reset credits.
- Newly installed pnpm files produced sandbox read-denial errors. Elevated executions of the same isolated checks succeeded. Use explicit `npx --yes pnpm@10.28.0` rather than the Codex pnpm 11 wrapper until S2-06 pins the toolchain.
- Build validation set TURSO_DATABASE_URL to `file::memory:` and replaced storage/passcode variables with test values. Existing `.env.local` contains production credentials and must not be printed.
- Production remains on commit 4349a75 until the pending push/deployment. Prior stage 1 database migrations and the daily R2 trash cleanup remain deployed.
