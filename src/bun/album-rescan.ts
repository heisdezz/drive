import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { albumDbPath, albumRelativePath, albumRoot, recoverCatalog } from "./album-location";
import { createBackup, getDatabaseConnection, openReadableDb } from "./database";
import { addLog } from "./logger";

export interface AlbumRescanStatus {
  scanning: boolean;
  paused?: boolean;
  stopped?: boolean;
  checked: number;
  added: number;
  updated: number;
  missing: number;
  albums: number;
  recoveredDatabase: boolean;
  error?: string;
}

export class AlbumRescanControl {
  paused = false;
  stopRequested = false;
  private wake?: () => void;

  pause(): void { this.paused = true; }
  resume(): void {
    this.paused = false;
    this.wake?.();
    this.wake = undefined;
  }
  stop(): void {
    this.stopRequested = true;
    this.resume();
  }
  async checkpoint(): Promise<boolean> {
    while (this.paused && !this.stopRequested) {
      await new Promise<void>(resolve => { this.wake = resolve; });
    }
    return this.stopRequested;
  }
}

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".webp": "image/webp", ".heic": "image/heic",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska", ".webm": "video/webm",
};

interface DiskMedia {
  fullPath: string;
  relativePath: string;
  albumName: string;
  size: number;
  mime: string;
  modified: number;
}

function verifyCatalog(dbPath: string): boolean {
  if (!fs.existsSync(dbPath)) return false;
  let db: ReturnType<typeof openReadableDb> | null = null;
  try {
    db = openReadableDb(dbPath);
    const result = db.prepare("PRAGMA integrity_check(1)").get() as Record<string, string>;
    if (Object.values(result)[0] !== "ok") return false;
    db.prepare("SELECT count(*) FROM media_items").get();
    return true;
  } catch { return false; }
  finally { db?.close(); }
}

function prepareCatalog(drivePath: string, root: string, status: AlbumRescanStatus): void {
  const dbPath = albumDbPath(drivePath);
  if (verifyCatalog(dbPath)) return;
  if (fs.existsSync(dbPath)) {
    const backupDir = path.join(root, ".backups");
    fs.mkdirSync(backupDir, { recursive: true });
    const preserved = path.join(backupDir, `unreadable-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.db`);
    fs.copyFileSync(dbPath, preserved, fs.constants.COPYFILE_EXCL);
    fs.unlinkSync(dbPath);
    addLog("warn", "Preserved unreadable catalog before album rescan", preserved);
    status.recoveredDatabase = true;
  }
  const source = recoverCatalog(drivePath, root);
  if (source) {
    status.recoveredDatabase = true;
    addLog("info", "Restored catalog for album rescan", source);
  }
}

export async function rescanAlbumFolder(drivePath: string, status: AlbumRescanStatus, control = new AlbumRescanControl()): Promise<void> {
  if (await control.checkpoint()) return;
  const drive = fs.realpathSync(drivePath);
  const root = albumRoot(drive);
  const rootReal = fs.realpathSync(root);
  const driveDevice = fs.statSync(drive).dev;
  if (fs.statSync(rootReal).dev !== driveDevice) throw new Error("The album folder is on another volume.");
  const rootRelative = path.relative(drive, rootReal);
  if (!rootRelative || rootRelative === ".." || rootRelative.startsWith(`..${path.sep}`) || path.isAbsolute(rootRelative)) {
    throw new Error("The album folder must be inside the selected drive.");
  }
  prepareCatalog(drive, root, status);
  const dbPath = albumDbPath(drive);
  const db = getDatabaseConnection(dbPath);
  try {
    createBackup(dbPath);
  } catch (error: any) {
    const backupDir = path.join(root, ".backups");
    fs.mkdirSync(backupDir, { recursive: true });
    const preserved = path.join(backupDir, `pre-rescan-unverified-${randomUUID()}.db`);
    try {
      fs.copyFileSync(dbPath, preserved, fs.constants.COPYFILE_EXCL);
      addLog("warn", `SQLite snapshot failed; preserved a file copy instead: ${error.message}`, preserved);
    } catch (preserveError) {
      db.close();
      throw preserveError;
    }
  }
  const seenAlbums = new Set<string>();
  const rootPrefix = path.relative(drive, root).replace(/\\/g, "/") + "/";
  db.run("CREATE TEMP TABLE rescan_seen(path TEXT PRIMARY KEY)");
  const insertSeen = db.prepare("INSERT OR IGNORE INTO rescan_seen(path) VALUES (?)");
  const insertAlbum = db.prepare("INSERT OR IGNORE INTO albums (name, relative_path) VALUES (?, ?)");
  const findAlbum = db.prepare("SELECT id, relative_path FROM albums WHERE name = ?");
  const updateAlbumPath = db.prepare("UPDATE albums SET relative_path = ? WHERE id = ?");
  const findMedia = db.prepare("SELECT id, file_hash, file_size, mime_type, album_id FROM media_items WHERE current_relative_path = ?");
  const findOrigin = db.prepare("SELECT 1 FROM media_items WHERE original_relative_path = ?");
  const findByHash = db.prepare("SELECT id, current_relative_path FROM media_items WHERE file_hash = ?");
  const insertMedia = db.prepare("INSERT INTO media_items (file_hash, original_relative_path, current_relative_path, file_size, mime_type, album_id) VALUES (?, ?, ?, ?, ?, ?)");
  const updateMedia = db.prepare("UPDATE media_items SET album_id = ?, file_size = ?, mime_type = ? WHERE id = ?");
  const relocateMedia = db.prepare("UPDATE media_items SET current_relative_path = ?, album_id = ?, file_size = ?, mime_type = ? WHERE id = ?");
  const staleThumbnails = new Set<string>();
  try {
    const recordBatch = db.transaction((batch: DiskMedia[]) => {
      for (const file of batch) {
        if (!seenAlbums.has(file.albumName)) {
          insertAlbum.run(file.albumName, albumRelativePath(drive, file.albumName));
          seenAlbums.add(file.albumName);
          status.albums++;
        }
        const album = findAlbum.get(file.albumName) as { id: number; relative_path: string } | undefined;
        if (!album) throw new Error(`Could not index album ${file.albumName}`);
        const expectedAlbumPath = albumRelativePath(drive, file.albumName);
        if (album.relative_path !== expectedAlbumPath) updateAlbumPath.run(expectedAlbumPath, album.id);
        insertSeen.run(file.relativePath);
        const existing = findMedia.get(file.relativePath) as { id: number; file_hash: string; file_size: number; mime_type: string; album_id: number | null } | undefined;
        if (existing) {
          if (existing.file_size !== file.size || existing.mime_type !== file.mime || existing.album_id !== album.id) {
            updateMedia.run(album.id, file.size, file.mime, existing.id);
            status.updated++;
            if (existing.file_size !== file.size || existing.mime_type !== file.mime) staleThumbnails.add(existing.file_hash);
          }
        } else {
          const hash = `${path.basename(file.fullPath)}_${file.size}_${file.modified}`;
          const matches = findByHash.all(hash) as { id: number; current_relative_path: string }[];
          const missingMatch = matches.length === 1 && !fs.existsSync(path.join(drive, matches[0].current_relative_path)) ? matches[0] : null;
          if (missingMatch) {
            relocateMedia.run(file.relativePath, album.id, file.size, file.mime, missingMatch.id);
            status.updated++;
          } else {
            const original = findOrigin.get(file.relativePath) ? `${file.relativePath}#rescanned-${randomUUID()}` : file.relativePath;
            insertMedia.run(hash, original, file.relativePath, file.size, file.mime, album.id);
            status.added++;
          }
        }
      }
    });

    const pending: DiskMedia[] = [];
    const stack = [root];
    while (stack.length) {
      if (await control.checkpoint()) return;
      const directory = stack.pop()!;
      const entries = await fs.promises.readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (await control.checkpoint()) return;
        if (entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (entry.name.toLowerCase() === "thumbs") continue;
          if (fs.statSync(fullPath).dev !== driveDevice) throw new Error(`Album subfolder is on another volume: ${fullPath}`);
          const albumName = path.relative(root, fullPath).replace(/\\/g, "/");
          if (!seenAlbums.has(albumName)) {
            const expected = albumRelativePath(drive, albumName);
            insertAlbum.run(albumName, expected);
            const album = findAlbum.get(albumName) as { id: number; relative_path: string } | undefined;
            if (album && album.relative_path !== expected) updateAlbumPath.run(expected, album.id);
            seenAlbums.add(albumName);
            status.albums++;
          }
          stack.push(fullPath);
          continue;
        }
        if (!entry.isFile()) continue;
        const mime = MIME_BY_EXT[path.extname(entry.name).toLowerCase()];
        if (!mime) continue;
        const stat = await fs.promises.stat(fullPath);
        if (stat.dev !== driveDevice) throw new Error(`Media file is on another volume: ${fullPath}`);
        const parent = path.relative(root, directory).replace(/\\/g, "/");
        pending.push({ fullPath, relativePath: path.relative(drive, fullPath).replace(/\\/g, "/"), albumName: parent && parent !== "." ? parent : "unknown", size: stat.size, mime, modified: stat.mtimeMs });
        status.checked++;
        if (pending.length >= 100) {
          if (await control.checkpoint()) return;
          recordBatch(pending.splice(0));
          await new Promise(resolve => setImmediate(resolve));
        }
      }
    }
    if (await control.checkpoint()) return;
    if (pending.length) recordBatch(pending);
    await new Promise(resolve => setImmediate(resolve));
    if (await control.checkpoint()) return;
    db.transaction(() => {
      const missingPage = db.prepare("SELECT id, current_relative_path FROM media_items WHERE id > ? AND substr(current_relative_path, 1, ?) = ? AND current_relative_path NOT IN (SELECT path FROM rescan_seen) ORDER BY id LIMIT 500");
      const deleteTags = db.prepare("DELETE FROM media_tags WHERE media_id = ?");
      const deleteMedia = db.prepare("DELETE FROM media_items WHERE id = ?");
      let lastId = 0;
      while (true) {
        const missing = missingPage.all(lastId, rootPrefix.length, rootPrefix) as { id: number; current_relative_path: string }[];
        if (!missing.length) break;
        for (const row of missing) {
          lastId = row.id;
          // A file moved into a directory already visited during this rescan
          // must not lose its catalog entry.
          const underThumbs = row.current_relative_path.slice(rootPrefix.length).split("/").some(segment => segment.toLowerCase() === "thumbs");
          if (!underThumbs && fs.existsSync(path.join(drive, row.current_relative_path))) continue;
          deleteTags.run(row.id);
          deleteMedia.run(row.id);
          status.missing++;
        }
      }
      db.run("DELETE FROM media_tags WHERE media_id NOT IN (SELECT id FROM media_items)");
      db.run("UPDATE albums SET media_count = (SELECT count(*) FROM media_items WHERE album_id = albums.id)");
      db.run("INSERT INTO media_search(media_search) VALUES ('rebuild')");
    })();
    const integrity = db.prepare("PRAGMA integrity_check(1)").get() as Record<string, string>;
    if (Object.values(integrity)[0] !== "ok") throw new Error("The catalog still failed SQLite integrity check after rescan.");
  } finally {
    if (control.stopRequested) {
      try { db.run("UPDATE albums SET media_count = (SELECT count(*) FROM media_items WHERE album_id = albums.id)"); }
      catch (error: any) { addLog("warn", `Could not refresh album counts after stopped rescan: ${error.message}`); }
    }
    db.close();
  }
  for (const hash of staleThumbnails) {
    await fs.promises.unlink(path.join(root, "thumbs", `${hash}.jpg`)).catch(() => {});
  }
}
