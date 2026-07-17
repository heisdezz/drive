import { BrowserWindow, BrowserView, Updater, Utils } from "electrobun/bun";
import type { MainRPC } from "../shared/rpc";

const userMountedDrives: {
	id: string;
	name: string;
	type: "internal" | "external" | "network";
	size: string;
	usedPercentage: number;
	status: "mounted" | "unmounted" | "syncing" | "unmounting";
	path: string;
}[] = [];
import fs from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";
import { readdir } from "node:fs/promises";
import si from "systeminformation";

interface LogEntry {
	timestamp: string;
	level: "info" | "warn" | "error" | "failure";
	message: string;
	context?: string;
}

const appLogs: LogEntry[] = [];

function addLog(level: LogEntry["level"], message: string, context?: string) {
	const entry: LogEntry = {
		timestamp: new Date().toISOString(),
		level,
		message,
		context
	};
	appLogs.push(entry);
	if (appLogs.length > 1000) {
		appLogs.shift();
	}
	console.log(`[${level.toUpperCase()}] ${message} ${context ? `(${context})` : ""}`);
}

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

// Check if Vite dev server is running for HMR
async function getMainViewUrl(): Promise<string> {
	const channel = await Updater.localInfo.channel();
	if (channel === "dev") {
		try {
			await fetch(DEV_SERVER_URL, { method: "HEAD" });
			console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
			return DEV_SERVER_URL;
		} catch {
			console.log(
				"Vite dev server not running. Run 'bun run dev:hmr' for HMR support.",
			);
		}
	}
	return "views://mainview/index.html";
}

// Backend function to list all block devices using systeminformation
async function getConnectedDrives() {
	addLog("info", "Listing drives via systeminformation");
	try {
		const devices = await si.blockDevices();

		// We only want top-level disks, not individual partitions —
		// each disk entry aggregates all its partition mount info via si
		const SKIP_FSTYPES = new Set(["swap", "squashfs", "tmpfs", "devtmpfs"]);
		const SKIP_MOUNTS = new Set(["/boot", "/boot/efi", "[SWAP]"]);
		const isSystemMount = (mp: string) =>
			!mp ||
			SKIP_MOUNTS.has(mp) ||
			mp.startsWith("/sys") ||
			mp.startsWith("/dev") ||
			mp.startsWith("/proc") ||
			(mp.startsWith("/run") && !mp.startsWith("/run/media/"));

		// Group partitions by their parent disk device path
		const diskMap = new Map<string, typeof devices[number]>();
		for (const dev of devices) {
			if (dev.type === "disk" && dev.name !== "zram0" && !dev.name.startsWith("loop")) {
				diskMap.set(`/dev/${dev.name}`, dev);
			}
		}

		const drives: {
			id: string;
			name: string;
			type: "internal" | "external" | "network";
			size: string;
			usedPercentage: number;
			status: "mounted" | "unmounted" | "syncing" | "unmounting";
			path: string;
		}[] = [];

		for (const [devicePath, disk] of diskMap) {
			// Find the best partition to represent this disk:
			// prefer the one with a meaningful user-accessible mount
			const partitions = devices.filter(
				(d) => d.device === devicePath && d.type === "part" && !SKIP_FSTYPES.has(d.fsType)
			);

			// Find the primary user mount (/ or /run/media/* or any non-system mount)
			const userPartition = partitions.find((p) => !isSystemMount(p.mount));
			const systemPartition = partitions.find((p) => p.mount === "/");
			const rep = userPartition || systemPartition || (partitions.length ? partitions[0] : null);

			// If this disk is entirely system-only partitions, skip it
			const hasOnlySystemMounts = partitions.length > 0 &&
				partitions.every((p) => p.mount && isSystemMount(p.mount) && p.mount !== "/");
			if (hasOnlySystemMounts) continue;

			const mountPath = rep && !isSystemMount(rep.mount) ? rep.mount : (systemPartition?.mount || "");
			const isMounted = !!mountPath;

			// Human-readable size
			const gb = (disk.size ?? 0) / 1_073_741_824;
			const size = gb >= 1000
				? `${(gb / 1024).toFixed(1)} TB`
				: `${Math.round(gb)} GB`;

			// Name: prefer model, fallback to label or device
			const name = disk.model?.trim() ||
				(rep?.label?.trim() || "") ||
				disk.name;
			const label = mountPath === "/" ? "System Root" : (name || devicePath);

			// Drive type: use protocol field
			const driveType: "internal" | "external" | "network" =
				disk.protocol === "usb" ? "external" : "internal";

			addLog("info", `Drive: ${label} (${size})`,
				`device=${devicePath}, mounted=${isMounted}, mount=${mountPath || "none"}, protocol=${disk.protocol}, physical=${disk.physical}`);

			drives.push({
				id: devicePath,
				name: label,
				type: driveType,
				size,
				usedPercentage: 0,
				status: isMounted ? "mounted" : "unmounted",
				path: mountPath,
			});
		}

		addLog("info", `Drive scan complete. Found ${drives.length} drives. Combined with ${userMountedDrives.length} custom mounts.`);
		return [...drives, ...userMountedDrives];
	} catch (error: any) {
		addLog("error", `Failed to list drives: ${error.message}`, error.stack);
		return [
			{ id: "fallback-1", name: "System (Fallback)", type: "internal" as const, size: "128 GB", usedPercentage: 0, status: "mounted" as const, path: "/" }
		];
	}
}

// SQLite Database structure initialization
function initializeDatabase(db: Database) {
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
function openLibraryDb(dbPath: string): Database {
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
function openReadableDb(dbPath: string): Database {
	const db = new Database(dbPath, { readonly: true });
	db.exec("PRAGMA busy_timeout = 5000;");
	return db;
}

// --- Backups ---------------------------------------------------------------
// Snapshots live next to the DB so they travel with the drive. We keep a small
// rotating set and use them to auto-recover instead of wiping data on corruption.
const BACKUP_KEEP = 5;

function backupDirFor(dbPath: string): string {
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
function createBackup(dbPath: string): string | null {
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

function getDatabaseConnection(dbPath: string): Database {
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
function friendlyFsError(err: any): string {
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
function assertWritable(dir: string) {
	const probe = path.join(dir, `.write_test_${process.pid}_${Date.now()}`);
	try {
		fs.writeFileSync(probe, "");
		fs.unlinkSync(probe);
	} catch (err: any) {
		throw Object.assign(new Error(friendlyFsError(err)), { code: err?.code });
	}
}

async function moveFile(src: string, dest: string) {
	try {
		await fs.promises.rename(src, dest);
	} catch (err: any) {
		addLog("info", `fs.rename failed (${err.message}), trying copy + delete fallback...`);
		await fs.promises.copyFile(src, dest);
		await fs.promises.unlink(src);
	}
}

async function generateThumbnailFile(fullMediaPath: string, thumbPath: string): Promise<boolean> {
	try {
		const thumbsDir = path.dirname(thumbPath);
		if (!fs.existsSync(thumbsDir)) {
			fs.mkdirSync(thumbsDir, { recursive: true });
		}

		const ext = path.extname(fullMediaPath).toLowerCase();
		const isVideo = [".mp4", ".mov", ".avi", ".mkv", ".webm"].includes(ext);

		if (isVideo) {
			addLog("info", `Generating video thumbnail for: ${fullMediaPath}`);
			const proc = Bun.spawn([
				"ffmpeg",
				"-y",
				"-ss", "00:00:01",
				"-i", fullMediaPath,
				"-vframes", "1",
				"-vf", "scale=320:-1",
				thumbPath
			]);
			await proc.exited;
		} else {
			addLog("info", `Generating image thumbnail for: ${fullMediaPath}`);
			try {
				const sharp = require("sharp");
				await sharp(fullMediaPath)
					.resize(320)
					.toFile(thumbPath);
			} catch (e: any) {
				addLog("warn", `Sharp failed or not available, falling back to ffmpeg: ${e.message}`);
				const proc = Bun.spawn([
					"ffmpeg",
					"-y",
					"-i", fullMediaPath,
					"-vf", "scale=320:-1",
					"-vframes", "1",
					thumbPath
				]);
				await proc.exited;
			}
		}

		return fs.existsSync(thumbPath);
	} catch (err: any) {
		addLog("error", `Failed in generateThumbnailFile for ${fullMediaPath}: ${err.message}`, err.stack);
		return false;
	}
}

class ConcurrencyLimiter {
	private active = 0;
	private limit: number;
	private queue: (() => void)[] = [];

	constructor(limit: number) {
		this.limit = limit;
	}

	async run<T>(fn: () => Promise<T>): Promise<T> {
		if (this.active >= this.limit) {
			await new Promise<void>((resolve) => this.queue.push(resolve));
		}
		this.active++;
		try {
			return await fn();
		} finally {
			this.active--;
			const next = this.queue.shift();
			if (next) {
				next();
			}
		}
	}
}

const generatorLimiter = new ConcurrencyLimiter(3);
const activeGenerations = new Map<string, Promise<boolean>>();

async function getOrGenerateThumbnail(fullMediaPath: string, thumbPath: string): Promise<boolean> {
	if (fs.existsSync(thumbPath)) {
		return true;
	}

	let activePromise = activeGenerations.get(thumbPath);
	if (!activePromise) {
		activePromise = generatorLimiter.run(() => generateThumbnailFile(fullMediaPath, thumbPath));
		activeGenerations.set(thumbPath, activePromise);
		activePromise.finally(() => {
			activeGenerations.delete(thumbPath);
		});
	}

	return activePromise;
}

interface ThumbnailQueueItem {
	fullMediaPath: string;
	thumbPath: string;
}

class ThumbnailQueue {
	private queue: ThumbnailQueueItem[] = [];
	private activeCount = 0;
	private maxConcurrency = 2;

	public add(fullMediaPath: string, thumbPath: string) {
		if (this.queue.some(item => item.thumbPath === thumbPath)) {
			return;
		}
		if (fs.existsSync(thumbPath)) {
			return;
		}
		this.queue.push({ fullMediaPath, thumbPath });
		this.processNext();
	}

	private async processNext() {
		if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) {
			return;
		}

		const item = this.queue.shift();
		if (!item) return;

		this.activeCount++;
		try {
			if (!fs.existsSync(item.thumbPath)) {
				await generateThumbnailFile(item.fullMediaPath, item.thumbPath);
			}
		} catch (err: any) {
			addLog("error", `Background thumbnail generation failed: ${err.message}`);
		} finally {
			this.activeCount--;
			setImmediate(() => this.processNext());
		}
	}
}

const backgroundThumbnailQueue = new ThumbnailQueue();

// Active scan tracking state
interface ScanState {
	scanning: boolean;
	scannedCount: number;
	foundCount: number;
	folderPath: string;
}
const activeScans = new Map<string, ScanState>();

// Recursive asynchronous directory scanner
async function walkDirectory(
	drivePath: string,
	currentDir: string,
	db: Database,
	scanState: ScanState
) {
	if (!scanState.scanning) return;

	try {
		const files = await readdir(currentDir, { withFileTypes: true });

		for (const file of files) {
			if (!scanState.scanning) return;

			// Skip symbolic links to avoid loops or escaping storage boundary
			if (file.isSymbolicLink()) {
				continue;
			}

			const fullPath = path.join(currentDir, file.name);
			const relativePath = path.relative(drivePath, fullPath);

			// Extra safety: do not descend or index outside the drive root
			if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
				continue;
			}

			if (file.isDirectory()) {
				// Skip albums folder, hidden directories and dependencies
				if (
					file.name === "albums" || 
					file.name.startsWith(".") || 
					file.name === "node_modules" || 
					file.name === "lost+found"
				) {
					continue;
				}
				await walkDirectory(drivePath, fullPath, db, scanState);
			} else if (file.isFile()) {
				scanState.scannedCount++;

				// Safety-net yield for code paths that don't otherwise await (e.g.
				// non-media files, or already-indexed files that only do a sync DB
				// lookup) so a large already-scanned directory can't starve the loop.
				if (scanState.scannedCount % 50 === 0) {
					await new Promise((resolve) => setImmediate(resolve));
					if (!scanState.scanning) return;
				}

				const ext = path.extname(file.name).toLowerCase();
				const isImage = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic"].includes(ext);
				const isVideo = [".mp4", ".mov", ".avi", ".mkv", ".webm"].includes(ext);

				if (isImage || isVideo) {
					// Check if already registered to avoid duplication
					const existing = db.prepare("SELECT id, file_hash, current_relative_path FROM media_items WHERE original_relative_path = ?").get(relativePath) as { id: number; file_hash: string; current_relative_path: string } | undefined;

					if (!existing) {
						// Async fs so each media file is a natural yield point — this
						// keeps the single-threaded main process responsive to RPC
						// requests (scaffoldLibrary/getScanStatus/getMediaItems)
						// instead of blocking on a burst of synchronous syscalls.
						const fileStats = await fs.promises.stat(fullPath);
						const fileHash = `${file.name}_${fileStats.size}_${fileStats.mtimeMs}`;
						const mimeType = isImage ? `image/${ext.slice(1)}` : `video/${ext.slice(1)}`;

						// Create destination folder if not exists
						const parentDir = path.dirname(fullPath);
						const isRoot = parentDir === drivePath;
						const albumName = isRoot ? "unknown" : path.basename(parentDir);

						const destDir = path.join(drivePath, "albums", albumName);
						await fs.promises.mkdir(destDir, { recursive: true });

						// Determine target full path
						let targetFullPath = path.join(destDir, file.name);
						if (fs.existsSync(targetFullPath)) {
							const base = path.basename(file.name, ext);
							let counter = 1;
							while (fs.existsSync(path.join(destDir, `${base}_${counter}${ext}`))) {
								counter++;
							}
							targetFullPath = path.join(destDir, `${base}_${counter}${ext}`);
						}

						// Bail out if the scan was stopped while we awaited above
						if (!scanState.scanning) return;

						try {
							// Move the file physically
							await moveFile(fullPath, targetFullPath);
							const currentRelativePath = path.relative(drivePath, targetFullPath);

							let albumId: number | null = null;
							// Ensure the album exists in the database
							db.prepare(`
								INSERT OR IGNORE INTO albums (name, relative_path)
								VALUES (?, ?)
							`).run(albumName, `albums/${albumName}`);

							const album = db.prepare("SELECT id FROM albums WHERE name = ?").get(albumName) as { id: number } | undefined;
							if (album) {
								albumId = album.id;
							}

							// Insert into Database
							db.prepare(`
								INSERT OR IGNORE INTO media_items (file_hash, original_relative_path, current_relative_path, file_size, mime_type, album_id)
								VALUES (?, ?, ?, ?, ?, ?)
							`).run(fileHash, relativePath, currentRelativePath, fileStats.size, mimeType, albumId);

							scanState.foundCount++;
							addLog("info", `Moved media file during scan`, `original: ${relativePath} -> current: ${currentRelativePath}`);

							// Queue background thumbnail generation
							const thumbPath = path.join(drivePath, "albums", "thumbs", `${fileHash}.jpg`);
							backgroundThumbnailQueue.add(targetFullPath, thumbPath);
						} catch (moveErr: any) {
							addLog("error", `Failed to move media file: ${fullPath}`, moveErr.message);
						}
					} else {
						// Already registered, but queue missing thumbnail generation
						const thumbPath = path.join(drivePath, "albums", "thumbs", `${existing.file_hash}.jpg`);
						const targetFullPath = path.join(drivePath, existing.current_relative_path);
						backgroundThumbnailQueue.add(targetFullPath, thumbPath);
					}
				}
			}
		}
	} catch (err: any) {
		addLog("error", `Error walking directory ${currentDir}: ${err.message}`, err.stack);
	}
}

// Define the RPC handlers
const rpc = BrowserView.defineRPC<MainRPC>({
	handlers: {
		requests: {
			getDrives: async () => {
				addLog("info", "RPC Request: getDrives invoked");
				return getConnectedDrives();
			},
			mountDrive: async () => {
				addLog("info", "RPC Request: mountDrive invoked");
				try {
					const paths = await Utils.openFileDialog({
						canChooseFiles: false,
						canChooseDirectory: true,
						allowsMultipleSelection: false,
						startingFolder: "/"
					});
					
					if (!paths || paths.length === 0 || !paths[0]) {
						addLog("info", "mountDrive cancelled by user");
						return { success: false, error: "Cancelled by user" };
					}
					
					const selectedPath = paths[0].trim();
					addLog("info", `mountDrive selected path: ${selectedPath}`);
					
					// Check if already mounted
					const existing = userMountedDrives.find(d => d.path === selectedPath);
					if (existing) {
						addLog("info", `Drive already mounted: ${selectedPath}`);
						return { success: true, drive: existing };
					}
					
					const name = path.basename(selectedPath) || selectedPath;
					const newDrive = {
						id: `user-${Date.now()}`,
						name: `${name} (Mounted)`,
						type: "external" as const,
						size: "Custom Folder",
						usedPercentage: 0,
						status: "mounted" as const,
						path: selectedPath
					};
					
					userMountedDrives.push(newDrive);
					addLog("info", `Successfully mounted custom folder as drive: ${newDrive.name} at ${newDrive.path}`);
					return { success: true, drive: newDrive };
				} catch (err: any) {
					addLog("error", `Failed to mount drive folder: ${err.message}`, err.stack);
					return { success: false, error: err.message };
				}
			},
			mountBlockDevice: async ({ deviceId }) => {
				addLog("info", `RPC Request: mountBlockDevice invoked`, `deviceId: ${deviceId}`);
				try {
					const devices = await si.blockDevices();
					
					// 1. Find the target partition to mount
					const SKIP_FSTYPES = new Set(["swap", "squashfs", "tmpfs", "devtmpfs"]);
					let targetPart = devices.find(d => `/dev/${d.name}` === deviceId && d.type === "part");
					
					if (!targetPart) {
						// If the deviceId represents the parent disk (e.g. /dev/sdb),
						// find the partitions belonging to it.
						const parts = devices.filter(
							(d) => d.device === deviceId && d.type === "part" && !SKIP_FSTYPES.has(d.fsType)
						);
						if (parts.length > 0) {
							// Sort by size descending to pick the largest partition
							parts.sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
							targetPart = parts[0];
						}
					}
					
					if (!targetPart) {
						throw new Error(`No mountable partition found for device ${deviceId}`);
					}
					
					const partPath = `/dev/${targetPart.name}`;
					addLog("info", `Attempting to mount partition ${partPath} via udisksctl`);
					
					const proc = Bun.spawn(["udisksctl", "mount", "-b", partPath]);
					const stdout = await new Response(proc.stdout).text();
					const stderr = await new Response(proc.stderr).text();
					await proc.exited;
					
					addLog("info", `udisksctl output`, `stdout: ${stdout.trim()}, stderr: ${stderr.trim()}`);
					
					// Query block devices again to get the new mountpoint
					const updatedDevices = await si.blockDevices();
					const freshPart = updatedDevices.find(d => `/dev/${d.name}` === partPath);
					
					if (freshPart && freshPart.mount) {
						addLog("info", `Successfully mounted device ${deviceId} at ${freshPart.mount}`);
						return { success: true, mountPath: freshPart.mount };
					} else {
						throw new Error(stderr.trim() || `udisksctl completed but mountpoint was not found`);
					}
				} catch (err: any) {
					addLog("error", `Failed to mount block device ${deviceId}: ${err.message}`, err.stack);
					return { success: false, error: err.message };
				}
			},
			scaffoldLibrary: async ({ drivePath }) => {
				addLog("info", `RPC Request: scaffoldLibrary invoked`, `drivePath: ${drivePath}`);
				try {
					const albumsPath = path.join(drivePath, "albums");
					const unknownPath = path.join(albumsPath, "unknown");
					const dbPath = path.join(drivePath, "albums", ".media_library.db");

					// Fail fast with a clear message if the drive is read-only,
					// rather than partway through creating folders / the DB.
					assertWritable(drivePath);

					// Create albums directory if not exists
					if (!fs.existsSync(albumsPath)) {
						fs.mkdirSync(albumsPath, { recursive: true });
						addLog("info", `Created albums folder: ${albumsPath}`);
					}
					
					// Create unknown directory if not exists
					if (!fs.existsSync(unknownPath)) {
						fs.mkdirSync(unknownPath, { recursive: true });
						addLog("info", `Created unknown folder: ${unknownPath}`);
					}

					// Skip initialization if scanning is already active on this drive to avoid locking
					const scanState = activeScans.get(drivePath);
					if (scanState && scanState.scanning) {
						addLog("info", `Drive ${drivePath} is actively scanning. Skipping SQLite initialization to avoid locks.`);
						return { success: true };
					}

					try {
						const db = getDatabaseConnection(dbPath);
						db.close();
						addLog("info", `SQLite database initialized: ${dbPath}`);
					} catch (dbErr: any) {
						addLog("error", `SQLite database initialization failed: ${dbErr.message}`);
						throw dbErr;
					}
					
					return { success: true };
				} catch (err: any) {
					addLog("failure", `Failed to scaffold library at ${drivePath}: ${err.message}`, err.stack);
					return { success: false, error: friendlyFsError(err) };
				}
			},
			startScan: async ({ drivePath, folderPath }) => {
				addLog("info", `RPC Request: startScan invoked`, `drivePath: ${drivePath}, folderPath: ${folderPath}`);
				try {
					const dbPath = path.join(drivePath, "albums", ".media_library.db");
					if (!fs.existsSync(dbPath)) {
						addLog("warn", "Database not scaffolded, cannot start scan", drivePath);
						return { success: false, error: "Database not scaffolded yet. Please scaffold library first." };
					}

					// Snapshot the current catalog before the scan's write burst, so
					// an unplug/corruption mid-scan can be rolled back to this point.
					// Non-fatal: a backup failure must not block scanning.
					try {
						createBackup(dbPath);
					} catch (backupErr: any) {
						addLog("warn", `Pre-scan backup failed (continuing): ${backupErr.message}`);
					}

					// Recovers automatically if the file is corrupt and uses a
					// journal mode safe for exFAT/removable drives (never WAL).
					const db = getDatabaseConnection(dbPath);

					// Stop any active scan on this drive
					let state = activeScans.get(drivePath);
					if (state && state.scanning) {
						addLog("info", "Aborting active scan on drive to start a new scan session", drivePath);
						state.scanning = false;
						await new Promise((resolve) => setTimeout(resolve, 300));
					}

					state = {
						scanning: true,
						scannedCount: 0,
						foundCount: 0,
						folderPath: folderPath,
					};
					activeScans.set(drivePath, state);

					// Async scan start
					(async () => {
						try {
							addLog("info", "Media scanner thread started", folderPath);
							await walkDirectory(drivePath, folderPath, db, state!);
						} catch (err: any) {
							addLog("error", `Scanning process encountered error: ${err.message}`, err.stack);
						} finally {
							state!.scanning = false;
							db.close();
							addLog("info", `Scan thread closed. Total checked: ${state!.scannedCount}, media found: ${state!.foundCount}`, drivePath);
						}
					})();

					return { success: true };
				} catch (err: any) {
					addLog("error", `Failed to initiate scan at ${folderPath}: ${err.message}`, err.stack);
					return { success: false, error: err.message };
				}
			},
			stopScan: async ({ drivePath }) => {
				addLog("info", `RPC Request: stopScan invoked`, `drivePath: ${drivePath}`);
				const state = activeScans.get(drivePath);
				if (state) {
					state.scanning = false;
					addLog("info", `Scan stopped by user request`, drivePath);
				}
				return { success: true };
			},
			getScanStatus: async ({ drivePath }) => {
				const state = activeScans.get(drivePath);
				if (state) {
					return {
						scanning: state.scanning,
						scannedCount: state.scannedCount,
						foundCount: state.foundCount,
						folderPath: state.folderPath,
					};
				}
				// If not currently scanning, return database total
				let db: Database | null = null;
				try {
					const dbPath = path.join(drivePath, "albums", ".media_library.db");
					if (fs.existsSync(dbPath)) {
						db = openReadableDb(dbPath);
						const result = db.prepare("SELECT count(*) as count FROM media_items").get() as { count: number };
						return {
							scanning: false,
							scannedCount: 0,
							foundCount: result.count,
							folderPath: "",
						};
					}
				} catch (err: any) {
					addLog("error", `Failed to read SQLite scan count: ${err.message}`, err.stack);
				} finally {
					db?.close();
				}
				return {
					scanning: false,
					scannedCount: 0,
					foundCount: 0,
					folderPath: "",
				};
			},
			getMediaItems: async ({ drivePath, limit, offset, search, filter }) => {
				let db: Database | null = null;
				try {
					const dbPath = path.join(drivePath, "albums", ".media_library.db");
					if (!fs.existsSync(dbPath)) {
						return { items: [], total: 0 };
					}
					db = openReadableDb(dbPath);

					let sql = "SELECT * FROM media_items WHERE 1=1";
					let countSql = "SELECT count(*) as count FROM media_items WHERE 1=1";
					const params: any[] = [];

					if (search) {
						sql += " AND (original_relative_path LIKE ? OR current_relative_path LIKE ?)";
						countSql += " AND (original_relative_path LIKE ? OR current_relative_path LIKE ?)";
						const term = `%${search}%`;
						params.push(term, term);
					}

					if (filter === "images") {
						sql += " AND mime_type LIKE 'image/%'";
						countSql += " AND mime_type LIKE 'image/%'";
					} else if (filter === "videos") {
						sql += " AND mime_type LIKE 'video/%'";
						countSql += " AND mime_type LIKE 'video/%'";
					}

					sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";

					const countParams = [...params];
					params.push(limit, offset);

					const items = db.prepare(sql).all(...params) as any[];
					const totalResult = db.prepare(countSql).get(...countParams) as { count: number };

					return { items, total: totalResult.count };
				} catch (err: any) {
					addLog("error", `Failed to query media items: ${err.message}`, err.stack);
					return { items: [], total: 0, error: err.message };
				} finally {
					db?.close();
				}
			},
			getMediaItem: async ({ drivePath, itemId, albumId }) => {
				let db: Database | null = null;
				try {
					const dbPath = path.join(drivePath, "albums", ".media_library.db");
					if (!fs.existsSync(dbPath)) {
						return { error: "Library database not found" };
					}
					db = openReadableDb(dbPath);
					const item = db.prepare(`
						SELECT m.*, a.name AS album_name, a.relative_path AS album_relative_path
						FROM media_items m
						LEFT JOIN albums a ON m.album_id = a.id
						WHERE m.id = ?
					`).get(itemId) as any;
					
					let nextId: number | null = null;
					let prevId: number | null = null;

					if (item) {
						const createdAt = item.created_at;
						const id = item.id;

						let nextQuery = "";
						let prevQuery = "";
						const nextParams: any[] = [createdAt, createdAt, id];
						const prevParams: any[] = [createdAt, createdAt, id];

						if (albumId !== undefined) {
							nextQuery = `
								SELECT id FROM media_items
								WHERE (created_at < ? OR (created_at = ? AND id < ?))
								AND album_id = ?
								ORDER BY created_at DESC, id DESC
								LIMIT 1
							`;
							prevQuery = `
								SELECT id FROM media_items
								WHERE (created_at > ? OR (created_at = ? AND id > ?))
								AND album_id = ?
								ORDER BY created_at ASC, id ASC
								LIMIT 1
							`;
							nextParams.push(albumId);
							prevParams.push(albumId);
						} else {
							nextQuery = `
								SELECT id FROM media_items
								WHERE (created_at < ? OR (created_at = ? AND id < ?))
								ORDER BY created_at DESC, id DESC
								LIMIT 1
							`;
							prevQuery = `
								SELECT id FROM media_items
								WHERE (created_at > ? OR (created_at = ? AND id > ?))
								ORDER BY created_at ASC, id ASC
								LIMIT 1
							`;
						}

						const nextRes = db.prepare(nextQuery).get(...nextParams) as { id: number } | undefined;
						const prevRes = db.prepare(prevQuery).get(...prevParams) as { id: number } | undefined;

						if (nextRes) nextId = nextRes.id;
						if (prevRes) prevId = prevRes.id;
					}

					if (!item) {
						return { error: `Media item with ID ${itemId} not found` };
					}
					return { item, nextId, prevId };
				} catch (err: any) {
					addLog("error", `Failed to query media item: ${err.message}`, err.stack);
					return { error: err.message };
				} finally {
					db?.close();
				}
			},
			getRelatedMedia: async ({ drivePath, itemId, limit }) => {
				let db: Database | null = null;
				try {
					const dbPath = path.join(drivePath, "albums", ".media_library.db");
					if (!fs.existsSync(dbPath)) {
						return { items: [] };
					}
					db = openReadableDb(dbPath);

					const current = db.prepare(
						"SELECT original_relative_path FROM media_items WHERE id = ?"
					).get(itemId) as { original_relative_path: string } | undefined;
					if (!current) {
						return { items: [] };
					}

					// Sibling files share the same source folder (the dirname of the
					// original path). Escape LIKE wildcards so folder names containing
					// '%' or '_' don't over-match.
					const orig = current.original_relative_path;
					const slash = orig.lastIndexOf("/");
					const folder = slash >= 0 ? orig.slice(0, slash) : "";

					const collected: any[] = [];
					const seen = new Set<number>([itemId]);

					if (folder) {
						const esc = folder.replace(/[\\%_]/g, (c) => `\\${c}`);
						const siblings = db.prepare(
							`SELECT * FROM media_items
							 WHERE id != ?
							   AND original_relative_path LIKE ? ESCAPE '\\'
							   AND original_relative_path NOT LIKE ? ESCAPE '\\'
							 ORDER BY created_at DESC LIMIT ?`
						).all(itemId, `${esc}/%`, `${esc}/%/%`, limit) as any[];
						for (const s of siblings) {
							if (!seen.has(s.id)) { collected.push(s); seen.add(s.id); }
						}
					}

					// Backfill with other recent items so the section is never empty.
					if (collected.length < limit) {
						const recent = db.prepare(
							"SELECT * FROM media_items ORDER BY created_at DESC LIMIT ?"
						).all(limit * 3) as any[];
						for (const r of recent) {
							if (collected.length >= limit) break;
							if (!seen.has(r.id)) { collected.push(r); seen.add(r.id); }
						}
					}

					return { items: collected.slice(0, limit) };
				} catch (err: any) {
					addLog("error", `Failed to query related media: ${err.message}`, err.stack);
					return { items: [], error: err.message };
				} finally {
					db?.close();
				}
			},
			backupDatabase: async ({ drivePath }) => {
				addLog("info", `RPC Request: backupDatabase invoked`, `drivePath: ${drivePath}`);
				try {
					const dbPath = path.join(drivePath, "albums", ".media_library.db");
					if (!fs.existsSync(dbPath)) {
						return { success: false, error: "No library database to back up yet." };
					}
					const backupPath = createBackup(dbPath);
					if (!backupPath) {
						return { success: false, error: "Backup produced no output file." };
					}
					return { success: true, backupPath };
				} catch (err: any) {
					addLog("error", `Failed to back up database: ${err.message}`, err.stack);
					return { success: false, error: err.message };
				}
			},
			listBackups: async ({ drivePath }) => {
				try {
					const dbPath = path.join(drivePath, "albums", ".media_library.db");
					const dir = backupDirFor(dbPath);
					if (!fs.existsSync(dir)) {
						return { backups: [] };
					}
					const backups = fs.readdirSync(dir)
						.filter((f) => f.startsWith("media_library-") && f.endsWith(".db"))
						.map((name) => {
							const stat = fs.statSync(path.join(dir, name));
							return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
						})
						.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
					return { backups };
				} catch (err: any) {
					addLog("error", `Failed to list backups: ${err.message}`, err.stack);
					return { backups: [], error: err.message };
				}
			},
			openExternal: async ({ drivePath, relativePath }) => {
				addLog("info", `RPC Request: openExternal invoked`, `relativePath: ${relativePath}`);
				try {
					// Resolve and confine the target to the drive root to avoid
					// launching arbitrary paths passed from the renderer.
					const fullPath = path.resolve(drivePath, relativePath);
					if (fullPath !== drivePath && !fullPath.startsWith(drivePath + path.sep)) {
						throw new Error("Refusing to open path outside the drive root");
					}
					if (!fs.existsSync(fullPath)) {
						throw new Error(`File not found: ${fullPath}`);
					}

					// mpv bundles its own ffmpeg-based decoder, so it plays media
					// without relying on the system GStreamer stack that WebKit uses.
					// Fall back to the desktop default handler if mpv is unavailable.
					const player = Bun.which("mpv") ? "mpv" : "xdg-open";
					const proc = Bun.spawn([player, fullPath], {
						stdout: "ignore",
						stderr: "ignore",
						stdin: "ignore",
					});
					// Detach so the player keeps running independently of the app.
					proc.unref();

					addLog("info", `Launched external player`, `${player} -> ${fullPath}`);
					return { success: true };
				} catch (err: any) {
					addLog("error", `Failed to open external player: ${err.message}`, err.stack);
					return { success: false, error: err.message };
				}
			},
			getThumbnail: async ({ mediaId, relativePath, drivePath, fileHash }) => {
				addLog("info", `RPC Request: getThumbnail invoked`, `mediaId: ${mediaId}, hash: ${fileHash}`);
				try {
					const thumbPath = path.join(drivePath, "albums", "thumbs", `${fileHash}.jpg`);
					const fullMediaPath = path.join(drivePath, relativePath);
					const localUrl = `http://localhost:${MEDIA_SERVER_PORT}/media/thumb?drivePath=${encodeURIComponent(drivePath)}&relativePath=${encodeURIComponent(relativePath)}&fileHash=${fileHash}`;

					await getOrGenerateThumbnail(fullMediaPath, thumbPath);
					return { success: true, url: localUrl };
				} catch (err: any) {
					addLog("error", `Failed to get or generate thumbnail: ${err.message}`, err.stack);
					return { success: false, error: err.message };
				}
			},
			getLogs: async () => {
				return { logs: appLogs };
			},
			getAlbums: async ({ drivePath }) => {
				addLog("info", `RPC Request: getAlbums invoked`, `drivePath: ${drivePath}`);
				let db: Database | null = null;
				try {
					const dbPath = path.join(drivePath, "albums", ".media_library.db");
					if (!fs.existsSync(dbPath)) {
						return { albums: [] };
					}
					const activeDb = openReadableDb(dbPath);
					db = activeDb;
					const rawAlbums = activeDb.prepare(`
						SELECT id, name, relative_path, description, created_at
						FROM albums
						ORDER BY name ASC
					`).all() as any[];

					const albums = rawAlbums.map(album => {
						// Get count of media items in this album
						const countResult = activeDb.prepare("SELECT count(*) as count FROM media_items WHERE album_id = ?").get(album.id) as { count: number };
						
						// Get preview item for this album (newest item)
						const previewItem = activeDb.prepare(`
							SELECT id, file_hash, original_relative_path, current_relative_path, mime_type
							FROM media_items
							WHERE album_id = ?
							ORDER BY created_at DESC
							LIMIT 1
						`).get(album.id) as any;

						return {
							id: album.id,
							name: album.name,
							relative_path: album.relative_path,
							description: album.description,
							created_at: album.created_at,
							media_count: countResult.count,
							preview_item: previewItem || null
						};
					});
					
					return { albums };
				} catch (err: any) {
					addLog("error", `Failed to get albums: ${err.message}`, err.stack);
					return { albums: [], error: err.message };
				} finally {
					db?.close();
				}
			},
			getAlbum: async ({ drivePath, albumId }) => {
				addLog("info", `RPC Request: getAlbum invoked`, `albumId: ${albumId}`);
				let db: Database | null = null;
				try {
					const dbPath = path.join(drivePath, "albums", ".media_library.db");
					if (!fs.existsSync(dbPath)) {
						return { error: "Library database not found" };
					}
					db = openReadableDb(dbPath);
					const album = db.prepare("SELECT * FROM albums WHERE id = ?").get(albumId) as any;
					if (!album) {
						return { error: `Album with ID ${albumId} not found` };
					}
					return { album };
				} catch (err: any) {
					addLog("error", `Failed to query album detail: ${err.message}`, err.stack);
					return { error: err.message };
				} finally {
					db?.close();
				}
			},
			getAlbumMedia: async ({ drivePath, albumId, limit, offset }) => {
				addLog("info", `RPC Request: getAlbumMedia invoked`, `albumId: ${albumId}`);
				let db: Database | null = null;
				try {
					const dbPath = path.join(drivePath, "albums", ".media_library.db");
					if (!fs.existsSync(dbPath)) {
						return { items: [], total: 0 };
					}
					db = openReadableDb(dbPath);
					const items = db.prepare(`
						SELECT * FROM media_items 
						WHERE album_id = ? 
						ORDER BY created_at DESC 
						LIMIT ? OFFSET ?
					`).all(albumId, limit, offset) as any[];
					
					const totalResult = db.prepare("SELECT count(*) as count FROM media_items WHERE album_id = ?").get(albumId) as { count: number };
					return { items, total: totalResult.count };
				} catch (err: any) {
					addLog("error", `Failed to query album media items: ${err.message}`, err.stack);
					return { items: [], total: 0, error: err.message };
				} finally {
					db?.close();
				}
			},
			moveMediaItemsToAlbum: async ({ drivePath, mediaIds, targetAlbumId }) => {
				addLog("info", `RPC Request: moveMediaItemsToAlbum invoked`, `mediaIds count: ${mediaIds.length}, targetAlbumId: ${targetAlbumId}`);
				let db: Database | null = null;
				try {
					const dbPath = path.join(drivePath, "albums", ".media_library.db");
					if (!fs.existsSync(dbPath)) {
						throw new Error("Library database not found");
					}

					assertWritable(drivePath);
					db = getDatabaseConnection(dbPath);

					// 1. Get target album details
					const album = db.prepare("SELECT * FROM albums WHERE id = ?").get(targetAlbumId) as { name: string; relative_path: string } | undefined;
					if (!album) {
						throw new Error(`Target album with ID ${targetAlbumId} not found`);
					}

					const destDir = path.join(drivePath, "albums", album.name);
					// Create destination folder if not exists
					await fs.promises.mkdir(destDir, { recursive: true });

					let movedCount = 0;

					db.run("BEGIN TRANSACTION;");
					try {
						// 2. Loop through and move each item
						for (const id of mediaIds) {
							const item = db.prepare("SELECT * FROM media_items WHERE id = ?").get(id) as { current_relative_path: string; mime_type: string } | undefined;
							if (!item) continue;

							const currentFullPath = path.join(drivePath, item.current_relative_path);
							if (!fs.existsSync(currentFullPath)) {
								addLog("warn", `File does not exist at current path, skipping physical move: ${currentFullPath}`);
								// Update DB anyway to keep it consistent
								db.prepare("UPDATE media_items SET album_id = ? WHERE id = ?").run(targetAlbumId, id);
								movedCount++;
								continue;
							}

							const filename = path.basename(item.current_relative_path);
							const ext = path.extname(filename);
							const base = path.basename(filename, ext);

							// Determine target full path, avoiding collisions
							let targetFullPath = path.join(destDir, filename);
							let finalFilename = filename;
							if (fs.existsSync(targetFullPath)) {
								let counter = 1;
								while (fs.existsSync(path.join(destDir, `${base}_${counter}${ext}`))) {
									counter++;
								}
								finalFilename = `${base}_${counter}${ext}`;
								targetFullPath = path.join(destDir, finalFilename);
							}

							// If target is same as current, skip physical rename, only update DB
							if (path.resolve(currentFullPath) === path.resolve(targetFullPath)) {
								db.prepare(`
									UPDATE media_items 
									SET album_id = ? 
									WHERE id = ?
								`).run(targetAlbumId, id);
								movedCount++;
								continue;
							}

							try {
								// Move physical file (with fallback)
								await moveFile(currentFullPath, targetFullPath);
								const newRelativePath = path.relative(drivePath, targetFullPath);

								// Update database
								db.prepare(`
									UPDATE media_items 
									SET album_id = ?, current_relative_path = ? 
									WHERE id = ?
								`).run(targetAlbumId, newRelativePath, id);

								movedCount++;
							} catch (moveErr: any) {
								addLog("error", `Failed to move physical file ${currentFullPath} to ${targetFullPath}: ${moveErr.message}`);
							}
						}
						db.run("COMMIT;");
					} catch (loopErr) {
						db.run("ROLLBACK;");
						throw loopErr;
					}

					addLog("info", `Successfully moved ${movedCount} items to album ${album.name}`);
					return { success: true, movedCount };
				} catch (err: any) {
					addLog("error", `Failed to move media items: ${err.message}`, err.stack);
					return { success: false, movedCount: 0, error: err.message };
				} finally {
					db?.close();
				}
			}
		}
	}
});

// Local HTTP server to bypass CORS/file scheme security policies
const MEDIA_SERVER_PORT = 51789;
const mediaServer = Bun.serve({
	port: MEDIA_SERVER_PORT,
	async fetch(req) {
		const corsHeaders = {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Allow-Headers": "*",
		};

		if (req.method === "OPTIONS") {
			return new Response(null, { headers: corsHeaders });
		}

		const url = new URL(req.url);
		if (url.pathname === "/media") {
			const filePath = url.searchParams.get("path");
			if (!filePath) {
				return new Response("Missing path parameter", { status: 400, headers: corsHeaders });
			}
			try {
				const file = Bun.file(filePath);
				if (await file.exists()) {
					return new Response(file, {
						headers: {
							...corsHeaders,
							"Cache-Control": "public, max-age=86400",
						}
					});
				}
				return new Response("File not found", { status: 404, headers: corsHeaders });
			} catch (err: any) {
				return new Response(err.message, { status: 500, headers: corsHeaders });
			}
		}

		if (url.pathname === "/media/thumb") {
			const drivePath = url.searchParams.get("drivePath");
			const relativePath = url.searchParams.get("relativePath");
			const fileHash = url.searchParams.get("fileHash");

			if (!drivePath || !relativePath || !fileHash) {
				return new Response("Missing parameter (drivePath/relativePath/fileHash)", { status: 400, headers: corsHeaders });
			}

			const thumbPath = path.join(drivePath, "albums", "thumbs", `${fileHash}.jpg`);
			const fullMediaPath = path.join(drivePath, relativePath);

			try {
				const success = await getOrGenerateThumbnail(fullMediaPath, thumbPath);
				if (success) {
					const file = Bun.file(thumbPath);
					return new Response(file, {
						headers: {
							...corsHeaders,
							"Cache-Control": "public, max-age=31536000, immutable",
						}
					});
				}
				return new Response("Failed to serve or generate thumbnail", { status: 500, headers: corsHeaders });
			} catch (err: any) {
				return new Response(err.message, { status: 500, headers: corsHeaders });
			}
		}
		return new Response("Not found", { status: 404, headers: corsHeaders });
	}
});

addLog("info", `Local media server running at http://localhost:${mediaServer.port}`);

// Create the main application window
const url = await getMainViewUrl();

new BrowserWindow({
	title: "React + Tailwind + Vite",
	url,
	rpc,
	frame: {
		width: 900,
		height: 700,
		x: 200,
		y: 200,
	},
});

addLog("info", "React Tailwind Vite app started!");
