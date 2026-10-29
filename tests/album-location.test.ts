import { test, expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Database } from "bun:sqlite";
import { albumDbPath, albumRelativeRoot, driveForAlbumDb, recoverCatalog, setAlbumRoot } from "../src/bun/album-location";

test("switches to an empty folder without moving the existing library", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dstream-album-location-"));
  const previousConfig = process.env.DSTREAM_CONFIG_DIR;
  process.env.DSTREAM_CONFIG_DIR = path.join(root, "config");
  try {
    const drive = path.join(root, "drive");
    const old = path.join(drive, "albums");
    fs.mkdirSync(path.join(old, "unknown"), { recursive: true });
    fs.writeFileSync(path.join(old, "unknown", "photo.jpg"), "photo");
    const db = new Database(albumDbPath(drive));
    db.exec("CREATE TABLE albums (relative_path TEXT); CREATE TABLE media_items (current_relative_path TEXT)");
    db.prepare("INSERT INTO albums VALUES (?)").run("albums/unknown");
    db.prepare("INSERT INTO media_items VALUES (?)").run("albums/unknown/photo.jpg");
    db.close();

    const chosen = path.join(drive, "Collections", "Media Library");
    fs.mkdirSync(chosen, { recursive: true });
    expect(setAlbumRoot(drive, chosen)).toBe("Collections/Media Library");
    expect(albumRelativeRoot(drive)).toBe("Collections/Media Library");
    expect(JSON.parse(fs.readFileSync(path.join(drive, ".dstream-album-location.json"), "utf8")).albumRelativePath).toBe("Collections/Media Library");
    process.env.DSTREAM_CONFIG_DIR = path.join(root, "another-computer");
    expect(driveForAlbumDb(albumDbPath(drive))).toBe(drive);
    expect(fs.existsSync(path.join(chosen, "unknown", "photo.jpg"))).toBe(false);
    expect(fs.existsSync(albumDbPath(drive))).toBe(false);
    expect(fs.existsSync(path.join(old, "unknown", "photo.jpg"))).toBe(true);
    const originalDb = new Database(path.join(old, ".media_library.db"), { readonly: true });
    expect((originalDb.query("SELECT relative_path FROM albums").get() as { relative_path: string }).relative_path).toBe("albums/unknown");
    expect((originalDb.query("SELECT current_relative_path FROM media_items").get() as { current_relative_path: string }).current_relative_path).toBe("albums/unknown/photo.jpg");
    originalDb.close();
    expect(() => setAlbumRoot(drive, path.join(root, "outside"))).toThrow();
  } finally {
    if (previousConfig === undefined) delete process.env.DSTREAM_CONFIG_DIR;
    else process.env.DSTREAM_CONFIG_DIR = previousConfig;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("finds a catalog at the drive root before creating an empty one", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dstream-root-catalog-"));
  try {
    const drive = path.join(root, "drive");
    const albums = path.join(drive, "albums");
    fs.mkdirSync(albums, { recursive: true });
    const rootDb = new Database(path.join(drive, ".media_library.db"));
    rootDb.exec("CREATE TABLE media_items (current_relative_path TEXT); INSERT INTO media_items VALUES ('albums/unknown/photo.jpg')");
    rootDb.close();
    expect(recoverCatalog(drive, albums)).toBe(path.join(drive, ".media_library.db"));
    const found = new Database(path.join(albums, ".media_library.db"));
    expect((found.query("SELECT count(*) AS count FROM media_items").get() as { count: number }).count).toBe(1);
    found.close();
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("uses a snapshot already in the chosen album folder", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dstream-backup-catalog-"));
  const previousConfig = process.env.DSTREAM_CONFIG_DIR;
  process.env.DSTREAM_CONFIG_DIR = path.join(root, "config");
  try {
    const drive = path.join(root, "drive");
    const chosen = path.join(drive, "Existing Albums");
    const backups = path.join(chosen, ".backups");
    fs.mkdirSync(backups, { recursive: true });
    const snapshot = new Database(path.join(backups, "media_library-2026-10-29.db"));
    snapshot.exec("CREATE TABLE media_items (current_relative_path TEXT); INSERT INTO media_items VALUES ('Existing Albums/unknown/photo.jpg')");
    snapshot.close();
    expect(setAlbumRoot(drive, chosen)).toBe("Existing Albums");
    expect(fs.existsSync(path.join(chosen, ".media_library.db"))).toBe(false);
    expect(recoverCatalog(drive, chosen)).toBe(path.join(backups, "media_library-2026-10-29.db"));
    expect(fs.existsSync(path.join(chosen, ".media_library.db"))).toBe(true);
    expect(fs.existsSync(path.join(backups, "media_library-2026-10-29.db"))).toBe(true);
  } finally {
    if (previousConfig === undefined) delete process.env.DSTREAM_CONFIG_DIR;
    else process.env.DSTREAM_CONFIG_DIR = previousConfig;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("falls back to the drive root backup folder", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dstream-root-backup-"));
  try {
    const drive = path.join(root, "drive");
    const albums = path.join(drive, "albums");
    const backups = path.join(drive, ".backups");
    fs.mkdirSync(albums, { recursive: true });
    fs.mkdirSync(backups);
    const snapshot = new Database(path.join(backups, "media_library-2026-10-29.db"));
    snapshot.exec("CREATE TABLE media_items (id INTEGER); INSERT INTO media_items VALUES (1)");
    snapshot.close();
    expect(recoverCatalog(drive, albums)).toBe(path.join(backups, "media_library-2026-10-29.db"));
    const recovered = new Database(path.join(albums, ".media_library.db"));
    expect((recovered.query("SELECT count(*) AS count FROM media_items").get() as { count: number }).count).toBe(1);
    recovered.close();
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("switches between populated catalogs without merging or moving files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dstream-conflicting-catalogs-"));
  const previousConfig = process.env.DSTREAM_CONFIG_DIR;
  process.env.DSTREAM_CONFIG_DIR = path.join(root, "config");
  try {
    const drive = path.join(root, "drive");
    const old = path.join(drive, "albums");
    const chosen = path.join(drive, "Another Library");
    fs.mkdirSync(old, { recursive: true });
    fs.mkdirSync(chosen);
    for (const [index, folder] of [old, chosen].entries()) {
      fs.writeFileSync(path.join(folder, `photo-${index}.jpg`), `photo-${index}`);
      const db = new Database(path.join(folder, ".media_library.db"));
      db.exec("CREATE TABLE media_items (id INTEGER)");
      db.prepare("INSERT INTO media_items VALUES (?)").run(index + 1);
      db.close();
    }
    expect(setAlbumRoot(drive, chosen)).toBe("Another Library");
    expect(albumDbPath(drive)).toBe(path.join(chosen, ".media_library.db"));
    const selectedDb = new Database(albumDbPath(drive), { readonly: true });
    expect((selectedDb.query("SELECT id FROM media_items").get() as { id: number }).id).toBe(2);
    selectedDb.close();
    expect(setAlbumRoot(drive, old)).toBe("albums");
    expect(albumDbPath(drive)).toBe(path.join(old, ".media_library.db"));
    const originalDb = new Database(albumDbPath(drive), { readonly: true });
    expect((originalDb.query("SELECT id FROM media_items").get() as { id: number }).id).toBe(1);
    originalDb.close();
    expect(fs.existsSync(path.join(old, ".media_library.db"))).toBe(true);
    expect(fs.existsSync(path.join(chosen, ".media_library.db"))).toBe(true);
    expect(fs.existsSync(path.join(old, "photo-0.jpg"))).toBe(true);
    expect(fs.existsSync(path.join(chosen, "photo-1.jpg"))).toBe(true);
  } finally {
    if (previousConfig === undefined) delete process.env.DSTREAM_CONFIG_DIR;
    else process.env.DSTREAM_CONFIG_DIR = previousConfig;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("switching folders does not move files when a drive-root catalog exists", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dstream-root-precedence-"));
  const previousConfig = process.env.DSTREAM_CONFIG_DIR;
  process.env.DSTREAM_CONFIG_DIR = path.join(root, "config");
  try {
    const drive = path.join(root, "drive");
    const old = path.join(drive, "albums");
    const chosen = path.join(drive, "Organized");
    fs.mkdirSync(path.join(old, "unknown"), { recursive: true });
    fs.writeFileSync(path.join(old, "unknown", "photo.jpg"), "photo");
    fs.mkdirSync(chosen);
    const empty = new Database(path.join(old, ".media_library.db"));
    empty.exec("CREATE TABLE albums (relative_path TEXT); CREATE TABLE media_items (current_relative_path TEXT)");
    empty.close();
    const rootDb = new Database(path.join(drive, ".media_library.db"));
    rootDb.exec("CREATE TABLE albums (relative_path TEXT); CREATE TABLE media_items (current_relative_path TEXT)");
    rootDb.prepare("INSERT INTO albums VALUES (?)").run("albums/unknown");
    rootDb.prepare("INSERT INTO media_items VALUES (?)").run("albums/unknown/photo.jpg");
    rootDb.close();
    expect(setAlbumRoot(drive, chosen)).toBe("Organized");
    expect(fs.existsSync(path.join(chosen, ".media_library.db"))).toBe(false);
    expect(fs.existsSync(path.join(chosen, "unknown", "photo.jpg"))).toBe(false);
    expect(fs.existsSync(path.join(old, "unknown", "photo.jpg"))).toBe(true);
    expect(fs.existsSync(path.join(drive, ".media_library.db"))).toBe(true);
  } finally {
    if (previousConfig === undefined) delete process.env.DSTREAM_CONFIG_DIR;
    else process.env.DSTREAM_CONFIG_DIR = previousConfig;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
