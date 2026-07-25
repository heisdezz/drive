import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";
import { addLog } from "../logger";
import { backupDirFor, createBackup } from "../database";
import { uploadFileToGDrive } from "../gdrive";
import type { RpcHandlers } from "./types";

export const backupHandlers: Pick<
	RpcHandlers,
	"backupDatabase" | "listBackups" | "testGoogleDriveConnection" | "backupToGoogleDrive"
> = {
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
	testGoogleDriveConnection: async ({ serviceAccountJson, folderId }) => {
		addLog("info", `RPC Request: testGoogleDriveConnection invoked`);
		try {
			const credentials = JSON.parse(serviceAccountJson);
			const auth = new google.auth.GoogleAuth({
				credentials,
				scopes: ["https://www.googleapis.com/auth/drive.file"],
			});
			const drive = google.drive({ version: "v3", auth });

			// Test list files
			await drive.files.list({ pageSize: 1 });

			// If folderId is specified, verify folder accessibility
			if (folderId) {
				await drive.files.get({ fileId: folderId });
			}

			return { success: true };
		} catch (err: any) {
			addLog("error", `Failed Google Drive Connection test: ${err.message}`);
			return { success: false, error: err.message };
		}
	},
	backupToGoogleDrive: async ({ drivePath, serviceAccountJson, folderId }) => {
		addLog("info", `RPC Request: backupToGoogleDrive invoked`, `drivePath: ${drivePath}`);
		try {
			const dbPath = path.join(drivePath, "albums", ".media_library.db");
			if (!fs.existsSync(dbPath)) {
				return { success: false, error: "No library database found to back up." };
			}

			// Parse service account json
			let credentials;
			try {
				credentials = JSON.parse(serviceAccountJson);
			} catch (e: any) {
				return { success: false, error: "Invalid Service Account JSON: " + e.message };
			}

			// Authenticate
			const auth = new google.auth.GoogleAuth({
				credentials,
				scopes: ["https://www.googleapis.com/auth/drive.file"],
			});

			const drive = google.drive({ version: "v3", auth });
			// Test auth by listing files or getting drive details
			await drive.files.list({ pageSize: 1 });

			const uploadResults: { filename: string; fileId: string; success: boolean; error?: string }[] = [];

			// 1. Upload main DB
			try {
				const fileId = await uploadFileToGDrive(auth, dbPath, ".media_library.db", folderId);
				uploadResults.push({ filename: ".media_library.db", fileId: fileId || "", success: true });
			} catch (e: any) {
				addLog("error", `Failed to upload main db to Google Drive: ${e.message}`);
				uploadResults.push({ filename: ".media_library.db", fileId: "", success: false, error: e.message });
			}

			// 2. Upload backups
			const dir = backupDirFor(dbPath);
			if (fs.existsSync(dir)) {
				const backups = fs.readdirSync(dir)
					.filter((f) => f.startsWith("media_library-") && f.endsWith(".db"));

				for (const backupFile of backups) {
					const backupPath = path.join(dir, backupFile);
					try {
						const fileId = await uploadFileToGDrive(auth, backupPath, backupFile, folderId);
						uploadResults.push({ filename: backupFile, fileId: fileId || "", success: true });
					} catch (e: any) {
						addLog("error", `Failed to upload backup ${backupFile} to Google Drive: ${e.message}`);
						uploadResults.push({ filename: backupFile, fileId: "", success: false, error: e.message });
					}
				}
			}

			const successCount = uploadResults.filter(r => r.success).length;
			return { success: successCount > 0, uploadResults };
		} catch (err: any) {
			addLog("error", `Failed Google Drive backup process: ${err.message}`, err.stack);
			return { success: false, error: err.message };
		}
	},
};
