# Stage 2 repair progress

Updated: 2026-09-15.

## Authorized scope

Implement S2-01 through S2-06 in order. Browser uploads must support 50 MiB through direct uploads to private R2 (S2-03). Standardize on Node 24 (S2-06). Keep project content in English. Pause before the next issue if remaining Codex usage is insufficient, then resume after reset. Do not start stage 3 before user acceptance. S2-07 is outside this repair authorization.

## S2-01: completed and deployed

- Updated Next.js and eslint-config-next from 16.2.4 to 16.3.5 together.
- Updated React and React DOM from 19.2.4 to 19.2.8, staying on the existing minor line.
- Regenerated pnpm-lock.yaml with pnpm 10.28.0, matching the observed production installer.
- Added `pnpm test:auth`, to run after a production build. It starts the actual Next.js production server against temporary SQLite with fake storage credentials and a test passcode. It checks HTML, RSC, segment-prefetch paths, middleware-subrequest headers, the real unlock Server Action, secure cookies, authenticated rendering and the exact cron authorization exception. No live database or bucket is used.

Validation: production build, TypeScript, existing isolated ingestion/trash/migration regression checks, and the new production-server authentication checks passed. The new test script passes ESLint. Full-repository lint remediation remains S2-05.

The updated framework normalizes authenticated RSC requests to include `_rsc`. The test uses that canonical request form. The framework also now ignores the unrelated parent-directory lockfile by default, with a warning; no S2-07 configuration change was made.

Commit `cfbfecd` was pushed to master. Vercel marked its production deployment Ready on 2026-09-14. Production smoke checks passed: anonymous access redirects to unlock, anonymous cron access returns 401, authenticated gallery rendering succeeds, and an existing thumbnail and original download return 200. These checks were read-only.

## S2-02: completed and deployed

- Updated the direct sharp dependency to 0.35.4; the application and Next.js now resolve the patched release.
- Fixed AVIF rejection by recognizing the HEIF decoder's AV1 compression and storing `image/avif`; HEIC is not added to the allowed formats.
- Extended isolated checks to upload JPEG, PNG, WebP, GIF and AVIF, verify original bytes/MIME types and both WebP thumbnails, and reject SVG/TIFF.
- Windows reports libvips 8.18.6 and libheif 1.23.2. All five pre-upgrade sample files produce unchanged dHash values. The full isolated audit checks, changed-file ESLint and production build passed.
- The build command now runs the isolated audit checks before Next.js, so native decoding is also verified in the actual Linux build environment. S2-05 will complete the remaining lint/type/build gate.

Commit `9b6c558` is deployed and Ready. Its Linux build ran the isolated checks successfully, and production read-only gallery/thumbnail/download smoke checks passed.

## S2-03: deployed; browser acceptance pending

Working-tree changes implement authenticated `/api/uploads` preparation/finalization, 15-minute signed tickets bound to a hash of the current session, signed PUT length/checksum/content type/conditional creation, bounded server-side reads and SHA verification, existing ingestion/classification reuse, serial browser hashing/uploads, and daily cleanup of abandoned `uploads/` objects older than 24 hours (up to 50 per run). The obsolete full-file Server Action and 51 MB action override are removed.

The production R2 bucket now has a CORS rule for `https://bits-image.vercel.app`, PUT only, headers `content-type`, `x-amz-checksum-sha256`, `if-none-match`, max age 3600. The bucket previously had no CORS policy. The user logged into Cloudflare; after verifying the production domain and absence of an existing policy, saving succeeded. The S3 credentials cannot read/write bucket configuration; use the logged-in Cloudflare dashboard for settings. A small synthetic signed PUT with length, checksum and If-None-Match was accepted by R2 and immediately deleted.

Isolation checks passed for five image formats, ticket tampering/expiry/session ownership, size/checksum rejection, concurrent finalization, folder/tag assignment, duplicate preflight and temporary cleanup. Build, TypeScript, changed-file ESLint and the production-server authentication/Origin/metadata-size/50 MiB-boundary checks passed. Next.js normalizes loopback hostnames in nextUrl; the Origin comparison retains the actual HTTP Host. Failed browser entries can be retried without selecting files again. README/SETUP document the upload flow, CORS and cleanup.

Commit `a2ce22f` is deployed and Ready (Vercel deployment `CrBZLa1CPXxCiYEACCMTvDF8uaFB`). Read-only gallery, thumbnail, download and authentication smoke checks passed. The live upload endpoint accepted 50 MiB metadata; R2 CORS preflight returned 204 for the production origin and did not permit an unrelated origin.

A real 52,428,800-byte synthetic PNG was PUT directly to production R2 and finalized through the production endpoint. The database dimensions/hash, original object length, both WebP thumbnails and duplicate preflight were verified. A title-comparison bug in the local test script was corrected; the application had saved the correct title. The uniquely identified test row and all three permanent objects were then removed, together with its temporary object. No existing user images were deleted. The fixture remains in ignored `backups/`, with its exact name/hash in `backups/s2-03-fixture.json`, for browser testing.

Remaining S2-03 work: perform the same upload through the browser UI, confirm duplicate/retry behavior, and clean only that synthetic sample. The app is at its Verification Code screen; an asynchronous request asked the user to unlock it without sharing the passcode in chat. Tabs 6 and 7 are the production unlock page, tab 4 is Vercel, and tab 5 is Cloudflare settings. Recheck tabs/cookies on resume. Do not mark S2-03 complete or begin S2-04 before browser acceptance. All current shell validation commands completed; no test server was intentionally left running.

## Remaining sequence

2. S2-03: implement authenticated direct-to-private-R2 uploads up to 50 MiB, followed by server-side validation and finalization; preserve deduplication, folder/tag assignment and failure cleanup. Verify expiry, ownership, size/content validation and bucket CORS without making the bucket public.
3. S2-04: update relevant compatible/transitive packages, move shadcn to devDependencies while preserving its CSS import, remove unused better-sqlite3 types, and document residual audit findings. Avoid forced migration-tool overrides.
4. S2-05: fix source lint issues and enforce lint, types, isolated checks and build before production promotion.
5. S2-06: unify Node 24, matching types and version documentation; pin pnpm 10.28.0 and verify a frozen install/native dependencies.

## Resume notes

- Check current usage before the next issue; do not redeem reset credits. This checkpoint awaits browser unlock, not a quota reset.
- Newly installed pnpm files produced sandbox read-denial errors. Elevated executions of the same isolated checks succeeded. Use explicit `npx --yes pnpm@10.28.0` rather than the Codex pnpm 11 wrapper until S2-06 pins the toolchain.
- Build validation set TURSO_DATABASE_URL to `file::memory:` and replaced storage/passcode variables with test values. Existing `.env.local` contains production credentials and must not be printed.
- Production is on `a2ce22f`. Prior stage 1 database migrations and the daily R2 trash cleanup remain deployed; this release also cleans abandoned temporary uploads.
