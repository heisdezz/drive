import fs from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";
import { addLog } from "../logger";
import { assertWritable, getDatabaseConnection, hasAlbumMediaCounts, hasMediaSearchIndex, openReadableDb } from "../database";
import { MoveBatch, beginAlbumRename, newDeletionBatch } from "../file-ops";
import type { RpcHandlers } from "./types";

function normalizeAlbumName(name: string): string {
	const cleaned = name?.trim().replace(/\\/g, "/");
	if (!cleaned || cleaned.startsWith("/") || cleaned.endsWith("/") ||
		cleaned.split("/").some(segment => !segment || segment === "." || segment === "..") ||
		/[\x00-\x1f:*?"<>|]/.test(cleaned) || cleaned.toLowerCase() === "unknown") {
		throw new Error("Invalid album name. Use folder names separated by / without empty, . or .. segments or invalid filesystem characters.");
	}
	return cleaned;
}

export const albumHandlers: Pick<
	RpcHandlers,
	"getAlbums" | "getAlbum" | "getAlbumMedia" | "createAlbum" | "editAlbum" | "deleteAlbum" | "mergeAlbums" | "validateAlbumFiles"
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

			// Old read-only libraries can still be listed before their first
			// writable open runs the count migration.
			const countExpression = hasAlbumMediaCounts(db)
				? "a.media_count"
				: "(SELECT count(*) FROM media_items c WHERE c.album_id = a.id)";
			const rows = db.prepare(`
				SELECT a.id, a.name, a.relative_path, a.description, a.created_at,
					${countExpression} AS media_count,
					p.id AS preview_id, p.file_hash AS preview_hash,
					p.original_relative_path AS preview_original_path,
					p.current_relative_path AS preview_current_path,
					p.mime_type AS preview_mime
				FROM albums a
				LEFT JOIN media_items p ON p.id = (
					SELECT x.id FROM media_items x WHERE x.album_id = a.id
					ORDER BY x.created_at DESC, x.id DESC LIMIT 1
				)
				ORDER BY a.name ASC
			`).all() as any[];

			const albums = rows.map(album => ({
				id: album.id,
				name: album.name,
				relative_path: album.relative_path,
				description: album.description,
				created_at: album.created_at,
				media_count: album.media_count,
				preview_item: album.preview_id === null ? undefined : {
					id: album.preview_id,
					file_hash: album.preview_hash,
					original_relative_path: album.preview_original_path,
					current_relative_path: album.preview_current_path,
					mime_type: album.preview_mime,
				}
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
			const countExpression = hasAlbumMediaCounts(db)
				? "a.media_count"
				: "(SELECT count(*) FROM media_items c WHERE c.album_id = a.id)";
			const album = db.prepare(`
				SELECT a.id, a.name, a.relative_path, a.description, a.created_at,
					${countExpression} AS media_count
				FROM albums a WHERE a.id = ?
			`).get(albumId) as any;
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
				const indexed = search.length >= 3 && hasMediaSearchIndex(db);
				sql += indexed
					? " AND m.id IN (SELECT rowid FROM media_search WHERE original_relative_path LIKE ? OR current_relative_path LIKE ?)"
					: " AND (m.original_relative_path LIKE ? OR m.current_relative_path LIKE ?)";
				countSql += indexed
					? " AND id IN (SELECT rowid FROM media_search WHERE original_relative_path LIKE ? OR current_relative_path LIKE ?)"
					: " AND (original_relative_path LIKE ? OR current_relative_path LIKE ?)";
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
			const unfiltered = !search && (!filter || filter === "all");
			const totalResult = unfiltered && hasAlbumMediaCounts(db)
				? db.prepare("SELECT media_count AS count FROM albums WHERE id = ?").get(albumId) as { count: number } | undefined
				: db.prepare(countSql).get(...countParams) as { count: number } | undefined;

			return { items, total: totalResult?.count ?? 0 };
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
			const cleanName = normalizeAlbumName(name);

			assertWritable(drivePath);
			db = getDatabaseConnection(dbPath);

			// 1. Check if album with this name already exists
			const existing = db.prepare("SELECT * FROM albums WHERE name = ? OR relative_path = ?").get(cleanName, `albums/${cleanName}`);
			if (existing) {
				throw new Error(`An album with the name '${cleanName}' already exists.`);
			}

			const relativePath = `albums/${cleanName}`;
			const fullDirPath = path.join(drivePath, ...relativePath.split("/"));
			await fs.promises.mkdir(fullDirPath, { recursive: true });
			// Insert only after the directory was created successfully.
			const result = db.prepare(`
				INSERT INTO albums (name, relative_path, description)
				VALUES (?, ?, ?)
			`).run(cleanName, relativePath, description || null);

			const newId = result.lastInsertRowid as number;

			const album = db.prepare("SELECT * FROM albums WHERE id = ?").get(newId) as {
				id: number;
				name: string;
				relative_path: string;
				description: string | null;
				created_at: string;
				media_count: number;
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
			const cleanName = newName?.trim().replace(/\\/g, "/");
			if (album.name === "unknown" && cleanName !== "unknown") {
				throw new Error("Cannot rename the default unsorted album.");
			}

			// 3. Validate new name
			if (cleanName !== "unknown") normalizeAlbumName(newName);
			else if (album.name !== "unknown") throw new Error("The name 'unknown' is reserved.");
			if (!cleanName) throw new Error("Album name cannot be empty.");
			if (cleanName !== album.name && cleanName.startsWith(`${album.name}/`)) {
				throw new Error("Cannot move an album inside itself.");
			}

			const oldDirPath = path.join(drivePath, "albums", album.name);
			const newDirPath = path.join(drivePath, "albums", cleanName);
			let movedDirectory = false;
			let renameJournal: string | null = null;
			db.run("BEGIN TRANSACTION;");
			try {
				if (album.name !== cleanName) {
					// Check if new name already exists
					const existing = db.prepare("SELECT * FROM albums WHERE (name = ? OR relative_path = ?) AND id != ?").get(cleanName, `albums/${cleanName}`, albumId);
					if (existing) {
						throw new Error(`An album with the name '${cleanName}' already exists.`);
					}

					// Rename physical directory on disk
					if (fs.existsSync(newDirPath)) throw new Error(`A folder named '${cleanName}' already exists on the drive.`);
					if (fs.existsSync(oldDirPath) && oldDirPath !== newDirPath) {
						await fs.promises.mkdir(path.dirname(newDirPath), { recursive: true });
						renameJournal = beginAlbumRename(drivePath, albumId, `albums/${album.name}`, `albums/${cleanName}`);
						await fs.promises.rename(oldDirPath, newDirPath);
						movedDirectory = true;
					}

					// A parent album can contain registered child albums. Move their paths too.
					const oldPrefix = `albums/${album.name}/`;
					// The UNIQUE path indexes let SQLite touch only rows in this folder.
					// A trailing '/' sorts immediately before '0' in binary order.
					db.prepare(`UPDATE media_items
						SET current_relative_path = ? || substr(current_relative_path, ?)
						WHERE current_relative_path >= ? AND current_relative_path < ?`)
						.run(`albums/${cleanName}/`, oldPrefix.length + 1, oldPrefix, `${oldPrefix.slice(0, -1)}0`);
					const childPrefix = `${album.name}/`;
					db.prepare(`UPDATE albums
						SET name = ? || substr(name, ?),
							relative_path = ? || substr(relative_path, ?)
						WHERE name >= ? AND name < ?`)
						.run(`${cleanName}/`, childPrefix.length + 1,
							`albums/${cleanName}/`, oldPrefix.length + 1,
							childPrefix, `${childPrefix.slice(0, -1)}0`);

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
				if (movedDirectory) {
					try { await fs.promises.rename(newDirPath, oldDirPath); if (renameJournal) fs.unlinkSync(renameJournal); }
					catch (restoreErr: any) { addLog("error", `Could not restore album directory after failed rename: ${restoreErr.message}`); }
				} else if (renameJournal) fs.unlinkSync(renameJournal);
				throw transactionErr;
			}
			if (renameJournal) {
				try { fs.unlinkSync(renameJournal); }
				catch (err: any) { addLog("warn", `Album rename journal cleanup deferred: ${err.message}`, renameJournal); }
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
	deleteAlbum: async ({ drivePath, albumId, permanent }) => {
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

			if (permanent) {
				const root = path.resolve(drivePath);
				const realRoot = fs.realpathSync(root);
				const albumDir = path.resolve(root, "albums", album.name);
				if (!albumDir.startsWith(path.join(root, "albums") + path.sep)) {
					throw new Error("Invalid album path.");
				}
				const batchDir = newDeletionBatch(drivePath);
				const staged = new MoveBatch();
				const hashes = new Set<string>();
				const page = db.prepare("SELECT id, current_relative_path, file_hash FROM media_items WHERE album_id = ? AND id > ? ORDER BY id LIMIT 500");
				const deleteItem = db.prepare("DELETE FROM media_items WHERE id = ?");
				let lastId = 0;
				let deletedCount = 0;
				db.run("BEGIN TRANSACTION;");
				try {
					while (true) {
						const items = page.all(albumId, lastId) as { id: number; current_relative_path: string; file_hash: string }[];
						if (!items.length) break;
						for (const item of items) {
							lastId = item.id;
							const fullPath = path.resolve(root, item.current_relative_path);
							if (!fullPath.startsWith(root + path.sep)) throw new Error(`Invalid media path: ${item.current_relative_path}`);
							if (fs.existsSync(fullPath)) {
								const realParent = fs.realpathSync(path.dirname(fullPath));
								if (realParent !== realRoot && !realParent.startsWith(realRoot + path.sep)) {
									throw new Error(`Media path leaves the drive: ${item.current_relative_path}`);
								}
								await staged.move(fullPath, path.join(batchDir, String(item.id)));
							}
							deleteItem.run(item.id);
							hashes.add(item.file_hash);
							deletedCount++;
						}
					}
					db.prepare("DELETE FROM albums WHERE id = ?").run(albumId);
					db.run("COMMIT;");
				} catch (transactionErr) {
					db.run("ROLLBACK;");
					await staged.rollback();
					await fs.promises.rm(batchDir, { recursive: true, force: true });
					throw transactionErr;
				}
				try { await fs.promises.rm(batchDir, { recursive: true, force: true }); }
				catch (cleanupErr: any) { addLog("warn", `Could not clear staged album files: ${cleanupErr.message}`, batchDir); }
				try {
					const stillUsesHash = db.prepare("SELECT 1 FROM media_items WHERE file_hash = ? LIMIT 1");
					const thumbsDir = fs.realpathSync(path.join(root, "albums", "thumbs"));
					if (thumbsDir.startsWith(realRoot + path.sep)) {
						for (const hash of hashes) {
							if (stillUsesHash.get(hash)) continue;
							const thumbPath = path.resolve(thumbsDir, `${hash}.jpg`);
							if (thumbPath.startsWith(thumbsDir + path.sep)) {
								await fs.promises.unlink(thumbPath).catch(() => {});
							}
						}
					}
				} catch (thumbErr: any) {
					addLog("warn", `Could not clean album thumbnails: ${thumbErr.message}`);
				}
				try { await fs.promises.rmdir(albumDir); }
				catch (dirErr: any) {
					if (dirErr.code !== "ENOENT" && dirErr.code !== "ENOTEMPTY" && dirErr.code !== "EEXIST") {
						addLog("warn", `Could not remove empty album directory: ${dirErr.message}`, albumDir);
					}
				}
				addLog("info", `Permanently deleted album ID ${albumId} and ${deletedCount} media files`);
				return { success: true, deletedCount };
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

			const movedFiles = new MoveBatch(drivePath);
			const targetDir = path.join(drivePath, "albums", album.name);
			db.run("BEGIN TRANSACTION;");
			try {
				// 4. Move all media files back to 'unknown'
				const items = db.prepare("SELECT id, current_relative_path FROM media_items WHERE album_id = ?").all(albumId) as { id: number; current_relative_path: string }[];
				const moveToFallback = db.prepare("UPDATE media_items SET album_id = ?, current_relative_path = ? WHERE id = ?");
				const deleteMissing = db.prepare("DELETE FROM media_items WHERE id = ?");
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

						await movedFiles.move(currentFullPath, targetFullPath, item.id);
						const newRelativePath = path.relative(drivePath, targetFullPath);
						moveToFallback.run(fallbackAlbum.id, newRelativePath, item.id);
					} else {
						deleteMissing.run(item.id);
					}
				}

				// Delete album record only after every move and DB update succeeded.
				db.prepare("DELETE FROM albums WHERE id = ?").run(albumId);
				db.run("COMMIT;");
				movedFiles.finish();
			} catch (transactionErr) {
				db.run("ROLLBACK;");
				await movedFiles.rollback();
				throw transactionErr;
			}
			if (fs.existsSync(targetDir)) {
				try { await fs.promises.rmdir(targetDir); } catch (err: any) {
					if (err.code !== "ENOTEMPTY" && err.code !== "EEXIST") addLog("warn", `Could not remove empty album directory: ${err.message}`, targetDir);
				}
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
	mergeAlbums: async ({ drivePath, sourceAlbumId, targetAlbumId }) => {
		let db: Database | null = null;
		let movedCount = 0;
		try {
			if (!Number.isSafeInteger(sourceAlbumId) || !Number.isSafeInteger(targetAlbumId) || sourceAlbumId === targetAlbumId) {
				throw new Error("Choose two different albums to merge.");
			}
			const dbPath = path.join(drivePath, "albums", ".media_library.db");
			if (!fs.existsSync(dbPath)) throw new Error("Library database not found");
			assertWritable(drivePath);
			db = getDatabaseConnection(dbPath);
			const getAlbum = db.prepare("SELECT id, name, relative_path FROM albums WHERE id = ?");
			const source = getAlbum.get(sourceAlbumId) as { id: number; name: string; relative_path: string } | undefined;
			const target = getAlbum.get(targetAlbumId) as { id: number; name: string; relative_path: string } | undefined;
			if (!source || !target) throw new Error("One of the selected albums no longer exists.");
			if (source.name === "unknown") throw new Error("The Unsorted Media album cannot be merged into another album.");

			const root = path.resolve(drivePath);
			const albumsRoot = path.join(root, "albums");
			const safePath = (relative: string) => {
				const resolved = path.resolve(root, relative);
				if (!resolved.startsWith(root + path.sep)) throw new Error(`Invalid media path: ${relative}`);
				return resolved;
			};
			const sourceDir = safePath(source.relative_path);
			const targetDir = safePath(target.relative_path);
			if (!sourceDir.startsWith(albumsRoot + path.sep) || !targetDir.startsWith(albumsRoot + path.sep)) {
				throw new Error("Album path is outside the library.");
			}
			await fs.promises.mkdir(targetDir, { recursive: true });
			const movedFiles = new MoveBatch(drivePath);
			const page = db.prepare("SELECT id, current_relative_path FROM media_items WHERE album_id = ? AND id > ? ORDER BY id LIMIT 500");
			const update = db.prepare("UPDATE media_items SET album_id = ?, current_relative_path = ? WHERE id = ?");
			const collisionSuffixes = new Map<string, number>();
			let lastId = 0;
			db.run("BEGIN TRANSACTION;");
			try {
				while (true) {
					const items = page.all(sourceAlbumId, lastId) as { id: number; current_relative_path: string }[];
					if (!items.length) break;
					for (const item of items) {
						lastId = item.id;
						const currentPath = safePath(item.current_relative_path);
						if (!fs.existsSync(currentPath)) throw new Error(`Media file is missing: ${item.current_relative_path}. Validate Files, then try again.`);
						const filename = path.basename(currentPath);
						const extension = path.extname(filename);
						const base = path.basename(filename, extension);
						let destination = path.join(targetDir, filename);
						let suffix = collisionSuffixes.get(filename) ?? 1;
						while (destination !== currentPath && fs.existsSync(destination)) {
							destination = path.join(targetDir, `${base}_${suffix++}${extension}`);
						}
						collisionSuffixes.set(filename, suffix);
						if (destination !== currentPath) await movedFiles.move(currentPath, destination, item.id);
						update.run(targetAlbumId, path.relative(root, destination).split(path.sep).join("/"), item.id);
						movedCount++;
					}
				}
				db.prepare("DELETE FROM albums WHERE id = ?").run(sourceAlbumId);
				db.run("COMMIT;");
				movedFiles.finish();
			} catch (err) {
				db.run("ROLLBACK;");
				await movedFiles.rollback();
				throw err;
			}
			try { await fs.promises.rmdir(sourceDir); }
			catch (err: any) {
				if (err.code !== "ENOENT" && err.code !== "ENOTEMPTY" && err.code !== "EEXIST") {
					addLog("warn", `Could not remove empty source album directory: ${err.message}`, sourceDir);
				}
			}
			return { success: true, movedCount };
		} catch (err: any) {
			addLog("error", `Failed to merge albums: ${err.message}`, err.stack);
			return { success: false, movedCount: 0, error: err.message };
		} finally {
			db?.close();
		}
	},
	validateAlbumFiles: async ({ drivePath, albumId }) => {
		let db: Database | null = null;
		try {
			const dbPath = path.join(drivePath, "albums", ".media_library.db");
			if (!fs.existsSync(dbPath)) throw new Error("Library database not found");
			assertWritable(drivePath);
			db = getDatabaseConnection(dbPath);
			const rows = (albumId === undefined
				? db.prepare("SELECT id, current_relative_path FROM media_items").all()
				: db.prepare("SELECT id, current_relative_path FROM media_items WHERE album_id = ?").all(albumId)
			) as { id: number; current_relative_path: string }[];
			const missing: number[] = [];
			for (const row of rows) {
				if (!fs.existsSync(path.join(drivePath, row.current_relative_path))) missing.push(row.id);
			}
			const remove = db.prepare("DELETE FROM media_items WHERE id = ?");
			const removeMissing = db.transaction((ids: number[]) => {
				for (const id of ids) remove.run(id);
			});
			removeMissing(missing);
			return { success: true, checked: rows.length, removed: missing.length };
		} catch (err: any) {
			addLog("error", `Failed to validate album files: ${err.message}`, err.stack);
			return { success: false, checked: 0, removed: 0, error: err.message };
		} finally {
			db?.close();
		}
	},
};
