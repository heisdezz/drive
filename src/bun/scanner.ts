import fs from "node:fs";
import path from "node:path";
import { readdir } from "node:fs/promises";
import { Database } from "bun:sqlite";
import { addLog } from "./logger";
import { moveScannedFile } from "./file-ops";
import { backgroundThumbnailQueue } from "./thumbnails";

export interface ScanState {
	scanning: boolean;
	scannedCount: number;
	foundCount: number;
	folderPath: string;
}

export const activeScans = new Map<string, ScanState>();

export function isIgnored(fileName: string, relativePath: string, ignoreList: string[] = []): boolean {
	if (
		fileName === "albums" ||
		fileName.startsWith(".") ||
		fileName === "node_modules" ||
		fileName === "lost+found" ||
		fileName === "System Volume Information" ||
		fileName === "$RECYCLE.BIN"
	) {
		return true;
	}

	if (!ignoreList || ignoreList.length === 0) return false;

	const normRel = relativePath.replace(/\\/g, "/").toLowerCase().trim();
	const relSegments = normRel.split("/");

	for (const rawPattern of ignoreList) {
		const pattern = rawPattern.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").toLowerCase().trim();
		if (!pattern) continue;
		const patternSegments = pattern.split("/");
		for (let i = 0; i <= relSegments.length - patternSegments.length; i++) {
			if (patternSegments.every((segment, j) => segment === relSegments[i + j])) return true;
		}
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
	const selectSourceAlbum = db.prepare(`SELECT a.name FROM scan_album_sources s
		JOIN albums a ON a.id = s.album_id WHERE s.source_relative_path = ?`);
	const selectAlbumSource = db.prepare("SELECT source_relative_path FROM scan_album_sources WHERE album_id = ?");
	const selectAlbumOrigin = db.prepare("SELECT original_relative_path FROM media_items WHERE album_id = ? LIMIT 1");
	const clearMissingSourceAlbum = db.prepare(`DELETE FROM scan_album_sources
		WHERE source_relative_path = ? AND NOT EXISTS
		(SELECT 1 FROM albums a WHERE a.id = scan_album_sources.album_id)`);
	const claimSource = db.prepare("INSERT OR IGNORE INTO scan_album_sources (source_relative_path, album_id) VALUES (?, ?)");
	const insertMedia = db.prepare("INSERT OR IGNORE INTO media_items (file_hash, original_relative_path, current_relative_path, file_size, mime_type, album_id) VALUES (?, ?, ?, ?, ?, ?)");
	const sourceAlbumNames = new Map<string, string>();

	function albumNameFor(sourceDir: string): string {
		if (!sourceDir || sourceDir === "unknown") return "unknown";
		const cached = sourceAlbumNames.get(sourceDir);
		if (cached) return cached;
		const mapped = selectSourceAlbum.get(sourceDir) as { name: string } | undefined;
		if (mapped) {
			sourceAlbumNames.set(sourceDir, mapped.name);
			return mapped.name;
		}
		clearMissingSourceAlbum.run(sourceDir);
		const leaf = path.posix.basename(sourceDir);
		for (let suffix = 1; ; suffix++) {
			const name = suffix === 1 ? leaf : `${leaf}_${suffix}`;
			if (name === "unknown") continue;
			const existing = selectAlbum.get(name) as { id: number } | undefined;
			if (!existing) {
				sourceAlbumNames.set(sourceDir, name);
				return name;
			}
			if (selectAlbumSource.get(existing.id)) continue;
			const origin = selectAlbumOrigin.get(existing.id) as { original_relative_path: string } | undefined;
			if (!origin || path.posix.dirname(origin.original_relative_path.replace(/\\/g, "/")) === sourceDir) {
				sourceAlbumNames.set(sourceDir, name);
				return name;
			}
		}
	}

	const recordFile = db.transaction((
		fileHash: string,
		relativePath: string,
		currentRelativePath: string,
		fileSize: number,
		mimeType: string,
		albumName: string,
		sourceDir: string,
	) => {
		insertAlbum.run(albumName, `albums/${albumName}`);
		const album = selectAlbum.get(albumName) as { id: number } | undefined;
		if (album && sourceDir && sourceDir !== "unknown") claimSource.run(sourceDir, album.id);
		const result = insertMedia.run(fileHash, relativePath, currentRelativePath, fileSize, mimeType, album?.id ?? null);
		if (result.changes === 0) throw new Error(`Media record already exists for ${relativePath}`);
	});

	const dirStack: string[] = [startDir];
	const visitedDirs: string[] = [];

	while (dirStack.length > 0) {
		if (!scanState.scanning) return;
		const currentDir = dirStack.pop()!;
		visitedDirs.push(currentDir);

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

							const sourceDir = path.relative(drivePath, currentDir).replace(/\\/g, "/");
							const albumName = albumNameFor(sourceDir);
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
								const currentRelativePath = path.relative(drivePath, targetFullPath);
								await moveScannedFile(drivePath, fullPath, targetFullPath, () =>
									recordFile(fileHash, relativePath, currentRelativePath, fileStats.size, mimeType, albumName, sourceDir));

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

	if (scanState.scanning) {
		for (const dir of visitedDirs.sort((a, b) => b.length - a.length)) {
			if (dir === drivePath || dir === startDir) continue;
			try {
				await fs.promises.rmdir(dir);
			} catch (err: any) {
				if (err.code !== "ENOTEMPTY" && err.code !== "EEXIST" && err.code !== "ENOENT") {
					addLog("warn", `Could not remove empty source directory: ${dir}`, err.message);
				}
			}
		}
	}
}
