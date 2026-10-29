import { test, expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { albumDbPath } from "../src/bun/album-location";
import { AlbumRescanControl, rescanAlbumFolder, type AlbumRescanStatus } from "../src/bun/album-rescan";
import { createBackup, getDatabaseConnection, openReadableDb } from "../src/bun/database";

function status(): AlbumRescanStatus {
  return { scanning: true, checked: 0, added: 0, updated: 0, missing: 0, albums: 0, recoveredDatabase: false };
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dstream-rescan-"));
  const drive = path.join(root, "drive");
  fs.mkdirSync(path.join(drive, "albums", "unknown"), { recursive: true });
  return { root, drive, dbPath: albumDbPath(drive) };
}

test("reconciles album files without moving them", async () => {
  const { root, drive, dbPath } = fixture();
  try {
    const albums = path.join(drive, "albums");
    fs.writeFileSync(path.join(albums, "unknown", "existing.jpg"), "existing");
    fs.mkdirSync(path.join(albums, "Trip"));
    fs.writeFileSync(path.join(albums, "Trip", "new.png"), "new");
    fs.mkdirSync(path.join(albums, "thumbs"));
    fs.writeFileSync(path.join(albums, "thumbs", "generated.jpg"), "thumb");
    fs.mkdirSync(path.join(albums, "Trip", "thumbs"));
    fs.writeFileSync(path.join(albums, "Trip", "thumbs", "generated.jpg"), "thumb");
    const movedFile = path.join(albums, "Trip", "moved.jpg");
    fs.writeFileSync(movedFile, "moved");
    const db = getDatabaseConnection(dbPath);
    const unknown = (db.prepare("SELECT id FROM albums WHERE name = 'unknown'").get() as { id: number }).id;
    const insert = db.prepare("INSERT INTO media_items (file_hash, original_relative_path, current_relative_path, file_size, mime_type, album_id) VALUES (?, ?, ?, ?, ?, ?)");
    insert.run("old-hash", "source/existing.jpg", "albums/unknown/existing.jpg", 999, "video/mp4", unknown);
    insert.run("missing-hash", "source/missing.jpg", "albums/unknown/missing.jpg", 1, "image/jpeg", unknown);
    const movedHash = `moved.jpg_5_${fs.statSync(movedFile).mtimeMs}`;
    const movedId = insert.run(movedHash, "source/moved.jpg", "albums/unknown/moved.jpg", 5, "image/jpeg", unknown).lastInsertRowid;
    insert.run("thumb-hash", "albums/Trip/thumbs/generated.jpg", "albums/Trip/thumbs/generated.jpg", 5, "image/jpeg", unknown);
    const tagId = db.prepare("INSERT INTO tags (name) VALUES ('keep-tag')").run().lastInsertRowid;
    db.prepare("INSERT INTO media_tags (media_id, tag_id) VALUES (?, ?)").run(movedId, tagId);
    db.close();
    const result = status();
    await rescanAlbumFolder(drive, result);
    expect(result.checked).toBe(3);
    expect(result.added).toBe(1);
    expect(result.updated).toBe(2);
    expect(result.missing).toBe(2);
    const repaired = openReadableDb(dbPath);
    expect((repaired.prepare("SELECT count(*) AS count FROM media_items").get() as { count: number }).count).toBe(3);
    expect((repaired.prepare("SELECT current_relative_path FROM media_items WHERE original_relative_path = 'source/moved.jpg'").get() as { current_relative_path: string }).current_relative_path).toBe("albums/Trip/moved.jpg");
    expect((repaired.prepare("SELECT count(*) AS count FROM media_tags").get() as { count: number }).count).toBe(1);
    expect((repaired.prepare("SELECT file_size, mime_type FROM media_items WHERE current_relative_path = 'albums/unknown/existing.jpg'").get() as { file_size: number; mime_type: string })).toEqual({ file_size: 8, mime_type: "image/jpeg" });
    expect((repaired.prepare("SELECT media_count FROM albums WHERE name = 'Trip'").get() as { media_count: number }).media_count).toBe(2);
    repaired.close();
    expect(fs.existsSync(path.join(albums, "Trip", "new.png"))).toBe(true);
    const again = status();
    await rescanAlbumFolder(drive, again);
    expect(again.added).toBe(0);
    expect(again.missing).toBe(0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("pauses and resumes album rescan before catalog changes", async () => {
  const { root, drive, dbPath } = fixture();
  try {
    fs.writeFileSync(path.join(drive, "albums", "unknown", "photo.jpg"), "photo");
    const control = new AlbumRescanControl();
    control.pause();
    const result = status();
    const scan = rescanAlbumFolder(drive, result, control);
    await new Promise(resolve => setImmediate(resolve));
    expect(result.checked).toBe(0);
    expect(fs.existsSync(dbPath)).toBe(false);
    control.resume();
    await scan;
    expect(result.checked).toBe(1);
    const db = openReadableDb(dbPath);
    expect((db.prepare("SELECT count(*) AS count FROM media_items").get() as { count: number }).count).toBe(1);
    db.close();
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("stop releases a paused album rescan", async () => {
  const { root, drive, dbPath } = fixture();
  try {
    const control = new AlbumRescanControl();
    control.pause();
    const result = status();
    const scan = rescanAlbumFolder(drive, result, control);
    await new Promise(resolve => setImmediate(resolve));
    control.stop();
    await scan;
    expect(result.checked).toBe(0);
    expect(fs.existsSync(dbPath)).toBe(false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("stopping a rescan skips missing-record cleanup", async () => {
  const { root, drive, dbPath } = fixture();
  try {
    const db = getDatabaseConnection(dbPath);
    db.prepare("INSERT INTO media_items (file_hash, original_relative_path, current_relative_path, file_size, mime_type) VALUES (?, ?, ?, ?, ?)")
      .run("missing", "albums/unknown/missing.jpg", "albums/unknown/missing.jpg", 1, "image/jpeg");
    db.close();
    for (let i = 0; i < 200; i++) fs.writeFileSync(path.join(drive, "albums", "unknown", `photo-${i}.jpg`), "photo");
    const control = new AlbumRescanControl();
    const result = status();
    const scan = rescanAlbumFolder(drive, result, control);
    while (result.checked === 0) await new Promise(resolve => setImmediate(resolve));
    control.stop();
    await scan;
    expect(result.checked).toBeLessThan(200);
    expect(result.missing).toBe(0);
    const preserved = openReadableDb(dbPath);
    expect((preserved.prepare("SELECT count(*) AS count FROM media_items WHERE file_hash = 'missing'").get() as { count: number }).count).toBe(1);
    preserved.close();
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("restores an unreadable database from a backup and preserves the damaged file", async () => {
  const { root, drive, dbPath } = fixture();
  try {
    fs.writeFileSync(path.join(drive, "albums", "unknown", "photo.jpg"), "photo");
    const db = getDatabaseConnection(dbPath);
    db.close();
    await rescanAlbumFolder(drive, status());
    expect(createBackup(dbPath)).toBeTruthy();
    fs.writeFileSync(dbPath, "not a sqlite database");
    const result = status();
    await rescanAlbumFolder(drive, result);
    expect(result.recoveredDatabase).toBe(true);
    const recovered = openReadableDb(dbPath);
    expect((recovered.prepare("SELECT count(*) AS count FROM media_items").get() as { count: number }).count).toBe(1);
    recovered.close();
    expect(fs.readdirSync(path.join(drive, "albums", ".backups")).some(name => name.startsWith("unreadable-"))).toBe(true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("rebuilds a catalog from album files when no valid backup exists", async () => {
  const { root, drive, dbPath } = fixture();
  try {
    const photo = path.join(drive, "albums", "unknown", "only-file.jpg");
    fs.writeFileSync(photo, "photo");
    fs.writeFileSync(dbPath, "broken sqlite data");
    const result = status();
    await rescanAlbumFolder(drive, result);
    expect(result.recoveredDatabase).toBe(true);
    expect(result.added).toBe(1);
    expect(fs.existsSync(photo)).toBe(true);
    const repaired = openReadableDb(dbPath);
    expect((repaired.prepare("SELECT count(*) AS count FROM media_items").get() as { count: number }).count).toBe(1);
    repaired.close();
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
