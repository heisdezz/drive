import { albumDbPath, albumRoot, recoverCatalog } from "../album-location";
import fs from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";
import { addLog } from "../logger";
import {
	assertWritable,
	createBackup,
	friendlyFsError,
	getDatabaseConnection,
	openReadableDb,
} from "../database";
import { activeScans, walkDirectory } from "../scanner";
import { AlbumRescanControl, rescanAlbumFolder, type AlbumRescanStatus } from "../album-rescan";
import type { RpcHandlers } from "./types";

const scanJobs = new Map<string, Promise<void>>();
const scanStarts = new Map<string, Promise<void>>();
const albumRescanJobs = new Map<string, Promise<void>>();
const albumRescanStates = new Map<string, AlbumRescanStatus>();
const albumRescanControls = new Map<string, AlbumRescanControl>();

export function isScanBusy(drivePath: string): boolean {
  return scanStarts.has(drivePath) || scanJobs.has(drivePath) || albumRescanJobs.has(drivePath) || !!activeScans.get(drivePath)?.scanning;
}

export const scanHandlers: Pick<
	RpcHandlers,
	"scaffoldLibrary" | "startScan" | "stopScan" | "getScanStatus" | "startAlbumRescan" | "pauseAlbumRescan" | "stopAlbumRescan" | "getAlbumRescanStatus"
> = {
	scaffoldLibrary: async ({ drivePath }) => {
		addLog("info", `RPC Request: scaffoldLibrary invoked`, `drivePath: ${drivePath}`);
		try {
			const albumsPath = albumRoot(drivePath);
			const unknownPath = path.join(albumsPath, "unknown");
			const dbPath = albumDbPath(drivePath);

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

			// Reuse a catalog at the drive root or restore a snapshot before SQLite
			// creates a fresh empty catalog in the chosen album folder.
			if (!fs.existsSync(dbPath)) {
				const source = recoverCatalog(drivePath, albumsPath);
				if (source) addLog("info", `Recovered library catalog from ${source}`, dbPath);
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
	startScan: async ({ drivePath, folderPath, ignoreList }) => {
		addLog("info", `RPC Request: startScan invoked`, `drivePath: ${drivePath}, folderPath: ${folderPath}, ignoreList: ${ignoreList?.join(", ") || "none"}`);
		const previousStart = scanStarts.get(drivePath);
		let releaseStart!: () => void;
		const startGate = new Promise<void>(resolve => { releaseStart = resolve; });
		scanStarts.set(drivePath, startGate);
		if (previousStart) await previousStart;
		try {
			if (albumRescanJobs.has(drivePath)) return { success: false, error: "Wait for the album folder rescan to finish." };
			const dbPath = albumDbPath(drivePath);
			if (!fs.existsSync(dbPath)) {
				addLog("warn", "Database not scaffolded, cannot start scan", drivePath);
				return { success: false, error: "Database not scaffolded yet. Please scaffold library first." };
			}

			const previousJob = scanJobs.get(drivePath);
			if (previousJob) {
				const previousState = activeScans.get(drivePath);
				if (previousState) previousState.scanning = false;
				await previousJob;
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

			const state = {
				scanning: true,
				scannedCount: 0,
				foundCount: 0,
				folderPath: folderPath,
			};
			activeScans.set(drivePath, state);

			// Async scan start
			const job = (async () => {
				try {
					addLog("info", "Media scanner thread started", folderPath);
					await walkDirectory(drivePath, folderPath, db, state, ignoreList);
				} catch (err: any) {
					addLog("error", `Scanning process encountered error: ${err.message}`, err.stack);
				} finally {
					state.scanning = false;
					db.close();
					scanJobs.delete(drivePath);
					addLog("info", `Scan thread closed. Total checked: ${state.scannedCount}, media found: ${state.foundCount}`, drivePath);
				}
			})();
			scanJobs.set(drivePath, job);

			return { success: true };
		} catch (err: any) {
			addLog("error", `Failed to initiate scan at ${folderPath}: ${err.message}`, err.stack);
			return { success: false, error: err.message };
		} finally {
			releaseStart();
			if (scanStarts.get(drivePath) === startGate) scanStarts.delete(drivePath);
		}
	},
	stopScan: async ({ drivePath }) => {
		addLog("info", `RPC Request: stopScan invoked`, `drivePath: ${drivePath}`);
		const state = activeScans.get(drivePath);
		if (state) {
			state.scanning = false;
			addLog("info", `Scan stopped by user request`, drivePath);
		}
		await scanJobs.get(drivePath);
		return { success: true };
	},
	startAlbumRescan: async ({ drivePath }) => {
		if (isScanBusy(drivePath)) return { success: false, error: "Wait for the current scan to finish." };
		const state: AlbumRescanStatus = { scanning: true, checked: 0, added: 0, updated: 0, missing: 0, albums: 0, recoveredDatabase: false };
		const control = new AlbumRescanControl();
		albumRescanStates.set(drivePath, state);
		albumRescanControls.set(drivePath, control);
		const job = (async () => {
			try {
				await rescanAlbumFolder(drivePath, state, control);
				if (control.stopRequested) addLog("info", "Album folder rescan stopped by user", drivePath);
				else addLog("info", "Album folder rescan completed", `${drivePath}: ${state.added} added, ${state.updated} updated, ${state.missing} missing`);
			} catch (error: any) {
				state.error = error.message || "Album folder rescan failed.";
				addLog("error", `Album folder rescan failed: ${state.error}`, drivePath);
			} finally {
				state.scanning = false;
				state.paused = false;
				state.stopped = control.stopRequested;
				albumRescanControls.delete(drivePath);
				albumRescanJobs.delete(drivePath);
			}
		})();
		albumRescanJobs.set(drivePath, job);
		return { success: true };
	},
	pauseAlbumRescan: async ({ drivePath, paused }) => {
		const control = albumRescanControls.get(drivePath);
		const state = albumRescanStates.get(drivePath);
		if (!control || !state?.scanning) return { success: false, error: "No album rescan is running." };
		if (paused) control.pause();
		else control.resume();
		state.paused = paused;
		return { success: true };
	},
	stopAlbumRescan: async ({ drivePath }) => {
		const control = albumRescanControls.get(drivePath);
		const state = albumRescanStates.get(drivePath);
		if (!control || !state?.scanning) return { success: false, error: "No album rescan is running." };
		control.stop();
		state.paused = false;
		await albumRescanJobs.get(drivePath);
		return { success: true };
	},
	getAlbumRescanStatus: async ({ drivePath }) => albumRescanStates.get(drivePath) ?? { scanning: false, checked: 0, added: 0, updated: 0, missing: 0, albums: 0, recoveredDatabase: false },
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
			const dbPath = albumDbPath(drivePath);
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
};
