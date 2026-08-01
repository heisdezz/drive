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
import type { RpcHandlers } from "./types";

export const scanHandlers: Pick<
	RpcHandlers,
	"scaffoldLibrary" | "startScan" | "stopScan" | "getScanStatus"
> = {
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
	startScan: async ({ drivePath, folderPath, ignoreList }) => {
		addLog("info", `RPC Request: startScan invoked`, `drivePath: ${drivePath}, folderPath: ${folderPath}, ignoreList: ${ignoreList?.join(", ") || "none"}`);
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
					await walkDirectory(drivePath, folderPath, db, state!, ignoreList);
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
};
