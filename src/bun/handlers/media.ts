import fs from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";
import { addLog } from "../logger";
import { assertWritable, getDatabaseConnection, openReadableDb } from "../database";
import { moveFile } from "../file-ops";
import { getOrGenerateThumbnail } from "../thumbnails";
import { MEDIA_SERVER_PORT } from "../media-server";
import type { RpcHandlers } from "./types";

export const mediaHandlers: Pick<
	RpcHandlers,
	| "getMediaItems"
	| "getMediaItem"
	| "getRelatedMedia"
	| "getThumbnail"
	| "moveMediaItemsToAlbum"
	| "deleteMediaItems"
> = {
	getMediaItems: async ({ drivePath, limit, offset, search, filter, sortBy, sortOrder }) => {
		let db: Database | null = null;
		try {
			const dbPath = path.join(drivePath, "albums", ".media_library.db");
			if (!fs.existsSync(dbPath)) {
				return { items: [], total: 0 };
			}
			db = openReadableDb(dbPath);

			let sql = `
				SELECT m.*, a.name AS album_name, a.relative_path AS album_relative_path
				FROM media_items m
				LEFT JOIN albums a ON m.album_id = a.id
				WHERE 1=1
			`;
			let countSql = "SELECT count(*) as count FROM media_items WHERE 1=1";
			const params: any[] = [];

			if (search) {
				sql += " AND (m.original_relative_path LIKE ? OR m.current_relative_path LIKE ?)";
				countSql += " AND (original_relative_path LIKE ? OR current_relative_path LIKE ?)";
				const term = `%${search}%`;
				params.push(term, term);
			}

			if (filter === "images") {
				sql += " AND m.mime_type LIKE 'image/%'";
				countSql += " AND mime_type LIKE 'image/%'";
			} else if (filter === "videos") {
				sql += " AND m.mime_type LIKE 'video/%'";
				countSql += " AND mime_type LIKE 'video/%'";
			}

			let orderCol = "m.created_at";
			if (sortBy === "name") {
				orderCol = "m.original_relative_path";
			} else if (sortBy === "size") {
				orderCol = "m.file_size";
			}

			const direction = sortOrder === "asc" ? "ASC" : "DESC";
			sql += ` ORDER BY ${orderCol} ${direction} LIMIT ? OFFSET ?`;

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

			// Prepare once, reuse across every id in the loop.
			const selectItem = db.prepare("SELECT current_relative_path, mime_type FROM media_items WHERE id = ?");
			const updateAlbumOnly = db.prepare("UPDATE media_items SET album_id = ? WHERE id = ?");
			const updateAlbumAndPath = db.prepare("UPDATE media_items SET album_id = ?, current_relative_path = ? WHERE id = ?");

			let movedCount = 0;

			db.run("BEGIN TRANSACTION;");
			try {
				// 2. Loop through and move each item
				for (const id of mediaIds) {
					const item = selectItem.get(id) as { current_relative_path: string; mime_type: string } | undefined;
					if (!item) continue;

					const currentFullPath = path.join(drivePath, item.current_relative_path);
					if (!fs.existsSync(currentFullPath)) {
						addLog("warn", `File does not exist at current path, skipping physical move: ${currentFullPath}`);
						// Update DB anyway to keep it consistent
						updateAlbumOnly.run(targetAlbumId, id);
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
						updateAlbumOnly.run(targetAlbumId, id);
						movedCount++;
						continue;
					}

					try {
						// Move physical file (with fallback)
						await moveFile(currentFullPath, targetFullPath);
						const newRelativePath = path.relative(drivePath, targetFullPath);

						// Update database
						updateAlbumAndPath.run(targetAlbumId, newRelativePath, id);

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
	},
	deleteMediaItems: async ({ drivePath, mediaIds }) => {
		addLog("info", `RPC Request: deleteMediaItems invoked`, `mediaIds count: ${mediaIds.length}`);
		let db: Database | null = null;
		try {
			const dbPath = path.join(drivePath, "albums", ".media_library.db");
			if (!fs.existsSync(dbPath)) {
				throw new Error("Library database not found");
			}

			assertWritable(drivePath);
			db = getDatabaseConnection(dbPath);

			// Prepare once, reuse across every id in the loop.
			const selectItem = db.prepare("SELECT current_relative_path, file_hash FROM media_items WHERE id = ?");
			const deleteItem = db.prepare("DELETE FROM media_items WHERE id = ?");

			let deletedCount = 0;
			db.run("BEGIN TRANSACTION;");
			try {
				for (const id of mediaIds) {
					const item = selectItem.get(id) as { current_relative_path: string; file_hash: string } | undefined;
					if (!item) continue;

					// 1. Physically delete the media file
					const fullPath = path.join(drivePath, item.current_relative_path);
					if (fs.existsSync(fullPath)) {
						await fs.promises.unlink(fullPath);
					}

					// 2. Physically delete the cached thumbnail file. Thumbnails are
					// generated into albums/thumbs/<hash>.jpg, so delete from there.
					const thumbPath = path.join(drivePath, "albums", "thumbs", `${item.file_hash}.jpg`);
					if (fs.existsSync(thumbPath)) {
						await fs.promises.unlink(thumbPath).catch(() => {});
					}

					// 3. Delete from database
					deleteItem.run(id);
					deletedCount++;
				}
				db.run("COMMIT;");
			} catch (transactionErr) {
				db.run("ROLLBACK;");
				throw transactionErr;
			}

			addLog("info", `Successfully deleted ${deletedCount} media items physically and from database`);
			return { success: true, deletedCount };
		} catch (err: any) {
			addLog("error", `Failed to delete media items: ${err.message}`, err.stack);
			return { success: false, deletedCount: 0, error: err.message };
		} finally {
			db?.close();
		}
	},
};
