# Python update port plan

Source: `/home/destiny/Documents/projects/py` at `fe962da`. Target: this Electrobun/Solid desktop app.

1. Compare the Python changes with existing desktop features. Keep the desktop runtime and RPC architecture.
2. Port scanner folder routing: root media to `unknown`, subfolder media to albums named by their full relative folder path, and prune empty source directories. Match ignore rules by complete path segments.
3. Allow safe nested album names in create and rename operations, keeping file paths and database rows in sync.
4. Port missing-file validation with an album or whole-library action in the UI.
5. Port the opt-in mobile sync server: library stats, SQLite snapshot download, media range streaming, and thumbnails; add a Settings control.
6. Verify with typecheck, renderer build, and focused filesystem/database/HTTP tests. Record outcomes and remaining differences in `implementation.md`.

Already present in the target: system-folder ignore defaults, local media streaming with range requests and thumbnails, and native drive discovery. The Python `--server` CLI maps to an opt-in Settings service in this desktop app.

## Optimization follow-up

1. Bind the local media server to loopback and allow only cataloged files on the selected drive.
2. Make scanner, bulk move, album rename, and deletion operations recoverable across transaction errors and interrupted app sessions.
3. Serialize scans per drive and wait for the previous job to finish before reopening its database.
4. Replace linear thumbnail queue deduplication and one-at-a-time background processing with a set and two workers.
5. Benchmark representative catalog queries, then index the measured bottlenecks while preserving existing page navigation.

## Grid column follow-up

6. Apply the saved column preference to album cards and media cards in both catalog routes, with responsive minimum card widths.
7. Normalize saved column values and verify the renderer build and typecheck.

## Stored album counts

8. Add a persisted album count, backfill old libraries once, and maintain it in the same SQLite transaction as media inserts, deletes, and album moves.
9. Use the stored value for album cards and unfiltered pagination, keep exact count queries for filters and searches, and verify migration and mutation paths.

## Album context menu and merging

10. Add a reusable Solid context menu to album cards with Open, Edit, Merge, and Delete actions.
11. Add a merge dialog that chooses a destination and reports failures. Merge the source album's own media in bounded batches, preserve child albums, resolve filename collisions, and remove the source record only after all moves succeed.
12. Verify count updates, file preservation, and rollback when a source file is missing.

## Edit album performance

13. Update the cached album list and details after a successful edit without refetching the full gallery; skip saving when nothing changed.
14. Use indexed path-prefix updates when renaming an album and its descendants, then verify boundary behavior against similarly named albums.

## Album search state

15. Store the albums gallery search term in its validated URL search parameter, updating the current history entry as the user types so reload and Back restore the filter.

## Merge destination search

16. Add a search field and keyboard-accessible destination list to the merge dialog. Keep selection visible while filtering and bound the rendered results for large libraries.

## Permanent album deletion

17. Keep the existing option to remove an album while moving its media to Unsorted Media, and add a separate permanent option that deletes the album's own indexed files and records. Stage files before committing so failures can restore them, preserve child albums, and clean unused thumbnails.
