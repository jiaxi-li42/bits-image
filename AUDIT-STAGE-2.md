# Stage 2 Audit: Dependencies and Build

Date: 2026-09-14. Reviewed commit: `4349a75fae15db77bc1c06de1527a851f1459e67`.

Status: review complete; authorized remediation is tracked in [STAGE-2-REPAIRS.md](STAGE-2-REPAIRS.md). The findings below preserve the original audit baseline.

## Assessment

The current release builds and serves images, but the dependency baseline needs security updates. There are also concrete gaps in upload-limit enforcement and the deployment quality gate. Updating every package to its latest major version is not necessary to address these findings.

All 39 direct dependencies were checked against the npm registry: 27 production and 12 development declarations. Twenty-eight have a newer stable release. Registry `latest` versions are a snapshot, not a recommendation to install every update.

The full lockfile audit returned 93 advisory matches: 2 critical, 40 high, 43 moderate, and 8 low. The production-only audit returned 88: 2 critical, 37 high, 42 moderate, and 7 low. These counts describe package/version matches, not 93 independently exploitable application bugs. In particular, the production declaration of the shadcn CLI pulls development-server packages into the production audit graph.

## S2-01 — P1: Next.js is behind relevant security fixes

Evidence: `package.json:31`, `proxy.ts`, `app/layout.tsx`, `modules/views/list-images.ts`, and the Server Actions under `modules/`.

Next.js and eslint-config-next are pinned to 16.2.4. The lockfile matches 24 Next.js advisories. This application uses App Router, Turbopack, Server Actions, and a proxy-based passcode gate, making the authorization-bypass and Server Action advisories relevant to its design. Rendering an alternative layout for unauthenticated requests does not itself authorize or prevent the child page's data access.

The [segment-prefetch advisory](https://github.com/vercel/next.js/security/advisories/GHSA-267c-6grr-h53f) describes requests that can avoid intended proxy checks. The [July release](https://nextjs.org/blog/july-2026-security-release) includes additional Server Action denial-of-service fixes. The [August release](https://nextjs.org/blog/august-2026-security-release) adds further fixes; upgrading only to 16.2.5 would therefore be insufficient.

Recommendation: upgrade `next` and `eslint-config-next` together to 16.3.5, the stable release verified in the registry. Update React and React DOM together; 19.2.8 is the conservative patch-line candidate, while 19.3.0 is a separate minor-version option. Do not use canary or preview tags for this repair. Recheck passcode gating, transport variants, Server Actions, rendering, and the cron exception against an isolated database.

Applicability limits: no exploit payloads were sent to production. The Windows-hosted mixed Pages/App Router critical advisory does not match this Linux-hosted, App-Router-only deployment. The generic AVIF optimizer advisory should not be described as a demonstrated unauthenticated exploit here: the application serves its own R2 thumbnails and does not import next/image. Direct image decoding remains a separate concern in S2-02.

## S2-02 — P1: sharp directly processes uploads with vulnerable native libraries

Evidence: `package.json:41`, `modules/storage/upload.ts:38`, and `modules/storage/hash.ts`. The installed sharp 0.34.5 reports libvips 8.17.3 and libheif 1.20.2. Next.js currently resolves the same sharp version. Local production traces include sharp in eight route/page bundles.

The [sharp libvips advisory](https://github.com/lovell/sharp/security/advisories/GHSA-f88m-g3jw-g9cj) affects versions before 0.35.0. The [libheif advisory for sharp](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) affects versions before 0.35.4 and explicitly covers processing untrusted input. The application decodes uploaded files for metadata, hashing, and thumbnails. It accepts AVIF and processes GIF on the backend; file-extension filtering alone does not protect the decoder.

Recommendation: update the direct sharp dependency to 0.35.4 alongside S2-01. Next.js 16.3.5 declares optional sharp `^0.35.4`, so both paths can resolve to a patched version. Confirm the resolved native-library versions after installation on Windows and the Linux deployment. Run the existing ingestion tests plus representative supported-format samples; compare dHash behavior because native decoder changes can affect approximate deduplication.

Applicability limits: the observed binary versions are from the local installation; the deployed native-library versions were not introspected. The production lockfile uses the same sharp release. No malicious image was generated or uploaded. One upstream alpha-plane advisory starts at libheif 1.22.0, which is newer than the locally installed library, but the [second upstream advisory](https://github.com/strukturag/libheif/security/advisories/GHSA-2jg2-4ch7-h545) includes versions through 1.23.1. The former is not grounds to dismiss the whole sharp finding.

## S2-03 — P1: The 50 MiB web upload limit exceeds the hosting limit

Evidence: `next.config.ts:7`, `modules/ingestion/ingest.ts:7`, and `modules/ingestion/upload-dialog.tsx:277` / `:354`.

The UI advertises 50 MB, the shared ingestion core permits 50 MiB, and Next.js accepts a 51 MB action body. However, the browser sends the complete file in a Server Action request. Vercel's [function payload limit](https://vercel.com/docs/functions/limitations#request-body-size) is 4.5 MB; increasing the Next.js limit does not increase the platform limit. An otherwise valid image above the hosting limit can be rejected before application validation runs.

Recommendation for the smallest repair: use a web-upload limit with multipart headroom, such as 4 MiB, enforce it both before client-side hashing/upload and in the web action, and show the same limit in the UI. The CLI can retain its separate 50 MiB processing limit because it does not send the file through Vercel. Keep the distinction explicit in documentation.

If 50 MiB browser uploads are a product requirement, use authenticated uploads directly to the private R2 bucket, followed by server-side size/content validation and finalization. That is a larger ingestion change and should be selected explicitly rather than hidden inside a dependency update. Direct upload also needs expiry, ownership, and failed-upload cleanup checks.

Verification limit: this finding is supported by the actual request path and current platform documentation. No oversized upload was sent to production during this stage. Do not infer that streamed original downloads have the same behavior as buffered requests; large-download testing remains separate.

## S2-04 — P2: Transitive dependency debt and tooling classification

Evidence: `package.json`, `pnpm-lock.yaml`, `app/globals.css:3`, and Next.js trace manifests.

The lockfile contains advisory matches in the AWS XML stack, libSQL's WebSocket dependency, CSS/build tooling, and shadcn's CLI/MCP dependencies. Most Hono, Express, qs, and fast-uri paths originate from shadcn. The application imports `shadcn/tailwind.css`, not its JavaScript CLI. The examined local production trace manifests contain no shadcn, Hono, or Express files; this reduces the supported runtime-exposure claim, but does not eliminate installation/tooling risk.

Recommendation: update the AWS SDK pair together and refresh their transitive lockfile resolutions; consider the compatible libSQL 0.17.4 patch before its 0.18.0 minor line. Move shadcn to development dependencies while retaining its build-time CSS import, update it, and re-audit. Removing the package without replacing the stylesheet would break the build and lose the `no-scrollbar` utility and state variants. `@types/better-sqlite3` has no direct use: the app uses `drizzle-orm/libsql` and `@libsql/client`, and better-sqlite3 is not present in the runtime traces. Remove this unnecessary type declaration after confirming typecheck.

Do not apply blanket `audit fix --force` or global overrides. In particular, drizzle-kit 0.31.10 is already the latest stable release and still brings deprecated `@esbuild-kit` loaders and esbuild 0.18.20. The known esbuild development-server issue is not the same as an exposed production endpoint. Keep any residual tool-only advisory documented; avoid an untested forced replacement of the migration loader. Stable drizzle-orm 0.45.2 is also current; do not switch to beta releases just to change version numbers.

Acceptance: rerun both full and production-only audits, list every remaining advisory with its dependency path and applicability, and verify database migration commands on an isolated copy.

## S2-05 — P2: Lint fails, but production deployment does not run it

Evidence: `package.json:7`, `eslint.config.mjs`, and the production build log for commit 4349a75.

Repository source has 15 ESLint errors and 4 warnings. Errors comprise 10 `react-hooks/set-state-in-effect`, 4 `react-hooks/refs`, and 1 `react-hooks/purity` diagnostic. A successful Next.js build does not clear these diagnostics: Next.js 16 no longer runs lint during build. The observed production command is only `pnpm run build`; no repository CI workflow was found.

The unrestricted local `eslint .` invocation additionally scanned the Git-ignored `backups/` directory. At the recorded scan it reported 32 errors and 4 warnings, including 17 `no-require-imports` errors in local audit/maintenance scripts. Those extra errors are not newly introduced application-code defects. ESLint's ignore list needs to distinguish repository source from local generated artifacts.

Recommendation: resolve source diagnostics according to actual lifecycle and interaction behavior, instead of disabling whole rule families. Explicitly ignore local backups/generated artifacts. Add a single verification script or CI job that runs lint, typecheck, the isolated audit checks, and build before promotion. A GitHub check that does not gate Vercel production promotion is not sufficient by itself.

The `<img>` warnings need judgment: this application already generates R2 thumbnails and uses custom viewer behavior. Replacing every `<img>` with next/image solely to silence lint is not justified. Either retain a narrowly explained exception or change the image path when there is a demonstrated benefit. The full mobile/interaction review remains in its later stage.

## S2-06 — P2: Runtime and package-manager versions are not reproducible

Evidence: no `engines`, `packageManager`, or `devEngines.packageManager` in package.json; no repository Node-version file; installed `@types/node` 20.19.39.

Observed environments:

| Surface | Version |
|---|---|
| Local Node executable | 22.13.1 |
| Existing local node_modules installer | pnpm 10.2.1 |
| Available Codex pnpm executable | 11.19.0 |
| Vercel production runtime | Node 24.x |
| Vercel installer in the reviewed build | pnpm 10.28.0 |
| Node type declarations | 20.19.39 |

Vercel explicitly logged that it chose pnpm 10.x based on project creation date. It also warned that build scripts were ignored for esbuild, sharp, msw, and unrs-resolver. The build still passed, and the first-stage production image checks passed; the warning is not evidence that sharp is currently broken. Prebuilt optional packages explain why a successful build is possible, but clean-install behavior should be deliberate.

Recommendation: align local development, CI, and hosting with Node 24 LTS; declare Node 24.x in engines and an appropriate version file; use Node 24 type declarations (24.13.4 at audit time); pin pnpm 10.28.0 as the initial known-working baseline. Verify a clean frozen-lockfile installation before changing pnpm major versions. Review which native/tooling installation scripts are actually required and allow only those, rather than enabling all scripts.

The README's Node >=20.9 requirement reflects the framework minimum, not a current supported production-runtime choice. Node 20 is now EOL according to the [Node release schedule](https://nodejs.org/en/about/previous-releases); update the setup guidance when standardizing the runtime. The latest @types/node 26.x is not the right default merely because it is latest.

## S2-07 — P3: Local build depends on workspace layout and font-network access

Evidence: `next.config.ts`, `app/layout.tsx:2`, and the earlier local build of this repair. A separate `C:/Users/Jia/Documents/GitHub/pnpm-lock.yaml` exists outside this repository. Next.js inferred that parent directory as the local workspace root and warned about multiple lockfiles.

Recommendation: set the Turbopack root explicitly to this project when standardizing the build, rather than deleting the unrelated parent lockfile. This removes accidental dependence on the user's directory layout. Consult the installed `node_modules/next/dist/docs/` guide for the target Next.js version.

The build downloads Geist fonts through next/font/google. Prior local builds required network access to Google Fonts, while the Vercel build succeeded. This is a build-availability dependency, not evidence of a current production outage. If restricted/offline builds must be supported, ship the licensed font assets and use next/font/local; otherwise document the network requirement. No font substitution is required solely for this audit.

## Verification performed and limits

- Read current package declarations, lockfile, installed package metadata, configuration, import paths, native library versions, and local build trace manifests.
- Queried every direct dependency from the official npm registry on 2026-09-14. Prerelease tags were not treated as upgrade targets.
- Ran full and production-only pnpm audits successfully against the registry. Both exited with advisory findings; neither command installed or upgraded packages.
- Reran repository lint and separated application-source diagnostics from Git-ignored local scripts.
- Inspected the actual Vercel deployment and build log for commit 4349a75: Ready, Node 24.x, pnpm 10.28.0, successful compilation and TypeScript checks, 38-second deployment duration. That deployment reused cache; it was not a clean-install proof.
- Reused the same-commit first-stage checks: TypeScript and isolated ingestion/migration/cleanup tests passed, and production gallery/thumbnail/download/authentication smoke checks passed. They were not repeated merely to produce another green result.
- No upgraded dependency combination has been installed or tested yet. No production exploit, oversized upload, database write, or configuration change was performed in this stage.

## Proposed repair order

1. S2-01 and S2-02: framework and native image-decoder security updates, isolated regression checks, then production verification.
2. S2-03: agree on the browser upload ceiling or explicitly select the larger direct-to-R2 upload change.
3. S2-04 through S2-06: dependency cleanup, resolved lockfile audit, source lint repairs, deployment checks, and a consistent runtime/toolchain.
4. S2-07: deterministic local project root; local fonts only if restricted-network builds are required.

Do not advance to the next audit stage until the user accepts this stage's repairs.

## Direct dependency inventory

`In-range` means the newest stable version allowed by the current package.json declaration. For exact pins, it is deliberately the current version, not a claim that newer versions are incompatible. Each package link points to the queried registry metadata.

| Package | Installed | In-range | Latest stable | Recommendation |
|---|---|---|---|---|
| [@aws-sdk/client-s3](https://registry.npmjs.org/%40aws-sdk%2Fclient-s3) | 3.1036.0 | 3.1131.0 | 3.1131.0 | Update together with the presigner; re-audit XML dependencies |
| [@aws-sdk/s3-request-presigner](https://registry.npmjs.org/%40aws-sdk%2Fs3-request-presigner) | 3.1036.0 | 3.1131.0 | 3.1131.0 | Update together with client-s3 |
| [@base-ui/react](https://registry.npmjs.org/%40base-ui%2Freact) | 1.4.1 | 1.8.0 | 1.8.0 | Routine update candidate; test affected behavior |
| [@hookform/resolvers](https://registry.npmjs.org/%40hookform%2Fresolvers) | 5.2.2 | 5.9.1 | 5.9.1 | Routine update candidate; test affected behavior |
| [@libsql/client](https://registry.npmjs.org/%40libsql%2Fclient) | 0.17.3 | 0.17.4 | 0.18.0 | Prefer 0.17.4 patch first; assess 0.18.0 separately |
| [@smithy/node-http-handler](https://registry.npmjs.org/%40smithy%2Fnode-http-handler) | 4.6.1 | 4.12.1 | 4.12.1 | Routine update candidate; test affected behavior |
| [class-variance-authority](https://registry.npmjs.org/class-variance-authority) | 0.7.1 | 0.7.1 | 0.7.1 | Keep; no newer stable release |
| [clsx](https://registry.npmjs.org/clsx) | 2.1.1 | 2.1.1 | 2.1.1 | Keep; no newer stable release |
| [cmdk](https://registry.npmjs.org/cmdk) | 1.1.1 | 1.1.1 | 1.1.1 | Keep; no newer stable release |
| [drizzle-orm](https://registry.npmjs.org/drizzle-orm) | 0.45.2 | 0.45.2 | 0.45.2 | Keep latest stable; avoid beta |
| [embla-carousel-react](https://registry.npmjs.org/embla-carousel-react) | 8.6.0 | 8.6.0 | 8.6.0 | Keep; no newer stable release |
| [lucide-react](https://registry.npmjs.org/lucide-react) | 1.9.0 | 1.46.0 | 1.46.0 | Routine update candidate; test affected behavior |
| [next](https://registry.npmjs.org/next) | 16.2.4 | 16.2.4 | 16.3.5 | Security update to 16.3.5 with eslint-config-next |
| [next-themes](https://registry.npmjs.org/next-themes) | 0.4.6 | 0.4.6 | 0.4.6 | Keep; no newer stable release |
| [overlayscrollbars](https://registry.npmjs.org/overlayscrollbars) | 2.16.0 | 2.16.0 | 2.16.0 | Keep; no newer stable release |
| [overlayscrollbars-react](https://registry.npmjs.org/overlayscrollbars-react) | 0.5.6 | 0.5.6 | 0.5.6 | Keep; no newer stable release |
| [react](https://registry.npmjs.org/react) | 19.2.4 | 19.2.4 | 19.3.0 | Patch candidate 19.2.8; evaluate 19.3.0 separately |
| [react-dom](https://registry.npmjs.org/react-dom) | 19.2.4 | 19.2.4 | 19.3.0 | Match the selected React version exactly |
| [react-dropzone](https://registry.npmjs.org/react-dropzone) | 15.0.0 | 15.0.0 | 20.1.2 | Defer major migration 15 to 20; latest requires Node >=22 |
| [react-hook-form](https://registry.npmjs.org/react-hook-form) | 7.73.1 | 7.88.0 | 7.88.0 | Routine update candidate; test affected behavior |
| [react-photo-album](https://registry.npmjs.org/react-photo-album) | 3.6.0 | 3.6.1 | 3.6.1 | Routine update candidate; test affected behavior |
| [shadcn](https://registry.npmjs.org/shadcn) | 4.4.0 | 4.21.0 | 4.21.0 | Update and move to devDependencies; retain CSS import |
| [sharp](https://registry.npmjs.org/sharp) | 0.34.5 | 0.34.5 | 0.35.4 | Security update to 0.35.4; verify native decoders |
| [sonner](https://registry.npmjs.org/sonner) | 2.0.7 | 2.0.8 | 2.0.8 | Routine update candidate; test affected behavior |
| [tailwind-merge](https://registry.npmjs.org/tailwind-merge) | 3.5.0 | 3.7.0 | 3.7.0 | Routine update candidate; test affected behavior |
| [tw-animate-css](https://registry.npmjs.org/tw-animate-css) | 1.4.0 | 1.4.0 | 1.4.0 | Keep; no newer stable release |
| [zod](https://registry.npmjs.org/zod) | 4.3.6 | 4.6.5 | 4.6.5 | Routine update candidate; test affected behavior |
| [@tailwindcss/postcss](https://registry.npmjs.org/%40tailwindcss%2Fpostcss) | 4.2.4 | 4.3.3 | 4.3.3 | Routine update candidate; test affected behavior |
| [@types/better-sqlite3](https://registry.npmjs.org/%40types%2Fbetter-sqlite3) | 7.6.13 | 7.6.13 | 9.6.0 | Remove after typecheck; no direct use |
| [@types/node](https://registry.npmjs.org/%40types%2Fnode) | 20.19.39 | 20.19.43 | 26.5.1 | Align to production Node 24, not latest 26 |
| [@types/react](https://registry.npmjs.org/%40types%2Freact) | 19.2.14 | 19.3.0 | 19.3.0 | Align with the selected React line |
| [@types/react-dom](https://registry.npmjs.org/%40types%2Freact-dom) | 19.2.3 | 19.3.0 | 19.3.0 | Align with the selected React line |
| [dotenv](https://registry.npmjs.org/dotenv) | 17.4.2 | 17.4.2 | 17.4.2 | Keep; no newer stable release |
| [drizzle-kit](https://registry.npmjs.org/drizzle-kit) | 0.31.10 | 0.31.10 | 0.31.10 | Keep latest stable; review remaining tool-only advisories |
| [eslint](https://registry.npmjs.org/eslint) | 9.39.4 | 9.39.5 | 10.10.0 | Prefer 9.39.5 initially; assess v10 plugin compatibility separately |
| [eslint-config-next](https://registry.npmjs.org/eslint-config-next) | 16.2.4 | 16.2.4 | 16.3.5 | Keep aligned with Next.js |
| [tailwindcss](https://registry.npmjs.org/tailwindcss) | 4.2.4 | 4.3.3 | 4.3.3 | Routine update candidate; test affected behavior |
| [tsx](https://registry.npmjs.org/tsx) | 4.21.0 | 4.23.13 | 4.23.13 | Routine update candidate; test affected behavior |
| [typescript](https://registry.npmjs.org/typescript) | 5.9.3 | 5.9.3 | 7.0.2 | Keep 5.9.3 initially; v7 is a separate migration |

## Advisory groups

Counts below are unique advisory matches in the full lockfile audit. Direct roots are dependency-chain entry points, not proof that a vulnerable function is reached by the application.

| Package | Matches | Severity distribution | Direct roots |
|---|---:|---|---|
| [esbuild](https://github.com/advisories/GHSA-67mh-4wv8-2f99) | 2 | moderate: 1, low: 1 | drizzle-kit, tsx |
| [postcss](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) | 4 | moderate: 2, high: 2 | next, shadcn, @tailwindcss/postcss |
| [hono](https://github.com/advisories/GHSA-qp7p-654g-cw7p) | 24 | moderate: 21, low: 2, high: 1 | shadcn |
| [next](https://github.com/advisories/GHSA-8h8q-6873-q5fj) | 24 | high: 11, low: 2, moderate: 9, critical: 2 | next |
| [ip-address](https://github.com/advisories/GHSA-v2v4-37r5-5v8g) | 2 | moderate: 1, high: 1 | shadcn |
| [fast-xml-builder](https://github.com/advisories/GHSA-5wm8-gmm8-39j9) | 2 | high: 1, moderate: 1 | @aws-sdk/client-s3, @aws-sdk/s3-request-presigner |
| [ws](https://github.com/advisories/GHSA-58qx-3vcg-4xpx) | 2 | moderate: 1, high: 1 | @libsql/client, drizzle-orm |
| [qs](https://github.com/advisories/GHSA-q8mj-m7cp-5q26) | 3 | moderate: 3 | shadcn |
| [brace-expansion](https://github.com/advisories/GHSA-jxxr-4gwj-5jf2) | 7 | moderate: 1, high: 6 | shadcn, eslint-config-next, eslint |
| [js-yaml](https://github.com/advisories/GHSA-h67p-54hq-rp68) | 4 | moderate: 1, high: 3 | shadcn, eslint, eslint-config-next |
| [@babel/core](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8) | 1 | low: 1 | next, shadcn, eslint-config-next |
| [body-parser](https://github.com/advisories/GHSA-v422-hmwv-36x6) | 1 | low: 1 | shadcn |
| [fast-uri](https://github.com/advisories/GHSA-v2hh-gcrm-f6hx) | 7 | high: 7 | shadcn |
| [sharp](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) | 2 | high: 2 | next, sharp |
| [nanoid](https://github.com/advisories/GHSA-28wg-ghj8-5hjv) | 3 | high: 3 | next, shadcn, @tailwindcss/postcss |
| [@hono/node-server](https://github.com/advisories/GHSA-frvp-7c67-39w9) | 1 | moderate: 1 | shadcn |
| [postcss-selector-parser](https://github.com/advisories/GHSA-w9m9-85wc-3x92) | 1 | low: 1 | shadcn |
| [browserslist](https://github.com/advisories/GHSA-c83g-rgw3-j3cx) | 2 | high: 2 | next, shadcn, eslint-config-next |
| [baseline-browser-mapping](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) | 1 | moderate: 1 | next, shadcn, eslint-config-next |

## Source lint diagnostics

| File | Line | Severity | Rule |
|---|---:|---|---|
| components/ui/sidebar.tsx | 251 | warning | @typescript-eslint/no-unused-vars |
| components/ui/sidebar.tsx | 504 | error | react-hooks/purity |
| modules/details/detail-editor.tsx | 73 | error | react-hooks/set-state-in-effect |
| modules/folders/folder-sidebar.tsx | 69 | error | react-hooks/set-state-in-effect |
| modules/pwa/ios-install-hint.tsx | 36 | error | react-hooks/set-state-in-effect |
| modules/pwa/pull-to-refresh.tsx | 79 | error | react-hooks/set-state-in-effect |
| modules/pwa/pull-to-refresh.tsx | 190 | error | react-hooks/refs |
| modules/pwa/pull-to-refresh.tsx | 204 | error | react-hooks/refs |
| modules/pwa/pull-to-refresh.tsx | 220 | error | react-hooks/refs |
| modules/shell/create-entity-dialog.tsx | 54 | error | react-hooks/set-state-in-effect |
| modules/shell/rename-dialog.tsx | 49 | error | react-hooks/set-state-in-effect |
| modules/tags/tag-filter-bar.tsx | 49 | error | react-hooks/set-state-in-effect |
| modules/viewer/viewer.tsx | 126 | error | react-hooks/set-state-in-effect |
| modules/viewer/viewer.tsx | 137 | error | react-hooks/set-state-in-effect |
| modules/viewer/viewer.tsx | 275 | error | react-hooks/set-state-in-effect |
| modules/viewer/viewer.tsx | 700 | error | react-hooks/refs |
| modules/viewer/viewer.tsx | 851 | warning | @next/next/no-img-element |
| modules/viewer/viewer.tsx | 934 | warning | @next/next/no-img-element |
| public/sw.js | 1 | warning | Unused disable directive |
