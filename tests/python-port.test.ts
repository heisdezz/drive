import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Database } from "bun:sqlite";
import { getDatabaseConnection } from "../src/bun/database";
import { albumHandlers } from "../src/bun/handlers/albums";
import { isIgnored, walkDirectory } from "../src/bun/scanner";
import { changeMobileSyncWriteToken, startMobileSync, stopMobileSync } from "../src/bun/mobile-sync";
import { mobileTokenFile } from "../src/bun/mobile-token";
import { startMediaServer, setActiveMediaDrive } from "../src/bun/media-server";
import { MoveBatch, beginAlbumRename, moveScannedFile, newDeletionBatch, recoverPendingAlbumRenames, recoverPendingDeletions, recoverPendingMediaMoves } from "../src/bun/file-ops";
import { mediaHandlers } from "../src/bun/handlers/media";

const roots: string[] = [];
afterEach(() => {
	if (process.env.DSTREAM_CONFIG_DIR) stopMobileSync();
	delete process.env.DSTREAM_CONFIG_DIR;
	for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function library() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-port-"));
	roots.push(root);
	fs.mkdirSync(path.join(root, "albums"));
	const db = getDatabaseConnection(path.join(root, "albums", ".media_library.db"));
	return { root, db };
}

test("album counts migrate once and follow inserts, moves, deletes, and rollbacks", async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-counts-"));
	roots.push(root);
	fs.mkdirSync(path.join(root, "albums"));
	const dbPath = path.join(root, "albums", ".media_library.db");
	const legacy = new Database(dbPath);
	legacy.run("CREATE TABLE albums (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL, relative_path TEXT UNIQUE NOT NULL, description TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
	legacy.run("CREATE TABLE media_items (id INTEGER PRIMARY KEY, file_hash TEXT NOT NULL, original_relative_path TEXT UNIQUE NOT NULL, current_relative_path TEXT UNIQUE NOT NULL, file_size INTEGER NOT NULL, mime_type TEXT NOT NULL, album_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
	const tripId = Number(legacy.prepare("INSERT INTO albums (name, relative_path) VALUES ('Trip', 'albums/Trip')").run().lastInsertRowid);
	const insertLegacy = legacy.prepare("INSERT INTO media_items (file_hash, original_relative_path, current_relative_path, file_size, mime_type, album_id) VALUES (?, ?, ?, 1, 'image/jpeg', ?)");
	insertLegacy.run("a", "one.jpg", "albums/Trip/one.jpg", tripId);
	insertLegacy.run("b", "two.jpg", "albums/Trip/two.jpg", tripId);
	insertLegacy.run("c", "loose.jpg", "albums/unknown/loose.jpg", null);
	legacy.close();

	const before = await albumHandlers.getAlbums({ drivePath: root });
	expect(before.albums.find(album => album.id === tripId)?.media_count).toBe(2);
	expect((await albumHandlers.getAlbum({ drivePath: root, albumId: tripId })).album?.media_count).toBe(2);

	const db = getDatabaseConnection(dbPath);
	const unknownId = (db.prepare("SELECT id FROM albums WHERE name = 'unknown'").get() as { id: number }).id;
	const counts = () => db.prepare("SELECT name, media_count FROM albums ORDER BY name").all();
	expect(counts()).toEqual([{ name: "Trip", media_count: 2 }, { name: "unknown", media_count: 1 }]);
	db.prepare("INSERT INTO media_items (file_hash, original_relative_path, current_relative_path, file_size, mime_type, album_id) VALUES ('d', 'three.jpg', 'albums/Trip/three.jpg', 1, 'image/jpeg', ?)").run(tripId);
	db.prepare("UPDATE media_items SET album_id = ? WHERE original_relative_path = 'three.jpg'").run(unknownId);
	db.prepare("UPDATE media_items SET album_id = ? WHERE original_relative_path = 'three.jpg'").run(unknownId);
	db.prepare("DELETE FROM media_items WHERE original_relative_path = 'three.jpg'").run();
	db.run("BEGIN TRANSACTION");
	db.prepare("INSERT INTO media_items (file_hash, original_relative_path, current_relative_path, file_size, mime_type, album_id) VALUES ('e', 'rolled-back.jpg', 'albums/Trip/rolled-back.jpg', 1, 'image/jpeg', ?)").run(tripId);
	db.run("ROLLBACK");
	expect(counts()).toEqual([{ name: "Trip", media_count: 2 }, { name: "unknown", media_count: 1 }]);
	expect((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(2);
	db.close();

	const listed = await albumHandlers.getAlbums({ drivePath: root });
	expect(listed.albums.find(album => album.id === tripId)?.media_count).toBe(2);
	expect((await albumHandlers.getAlbum({ drivePath: root, albumId: tripId })).album?.media_count).toBe(2);
	const page = await albumHandlers.getAlbumMedia({ drivePath: root, albumId: tripId, limit: 1, offset: 0 });
	expect(page.total).toBe(2);
});

test("merging albums preserves collisions and child albums while updating counts", async () => {
	const { root, db } = library();
	const insertAlbum = db.prepare("INSERT INTO albums (name, relative_path) VALUES (?, ?)");
	const sourceId = Number(insertAlbum.run("Trips", "albums/Trips").lastInsertRowid);
	const childId = Number(insertAlbum.run("Trips/Child", "albums/Trips/Child").lastInsertRowid);
	const targetId = Number(insertAlbum.run("Favorites", "albums/Favorites").lastInsertRowid);
	for (const dir of ["Trips", "Trips/Child", "Favorites"]) fs.mkdirSync(path.join(root, "albums", dir), { recursive: true });
	fs.writeFileSync(path.join(root, "albums", "Trips", "photo.jpg"), "source");
	fs.writeFileSync(path.join(root, "albums", "Trips", "other.jpg"), "other");
	fs.writeFileSync(path.join(root, "albums", "Trips", "Child", "child.jpg"), "child");
	fs.writeFileSync(path.join(root, "albums", "Favorites", "photo.jpg"), "target");
	const insertMedia = db.prepare("INSERT INTO media_items (file_hash, original_relative_path, current_relative_path, file_size, mime_type, album_id) VALUES (?, ?, ?, 1, 'image/jpeg', ?)");
	insertMedia.run("source", "original/source.jpg", "albums/Trips/photo.jpg", sourceId);
	insertMedia.run("other", "original/other.jpg", "albums/Trips/other.jpg", sourceId);
	insertMedia.run("child", "original/child.jpg", "albums/Trips/Child/child.jpg", childId);
	insertMedia.run("target", "original/target.jpg", "albums/Favorites/photo.jpg", targetId);
	db.close();

	expect(await albumHandlers.mergeAlbums({ drivePath: root, sourceAlbumId: sourceId, targetAlbumId: targetId })).toMatchObject({ success: true, movedCount: 2 });
	const check = getDatabaseConnection(path.join(root, "albums", ".media_library.db"));
	expect(check.prepare("SELECT id FROM albums WHERE id = ?").get(sourceId)).toBeNull();
	expect(check.prepare("SELECT media_count FROM albums WHERE id = ?").get(targetId)).toEqual({ media_count: 3 });
	expect(check.prepare("SELECT media_count FROM albums WHERE id = ?").get(childId)).toEqual({ media_count: 1 });
	expect(check.prepare("SELECT current_relative_path FROM media_items WHERE file_hash = 'source'").get()).toEqual({ current_relative_path: "albums/Favorites/photo_1.jpg" });
	expect(fs.readFileSync(path.join(root, "albums", "Favorites", "photo.jpg"), "utf8")).toBe("target");
	expect(fs.readFileSync(path.join(root, "albums", "Favorites", "photo_1.jpg"), "utf8")).toBe("source");
	expect(fs.existsSync(path.join(root, "albums", "Trips", "Child", "child.jpg"))).toBe(true);
	check.close();
});

test("a failed album merge restores already moved files and catalog rows", async () => {
	const { root, db } = library();
	const insertAlbum = db.prepare("INSERT INTO albums (name, relative_path) VALUES (?, ?)");
	const sourceId = Number(insertAlbum.run("Source", "albums/Source").lastInsertRowid);
	const targetId = Number(insertAlbum.run("Target", "albums/Target").lastInsertRowid);
	fs.mkdirSync(path.join(root, "albums", "Source"));
	fs.mkdirSync(path.join(root, "albums", "Target"));
	fs.writeFileSync(path.join(root, "albums", "Source", "present.jpg"), "present");
	const insertMedia = db.prepare("INSERT INTO media_items (file_hash, original_relative_path, current_relative_path, file_size, mime_type, album_id) VALUES (?, ?, ?, 1, 'image/jpeg', ?)");
	insertMedia.run("present", "original/present.jpg", "albums/Source/present.jpg", sourceId);
	insertMedia.run("missing", "original/missing.jpg", "albums/Source/missing.jpg", sourceId);
	db.close();

	const result = await albumHandlers.mergeAlbums({ drivePath: root, sourceAlbumId: sourceId, targetAlbumId: targetId });
	expect(result.success).toBe(false);
	expect(result.error).toContain("Validate Files");
	expect(fs.existsSync(path.join(root, "albums", "Source", "present.jpg"))).toBe(true);
	expect(fs.existsSync(path.join(root, "albums", "Target", "present.jpg"))).toBe(false);
	const check = getDatabaseConnection(path.join(root, "albums", ".media_library.db"));
	expect(check.prepare("SELECT media_count FROM albums WHERE id = ?").get(sourceId)).toEqual({ media_count: 2 });
	expect(check.prepare("SELECT media_count FROM albums WHERE id = ?").get(targetId)).toEqual({ media_count: 0 });
	expect(check.prepare("SELECT album_id FROM media_items WHERE file_hash = 'present'").get()).toEqual({ album_id: sourceId });
	check.close();
});

test("merging several selected albums keeps one destination and resolves collisions", async () => {
	const { root, db } = library();
	const insertAlbum = db.prepare("INSERT INTO albums (name, relative_path) VALUES (?, ?)");
	const firstId = Number(insertAlbum.run("First", "albums/First").lastInsertRowid);
	const secondId = Number(insertAlbum.run("Second", "albums/Second").lastInsertRowid);
	const targetId = Number(insertAlbum.run("Target", "albums/Target").lastInsertRowid);
	const insertMedia = db.prepare("INSERT INTO media_items (file_hash, original_relative_path, current_relative_path, file_size, mime_type, album_id) VALUES (?, ?, ?, 1, 'image/jpeg', ?)");
	for (const [name, id] of [["First", firstId], ["Second", secondId], ["Target", targetId]] as const) {
		fs.mkdirSync(path.join(root, "albums", name));
		fs.writeFileSync(path.join(root, "albums", name, "photo.jpg"), name);
		insertMedia.run(name, `original/${name}.jpg`, `albums/${name}/photo.jpg`, id);
	}
	db.close();

	expect(await albumHandlers.mergeAlbums({ drivePath: root, sourceAlbumIds: [firstId, secondId], targetAlbumId: targetId })).toMatchObject({ success: true, movedCount: 2 });
	const check = getDatabaseConnection(path.join(root, "albums", ".media_library.db"));
	expect(check.prepare("SELECT media_count FROM albums WHERE id = ?").get(targetId)).toEqual({ media_count: 3 });
	expect(check.prepare("SELECT id FROM albums WHERE id IN (?, ?)").all(firstId, secondId)).toEqual([]);
	expect(fs.readFileSync(path.join(root, "albums", "Target", "photo.jpg"), "utf8")).toBe("Target");
	expect(fs.readFileSync(path.join(root, "albums", "Target", "photo_1.jpg"), "utf8")).toBe("First");
	expect(fs.readFileSync(path.join(root, "albums", "Target", "photo_2.jpg"), "utf8")).toBe("Second");
	check.close();
});

test("a failed multi-album merge rolls back files moved from earlier sources", async () => {
	const { root, db } = library();
	const insertAlbum = db.prepare("INSERT INTO albums (name, relative_path) VALUES (?, ?)");
	const firstId = Number(insertAlbum.run("First", "albums/First").lastInsertRowid);
	const secondId = Number(insertAlbum.run("Second", "albums/Second").lastInsertRowid);
	const targetId = Number(insertAlbum.run("Target", "albums/Target").lastInsertRowid);
	for (const name of ["First", "Second", "Target"]) fs.mkdirSync(path.join(root, "albums", name));
	fs.writeFileSync(path.join(root, "albums", "First", "present.jpg"), "present");
	const insertMedia = db.prepare("INSERT INTO media_items (file_hash, original_relative_path, current_relative_path, file_size, mime_type, album_id) VALUES (?, ?, ?, 1, 'image/jpeg', ?)");
	insertMedia.run("present", "original/present.jpg", "albums/First/present.jpg", firstId);
	insertMedia.run("missing", "original/missing.jpg", "albums/Second/missing.jpg", secondId);
	db.close();

	const result = await albumHandlers.mergeAlbums({ drivePath: root, sourceAlbumIds: [firstId, secondId], targetAlbumId: targetId });
	expect(result.success).toBe(false);
	expect(fs.existsSync(path.join(root, "albums", "First", "present.jpg"))).toBe(true);
	expect(fs.existsSync(path.join(root, "albums", "Target", "present.jpg"))).toBe(false);
	const check = getDatabaseConnection(path.join(root, "albums", ".media_library.db"));
	expect(check.prepare("SELECT album_id FROM media_items WHERE file_hash = 'present'").get()).toEqual({ album_id: firstId });
	expect(check.prepare("SELECT id FROM albums WHERE id IN (?, ?)").all(firstId, secondId).length).toBe(2);
	check.close();
});

test("permanent album deletion removes its own media but preserves child albums and shared thumbnails", async () => {
	const { root, db } = library();
	const insertAlbum = db.prepare("INSERT INTO albums (name, relative_path) VALUES (?, ?)");
	const parentId = Number(insertAlbum.run("Parent", "albums/Parent").lastInsertRowid);
	const childId = Number(insertAlbum.run("Parent/Child", "albums/Parent/Child").lastInsertRowid);
	const otherId = Number(insertAlbum.run("Other", "albums/Other").lastInsertRowid);
	for (const dir of ["Parent/Child", "Other", "thumbs"]) fs.mkdirSync(path.join(root, "albums", dir), { recursive: true });
	for (const file of ["Parent/one.jpg", "Parent/two.jpg", "Parent/Child/child.jpg", "Other/other.jpg"]) {
		fs.writeFileSync(path.join(root, "albums", file), file);
	}
	for (const hash of ["unique", "shared"]) fs.writeFileSync(path.join(root, "albums", "thumbs", `${hash}.jpg`), hash);
	const insertMedia = db.prepare("INSERT INTO media_items (file_hash, original_relative_path, current_relative_path, file_size, mime_type, album_id) VALUES (?, ?, ?, 1, 'image/jpeg', ?)");
	insertMedia.run("unique", "original/one.jpg", "albums/Parent/one.jpg", parentId);
	insertMedia.run("shared", "original/two.jpg", "albums/Parent/two.jpg", parentId);
	insertMedia.run("child", "original/child.jpg", "albums/Parent/Child/child.jpg", childId);
	insertMedia.run("shared", "original/other.jpg", "albums/Other/other.jpg", otherId);
	db.close();

	expect(await albumHandlers.deleteAlbum({ drivePath: root, albumId: parentId, permanent: true })).toEqual({ success: true, deletedCount: 2 });
	const check = getDatabaseConnection(path.join(root, "albums", ".media_library.db"));
	expect(check.prepare("SELECT id FROM albums WHERE id = ?").get(parentId)).toBeNull();
	expect(check.prepare("SELECT media_count FROM albums WHERE id = ?").get(childId)).toEqual({ media_count: 1 });
	expect(check.prepare("SELECT media_count FROM albums WHERE id = ?").get(otherId)).toEqual({ media_count: 1 });
	expect(check.prepare("SELECT count(*) AS count FROM media_items WHERE album_id = ?").get(parentId)).toEqual({ count: 0 });
	expect(fs.existsSync(path.join(root, "albums", "Parent", "one.jpg"))).toBe(false);
	expect(fs.existsSync(path.join(root, "albums", "Parent", "two.jpg"))).toBe(false);
	expect(fs.existsSync(path.join(root, "albums", "Parent", "Child", "child.jpg"))).toBe(true);
	expect(fs.existsSync(path.join(root, "albums", "thumbs", "unique.jpg"))).toBe(false);
	expect(fs.existsSync(path.join(root, "albums", "thumbs", "shared.jpg"))).toBe(true);
	check.close();
});

test("failed permanent album deletion restores staged files and database rows", async () => {
	const { root, db } = library();
	const albumId = Number(db.prepare("INSERT INTO albums (name, relative_path) VALUES ('Source', 'albums/Source')").run().lastInsertRowid);
	fs.mkdirSync(path.join(root, "albums", "Source"));
	fs.writeFileSync(path.join(root, "albums", "Source", "present.jpg"), "present");
	const insertMedia = db.prepare("INSERT INTO media_items (file_hash, original_relative_path, current_relative_path, file_size, mime_type, album_id) VALUES (?, ?, ?, 1, 'image/jpeg', ?)");
	insertMedia.run("present", "original/present.jpg", "albums/Source/present.jpg", albumId);
	insertMedia.run("invalid", "original/invalid.jpg", "../../outside.jpg", albumId);
	db.close();

	const result = await albumHandlers.deleteAlbum({ drivePath: root, albumId, permanent: true });
	expect(result.success).toBe(false);
	expect(result.error).toContain("Invalid media path");
	expect(fs.readFileSync(path.join(root, "albums", "Source", "present.jpg"), "utf8")).toBe("present");
	const check = getDatabaseConnection(path.join(root, "albums", ".media_library.db"));
	expect(check.prepare("SELECT media_count FROM albums WHERE id = ?").get(albumId)).toEqual({ media_count: 2 });
	expect(check.prepare("SELECT count(*) AS count FROM media_items WHERE album_id = ?").get(albumId)).toEqual({ count: 2 });
	check.close();
});

test("default album deletion still moves media to Unsorted Media", async () => {
	const { root, db } = library();
	const albumId = Number(db.prepare("INSERT INTO albums (name, relative_path) VALUES ('Source', 'albums/Source')").run().lastInsertRowid);
	fs.mkdirSync(path.join(root, "albums", "Source"));
	fs.writeFileSync(path.join(root, "albums", "Source", "keep.jpg"), "keep");
	db.prepare("INSERT INTO media_items (file_hash, original_relative_path, current_relative_path, file_size, mime_type, album_id) VALUES ('keep', 'original/keep.jpg', 'albums/Source/keep.jpg', 1, 'image/jpeg', ?)").run(albumId);
	db.close();

	expect(await albumHandlers.deleteAlbum({ drivePath: root, albumId })).toEqual({ success: true });
	expect(fs.readFileSync(path.join(root, "albums", "unknown", "keep.jpg"), "utf8")).toBe("keep");
	const check = getDatabaseConnection(path.join(root, "albums", ".media_library.db"));
	expect(check.prepare("SELECT a.name AS album_name FROM media_items m JOIN albums a ON a.id = m.album_id WHERE m.file_hash = 'keep'").get()).toEqual({ album_name: "unknown" });
	check.close();
});

describe("Python scanner update", () => {
	test("ignore rules match complete path segments", () => {
		expect(isIgnored("raw", "photos/raw", ["raw"])).toBe(true);
		expect(isIgnored("strawberry.jpg", "photos/strawberry.jpg", ["raw"])).toBe(false);
		expect(isIgnored("photo.jpg", "backup/photos/raw/photo.jpg", ["photos/raw"])).toBe(true);
		expect(isIgnored("photo.jpg", "backup/photos/edited/photo.jpg", ["photos/raw"])).toBe(false);
	});

	test("routes root and nested files and prunes empty source folders", async () => {
		const { root, db } = library();
		fs.mkdirSync(path.join(root, "2024", "Events"), { recursive: true });
		fs.mkdirSync(path.join(root, "Vacation"));
		fs.writeFileSync(path.join(root, "loose.jpg"), "root");
		fs.writeFileSync(path.join(root, "Vacation", "beach.jpg"), "beach");
		fs.writeFileSync(path.join(root, "2024", "Events", "party.mp4"), "party");
		const state = { scanning: true, scannedCount: 0, foundCount: 0, folderPath: root };
		await walkDirectory(root, root, db, state, ["albums"]);
		expect(state.foundCount).toBe(3);
		for (const file of ["unknown/loose.jpg", "Vacation/beach.jpg", "2024/Events/party.mp4"]) {
			expect(fs.existsSync(path.join(root, "albums", file))).toBe(true);
		}
		expect(fs.existsSync(path.join(root, "Vacation"))).toBe(false);
		expect(fs.existsSync(path.join(root, "2024"))).toBe(false);
		const rows = db.prepare("SELECT name FROM albums WHERE name != 'unknown' ORDER BY name").all() as { name: string }[];
		expect(rows.map(row => row.name)).toEqual(["2024/Events", "Vacation"]);
		db.close();
	});

	test("nested album rename and missing-file validation", async () => {
		const { root, db } = library();
		const created = await albumHandlers.createAlbum({ drivePath: root, name: "2024/Events" });
		expect(created.success).toBe(true);
		const albumId = created.album!.id;
		fs.writeFileSync(path.join(root, "albums", "2024", "Events", "party.jpg"), "party");
		db.prepare("INSERT INTO media_items (file_hash, original_relative_path, current_relative_path, file_size, mime_type, album_id) VALUES (?, ?, ?, ?, ?, ?)")
			.run("hash1", "2024/Events/party.jpg", "albums/2024/Events/party.jpg", 5, "image/jpeg", albumId);
		db.close();
		const renamed = await albumHandlers.editAlbum({ drivePath: root, albumId, newName: "2025/Events" });
		expect(renamed.success).toBe(true);
		expect(fs.existsSync(path.join(root, "albums", "2025", "Events", "party.jpg"))).toBe(true);
		fs.rmSync(path.join(root, "albums", "2025", "Events", "party.jpg"));
		const validated = await albumHandlers.validateAlbumFiles({ drivePath: root, albumId });
		expect(validated).toMatchObject({ success: true, checked: 1, removed: 1 });
	});

	test("parent rename updates descendants without touching similarly named albums", async () => {
		const { root, db } = library();
		const insertAlbum = db.prepare("INSERT INTO albums (name, relative_path) VALUES (?, ?)");
		const parentId = Number(insertAlbum.run("Trip", "albums/Trip").lastInsertRowid);
		const childId = Number(insertAlbum.run("Trip/Day 1", "albums/Trip/Day 1").lastInsertRowid);
		const siblingId = Number(insertAlbum.run("Trips", "albums/Trips").lastInsertRowid);
		for (const dir of ["Trip/Day 1", "Trips"]) fs.mkdirSync(path.join(root, "albums", dir), { recursive: true });
		fs.writeFileSync(path.join(root, "albums", "Trip", "parent.jpg"), "parent");
		fs.writeFileSync(path.join(root, "albums", "Trip", "Day 1", "child.jpg"), "child");
		fs.writeFileSync(path.join(root, "albums", "Trips", "sibling.jpg"), "sibling");
		const insertMedia = db.prepare("INSERT INTO media_items (file_hash, original_relative_path, current_relative_path, file_size, mime_type, album_id) VALUES (?, ?, ?, 1, 'image/jpeg', ?)");
		insertMedia.run("parent", "original/parent.jpg", "albums/Trip/parent.jpg", parentId);
		insertMedia.run("child", "original/child.jpg", "albums/Trip/Day 1/child.jpg", childId);
		insertMedia.run("sibling", "original/sibling.jpg", "albums/Trips/sibling.jpg", siblingId);
		db.close();

		expect(await albumHandlers.editAlbum({ drivePath: root, albumId: parentId, newName: "Journey", newDescription: "Renamed" })).toEqual({ success: true });
		const check = getDatabaseConnection(path.join(root, "albums", ".media_library.db"));
		expect(check.prepare("SELECT name, relative_path FROM albums WHERE id = ?").get(childId)).toEqual({ name: "Journey/Day 1", relative_path: "albums/Journey/Day 1" });
		expect(check.prepare("SELECT name, relative_path FROM albums WHERE id = ?").get(siblingId)).toEqual({ name: "Trips", relative_path: "albums/Trips" });
		expect(check.prepare("SELECT current_relative_path FROM media_items WHERE file_hash = 'child'").get()).toEqual({ current_relative_path: "albums/Journey/Day 1/child.jpg" });
		expect(check.prepare("SELECT current_relative_path FROM media_items WHERE file_hash = 'sibling'").get()).toEqual({ current_relative_path: "albums/Trips/sibling.jpg" });
		expect(fs.existsSync(path.join(root, "albums", "Journey", "Day 1", "child.jpg"))).toBe(true);
		check.close();
	});

	test("mobile sync serves stats, snapshot, media ranges, and HEAD", async () => {
		const { root, db } = library();
		process.env.DSTREAM_CONFIG_DIR = path.join(root, "config");
		fs.mkdirSync(path.join(root, "albums", "unknown"));
		fs.writeFileSync(path.join(root, "albums", "unknown", "clip.mp4"), "0123456789");
		const album = db.prepare("SELECT id FROM albums WHERE name = 'unknown'").get() as { id: number };
		db.prepare("INSERT INTO media_items (file_hash, original_relative_path, current_relative_path, file_size, mime_type, album_id) VALUES (?, ?, ?, ?, ?, ?)")
			.run("hash2", "clip.mp4", "albums/unknown/clip.mp4", 10, "video/mp4", album.id);
		db.close();
		const { port } = startMobileSync(root, 0, "127.0.0.1");
		const base = `http://127.0.0.1:${port}`;
		const info = await (await fetch(`${base}/api/info`)).json() as any;
		expect(info.stats.total_items).toBe(1);
		const media = await fetch(`${base}/media/1`, { headers: { Range: "bytes=2-5" } });
		expect(media.status).toBe(206);
		expect(await media.text()).toBe("2345");
		const head = await fetch(`${base}/media/1`, { method: "HEAD" });
		expect(head.headers.get("content-length")).toBe("10");
		const snapshot = await fetch(`${base}/download/db`);
		expect(snapshot.status).toBe(200);
		expect((await snapshot.arrayBuffer()).byteLength).toBeGreaterThan(0);
	});

	test("mobile sync CRUD requires a write token and keeps files and counts in sync", async () => {
		const { root, db } = library();
		process.env.DSTREAM_CONFIG_DIR = path.join(root, "config");
		const unknownId = (db.prepare("SELECT id FROM albums WHERE name = 'unknown'").get() as { id: number }).id;
		db.close();
		const { port, writeToken } = startMobileSync(root, 0, "127.0.0.1");
		const base = `http://127.0.0.1:${port}`;
		const auth = { Authorization: `Bearer ${writeToken}` };
		const postAlbum = (headers: Record<string, string>) => fetch(`${base}/api/albums`, {
			method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Phone" }),
		});
		expect((await postAlbum({})).status).toBe(401);
		const created = await postAlbum(auth);
		expect(created.status).toBe(201);
		const albumId = ((await created.json()) as any).album.id as number;
		const albums = (await (await fetch(`${base}/api/albums`)).json()) as any;
		expect(albums.albums.find((album: any) => album.id === albumId).media_count).toBe(0);

		const upload = await fetch(`${base}/api/media?albumId=${albumId}&filename=photo.png`, {
			method: "POST", headers: { ...auth, "Content-Type": "image/png" }, body: new Uint8Array([137, 80, 78, 71, 1]),
		});
		expect(upload.status).toBe(201);
		const itemId = ((await upload.json()) as any).item.id as number;
		expect((await (await fetch(`${base}/api/media?albumId=${albumId}`)).json() as any).total).toBe(1);
		expect((await fetch(`${base}/api/media/${itemId}`)).status).toBe(200);
		expect((await fetch(`${base}/api/media/${itemId}/details`)).status).toBe(200);
		expect((await fetch(`${base}/api/media?albumId=${albumId}&filename=../escape.png`, {
			method: "POST", headers: { ...auth, "Content-Type": "image/png" }, body: new Uint8Array([1]),
		})).status).toBe(400);

		const move = await fetch(`${base}/api/media/${itemId}`, {
			method: "PATCH", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ albumId: unknownId }),
		});
		expect(move.status).toBe(200);
		const form = new FormData();
		form.set("albumId", String(albumId));
		form.set("file", new File([new Uint8Array([137, 80, 78, 71, 2])], "second.png", { type: "image/png" }));
		const second = await fetch(`${base}/api/media`, { method: "POST", headers: auth, body: form });
		expect(second.status).toBe(201);
		const secondId = ((await second.json()) as any).item.id as number;
		expect((await fetch(`${base}/api/media/${secondId}`, { method: "DELETE", headers: auth })).status).toBe(200);
		const renamed = await fetch(`${base}/api/albums/${albumId}`, {
			method: "PATCH", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ description: "From mobile" }),
		});
		expect(renamed.status).toBe(200);
		expect((await fetch(`${base}/api/albums/${albumId}`, { method: "DELETE", headers: auth })).status).toBe(200);
		const check = getDatabaseConnection(path.join(root, "albums", ".media_library.db"));
		expect(check.prepare("SELECT media_count FROM albums WHERE id = ?").get(unknownId)).toEqual({ media_count: 1 });
		expect(check.prepare("SELECT id FROM albums WHERE id = ?").get(albumId)).toBeNull();
		check.close();

		expect(changeMobileSyncWriteToken("x").writeToken).toBe("x");
		expect(JSON.parse(fs.readFileSync(mobileTokenFile(), "utf8")).writeToken).toBe("x");
		expect((await postAlbum(auth)).status).toBe(401);
		const shortToken = { Authorization: "Bearer x" };
		expect((await postAlbum(shortToken)).status).toBe(201);
		stopMobileSync();
		const restarted = startMobileSync(root, 0, "127.0.0.1");
		expect(restarted.writeToken).toBe("x");
		expect((await fetch(`http://127.0.0.1:${restarted.port}/api/albums`, {
			method: "POST", headers: { ...shortToken, "Content-Type": "application/json" }, body: JSON.stringify({ name: "After restart" }),
		})).status).toBe(201);
	});

	test("local media server rejects uncataloged paths", async () => {
		const { root, db } = library();
		fs.mkdirSync(path.join(root, "albums", "unknown"));
		const mediaPath = path.join(root, "albums", "unknown", "photo.jpg");
		fs.writeFileSync(mediaPath, "image");
		const album = db.prepare("SELECT id FROM albums WHERE name = 'unknown'").get() as { id: number };
		db.prepare("INSERT INTO media_items (file_hash, original_relative_path, current_relative_path, file_size, mime_type, album_id) VALUES (?, ?, ?, ?, ?, ?)")
			.run("hash3", "photo.jpg", "albums/unknown/photo.jpg", 5, "image/jpeg", album.id);
		db.close();
		setActiveMediaDrive(root);
		const server = startMediaServer(0);
		try {
			const base = `http://127.0.0.1:${server.port}/media?path=`;
			expect((await fetch(base + encodeURIComponent(mediaPath))).status).toBe(200);
			expect((await fetch(base + encodeURIComponent(path.join(root, "albums", ".media_library.db")))).status).toBe(403);
			expect((await fetch(base + encodeURIComponent("/etc/passwd"))).status).toBe(403);
		} finally { server.stop(true); setActiveMediaDrive(null); }
	});

	test("failed scan insert restores the source file", async () => {
		const { root, db } = library();
		const src = path.join(root, "photo.jpg");
		const dest = path.join(root, "albums", "photo.jpg");
		fs.writeFileSync(src, "image");
		await expect(moveScannedFile(root, src, dest, () => { throw new Error("DB failed"); })).rejects.toThrow("DB failed");
		expect(fs.existsSync(src)).toBe(true);
		expect(fs.existsSync(dest)).toBe(false);
		db.close();
	});

	test("staged deletion recovers an uncommitted file and search index follows updates", async () => {
		const { root, db } = library();
		fs.mkdirSync(path.join(root, "albums", "unknown"));
		const source = path.join(root, "albums", "unknown", "sunset.jpg");
		fs.writeFileSync(source, "image");
		const album = db.prepare("SELECT id FROM albums WHERE name = 'unknown'").get() as { id: number };
		const result = db.prepare("INSERT INTO media_items (file_hash, original_relative_path, current_relative_path, file_size, mime_type, album_id) VALUES (?, ?, ?, ?, ?, ?)")
			.run("hash4", "sunset.jpg", "albums/unknown/sunset.jpg", 5, "image/jpeg", album.id);
		const id = Number(result.lastInsertRowid);
		const batchDir = newDeletionBatch(root);
		const batch = new MoveBatch();
		await batch.move(source, path.join(batchDir, String(id)));
		recoverPendingDeletions(db, root);
		expect(fs.existsSync(source)).toBe(true);
		let found = await mediaHandlers.getMediaItems({ drivePath: root, limit: 10, offset: 0, search: "sunset" });
		expect(found.total).toBe(1);
		db.prepare("UPDATE media_items SET current_relative_path = ? WHERE id = ?").run("albums/unknown/dusk.jpg", id);
		found = await mediaHandlers.getMediaItems({ drivePath: root, limit: 10, offset: 0, search: "dusk" });
		expect(found.total).toBe(1);
		db.close();
	});

	test("interrupted bulk move and album rename follow committed database paths", async () => {
		const { root, db } = library();
		const sourceDir = path.join(root, "albums", "Trip");
		const targetDir = path.join(root, "albums", "Holiday");
		fs.mkdirSync(sourceDir);
		fs.mkdirSync(targetDir);
		const albumId = Number(db.prepare("INSERT INTO albums (name, relative_path) VALUES (?, ?)").run("Trip", "albums/Trip").lastInsertRowid);
		const itemId = Number(db.prepare("INSERT INTO media_items (file_hash, original_relative_path, current_relative_path, file_size, mime_type, album_id) VALUES (?, ?, ?, ?, ?, ?)")
			.run("hash5", "Trip/photo.jpg", "albums/Trip/photo.jpg", 5, "image/jpeg", albumId).lastInsertRowid);
		const source = path.join(sourceDir, "photo.jpg");
		const target = path.join(targetDir, "photo.jpg");
		fs.writeFileSync(source, "image");
		const batch = new MoveBatch(root);
		await batch.move(source, target, itemId);
		recoverPendingMediaMoves(db, root);
		expect(fs.existsSync(source)).toBe(true);
		expect(fs.existsSync(target)).toBe(false);
		const renameJournal = beginAlbumRename(root, albumId, "albums/Trip", "albums/Journey");
		fs.renameSync(sourceDir, path.join(root, "albums", "Journey"));
		recoverPendingAlbumRenames(db, root);
		expect(fs.existsSync(sourceDir)).toBe(true);
		expect(fs.existsSync(renameJournal)).toBe(false);
		db.close();
	});

	test("bulk move and staged deletion commit matching filesystem and catalog state", async () => {
		const { root, db } = library();
		fs.mkdirSync(path.join(root, "albums", "unknown"));
		const created = await albumHandlers.createAlbum({ drivePath: root, name: "Trips" });
		expect(created.success).toBe(true);
		const source = path.join(root, "albums", "unknown", "trip.jpg");
		fs.writeFileSync(source, "image");
		const unknown = db.prepare("SELECT id FROM albums WHERE name = 'unknown'").get() as { id: number };
		const itemId = Number(db.prepare("INSERT INTO media_items (file_hash, original_relative_path, current_relative_path, file_size, mime_type, album_id) VALUES (?, ?, ?, ?, ?, ?)")
			.run("hash6", "trip.jpg", "albums/unknown/trip.jpg", 5, "image/jpeg", unknown.id).lastInsertRowid);
		const listed = await albumHandlers.getAlbums({ drivePath: root });
		expect(listed.albums.find(album => album.name === "unknown")?.preview_item?.id).toBe(itemId);
		db.close();
		const moved = await mediaHandlers.moveMediaItemsToAlbum({ drivePath: root, mediaIds: [itemId], targetAlbumId: created.album!.id });
		expect(moved).toMatchObject({ success: true, movedCount: 1 });
		const afterMove = await albumHandlers.getAlbums({ drivePath: root });
		expect(afterMove.albums.find(album => album.name === "unknown")?.media_count).toBe(0);
		expect(afterMove.albums.find(album => album.name === "Trips")?.media_count).toBe(1);
		const target = path.join(root, "albums", "Trips", "trip.jpg");
		expect(fs.existsSync(target)).toBe(true);
		const deleted = await mediaHandlers.deleteMediaItems({ drivePath: root, mediaIds: [itemId] });
		expect(deleted).toMatchObject({ success: true, deletedCount: 1 });
		expect(fs.existsSync(target)).toBe(false);
		const afterDelete = await albumHandlers.getAlbums({ drivePath: root });
		expect(afterDelete.albums.find(album => album.name === "Trips")?.media_count).toBe(0);
		const check = getDatabaseConnection(path.join(root, "albums", ".media_library.db"));
		expect(check.prepare("SELECT count(*) AS n FROM media_items").get()).toEqual({ n: 0 });
		check.close();
	});
});
