import fs from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";
import { addLog } from "../logger";
import { assertWritable, getDatabaseConnection, openReadableDb } from "../database";
import { moveFile } from "../file-ops";
import type { RpcHandlers } from "./types";

export const albumHandlers: Pick<
	RpcHandlers,
	"getAlbums" | "getAlbum" | "getAlbumMedia" | "createAlbum" | "editAlbum" | "deleteAlbum"
> = {
	getAlbums: async ({ drivePath }) => {
		addLog("info", `RPC Request: getAlbums invoked`, `drivePath: ${drivePath}`);
		let db: Database | null = null;
		try {
			const dbPath = path.join(drivePath, "albums", ".media_library.db");
			if (!fs.existsSync(dbPath)) {
				return { albums: [] };
			}
			db = openReadableDb(dbPath);

			// One query for albums + their media counts (LEFT JOIN so empty
			// albums still appear with count 0), instead of a COUNT per album.
			const rawAlbums = db.prepare(`
				SELECT a.id, a.name, a.relative_path, a.description, a.created_at,
					COUNT(m.id) AS media_count
				FROM albums a
				LEFT JOIN media_items m ON m.album_id = a.id
				GROUP BY a.id
				ORDER BY a.name ASC
			`).all() as any[];

			// One query for the newest item of every album via a window function,
			// instead of an ORDER BY ... LIMIT 1 per album. Map by album_id.
			const previewRows = db.prepare(`
				SELECT album_id, id, file_hash, original_relative_path, current_relative_path, mime_type
				FROM (
					SELECT album_id, id, file_hash, original_relative_path, current_relative_path, mime_type,
						ROW_NUMBER() OVER (PARTITION BY album_id ORDER BY created_at DESC, id DESC) AS rn
					FROM media_items
				)
				WHERE rn = 1
			`).all() as any[];
			const previewByAlbum = new Map<number, any>();
			for (const row of previewRows) {
				const { album_id, ...preview } = row;
				previewByAlbum.set(album_id, preview);
			}

			const albums = rawAlbums.map(album => ({
				id: album.id,
				name: album.name,
				relative_path: album.relative_path,
				description: album.description,
				created_at: album.created_at,
				media_count: album.media_count,
				preview_item: previewByAlbum.get(album.id) || null
			}));

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
	getAlbumMedia: async ({ drivePath, albumId, limit, offset, search, filter, sortBy, sortOrder }) => {
		addLog("info", `RPC Request: getAlbumMedia invoked`, `albumId: ${albumId}, search: ${search}, filter: ${filter}, sortBy: ${sortBy}, sortOrder: ${sortOrder}`);
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
				WHERE m.album_id = ?
			`;
			let countSql = "SELECT count(*) as count FROM media_items WHERE album_id = ?";
			const params: any[] = [albumId];

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

			// Dynamic but secure whitelist ordering
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
			addLog("error", `Failed to query album media items: ${err.message}`, err.stack);
			return { items: [], total: 0, error: err.message };
		} finally {
			db?.close();
		}
	},
	createAlbum: async ({ drivePath, name, description }) => {
		addLog("info", `RPC Request: createAlbum invoked`, `name: ${name}, description: ${description}`);
		let db: Database | null = null;
		try {
			const dbPath = path.join(drivePath, "albums", ".media_library.db");
			if (!fs.existsSync(dbPath)) {
				throw new Error("Library database not found");
			}

			// Validate album name
			const cleanName = name?.trim();
			if (!cleanName || cleanName === "" || cleanName.includes("/") || cleanName.includes("\\") || cleanName.includes("..")) {
				throw new Error("Invalid album name. Names cannot be empty and cannot contain path traversal or slashes.");
			}

			assertWritable(drivePath);
			db = getDatabaseConnection(dbPath);

			// 1. Check if album with this name already exists
			const existing = db.prepare("SELECT * FROM albums WHERE name = ?").get(cleanName);
			if (existing) {
				throw new Error(`An album with the name '${cleanName}' already exists.`);
			}

			// 2. Insert into DB
			const relativePath = `albums/${cleanName}`;
			const result = db.prepare(`
				INSERT INTO albums (name, relative_path, description)
				VALUES (?, ?, ?)
			`).run(cleanName, relativePath, description || null);

			const newId = result.lastInsertRowid as number;

			// 3. Create physical directory
			const fullDirPath = path.join(drivePath, "albums", cleanName);
			if (!fs.existsSync(fullDirPath)) {
				await fs.promises.mkdir(fullDirPath, { recursive: true });
			}

			const album = db.prepare("SELECT * FROM albums WHERE id = ?").get(newId) as {
				id: number;
				name: string;
				relative_path: string;
				description: string | null;
				created_at: string;
			};

			addLog("info", `Successfully created album ${cleanName} with ID ${newId}`);
			return { success: true, album };
		} catch (err: any) {
			addLog("error", `Failed to create album: ${err.message}`, err.stack);
			return { success: false, error: err.message };
		} finally {
			db?.close();
		}
	},
	editAlbum: async ({ drivePath, albumId, newName, newDescription }) => {
		addLog("info", `RPC Request: editAlbum invoked`, `albumId: ${albumId}, newName: ${newName}`);
		let db: Database | null = null;
		try {
			const dbPath = path.join(drivePath, "albums", ".media_library.db");
			if (!fs.existsSync(dbPath)) {
				throw new Error("Library database not found");
			}

			assertWritable(drivePath);
			db = getDatabaseConnection(dbPath);

			// 1. Get current album details
			const album = db.prepare("SELECT * FROM albums WHERE id = ?").get(albumId) as { name: string } | undefined;
			if (!album) {
				throw new Error(`Album with ID ${albumId} not found`);
			}

			// 2. Prevent renaming "unknown" album
			const cleanName = newName?.trim();
			if (album.name === "unknown" && cleanName && cleanName !== "unknown") {
				throw new Error("Cannot rename the default unsorted album.");
			}

			// 3. Validate new name
			if (!cleanName || cleanName === "" || cleanName.includes("/") || cleanName.includes("\\") || cleanName.includes("..")) {
				throw new Error("Invalid album name. Names cannot be empty and cannot contain path traversal or slashes.");
			}

			db.run("BEGIN TRANSACTION;");
			try {
				if (album.name !== cleanName) {
					// Check if new name already exists
					const existing = db.prepare("SELECT * FROM albums WHERE name = ? AND id != ?").get(cleanName, albumId);
					if (existing) {
						throw new Error(`An album with the name '${cleanName}' already exists.`);
					}

					// Rename physical directory on disk
					const oldDirPath = path.join(drivePath, "albums", album.name);
					const newDirPath = path.join(drivePath, "albums", cleanName);
					if (fs.existsSync(oldDirPath) && oldDirPath !== newDirPath) {
						await fs.promises.rename(oldDirPath, newDirPath);
					}

					// Update all media items inside this album
					const items = db.prepare("SELECT id, current_relative_path FROM media_items WHERE album_id = ?").all(albumId) as { id: number; current_relative_path: string }[];
					const updatePath = db.prepare("UPDATE media_items SET current_relative_path = ? WHERE id = ?");
					for (const item of items) {
						const filename = path.basename(item.current_relative_path);
						const newRelativePath = `albums/${cleanName}/${filename}`;
						updatePath.run(newRelativePath, item.id);
					}

					// Update album details in database
					const relativePath = `albums/${cleanName}`;
					db.prepare(`
						UPDATE albums
						SET name = ?, relative_path = ?, description = ?
						WHERE id = ?
					`).run(cleanName, relativePath, newDescription || null, albumId);
				} else {
					// Update only description
					db.prepare(`
						UPDATE albums
						SET description = ?
						WHERE id = ?
					`).run(newDescription || null, albumId);
				}
				db.run("COMMIT;");
			} catch (transactionErr) {
				db.run("ROLLBACK;");
				throw transactionErr;
			}

			addLog("info", `Successfully updated album ${album.name} to ${cleanName}`);
			return { success: true };
		} catch (err: any) {
			addLog("error", `Failed to edit album: ${err.message}`, err.stack);
			return { success: false, error: err.message };
		} finally {
			db?.close();
		}
	},
	deleteAlbum: async ({ drivePath, albumId }) => {
		addLog("info", `RPC Request: deleteAlbum invoked`, `albumId: ${albumId}`);
		let db: Database | null = null;
		try {
			const dbPath = path.join(drivePath, "albums", ".media_library.db");
			if (!fs.existsSync(dbPath)) {
				throw new Error("Library database not found");
			}

			assertWritable(drivePath);
			db = getDatabaseConnection(dbPath);

			// 1. Get current album details
			const album = db.prepare("SELECT * FROM albums WHERE id = ?").get(albumId) as { name: string } | undefined;
			if (!album) {
				throw new Error(`Album with ID ${albumId} not found`);
			}

			// 2. Prevent deleting "unknown" album
			if (album.name === "unknown") {
				throw new Error("Cannot delete the default unsorted album.");
			}

			// 3. Find or create the fallback 'unknown' album
			let fallbackAlbum = db.prepare("SELECT * FROM albums WHERE name = 'unknown'").get() as { id: number; name: string } | undefined;
			if (!fallbackAlbum) {
				const relativePath = "albums/unknown";
				const insertRes = db.prepare(`
					INSERT INTO albums (name, relative_path, description)
					VALUES ('unknown', ?, 'Unsorted media items')
				`).run(relativePath);
				fallbackAlbum = { id: insertRes.lastInsertRowid as number, name: "unknown" };
			}

			const fallbackDir = path.join(drivePath, "albums", "unknown");
			await fs.promises.mkdir(fallbackDir, { recursive: true });

			db.run("BEGIN TRANSACTION;");
			try {
				// 4. Move all media files back to 'unknown'
				const items = db.prepare("SELECT id, current_relative_path FROM media_items WHERE album_id = ?").all(albumId) as { id: number; current_relative_path: string }[];
				const moveToFallback = db.prepare("UPDATE media_items SET album_id = ?, current_relative_path = ? WHERE id = ?");
				const reassignAlbum = db.prepare("UPDATE media_items SET album_id = ? WHERE id = ?");
				for (const item of items) {
					const currentFullPath = path.join(drivePath, item.current_relative_path);
					if (fs.existsSync(currentFullPath)) {
						const filename = path.basename(item.current_relative_path);
						const ext = path.extname(filename);
						const base = path.basename(filename, ext);

						let targetFullPath = path.join(fallbackDir, filename);
						let finalFilename = filename;
						if (fs.existsSync(targetFullPath)) {
							let counter = 1;
							while (fs.existsSync(path.join(fallbackDir, `${base}_${counter}${ext}`))) {
								counter++;
							}
							finalFilename = `${base}_${counter}${ext}`;
							targetFullPath = path.join(fallbackDir, finalFilename);
						}

						await moveFile(currentFullPath, targetFullPath);
						const newRelativePath = path.relative(drivePath, targetFullPath);
						moveToFallback.run(fallbackAlbum.id, newRelativePath, item.id);
					} else {
						reassignAlbum.run(fallbackAlbum.id, item.id);
					}
				}

				// 5. Delete empty target album folder on disk
				const targetDir = path.join(drivePath, "albums", album.name);
				if (fs.existsSync(targetDir)) {
					await fs.promises.rm(targetDir, { recursive: true, force: true });
				}

				// 6. Delete album record
				db.prepare("DELETE FROM albums WHERE id = ?").run(albumId);
				db.run("COMMIT;");
			} catch (transactionErr) {
				db.run("ROLLBACK;");
				throw transactionErr;
			}

			addLog("info", `Successfully deleted album ID ${albumId} (${album.name}) and moved items to unsorted`);
			return { success: true };
		} catch (err: any) {
			addLog("error", `Failed to delete album: ${err.message}`, err.stack);
			return { success: false, error: err.message };
		} finally {
			db?.close();
		}
	},
};
