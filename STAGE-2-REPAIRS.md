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

## S2-03: completed and deployed

Commit a2ce22f implements authenticated `/api/uploads` preparation/finalization, 15-minute signed tickets bound to a hash of the current session, signed PUT length/checksum/content type/conditional creation, bounded server-side reads and SHA verification, existing ingestion/classification reuse, serial browser hashing/uploads, and daily cleanup of abandoned `uploads/` objects older than 24 hours (up to 50 per run). The obsolete full-file Server Action and 51 MB action override are removed.

The production R2 bucket now has a CORS rule for `https://bits-image.vercel.app`, PUT only, headers `content-type`, `x-amz-checksum-sha256`, `if-none-match`, max age 3600. The bucket previously had no CORS policy. The user logged into Cloudflare; after verifying the production domain and absence of an existing policy, saving succeeded. The S3 credentials cannot read/write bucket configuration; use the logged-in Cloudflare dashboard for settings. A small synthetic signed PUT with length, checksum and If-None-Match was accepted by R2 and immediately deleted.

Isolation checks passed for five image formats, ticket tampering/expiry/session ownership, size/checksum rejection, concurrent finalization, folder/tag assignment, duplicate preflight and temporary cleanup. Build, TypeScript, changed-file ESLint and the production-server authentication/Origin/metadata-size/50 MiB-boundary checks passed. Next.js normalizes loopback hostnames in nextUrl; the Origin comparison retains the actual HTTP Host. Failed browser entries can be retried without selecting files again. README/SETUP document the upload flow, CORS and cleanup.

Commit `a2ce22f` is deployed and Ready (Vercel deployment `CrBZLa1CPXxCiYEACCMTvDF8uaFB`). Read-only gallery, thumbnail, download and authentication smoke checks passed. The live upload endpoint accepted 50 MiB metadata; R2 CORS preflight returned 204 for the production origin and did not permit an unrelated origin.

A real 52,428,800-byte synthetic PNG was PUT directly to production R2 and finalized through the production endpoint. The database dimensions/hash, original object length, both WebP thumbnails and duplicate preflight were verified. A title-comparison bug in the local test script was corrected; the application had saved the correct title. The uniquely identified test row and all three permanent objects were then removed, together with its temporary object. No existing user images were deleted. The fixture remains in ignored `backups/`, with its exact name/hash in `backups/s2-03-fixture.json`, for browser testing.

Browser acceptance also passed: the UI uploaded the exact 52,428,800-byte PNG, displayed its new gallery entry, recognized a repeat upload, rejected 52,428,801 bytes, and retried only failed entries. The synthetic row and its three permanent objects were verified and removed on 2026-09-15; no user images were removed.

## S2-04: code complete; manual regression pending

Updated AWS client/presigner to resolved 3.1132.0, libSQL to 0.17.4, Smithy HTTP handler to 4.12.1, Tailwind/PostCSS to 4.3.3 and tsx to 4.23.13. Moved shadcn 4.21.0 to development dependencies while retaining its CSS import. Removed unused better-sqlite3 types. Refreshed vulnerable indirect dependencies within supported ranges, without forced overrides.

TypeScript passed. Full audit now reports three matches (one high, two moderate), down from 93; production-only audit reports zero, down from 88. These are registry advisory matches, not an exploit assessment.

| Remaining advisory | Dependency path | Applicability and decision |
|---|---|---|
| [esbuild development-server disclosure](https://github.com/advisories/GHSA-67mh-4wv8-2f99), moderate | drizzle-kit > @esbuild-kit/esm-loader > @esbuild-kit/core-utils > esbuild 0.18.20 | Migration tooling only. Application does not expose its development server. Retain the stable migration tool instead of forcing an incompatible loader replacement. |
| [ip-address](https://github.com/advisories/GHSA-v2v4-37r5-5v8g), moderate | shadcn > @modelcontextprotocol/sdk > express-rate-limit 8.4.0 > ip-address 10.1.0 | Development CLI/MCP path, absent from the production dependency graph. Parent pins 10.1.0; an ordinary range refresh cannot replace it. Revisit when the parent updates. |
| [ip-address](https://github.com/advisories/GHSA-mwp4-54f8-5fhr), high | Same shadcn path | Same applicability; do not expose the affected CLI/MCP service. No global override added. |

ESLint was patched to 9.39.5; npm marks this major deprecated. ESLint 10 and TypeScript 7 remain separate major upgrades requiring plugin/API compatibility review. UI libraries unrelated to these advisory paths retain their existing versions.

At the user's request, database migration checks on a disposable copy and runtime/UI regression are delegated to the manual test checklist. No new production database migrations are introduced by S2-04.

## S2-05: code complete; interaction acceptance pending

Removed the reported source diagnostics without disabling React hook rule families. Closed dialogs reset their own guarded state; the shared detail editor keys its form by image ID. Folder expansion and tag-filter state update with route changes. Both PWA features subscribe to browser state, and pull-to-refresh renders tracking from state rather than reading refs during render. Cancelled/multi-touch gestures stop tracking. Viewer state resets by image ID, and pan correction uses post-layout DOM bounds before paint. Thumbnail img elements retain two narrow, documented lint exceptions.

The repository build now runs the shared check command (lint with zero warnings, route generation and TypeScript), then the isolated audit checks, then Next.js compilation. ESLint and TypeScript exclude local backup/store artifacts. Next route types use the [documented typegen command](https://nextjs.org/docs/app/api-reference/cli/next#next-typegen-options). The installed documentation directory was no longer present after package refresh, so the official Next.js documentation was used.

Static validation: the full source lint run had only the viewer pan diagnostic remaining; after its fix the viewer lint check passed with zero warnings. Route generation and TypeScript passed. Runtime/browser checks and a fresh production build are intentionally delegated to [STAGE-2-TEST-CHECKLIST.md](STAGE-2-TEST-CHECKLIST.md), following the user's quota-saving request.

## Remaining sequence

- S2-06: unify Node 24, matching types and version documentation; pin pnpm 10.28.0 and define native install-script policy.
- User performs the remaining runtime checks and accepts stage 2 before stage 3 begins.

## Working notes

Use pnpm 10.28.0. Production credentials remain in ignored .env.local and must not be printed. S2-01 through S2-03 are deployed; subsequent changes are local until explicitly recorded as pushed. Do not redeem reset credits.
