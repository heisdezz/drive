# D-Stream Desktop

D-Stream Desktop is a Solid and Electrobun media library for removable drives.

Mobile app: [D-Stream](https://github.com/heisdezz/d-stream).

## Screenshots

![Dashboard showing the selected drive, recent media, and albums](images/dashboard_edit.png)

| Discover | Media Library |
| --- | --- |
| ![Discover scan and ignore list](images/discover.png) | ![Media grid with search and filters](images/media%20libary_edit.png) |
| Albums | Media player |
| ![Album gallery](images/albums_edit.png) | ![Video player and file details](images/player_edit.png) |
| Settings | System info |
| ![Appearance and catalog settings](images/settings.png) | ![Application logs and system information](images/debugger%28system_info%29.png) |
| Playback diagnostic | |
| ![Video playback diagnostic](images/test_page_edit.png) | |

## Run locally

```bash
bun install
bun run dev
```

For frontend hot reload, use `bun run dev:hmr`.

## Album folder per drive

On **Discover**, select a drive and use **Choose folder** to switch the active
album folder and its `.media_library.db`. The dashboard shows the current folder
and links back to this control. Switching keeps both folders, their media, and
their databases in place. It does not merge catalogs or move files. If the
selected folder has no database, scaffolding looks for a valid snapshot in its
`.backups/` directory, then for a database or backup at the drive root, before
creating a new catalog. Scanning must be idle and Mobile Sync stopped for that
drive.

The path is saved in `.dstream-album-location.json` at the drive root so another
installation can find the library. A drive-to-folder cache is also saved on this
computer in `album-locations.json` under the app config directory (on Linux,
`~/.config/io.github.heisdezz.dstream/`, or under `$XDG_CONFIG_HOME` if set).
Drives without either setting use `albums/` at their root.

## Repair an album catalog

On **Discover**, select a drive and click **Rescan album folder**. The rescan
checks existing album files without moving them, adds missing catalog entries,
updates changed file details and album links, removes records for files that no
longer exist, and rebuilds album counts and search data. If the database is
unreadable, the app keeps a copy in the album folder's `.backups/` directory,
then restores a valid snapshot if available before rebuilding from the files.
The result shows how many files were checked, added, updated, or removed from
the catalog. Folders named `thumbs` are skipped at every level, and existing
thumbnail entries are removed from the catalog during a completed rescan.
Use **Pause** and **Resume** to suspend or continue a running rescan. **Stop**
ends it without running missing-record cleanup; any completed batches remain
in the catalog.

## Mobile LAN API

In Settings, select a scanned drive and start **Local Network Mobile Sync**.
The server URL and a write token appear there. Read endpoints remain available
on the local network; send `Authorization: Bearer <token>` for create, update,
and delete requests. You can edit the token in Settings; any nonempty length is
accepted, and saving it takes effect immediately. The token persists across
restarts in the app's local config directory as `mobile-sync.json` (on Linux,
`~/.config/io.github.heisdezz.dstream/mobile-sync.json`, or under
`$XDG_CONFIG_HOME` if set). It is separate from the library on the drive.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/albums` | List albums, including empty albums |
| `GET` | `/api/albums/:id` | Get one album |
| `POST` | `/api/albums` | Create an album with JSON `{ "name": "Trip", "description": "..." }` |
| `PATCH` | `/api/albums/:id` | Change `name` and/or `description` |
| `DELETE` | `/api/albums/:id` | Remove the album and move its files to Unsorted Media |
| `DELETE` | `/api/albums/:id?permanent=true` | Delete the album and its media files |
| `GET` | `/api/media?albumId=1&limit=50&offset=0` | List media with optional `search`, `filter`, `sortBy`, and `sortOrder` |
| `GET` | `/api/media/:id/details` | Get a media record |
| `GET` | `/api/media/:id` | Stream the original file, including byte ranges |
| `GET` | `/api/thumbnail/:id` | Get its thumbnail |
| `POST` | `/api/media` | Upload a file into an album |
| `PATCH` | `/api/media/:id` | Move a file using JSON `{ "albumId": 2 }` |
| `DELETE` | `/api/media/:id` | Delete its record and physical file |

Upload with multipart form data (`file` and `albumId` fields) up to 100 MiB.
For larger files, stream the raw body to `POST /api/media?albumId=1&filename=clip.mp4`;
raw uploads support up to 2 GiB. Both forms return `201` with the new `item`.
The server accepts the same image and video extensions as the desktop scanner.
Album and media changes return JSON results or a JSON `error` with a non-2xx
status. Existing `/download/db` and `/api/info` routes remain available.

## Build a release

```bash
bun run build:stable
```

The installer to share is printed at the end of the build and copied to
`release/stable/`. For a canary build, run `bun run build:canary` and find its
installer in `release/canary/`.

Pushes to `main` build Linux and macOS stable installers and attach them to a
GitHub Release. The update files in `artifacts/` stay out of the release assets.

On Linux, the release file is a `.tar.gz` archive. Extract it and run the
`installer` inside. On Windows, extract the release `.zip` and run the setup
program. On macOS, open the release `.dmg`.

For local Linux builds, `bun run build:stable` also refreshes the matching
`release/stable/*-Setup/` folder. Run its `installer` only after that build
finishes; the release script checks that the installer and update archive have
the same app identifier and build hash.

| Directory | Purpose |
| --- | --- |
| `release/<channel>/` | Clearly named installer to distribute |
| `artifacts/` | Electrobun's installer, update archive (`.tar.zst`), and update metadata |
| `build/` | Expanded app and temporary packaging files |
| `dist/` | Bundled frontend from Vite |

Electrobun's update archive in `artifacts/` is for the updater; the `-Setup`
archive is the Linux installer. The repeated app folder and archive names in
`build/` are packaging inputs, not additional releases.

The installed app lives under `~/.local/share/io.github.heisdezz.dstream/` on
Linux. Its `stable/app/` bundle contains the runtime, and `stable/self-extraction/`
holds an archive Electrobun uses for updates. Earlier builds installed under
`~/.local/share/reacttailwindvite.electrobun.dev/`; that installation remains
separate because Electrobun uses the app identifier as the installation key.
If you still have that older installation, remove it and its desktop shortcut
after confirming the current app works. New releases update the installation
under `io.github.heisdezz.dstream`.
