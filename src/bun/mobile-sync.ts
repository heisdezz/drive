import { albumDbPath, albumRoot } from "./album-location";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import { createBackup, openReadableDb } from "./database";
import { getOrGenerateThumbnail } from "./thumbnails";
import { handleMobileCrud } from "./mobile-crud";
import { getMobileWriteToken, setMobileWriteToken } from "./mobile-token";

let server: ReturnType<typeof Bun.serve> | null = null;
let activeDrive = "";
let activePort = 8080;

function localIp(): string {
	for (const addresses of Object.values(os.networkInterfaces())) {
		for (const address of addresses || []) {
			if (address.family === "IPv4" && !address.internal) return address.address;
		}
	}
	return "127.0.0.1";
}

export function isMobileSyncActiveForDrive(drivePath: string): boolean {
	return !!server && activeDrive === drivePath;
}

export function mobileSyncStatus() {
	return { running: !!server, drivePath: activeDrive, port: activePort, url: server ? `http://${localIp()}:${activePort}` : "", writeToken: getMobileWriteToken() };
}

export function changeMobileSyncWriteToken(token: string) {
	setMobileWriteToken(token);
	return mobileSyncStatus();
}

const cors = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, HEAD, POST, PATCH, DELETE, OPTIONS",
	"Access-Control-Allow-Headers": "Range, Content-Type, Authorization, X-File-Name",
	"Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length",
};

function json(data: unknown, status = 200, head = false): Response {
	const body = JSON.stringify(data);
	return new Response(head ? null : body, { status, headers: { ...cors, "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(body)) } });
}

function dbPath() { return albumDbPath(activeDrive); }

async function serveFile(filePath: string, mime: string, request: Request, head: boolean, download = false): Promise<Response> {
	const file = Bun.file(filePath);
	if (!(await file.exists())) return json({ error: "File not found" }, 404, head);
	const total = file.size;
	let start = 0;
	let end = total - 1;
	const range = download ? null : request.headers.get("range");
	if (range) {
		const match = /^bytes=(\d*)-(\d*)$/.exec(range);
		if (!match || (!match[1] && !match[2])) return json({ error: "Invalid Range" }, 400, head);
		if (!match[1]) {
			start = Math.max(0, total - Number(match[2]));
		} else {
			start = Number(match[1]);
			if (match[2]) end = Math.min(Number(match[2]), total - 1);
		}
		if (start >= total || start > end || Number.isNaN(start) || Number.isNaN(end)) {
			return new Response(null, { status: 416, headers: { ...cors, "Content-Range": `bytes */${total}` } });
		}
		// Keep seek responses bounded and materialized; aborted file streams can
		// hit Bun's sendfile path while a player scrubs through a video.
		end = Math.min(end, start + 8 * 1024 * 1024 - 1);
	}
	const headers: Record<string, string> = {
		...cors,
		"Content-Type": mime,
		"Content-Length": String(range ? end - start + 1 : total),
		"Accept-Ranges": "bytes",
	};
	if (range) headers["Content-Range"] = `bytes ${start}-${end}/${total}`;
	if (download) headers["Content-Disposition"] = 'attachment; filename="media_library.db"';
	const body = head ? null : range ? await file.slice(start, end + 1).arrayBuffer() : file;
	return new Response(body, { status: range ? 206 : 200, headers });
}

function mediaRow(id: number): { current_relative_path: string; mime_type: string; file_hash: string } | undefined {
	const db = openReadableDb(dbPath());
	try {
		return db.prepare("SELECT current_relative_path, mime_type, file_hash FROM media_items WHERE id = ?").get(id) as any;
	} finally { db.close(); }
}

async function safeMediaPath(relativePath: string): Promise<string | null> {
	const drive = await fs.promises.realpath(activeDrive);
	const target = await fs.promises.realpath(path.join(drive, relativePath));
	const rel = path.relative(drive, target);
	return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? target : null;
}

async function handle(request: Request): Promise<Response> {
	const head = request.method === "HEAD";
	if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
	const route = new URL(request.url).pathname.replace(/\/$/, "") || "/";
	if (!fs.existsSync(dbPath())) return json({ error: "Library database not found" }, 404, head);
	if (route === "/api/albums" || route.startsWith("/api/albums/") || route === "/api/media" ||
		/^\/api\/media\/\d+\/details$/.test(route) ||
		(/^\/api\/media\/\d+$/.test(route) && ["PATCH", "DELETE"].includes(request.method))) {
		if (request.method !== "GET" && request.method !== "HEAD") {
			const authorization = request.headers.get("authorization") || "";
			const supplied = /^Bearer /i.test(authorization) ? authorization.slice(7) : "";
			const expected = Buffer.from(getMobileWriteToken());
			const provided = Buffer.from(supplied);
			if (!supplied || provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
				return json({ error: "A valid write token is required." }, 401);
			}
		}
		return handleMobileCrud(request, activeDrive, new URL(request.url));
	}
	if (request.method !== "GET" && !head) return json({ error: "Method not allowed" }, 405);
	if (route === "/" || route === "/api/info" || route === "/api/db/stats") {
		const db = openReadableDb(dbPath());
		try {
			const count = (sql: string) => (db.prepare(sql).get() as { count: number }).count;
			return json({
				status: "online", server: "Media Library Mobile Sync Server",
				drive_name: path.basename(activeDrive), drive_path: activeDrive,
				download_url: `${mobileSyncStatus().url}/download/db`, server_ip: localIp(), server_port: activePort,
				stats: {
					total_items: count("SELECT count(*) AS count FROM media_items"),
					images: count("SELECT count(*) AS count FROM media_items WHERE mime_type LIKE 'image/%'"),
					videos: count("SELECT count(*) AS count FROM media_items WHERE mime_type LIKE 'video/%'"),
					albums: count("SELECT count(*) AS count FROM albums"),
					tags: count("SELECT count(*) AS count FROM tags"),
					db_size_bytes: fs.statSync(dbPath()).size, db_exists: true,
				},
			}, 200, head);
		} finally { db.close(); }
	}
	if (["/download/db", "/api/db/download"].includes(route)) {
		const snapshot = head ? dbPath() : createBackup(dbPath());
		return serveFile(snapshot || dbPath(), "application/x-sqlite3", request, head, true);
	}
	const media = /^\/(?:api\/)?(media|thumbnail)\/(\d+)$/.exec(route);
	if (media) {
		const row = mediaRow(Number(media[2]));
		if (!row) return json({ error: "Media item not found" }, 404, head);
		let target: string | null;
		try { target = await safeMediaPath(row.current_relative_path); }
		catch { return json({ error: "Media file not found" }, 404, head); }
		if (!target) return json({ error: "Forbidden media path" }, 403, head);
		if (media[1] === "media") return serveFile(target, row.mime_type || "application/octet-stream", request, head);
		const thumb = path.join(albumRoot(activeDrive), "thumbs", `${row.file_hash}.jpg`);
		if (!head && !(await getOrGenerateThumbnail(target, thumb))) return json({ error: "Thumbnail unavailable" }, 404);
		return serveFile(thumb, "image/jpeg", request, head);
	}
	return json({ error: "Not found" }, 404, head);
}

export function startMobileSync(drivePath: string, port: number, hostname = "0.0.0.0") {
	if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Port must be between 1 and 65535.");
	if (!fs.existsSync(albumDbPath(drivePath))) throw new Error("Select a drive with a scanned library.");
	getMobileWriteToken();
	server?.stop(true);
	server = null;
	activeDrive = fs.realpathSync(drivePath);
	activePort = port;
	server = Bun.serve({ hostname, port, maxRequestBodySize: 2 * 1024 * 1024 * 1024, fetch: request => handle(request).catch(err => json({ error: err.message }, 500)) });
	activePort = server.port ?? port;
	return mobileSyncStatus();
}

export function stopMobileSync() {
	server?.stop(true);
	server = null;
	return mobileSyncStatus();
}
