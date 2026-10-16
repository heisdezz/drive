# Python update port implementation

Source reviewed: `/home/destiny/Documents/projects/py` at `fe962da` (latest commits include nested album routing, missing-file validation, system ignore defaults, and LAN mobile sync). Target: Electrobun/Solid desktop app.

## Changes

- `src/bun/scanner.ts`: matches ignore patterns by complete path segments, routes root media to `albums/unknown`, routes nested source folders to corresponding nested albums, and removes empty source folders after a completed scan. System volume folders are skipped by the backend even if the user removes a default ignore entry.
- `src/bun/handlers/albums.ts`: accepts safe nested album names in create and rename operations. Renaming rewrites catalog paths and child album records. Deleting an album no longer recursively removes registered child album folders. Added missing-file validation for one album or the whole library.
- `src/shared/rpc.ts` and album routes: expose validation through the RPC bridge and add **Validate Files** actions with checked/removed counts.
- `src/bun/mobile-sync.ts`, `src/bun/handlers/mobile-sync.ts`, and Settings: opt-in LAN server with `/api/info`, `/api/db/stats`, `/download/db`, `/media/<id>`, and `/thumbnail/<id>` plus `/api/` aliases. Media supports HTTP Range and HEAD. The server resolves catalog paths against the selected drive before serving files. Settings displays the LAN URL and port.
- `tests/python-port.test.ts`: covers ignore matching, nested scan routing and cleanup, nested album rename, missing-record removal, and mobile HTTP routes.

## Verification

- `bun run typecheck` — passed.
- `bunx vite build` — passed.
- `bun test tests/python-port.test.ts` — 4 passed, 0 failed. The HTTP test used a local temporary library and loopback socket.
- `git diff --check` — passed.

## Desktop-specific behavior and remaining differences

- Mobile sync starts only when enabled in Settings and stops with the app. Select a scanned drive, choose a port (default `8080`), and press **Start Server**. The displayed URL is reachable from devices on the same network if the host firewall allows that port. The service has no authentication, matching the Python server, so enable it only on a trusted network.
- The Python headless `--server` CLI and its interactive mount prompt were not copied into the GUI entrypoint. The desktop already has native drive discovery and mounting.
- The desktop scanner retains its existing media extension set and fast file fingerprint strategy. The Python scanner supports more extensions and uses SHA-256 content hashes; changing these would alter existing desktop catalog and thumbnail behavior and requires a separate migration.
- Album counts now use a stored `media_count` column with insert, delete, and move triggers. Existing libraries are backfilled once on their first writable open.

## Optimization follow-up

- The local media server now binds to `127.0.0.1`. Drive selection registers its root, and each requested media or thumbnail path must resolve inside that root and match a catalog row. LAN sharing remains available only through the separate opt-in mobile sync server.
- File moves use rollback tracking. Scanner moves, bulk media moves, and album renames write small journals before changing files; the next writable library open checks the catalog and restores an uncommitted move. Deletes stage media under `albums/.pending-delete` until the SQLite transaction commits. The cross-device file move fallback now runs only for `EXDEV` and avoids replacing an existing destination.
- Scan starts are serialized by drive, and a replacement waits for the previous job to finish and close its database connection. Stop also waits for the active job.
- Thumbnail queue membership uses a `Set`, and two background workers share the existing two-job generation limiter with on-demand requests.
- A trigram FTS5 index with insert/update/delete triggers accelerates searches of original and current paths. Existing libraries rebuild it once on writable open; read-only libraries without the index use the previous query. Album previews now use indexed newest-item lookups per album. Name and size sort indexes were added.

### Measurements and checks

On a synthetic 50,000-row in-memory catalog, 20 repeated substring searches averaged about **43.5 ms** with the previous `LIKE` scan and **1.3 ms** with trigram FTS. A deep `OFFSET 40000` page averaged **0.64 ms** versus **0.02 ms** for page one, so the existing page API was retained. The previous album preview window query averaged **63 ms**; indexed lookups per album averaged **3.8 ms** over 200 albums. These figures are directional; removable-drive latency and real catalog distributions will differ.

Final verification: `bun run typecheck`, `bunx vite build`, and `git diff --check` passed; `bun test tests/python-port.test.ts` passed **9 tests**. The HTTP tests used loopback sockets and temporary libraries.

## Stored album counts

- Schema version 2 adds `albums.media_count`. A one-time transaction backfills existing albums, then SQLite triggers keep counts current when media is inserted, deleted, or assigned to a different album. These updates commit or roll back with the media change.
- Album lists and unfiltered album pagination read the stored count. Filtered or searched pagination still counts matching rows. Read-only libraries that have not been migrated retain the old count query until a writable open succeeds.
- Verification: the focused migration and move/delete tests passed; the full `python-port.test.ts` suite passed 10 tests with loopback access. The renderer build passed. `bun run typecheck` remains blocked by six errors in the installed Electrobun `native.ts` dependency.

## Grid column follow-up

- The saved 4–9 column preference now drives the albums gallery, album detail media grid, and main media catalog. Each grid uses the selected value as its wide-window maximum and reduces columns when cards would become too narrow. Those catalog pages can use up to 1600px of available space.
- `settings_store.ts` normalizes invalid or old persisted column values, and Settings explains the responsive behavior.
- Verification: `bun run typecheck`, `bunx vite build`, and `git diff --check` passed. The layout detector reported no findings.

## Album context menu and merging

- Added `@kobalte/core` and a reusable `AppContextMenu` around album cards. Right click or the keyboard context menu opens Open, Edit, Merge, and Delete actions. Reserved Unsorted Media actions are disabled.
- The Merge album dialog selects a destination and calls `mergeAlbums`. The handler moves the source album's media in 500-row batches, gives filename collisions numbered suffixes, updates paths and album IDs in one SQLite transaction, and removes the source record after all moves. Existing child album records and directories remain. The current media move journal protects files if a move or transaction fails.
- Missing files stop the merge and prompt the user to run Validate Files. The handler rolls back earlier file moves and database changes. Stored album counts update through the existing triggers.
- Focused tests cover collisions, preserved child albums, counts, and rollback. The full `python-port.test.ts` suite passes 12 tests; the renderer build and layout detector pass. Typecheck reports only six errors in the installed Electrobun `native.ts` dependency.

## Edit album performance

- Saving unchanged details closes the dialog without an RPC call. A successful edit updates the cached album gallery and cached album details directly. A rename marks cached media paths stale for refresh when those views are next opened; it does not refetch the gallery immediately.
- Parent album renames now update media paths and child album names with indexed SQLite range statements instead of loading every media and album row into JavaScript. `EXPLAIN QUERY PLAN` confirms the existing unique indexes serve both ranges.
- A new test checks descendants and a similarly named sibling. Renderer build and layout detector pass; typecheck still reports only the six existing Electrobun dependency errors.

## Album search state

- The albums gallery now reads its search term from the validated `search` URL parameter. Typing replaces the current history entry and keeps the current scroll position; clearing the field removes the parameter. Reloading or returning with Back restores the filter.
- Renderer build, layout detector, and `git diff --check` pass. Typecheck still reports only the six existing Electrobun dependency errors.

## Merge destination search

- The merge dialog now filters destination albums by name as the user types. Results appear in a scrollable radio list, capped at 100 visible rows; the selected destination remains named above the list when a filter hides it. Search resets when the dialog opens.

## Permanent album deletion

- The delete dialog now offers **Keep files** and **Delete permanently**. Keep files retains the prior behavior, moving indexed media to Unsorted Media. The permanent action stages only media records owned by the selected album, deletes those records and the album in one SQLite transaction, then removes the staged files. Child albums and their files remain.
- A failed transaction restores staged files. Unused thumbnails are removed after commit; thumbnails still referenced by another media item remain. The album's own empty directory is removed when possible.
- Tests cover permanent deletion, child preservation, shared thumbnails, rollback, and the existing keep-files action. The full suite passes 16 tests; the renderer build and layout detector pass. Typecheck still reports only the six existing Electrobun dependency errors.
