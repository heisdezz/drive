import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";
import { addLog } from "./logger";

// Move a file, falling back to copy+delete when rename can't cross a boundary
// (e.g. different filesystems, which throws EXDEV on removable drives).
export async function moveFile(src: string, dest: string) {
	try {
		await fs.promises.rename(src, dest);
	} catch (err: any) {
		if (err.code !== "EXDEV") throw err;
		addLog("info", `fs.rename failed (${err.message}), trying copy + delete fallback...`);
		const existed = fs.existsSync(dest);
		try { await fs.promises.copyFile(src, dest, fs.constants.COPYFILE_EXCL); }
		catch (copyErr) { if (!existed) await fs.promises.unlink(dest).catch(() => {}); throw copyErr; }
		try { await fs.promises.unlink(src); }
		catch (unlinkErr) { await fs.promises.unlink(dest).catch(() => {}); throw unlinkErr; }
	}
}

function restoreSync(src: string, dest: string) {
	try { fs.renameSync(src, dest); }
	catch (err: any) {
		if (err.code !== "EXDEV") throw err;
		fs.copyFileSync(src, dest, fs.constants.COPYFILE_EXCL);
		fs.unlinkSync(src);
	}
}

export class MoveBatch {
	private moves: { src: string; dest: string; journal?: string }[] = [];
	constructor(private readonly drivePath?: string) {}

	async move(src: string, dest: string, itemId?: number) {
		let journal: string | undefined;
		if (this.drivePath) {
			if (itemId === undefined) throw new Error("Media item ID required for a recoverable move.");
			journal = writeJournal(path.join(this.drivePath, "albums", ".pending-media-moves"), {
				id: itemId, original: path.relative(this.drivePath, src), current: path.relative(this.drivePath, dest),
			});
		}
		try { await moveFile(src, dest); }
		catch (err) { if (journal) fs.unlinkSync(journal); throw err; }
		this.moves.push({ src, dest, journal });
	}

	finish() {
		for (const { journal } of this.moves) {
			if (journal) {
				try { fs.unlinkSync(journal); }
				catch (err: any) { addLog("warn", `Move journal cleanup deferred: ${err.message}`, journal); }
			}
		}
		this.moves = [];
	}

	async rollback() {
		const errors: string[] = [];
		for (const { src, dest, journal } of this.moves.reverse()) {
			try { await moveFile(dest, src); if (journal) fs.unlinkSync(journal); }
			catch (err: any) { errors.push(`${dest}: ${err.message}`); }
		}
		this.moves = [];
		if (errors.length) throw new Error(`Could not restore moved files: ${errors.join("; ")}`);
	}
}

function writeJournal(dir: string, data: unknown): string {
	fs.mkdirSync(dir, { recursive: true });
	const journal = path.join(dir, `${randomUUID()}.json`);
	const fd = fs.openSync(journal, "wx");
	try { fs.writeSync(fd, JSON.stringify(data)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
	return journal;
}

function journalPath(drivePath: string, relative: string): string {
	const root = path.resolve(drivePath);
	const resolved = path.resolve(root, relative);
	if (resolved === root || !resolved.startsWith(root + path.sep)) throw new Error(`Invalid recovery path: ${relative}`);
	return resolved;
}

export function recoverPendingMediaMoves(db: Database, drivePath: string) {
	const dir = path.join(drivePath, "albums", ".pending-media-moves");
	if (!fs.existsSync(dir)) return;
	const lookup = db.prepare("SELECT current_relative_path FROM media_items WHERE id = ?");
	for (const file of fs.readdirSync(dir)) {
		const journal = path.join(dir, file);
		try {
			const { id, original, current } = JSON.parse(fs.readFileSync(journal, "utf8")) as { id: number; original: string; current: string };
			const src = journalPath(drivePath, original);
			const dest = journalPath(drivePath, current);
			const row = lookup.get(id) as { current_relative_path: string } | undefined;
			if (row?.current_relative_path === current) { fs.unlinkSync(journal); continue; }
			if (fs.existsSync(dest) && !fs.existsSync(src)) {
				fs.mkdirSync(path.dirname(src), { recursive: true });
				restoreSync(dest, src);
			}
			if (!fs.existsSync(dest)) fs.unlinkSync(journal);
		} catch (err: any) {
			addLog("error", `Could not recover media move: ${err.message}`, journal);
		}
	}
}

function albumRenameDir(drivePath: string) { return path.join(drivePath, "albums", ".pending-album-renames"); }

export function beginAlbumRename(drivePath: string, albumId: number, original: string, current: string): string {
	return writeJournal(albumRenameDir(drivePath), { id: albumId, original, current });
}

export function recoverPendingAlbumRenames(db: Database, drivePath: string) {
	const dir = albumRenameDir(drivePath);
	if (!fs.existsSync(dir)) return;
	const lookup = db.prepare("SELECT relative_path FROM albums WHERE id = ?");
	for (const file of fs.readdirSync(dir)) {
		const journal = path.join(dir, file);
		try {
			const { id, original, current } = JSON.parse(fs.readFileSync(journal, "utf8")) as { id: number; original: string; current: string };
			const oldDir = journalPath(drivePath, original);
			const newDir = journalPath(drivePath, current);
			const row = lookup.get(id) as { relative_path: string } | undefined;
			if (row?.relative_path === current) { fs.unlinkSync(journal); continue; }
			if (fs.existsSync(newDir) && !fs.existsSync(oldDir)) {
				fs.mkdirSync(path.dirname(oldDir), { recursive: true });
				restoreSync(newDir, oldDir);
			}
			if (!fs.existsSync(newDir)) fs.unlinkSync(journal);
		} catch (err: any) {
			addLog("error", `Could not recover album rename: ${err.message}`, journal);
		}
	}
}

export function pendingDeletionDir(drivePath: string): string {
	return path.join(drivePath, "albums", ".pending-delete");
}

function scanMoveDir(drivePath: string) { return path.join(drivePath, "albums", ".pending-scan-moves"); }

export async function moveScannedFile(drivePath: string, src: string, dest: string, record: () => void) {
	const journal = writeJournal(scanMoveDir(drivePath), { original: path.relative(drivePath, src), current: path.relative(drivePath, dest) });
	let moved = false;
	try {
		await moveFile(src, dest);
		moved = true;
		record();
	} catch (err) {
		if (moved) {
			try { await moveFile(dest, src); fs.unlinkSync(journal); }
			catch (restoreErr: any) { addLog("error", `Scan move needs recovery: ${restoreErr.message}`, journal); }
		} else fs.unlinkSync(journal);
		throw err;
	}
	try { fs.unlinkSync(journal); }
	catch (err: any) { addLog("warn", `Scan move journal cleanup deferred: ${err.message}`, journal); }
}

export function recoverPendingScanMoves(db: Database, drivePath: string) {
	const dir = scanMoveDir(drivePath);
	if (!fs.existsSync(dir)) return;
	const lookup = db.prepare("SELECT current_relative_path FROM media_items WHERE original_relative_path = ?");
	for (const file of fs.readdirSync(dir)) {
		const journal = path.join(dir, file);
		try {
			const { original, current } = JSON.parse(fs.readFileSync(journal, "utf8")) as { original: string; current: string };
			const src = journalPath(drivePath, original);
			const dest = journalPath(drivePath, current);
			const row = lookup.get(original) as { current_relative_path: string } | undefined;
			if (row?.current_relative_path === current) { fs.unlinkSync(journal); continue; }
			if (fs.existsSync(dest) && !fs.existsSync(src)) {
				fs.mkdirSync(path.dirname(src), { recursive: true });
				restoreSync(dest, src);
			}
			if (!fs.existsSync(dest)) fs.unlinkSync(journal);
		} catch (err: any) {
			addLog("error", `Could not recover scan move: ${err.message}`, journal);
		}
	}
}

export function newDeletionBatch(drivePath: string): string {
	const dir = path.join(pendingDeletionDir(drivePath), randomUUID());
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}

// On the next writable DB open, resolve any deletion interrupted by a crash.
// A still-present row means the SQLite transaction did not commit.
export function recoverPendingDeletions(db: Database, drivePath: string) {
	const root = pendingDeletionDir(drivePath);
	if (!fs.existsSync(root)) return;
	const lookup = db.prepare("SELECT current_relative_path FROM media_items WHERE id = ?");
	for (const batch of fs.readdirSync(root)) {
		const dir = path.join(root, batch);
		if (!fs.lstatSync(dir).isDirectory()) continue;
		for (const name of fs.readdirSync(dir)) {
			const id = Number(name);
			if (!Number.isSafeInteger(id) || id < 1) continue;
			const staged = path.join(dir, name);
			try {
				const row = lookup.get(id) as { current_relative_path: string } | undefined;
				if (row) {
					const original = journalPath(drivePath, row.current_relative_path);
					if (!fs.existsSync(original)) {
						fs.mkdirSync(path.dirname(original), { recursive: true });
						restoreSync(staged, original);
					} else fs.unlinkSync(staged);
				} else fs.unlinkSync(staged);
			} catch (err: any) {
				addLog("error", `Could not recover staged deletion: ${err.message}`, staged);
			}
		}
		if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
	}
}
