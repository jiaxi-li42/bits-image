# Stage 2 manual acceptance

The user requested code changes with runtime testing delegated to them. S2-01 through S2-03 already passed their recorded checks. The dependency and component changes in S2-04 through S2-06 still need the checks below. Record the commit, device/browser, result and any console/network error when reporting a failure.

## Toolchain and build

Use Node 24 and pnpm 10.28.0. Use a fresh checkout or disposable worktree to check installation; do not delete the working repository or its environment files.

```sh
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm test:auth
pnpm audit --prod
pnpm audit
```

- Expect Node v24.x, pnpm 10.28.0, successful install, lint/type checks, build and isolated authentication checks.
- `pnpm build` runs lint, route/type checks and isolated ingestion/migration checks before compiling. These isolated tests use temporary SQLite and mocked storage.
- Expect no production advisory matches at the recorded lockfile. The full audit intentionally exits nonzero for the three documented development-tool matches; compare paths with [STAGE-2-REPAIRS.md](STAGE-2-REPAIRS.md).
- Use a disposable database configuration to run `pnpm db:migrate` twice. Expect successful initial application and a no-op second run; do not run migration experiments against production. This repair adds no migration SQL.
- Check that Vercel's build uses Node 24.x and pnpm 10.28.0 and executes the repository build script.

## Dependencies and uploads

- Upload small JPEG, PNG, WebP and AVIF samples. Check original downloads, both thumbnail sizes, titles and dimensions. Check gallery search, tags and folders after refresh.
- Repeat an existing image upload from a folder/tag view. Expect duplicate recognition with the requested assignment and no extra image row.
- Optional boundary regression: upload a valid image of exactly 52,428,800 bytes through the browser, then repeat it and try a 52,428,801-byte image. Expect success, duplicate, and size rejection respectively. The production browser flow already passed this before S2-04; this rechecks the updated AWS/HTTP stack.
- Interrupt a test upload, restore connectivity and use **Upload / retry**. Completed entries must not create duplicates. Use only disposable images for deletion/restore checks.
- Confirm generated styles, dialogs, menus, tooltips and responsive layout still render after the Tailwind/shadcn tooling update.

## Component state and interaction

| Area | Steps | Expected result |
|---|---|---|
| New folder, subfolder and tag | Enter text, cancel or dismiss with Escape/outside click, reopen; then try a duplicate name and correct it | Reopening starts empty. A validation failure retains input. Successful creation closes the dialog. |
| Rename folder/tag | Edit and cancel, reopen; save a new name, reopen; try an invalid or duplicate name | Cancel restores the current stored name. Success becomes the next initial name. Failure retains the attempted name. |
| Image details | Switch rapidly between several images, edit the title/description/source URL and blur, then reopen | Each image shows its own values and changes persist to the intended image. No stale form appears during loading. |
| Folder tree | Collapse an ancestor, navigate directly to a nested folder, then manually collapse again; refresh sidebar data | Navigation reveals the active ancestor chain. Manual collapse remains until navigation requires the chain to reopen. |
| Tag filters | Select multiple tags, toggle Match all/any, clear, navigate to another view, reload, then use back/forward | Chips, mode, URL and gallery agree. Fresh routes/reloads clear session-only filters. No previous-route chips flash in the new view. |
| Viewer on desktop | Zoom with buttons, wheel and keyboard; pan to edges; reset with 0/double-click; switch and delete the last displayed disposable image | Pan remains bounded. New images start at 1x without fullscreen. Selection clamps correctly after deletion. Close/zoom buttons work. |
| Viewer on phone | Swipe at 1x; tap fullscreen; pinch/pan; minimize/double-tap; return to the detail form | No unintended image change during zoom, stuck transform, offscreen image or broken close button. |

## iOS PWA

- In iPhone Safari, check the install hint, dismiss it, then reload. It stays dismissed when browser storage is available; blocked storage must not crash the page.
- Launch the installed home-screen app. The install hint must be hidden. Normal desktop/Android pages must not show the iOS pull indicator.
- At the top of the installed app, pull below the threshold and release: no refresh. Pull past the threshold and release: one refresh request and smooth indicator dismissal.
- Reverse the pull, add a second finger, or cancel the gesture: no accidental refresh and no stuck veil. Pinching in the viewer and scrolling inside dialogs must not trigger page refresh.
- The 700 ms indicator acknowledges the request; **Refresh requested** does not claim that a slow server response has completed.

Stage 3 remains on hold until stage 2 is accepted.
