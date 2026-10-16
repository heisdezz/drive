# D-Stream Desktop

D-Stream Desktop is a Solid and Electrobun media library for removable drives.

## Run locally

```bash
bun install
bun run dev
```

For frontend hot reload, use `bun run dev:hmr`.

## Build a release

```bash
bun run build:stable
```

The installer to share is printed at the end of the build and copied to
`release/stable/`. For a canary build, run `bun run build:canary` and find its
installer in `release/canary/`.

On Linux, the release file is a `.tar.gz` archive. Extract it and run the
`installer` inside. On Windows, extract the release `.zip` and run the setup
program. On macOS, open the release `.dmg`.

| Directory | Purpose |
| --- | --- |
| `release/<channel>/` | Clearly named installer to distribute |
| `artifacts/` | Electrobun's installer, update archive (`.tar.zst`), and update metadata |
| `build/` | Expanded app and temporary packaging files |
| `dist/` | Bundled frontend from Vite |

Electrobun's update archive in `artifacts/` is for the updater; the `-Setup`
archive is the Linux installer. The repeated app folder and archive names in
`build/` are packaging inputs, not additional releases.
