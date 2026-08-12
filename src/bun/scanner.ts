import fs from "node:fs";
import path from "node:path";
import { readdir } from "node:fs/promises";
import { Database } from "bun:sqlite";
import { addLog } from "./logger";
import { moveFile } from "./file-ops";
import { backgroundThumbnailQueue } from "./thumbnails";

export interface ScanState {
	scanning: boolean;
	scannedCount: number;
	foundCount: number;
	folderPath: string;
}

export const activeScans = new Map<string, ScanState>();

function isIgnored(fileName: string, relativePath: string, ignoreList: string[] = []): boolean {
	if (
		fileName === "albums" ||
		fileName.startsWith(".") ||
		fileName === "node_modules" ||
		fileName === "lost+found"
	) {
		return true;
	}

	if (!ignoreList || ignoreList.length === 0) return false;

	const normFile = fileName.toLowerCase().trim();
	const normRel = relativePath.replace(/\\/g, "/").toLowerCase().trim();
	const relSegments = normRel.split("/");

	for (const rawPattern of ignoreList) {
		const pattern = rawPattern.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").toLowerCase().trim();
		if (!pattern) continue;
		if (normFile === pattern) return true;
		if (relSegments.includes(pattern)) return true;
		if (normRel === pattern || normRel.startsWith(pattern + "/")) return true;
	}

	return false;
}

export async function walkDirectory(
	drivePath: string,
	startDir: string,
	db: Database,
	scanState: ScanState,
	ignoreList: string[] = []
) {
	const selectExisting = db.prepare("SELECT id, file_hash, current_relative_path FROM media_items WHERE original_relative_path = ?");

	// Batch the album upsert + media insert into one transaction so they share
	// a single journal flush instead of three separate synchronous DB calls.
	const insertAlbum = db.prepare("INSERT OR IGNORE INTO albums (name, relative_path) VALUES (?, ?)");
	const selectAlbum = db.prepare("SELECT id FROM albums WHERE name = ?");
	const insertMedia = db.prepare("INSERT OR IGNORE INTO media_items (file_hash, original_relative_path, current_relative_path, file_size, mime_type, album_id) VALUES (?, ?, ?, ?, ?, ?)");

	const recordFile = db.transaction((
		fileHash: string,
		relativePath: string,
		currentRelativePath: string,
		fileSize: number,
		mimeType: string,
		albumName: string,
	) => {
		insertAlbum.run(albumName, `albums/${albumName}`);
		const album = selectAlbum.get(albumName) as { id: number } | undefined;
		insertMedia.run(fileHash, relativePath, currentRelativePath, fileSize, mimeType, album?.id ?? null);
	});

	const dirStack: string[] = [startDir];

	while (dirStack.length > 0) {
		if (!scanState.scanning) return;
		const currentDir = dirStack.pop()!;

		try {
			const files = await readdir(currentDir, { withFileTypes: true });

			for (const file of files) {
				if (!scanState.scanning) return;

				if (file.isSymbolicLink()) continue;

				const fullPath = path.join(currentDir, file.name);
				const relativePath = path.relative(drivePath, fullPath);

				if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) continue;
				if (isIgnored(file.name, relativePath, ignoreList)) continue;

				if (file.isDirectory()) {
					dirStack.push(fullPath);
				} else if (file.isFile()) {
					scanState.scannedCount++;

					if (scanState.scannedCount % 50 === 0) {
						await new Promise((resolve) => setImmediate(resolve));
						if (!scanState.scanning) return;
					}

					const ext = path.extname(file.name).toLowerCase();
					const isImage = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic"].includes(ext);
					const isVideo = [".mp4", ".mov", ".avi", ".mkv", ".webm"].includes(ext);

					if (isImage || isVideo) {
						const existing = selectExisting.get(relativePath) as { id: number; file_hash: string; current_relative_path: string } | undefined;

						if (!existing) {
							const fileStats = await fs.promises.stat(fullPath);
							const fileHash = `${file.name}_${fileStats.size}_${fileStats.mtimeMs}`;
							const mimeType = isImage ? `image/${ext.slice(1)}` : `video/${ext.slice(1)}`;

							const parentDir = path.dirname(fullPath);
							const albumName = parentDir === drivePath ? "unknown" : path.basename(parentDir);
							const destDir = path.join(drivePath, "albums", albumName);

							await fs.promises.mkdir(destDir, { recursive: true });

							let targetFullPath = path.join(destDir, file.name);
							if (fs.existsSync(targetFullPath)) {
								const base = path.basename(file.name, ext);
								let counter = 1;
								while (fs.existsSync(path.join(destDir, `${base}_${counter}${ext}`))) {
									counter++;
								}
								targetFullPath = path.join(destDir, `${base}_${counter}${ext}`);
							}

							if (!scanState.scanning) return;

							try {
								await moveFile(fullPath, targetFullPath);
								const currentRelativePath = path.relative(drivePath, targetFullPath);

								recordFile(fileHash, relativePath, currentRelativePath, fileStats.size, mimeType, albumName);

								scanState.foundCount++;
								addLog("info", `Moved media file during scan`, `original: ${relativePath} -> current: ${currentRelativePath}`);

								const thumbPath = path.join(drivePath, "albums", "thumbs", `${fileHash}.jpg`);
								backgroundThumbnailQueue.add(targetFullPath, thumbPath);
							} catch (moveErr: any) {
								addLog("error", `Failed to move media file: ${fullPath}`, moveErr.message);
							}
						} else {
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
}
