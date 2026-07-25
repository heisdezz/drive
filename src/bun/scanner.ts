import fs from "node:fs";
import path from "node:path";
import { readdir } from "node:fs/promises";
import { Database } from "bun:sqlite";
import { addLog } from "./logger";
import { moveFile } from "./file-ops";
import { backgroundThumbnailQueue } from "./thumbnails";

// Active scan tracking state
export interface ScanState {
	scanning: boolean;
	scannedCount: number;
	foundCount: number;
	folderPath: string;
}

export const activeScans = new Map<string, ScanState>();

// Asynchronous directory scanner. Uses an explicit directory stack instead of
// recursion so deeply-nested trees can't build a deep async call stack, and
// prepares its SQL statements once up front so the per-file hot path reuses
// them rather than re-compiling the same queries thousands of times.
export async function walkDirectory(
	drivePath: string,
	startDir: string,
	db: Database,
	scanState: ScanState
) {
	// Prepared once, reused for every media file processed in this scan.
	const selectExisting = db.prepare("SELECT id, file_hash, current_relative_path FROM media_items WHERE original_relative_path = ?");
	const insertAlbum = db.prepare("INSERT OR IGNORE INTO albums (name, relative_path) VALUES (?, ?)");
	const selectAlbum = db.prepare("SELECT id FROM albums WHERE name = ?");
	const insertMedia = db.prepare("INSERT OR IGNORE INTO media_items (file_hash, original_relative_path, current_relative_path, file_size, mime_type, album_id) VALUES (?, ?, ?, ?, ?, ?)");

	const dirStack: string[] = [startDir];

	while (dirStack.length > 0) {
		if (!scanState.scanning) return;
		const currentDir = dirStack.pop()!;

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
					dirStack.push(fullPath);
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
						const existing = selectExisting.get(relativePath) as { id: number; file_hash: string; current_relative_path: string } | undefined;

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
								insertAlbum.run(albumName, `albums/${albumName}`);

								const album = selectAlbum.get(albumName) as { id: number } | undefined;
								if (album) {
									albumId = album.id;
								}

								// Insert into Database
								insertMedia.run(fileHash, relativePath, currentRelativePath, fileStats.size, mimeType, albumId);

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
}
