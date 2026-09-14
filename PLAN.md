# Bits Image — Project Plan

> Historical plan, archived on 2026-09-13. This is not the current setup or
> implementation specification; use README.md for current behavior.
> Next.js 16, a shared passcode gate, folders, bulk management, an Embla-based
> viewer and a handwritten service worker now replace parts of this plan.
> Paste/URL/share-target ingestion and an offline gallery remain unimplemented;
> their old inclusion here does not schedule them for implementation.
> The 30-day purge endpoint and daily Vercel schedule are implemented. See README.md for deployment requirements.

A photography studio's inspiration library: save, tag, search, and view reference images across desktop and mobile. Single-tenant, no authentication — deployed at an unlisted URL for studio-internal use only.

---

## 1. Scope (finalised)

- **In:** upload from device, paste, URL, mobile share sheet; four-view navigation (Library / Inbox / Organised / Trash); masonry grid; multi-tag + filter; detail metadata; lightbox viewer; search; download; soft-delete + restore; responsive PWA.
- **Out (for now):** authentication, browser extension, Pinterest integration, AI tagging, color-palette search, team sharing, collections/boards, EXIF, similar-image search.
- **Single app, single deployment.** No monorepo, no extension, no external image host dependency.
- **Trust model:** no login. Access control is "don't share the URL." Fine for studio-internal inspiration; would not be fine for client-sensitive material.

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) + React 19 + TypeScript | One codebase for desktop + mobile PWA |
| UI | **shadcn/ui** + Tailwind CSS | Component-first; use shadcn primitives wherever one exists |
| Data | Turso (libSQL / SQLite) + Drizzle ORM | Real SQLite semantics, persistent on Vercel, free tier |
| Storage | Cloudflare R2 (S3-compatible) | No egress fees; cheap; stable URLs; defaults OK |
| Auth | **None** | Removed per studio decision |
| Image processing | `next/image` + `sharp` on upload | Thumbnails + on-the-fly resize |
| Grid | `react-photo-album` (masonry) | Handles responsive columns + lazy load |
| Viewer | `yet-another-react-lightbox` | Zoom, swipe, keyboard, touch |
| State/data | TanStack Query + Server Actions | Optimistic updates for tag/delete |
| Forms | `react-hook-form` + `zod` | Pairs natively with shadcn Form |
| PWA | `@serwist/next` | Service worker + Web Share Target |
| Hosting | Vercel (`*.vercel.app` subdomain for MVP) | Matches Next.js; free tier covers MVP; custom domain later |

**Note on SQLite-on-Vercel:** Vercel serverless has an ephemeral filesystem, so a local `.db` file does not persist. Turso is the minimal-change path — libSQL is a SQLite fork, Drizzle works identically, the code doesn't change if we ever migrate back to a file-based SQLite in a self-hosted deployment.

---

## 3. Module Architecture

Every module owns its own directory, exports a narrow public interface, and touches the DB only through its own repository layer. Cross-module calls go through exported functions/components — never through shared internal state.

```
bits-image/
  app/                         # Next.js routes (thin — delegate to modules)
    library/                   # all images
    inbox/                     # untagged images
    organised/                 # tagged images
    trash/                     # soft-deleted images
    image/[id]/
    share/                     # Web Share Target handler
    api/
  modules/
    storage/                   # [Module 1] R2 upload, thumbnailing, URLs
    ingestion/                 # [Module 2] device, paste, URL, share-target
    views/                     # [Module 3] Library/Inbox/Organised/Trash grids
    tags/                      # [Module 4] CRUD, assign, filter
    details/                   # [Module 5] metadata panel
    viewer/                    # [Module 6] lightbox
    search/                    # [Module 7] text search
    actions/                   # [Module 8] download, delete, restore, purge
    shell/                     # [Module 9] nav, PWA, install prompt
  components/ui/               # shadcn/ui components (generated)
  db/                          # schema, migrations, client
  lib/                         # generic helpers only (no business logic)
```

### Module contracts

Each module exposes **only**:
- Server functions (used by routes / other modules)
- React components (used by routes)
- Zod schemas for its own types

No module imports another module's internals. If two modules need to share a type, it goes in the importing module's own zod schema or in `db/schema.ts`.

---

### Module 1 — Storage
- **Responsibility:** Put/get objects in R2. Generate thumbnails on upload. Produce signed URLs.
- **Exposes:** `uploadImage(buffer) → { key, width, height, hash, phash }`, `getSignedUrl(key)`, `deleteObject(key)`.
- **shadcn:** none (pure server).
- **Notes:** SHA-256 for dedup; pHash stored for future similarity search.

### Module 2 — Ingestion
- **Responsibility:** Turn "something the user gave us" into an image row + R2 object. Four sources, one pipeline. **New images land with no tags → appear in Inbox.**
  - 2a. **Device upload** — file input / drag-drop
  - 2b. **Clipboard paste** — paste image or URL anywhere in app
  - 2c. **URL fetch** — server-side fetch of a remote image URL
  - 2d. **Web Share Target** — mobile share sheet → `/share` route → same pipeline
- **Exposes:** `ingestFromFile(file)`, `ingestFromUrl(url)`, `<Dropzone />`, `<PasteCatcher />`.
- **shadcn:** `Dialog`, `Progress`, `Sonner` (toast), `Button`, `Input`.
- **Dedup:** reject on SHA-256 match; show a "this image is already in your library" toast linking to the existing one.

### Module 3 — Views (Library / Inbox / Organised / Trash)
- **Responsibility:** Four filtered grid views over the same image set. All four share the same masonry component; they differ only in the server-side filter predicate.
  - **Library** — `deleted_at IS NULL` (all non-deleted)
  - **Inbox** — `deleted_at IS NULL AND NOT EXISTS (image_tags WHERE image_id = images.id)` (untagged, to-triage)
  - **Organised** — `deleted_at IS NULL AND EXISTS (image_tags …)` (tagged)
  - **Trash** — `deleted_at IS NOT NULL`
- **Exposes:** `<Grid view="library"|"inbox"|"organised"|"trash" filter={tagIds, query} />`, `listImages({ view, cursor, tags, query })`.
- **shadcn:** `Skeleton` (loading), `Button`, `Badge` (count per view), `Tabs` (optional top-level view switcher).
- **Notes:** All views accept tag + search filters. Inbox count is shown as a badge in the nav (triage signal). Masonry grid itself is the one place we drop to custom Tailwind (no shadcn equivalent).

### Module 4 — Tags
- **Responsibility:** Create/rename/delete tags; assign/unassign to images; expose a filter UI.
- **Exposes:** `<TagPicker imageId />`, `<TagFilterBar onChange />`, server fns `createTag`, `assignTag`, `unassignTag`, `listTags`, `renameTag`, `deleteTag`.
- **shadcn:** `Command` (autocomplete), `Badge` (tag chips), `Popover`, `Checkbox`, `ToggleGroup` (AND/OR), `ContextMenu` (rename/delete tag).
- **DB:** `tags(id, name, created_at)`, `image_tags(image_id, tag_id)`.
- **Side effect:** assigning the first tag moves an image from Inbox → Organised; removing the last tag moves it back to Inbox.

### Module 5 — Details (metadata)
- **Responsibility:** Edit title, description, source URL for an image.
- **Exposes:** `<DetailPanel imageId />`, `updateImageMeta({ id, ... })`.
- **shadcn:** `Sheet` (mobile) / `Dialog` (desktop), `Form`, `Input`, `Textarea`, `Label`, `Button`.

### Module 6 — Viewer (lightbox)
- **Responsibility:** Full-screen view with zoom, pan, swipe, keyboard.
- **Exposes:** `<Viewer images[] startIndex />`, opens from grid click.
- **shadcn:** `Dialog` (container), `Button` (controls), `Tooltip`.
- **Library:** `yet-another-react-lightbox` + zoom + captions plugins.

### Module 7 — Search
- **Responsibility:** Full-text search on title/description/source URL.
- **Exposes:** `<SearchBar />`, `searchImages({ query, view })`.
- **shadcn:** `Input` with icon, `Command` (results dropdown), `Kbd` (⌘K hint).
- **DB:** SQLite FTS5 virtual table (Turso supports FTS5).
- **Scope:** search respects current view (Library / Inbox / Organised / Trash).

### Module 8 — Actions
- **Responsibility:** Download original; soft-delete (→ Trash); restore from Trash; hard-delete / purge; empty-trash.
- **Exposes:** `<ImageActions imageId />`, `<TrashBulkActions />`, `downloadImage`, `softDelete`, `restore`, `hardDelete`, `emptyTrash`.
- **shadcn:** `DropdownMenu`, `AlertDialog` (destructive confirmations), `Button`.
- **Behaviour:** soft-delete sets `deleted_at=now()`. Trash view shows items with `deleted_at` set; offers "Restore" or "Delete permanently". A cron purges items older than 30 days automatically.

### Module 9 — Shell (nav + PWA)
- **Responsibility:** Top-level navigation between the four views; PWA manifest; service worker; install prompt; Web Share Target registration.
- **Exposes:** `<AppShell />`, `<InstallPrompt />`.
- **shadcn:** `NavigationMenu` (desktop sidebar), `Sheet` (mobile drawer), `Tabs` (mobile bottom nav), `Badge` (Inbox count), `Tooltip`.
- **Nav items (all views):** Library · Inbox · Organised · Trash. Inbox shows a live count badge when > 0.
- **Manifest:** `share_target` field for mobile share sheet.

---

## 4. Database Schema (initial)

Single-tenant: no `users` or `user_id` columns.

```ts
images        (id, r2_key, width, height, hash, phash,
               title, description, source_url,
               created_at, deleted_at)
tags          (id, name UNIQUE, created_at)
image_tags    (image_id, tag_id)  -- composite PK
images_fts    (virtual FTS5 on title, description, source_url)
```

Indexes: `images(created_at)`, `images(hash)` (dedup), `images(deleted_at)` (trash filter), `tags(name)`.

Derived view counts:
- Library = `SELECT COUNT(*) FROM images WHERE deleted_at IS NULL`
- Inbox = `… AND id NOT IN (SELECT image_id FROM image_tags)`
- Organised = `… AND id IN (SELECT image_id FROM image_tags)`
- Trash = `SELECT COUNT(*) FROM images WHERE deleted_at IS NOT NULL`

---

## 5. Implementation Priority

Each phase is independently shippable. Ship P0 → P1 → P2 → P3 in order; do not interleave.

### P0 — Foundation (week 1)
1. Repo init: Next.js + TS + Tailwind + shadcn/ui
2. DB: Turso + Drizzle + schema + migrations
3. **Module 1 — Storage** (can upload a file to R2 via script)
4. **Module 9a — Shell** (four-view nav skeleton, responsive; no PWA yet)

*Exit criteria:* app runs locally and on Vercel. Navigating to Library/Inbox/Organised/Trash shows four empty grids. Uploading a file via a dev-only script puts it in R2 and a row in the DB.

### P1 — MVP Core (week 2)
5. **Module 2a — Device upload** (drag-drop + file input)
6. **Module 3 — Views** (all four views, masonry grid, infinite scroll)
7. **Module 6 — Viewer** (open on click, swipe, zoom)
8. **Module 8 — Actions** (download, soft-delete, restore from Trash)
9. **Module 5 — Details** (edit title/description/source)

*Exit criteria:* studio can upload, browse (all four views work), view, edit metadata, download, delete, and restore. Product is already useful without tags or search.

### P2 — Tagging & Search (week 3)
10. **Module 4 — Tags** (create, assign, autocomplete, filter bar with AND/OR, rename, delete)
11. **Module 7 — Search** (FTS on title/desc/source, scoped to current view)

*Exit criteria:* full triage workflow works. New image → Inbox → assign tags → moves to Organised → findable by tag filter or search. Core value proposition delivered.

### P3 — Ingestion polish + PWA (week 4)
12. **Module 2b — Paste** (image + URL)
13. **Module 2c — URL fetch** (server-side)
14. **Module 9b — PWA** (installable, offline grid cache)
15. **Module 2d — Web Share Target** (mobile share sheet)

*Exit criteria:* on mobile, user shares an image from Instagram/Safari/Weibo into Bits Image, it lands in Inbox. App is installable on home screen.

### Later (not in MVP, not scheduled)
- Bulk select + bulk tag/delete
- Collections / boards
- EXIF extraction
- AI auto-tagging
- Color-palette filter
- Similar-image search (pHash already stored)
- Export (zip, PDF mood board)
- Team sharing (would require bringing auth back)

---

## 6. Key Considerations

- **shadcn/ui first.** Before writing any UI, check if a shadcn primitive exists. The masonry grid itself is the one known exception — no shadcn equivalent, use `react-photo-album` with Tailwind.
- **Module boundaries are load-bearing.** If a feature requires two modules to know about each other's internals, the split is wrong — revisit the interface before writing the code.
- **Views are predicates, not storage.** Library/Inbox/Organised/Trash are filters over one `images` table. Do not create separate tables or status columns — derive from `deleted_at` and presence/absence of tag rows. This keeps the Inbox→Organised transition free (just assign a tag).
- **Server Actions over API routes** for all mutations. Cleaner, typed, works with forms.
- **Deduplication at ingestion.** Reject on SHA-256 match to avoid accumulating duplicates from multiple save paths.
- **Attribution.** Always capture `source_url` when saving from URL / share target. Display prominently in detail panel.
- **Soft-delete.** Delete sets `deleted_at`. Items stay in Trash for 30 days, visible and restorable. A scheduled purge (Vercel Cron) removes R2 objects and DB rows after that. `emptyTrash` action available in the Trash view.
- **Thumbnails.** Generate 3 sizes on ingest (grid 400px, detail 1200px, original). Serve WebP. Grid never loads originals.
- **Mobile UX is not desktop-shrunk.** Bottom nav for the four views, swipe gestures in viewer, long-press for multi-select (later), pull-to-refresh on grid. Test on a real phone before shipping each phase.
- **Cost control.** R2 has no egress; Turso free tier generous; Vercel hobby fine for internal use. Watch sharp's processing time on upload (N thumbnails × M images adds up in bulk ingest).
- **Backup.** R2 bucket versioning + weekly Turso dump. A lost inspiration library is real creative loss.
- **Testing scope.** Unit-test repository functions and ingestion pipeline. Skip component tests for MVP; manually verify each phase on desktop + phone before moving on.
- **Access reality check.** With no auth, anyone who learns the URL has full write access. Fine for internal inspiration references; re-introduce auth before ever putting client-sensitive work in here.

---

## 7. Resolved Decisions

| Question | Decision |
|---|---|
| Database | Turso (libSQL) — local SQLite doesn't persist on Vercel |
| R2 region | Use Cloudflare defaults; region choice not critical for internal studio use |
| Authentication | **Excluded** — internal app, unlisted URL |
| Domain | Ship on `*.vercel.app` for MVP; custom domain deferred until after P3 |

---

## 8. Not Doing (and why)

- **Authentication** — dropped at studio request; app is internal and URL is unlisted. Revisit if library ever holds client-sensitive material.
- **Browser extension** — Web Share Target + paste + drag-drop covers the same ground without store review, Manifest V3 churn, or per-browser builds.
- **Pinterest API** — trial-mode approval risk, ToS grey zone, no native multi-tag, privacy limits, lock-in. Self-hosting on R2 is simpler and safer.
- **Postgres** — SQLite/Turso is plenty for a single studio's library for years. Revisit only if we add team sharing or vector search.
- **Monorepo** — no second package to justify it.
- **Local SQLite file** — Vercel's ephemeral filesystem doesn't support it; would need self-hosting to work. Turso preserves the SQLite semantics without that constraint.
