import fs from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";
import { addLog } from "./logger";

// SQLite Database structure initialization
export function initializeDatabase(db: Database) {
	db.run(`
		CREATE TABLE IF NOT EXISTS media_items (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			file_hash TEXT NOT NULL,
			original_relative_path TEXT UNIQUE NOT NULL,
			current_relative_path TEXT UNIQUE NOT NULL,
			file_size INTEGER NOT NULL,
			mime_type TEXT NOT NULL,
			duration_seconds INTEGER DEFAULT NULL,
			metadata_json TEXT,
			album_id INTEGER,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
	`);

	db.run(`
		CREATE TABLE IF NOT EXISTS albums (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT UNIQUE NOT NULL,
			relative_path TEXT UNIQUE NOT NULL,
			description TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
	`);

	db.run(`
		CREATE TABLE IF NOT EXISTS tags (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT UNIQUE NOT NULL,
			color_hex TEXT NOT NULL DEFAULT '#3B82F6',
			category TEXT DEFAULT 'General'
		);
	`);

	db.run(`
		CREATE TABLE IF NOT EXISTS media_tags (
			media_id INTEGER,
			tag_id INTEGER,
			PRIMARY KEY (media_id, tag_id)
		);
	`);

	// Indexes for the hot query paths: album listing/pagination filters and
	// sorts on (album_id, created_at); global listing and next/prev seek on
	// created_at; type filters scan mime_type. original_relative_path already
	// has an implicit index from its UNIQUE constraint (used by the dup check).
	db.run("CREATE INDEX IF NOT EXISTS idx_media_album_created ON media_items(album_id, created_at);");
	db.run("CREATE INDEX IF NOT EXISTS idx_media_created ON media_items(created_at);");
	db.run("CREATE INDEX IF NOT EXISTS idx_media_mime ON media_items(mime_type);");

	// Ensure the default "unknown" album always exists in the database
	db.run(`
		INSERT OR IGNORE INTO albums (name, relative_path, description)
		VALUES ('unknown', 'albums/unknown', 'Default album for unsorted media');
	`);

	// Migrate any existing media_items with NULL album_id to the 'unknown' album
	const unknownAlbum = db.prepare("SELECT id FROM albums WHERE name = 'unknown'").get() as { id: number } | undefined;
	if (unknownAlbum) {
		db.prepare("UPDATE media_items SET album_id = ? WHERE album_id IS NULL").run(unknownAlbum.id);
	}
}

// Open the library DB with settings safe for the removable (typically exFAT)
// drives this app targets. WAL is deliberately NOT used: it relies on mmap'd
// shared memory and POSIX locking that exFAT/FAT/network mounts don't support,
// which corrupts the file ("database disk image is malformed"). The rollback
// journal (DELETE) plus a busy_timeout is safe and portable.
export function openLibraryDb(dbPath: string): Database {
	const db = new Database(dbPath);
	db.exec("PRAGMA busy_timeout = 5000;");
	// Force the file out of any previously-set WAL mode and keep it there.
	db.exec("PRAGMA journal_mode = DELETE;");
	// Flush to disk before each commit. On removable drives that can be yanked
	// or lose power mid-write, this is what keeps the file from being left
	// half-written (malformed) — durability matters more here than raw speed.
	db.exec("PRAGMA synchronous = FULL;");
	return db;
}

// Read-only connection for RPC readers (getMediaItem(s), related, status).
// Opening readonly means these never take a write lock or run schema/journal
// writes, so they can't block on — or time out against — an active scan writer;
// they just take a shared lock and wait out any brief writer lock via busy_timeout.
export function openReadableDb(dbPath: string): Database {
	const db = new Database(dbPath, { readonly: true });
	db.exec("PRAGMA busy_timeout = 5000;");
	return db;
}

// --- Backups ---------------------------------------------------------------
// Snapshots live next to the DB so they travel with the drive. We keep a small
// rotating set and use them to auto-recover instead of wiping data on corruption.
const BACKUP_KEEP = 5;

export function backupDirFor(dbPath: string): string {
	return path.join(path.dirname(dbPath), ".backups");
}

function isCorruptionError(err: any): boolean {
	const m = err?.message || "";
	return (
		m.includes("malformed") ||
		m.includes("corrupt") ||
		m.includes("disk image") ||
		m.includes("not a database")
	);
}

// Consistent snapshot via VACUUM INTO (safe even while the DB is in use) and
// prune old snapshots. Returns the backup path, or null if nothing was written.
export function createBackup(dbPath: string): string | null {
	if (!fs.existsSync(dbPath)) return null;
	const dir = backupDirFor(dbPath);
	fs.mkdirSync(dir, { recursive: true });
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const backupPath = path.join(dir, `media_library-${stamp}.db`);

	let db: Database | null = null;
	try {
		// Open read-only and let SQLite write a clean, defragmented copy.
		db = openReadableDb(dbPath);
		db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
	} finally {
		db?.close();
	}

	// Rotation: keep only the newest BACKUP_KEEP snapshots.
	try {
		const snaps = fs.readdirSync(dir)
			.filter((f) => f.startsWith("media_library-") && f.endsWith(".db"))
			.sort();
		for (const old of snaps.slice(0, Math.max(0, snaps.length - BACKUP_KEEP))) {
			fs.unlinkSync(path.join(dir, old));
		}
	} catch (rotErr: any) {
		addLog("warn", `Backup rotation failed: ${rotErr.message}`);
	}

	addLog("info", `Database backup created`, backupPath);
	return backupPath;
}

// Newest verified-readable backup file, or null if none usable.
function latestValidBackup(dbPath: string): string | null {
	const dir = backupDirFor(dbPath);
	if (!fs.existsSync(dir)) return null;
	const snaps = fs.readdirSync(dir)
		.filter((f) => f.startsWith("media_library-") && f.endsWith(".db"))
		.sort()
		.reverse();
	for (const name of snaps) {
		const candidate = path.join(dir, name);
		let db: Database | null = null;
		try {
			db = openReadableDb(candidate);
			db.prepare("SELECT count(*) FROM media_items").get(); // touch data pages
			return candidate;
		} catch {
			addLog("warn", `Skipping unreadable backup: ${name}`);
		} finally {
			db?.close();
		}
	}
	return null;
}

export function getDatabaseConnection(dbPath: string): Database {
	let db: Database | null = null;
	try {
		db = openLibraryDb(dbPath);
		initializeDatabase(db);
		// Touch actual data pages (not just the schema page) so on-disk
		// corruption is detected here and can trigger recovery, rather than
		// surfacing later inside a specific query like getMediaItems.
		db.prepare("SELECT count(*) FROM media_items").get();
		return db;
	} catch (err: any) {
		if (db) {
			try {
				db.close();
			} catch {}
			db = null;
		}

		if (!isCorruptionError(err)) throw err;

		addLog("error", `SQLite database malformed/corrupted: ${err.message}. Attempting recovery...`);

		// Remove the corrupt file + any stale journal/wal/shm siblings.
		for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`, `${dbPath}-journal`]) {
			try {
				if (fs.existsSync(p)) fs.unlinkSync(p);
			} catch (unlinkErr: any) {
				addLog("error", `Failed to delete ${p}: ${unlinkErr.message}`);
			}
		}

		// Prefer restoring the newest good backup over losing the whole catalog.
		const backup = latestValidBackup(dbPath);
		if (backup) {
			try {
				fs.copyFileSync(backup, dbPath);
				db = openLibraryDb(dbPath);
				initializeDatabase(db);
				db.prepare("SELECT count(*) FROM media_items").get();
				addLog("info", `Recovered database from backup`, backup);
				return db;
			} catch (restoreErr: any) {
				if (db) {
					try {
						db.close();
					} catch {}
					db = null;
				}
				addLog("error", `Restore from backup failed, recreating empty DB: ${restoreErr.message}`);
				try {
					if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
				} catch {}
			}
		}

		// Last resort: fresh empty library.
		addLog("warn", "No usable backup; recreating an empty library database.");
		try {
			db = openLibraryDb(dbPath);
			initializeDatabase(db);
			return db;
		} catch (recreateErr: any) {
			if (db) {
				try {
					db.close();
				} catch {}
			}
			throw recreateErr;
		}
	}
}

// Translate raw filesystem errno codes into guidance a user can act on.
export function friendlyFsError(err: any): string {
	switch (err?.code) {
		case "EROFS":
			return "This drive is mounted read-only, so the media library can't be created on it. Remount the drive with write access and try again.";
		case "EACCES":
		case "EPERM":
			return "Permission denied writing to this drive. Check the drive's mount options or ownership.";
		case "ENOSPC":
			return "The drive is full — free up some space to build the media library.";
		default:
			return err?.message || "Unknown filesystem error";
	}
}

// Verify we can actually write to the target directory before initializing the
// database there. Catches read-only mounts up front with a clear message
// instead of failing later with a cryptic EROFS deep in a SQLite write.
export function assertWritable(dir: string) {
	const probe = path.join(dir, `.write_test_${process.pid}_${Date.now()}`);
	try {
		fs.writeFileSync(probe, "");
		fs.unlinkSync(probe);
	} catch (err: any) {
		throw Object.assign(new Error(friendlyFsError(err)), { code: err?.code });
	}
}
