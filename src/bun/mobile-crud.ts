import { albumDbPath, albumRoot } from "./album-location";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Database } from "bun:sqlite";
import { albumHandlers } from "./handlers/albums";
import { mediaHandlers } from "./handlers/media";
import { assertWritable, getDatabaseConnection, openReadableDb } from "./database";
import { backgroundThumbnailQueue } from "./thumbnails";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_MULTIPART_BYTES = 100 * 1024 * 1024;
const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".webp": "image/webp", ".heic": "image/heic",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska", ".webm": "video/webm",
};

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-File-Name, Range",
  "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length",
};

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers });
}

function fail(error: string, status: number) {
  return json({ error }, status);
}

function integer(value: string | null, fallback?: number): number | null {
  if (value === null) return fallback ?? null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

async function bodyObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

function errorStatus(message: string): number {
  return /not found|does not exist/i.test(message) ? 404 : /already exists|duplicate|UNIQUE constraint/i.test(message) ? 409 : 400;
}

async function albumPath(drivePath: string, relativePath: string): Promise<string> {
  const root = fs.realpathSync(drivePath);
  const directory = path.resolve(root, relativePath);
  const albumsRoot = albumRoot(root);
  if (!directory.startsWith(albumsRoot + path.sep)) throw new Error("Invalid album path.");
  if (fs.realpathSync(albumsRoot) !== albumsRoot) throw new Error("Album root must be inside the selected drive.");
  let current = albumsRoot;
  for (const part of path.relative(albumsRoot, directory).split(path.sep)) {
    current = path.join(current, part);
    try { await fs.promises.mkdir(current); }
    catch (error: any) { if (error.code !== "EEXIST") throw error; }
    if (!(await fs.promises.lstat(current)).isDirectory()) throw new Error("Album path is not a directory.");
  }
  const realDirectory = fs.realpathSync(directory);
  if (!realDirectory.startsWith(albumsRoot + path.sep)) throw new Error("Album path leaves the selected drive.");
  return realDirectory;
}

async function uploadMedia(request: Request, drivePath: string, url: URL): Promise<Response> {
  const multipart = request.headers.get("content-type")?.startsWith("multipart/form-data") ?? false;
  const length = Number(request.headers.get("content-length") || 0);
  if (!Number.isFinite(length) || length > (multipart ? MAX_MULTIPART_BYTES : MAX_UPLOAD_BYTES)) {
    return fail("Upload is too large.", 413);
  }

  let albumId = integer(url.searchParams.get("albumId"));
  let fileName = url.searchParams.get("filename") || request.headers.get("x-file-name") || "";
  let stream: ReadableStream<Uint8Array> | null = request.body;
  if (multipart) {
    const form = await request.formData();
    const field = form.get("file");
    if (!(field instanceof File)) return fail("A file field is required.", 400);
    if (field.size > MAX_MULTIPART_BYTES) return fail("Multipart uploads are limited to 100 MiB; use a raw request for larger files.", 413);
    albumId = integer(String(form.get("albumId") ?? url.searchParams.get("albumId") ?? ""));
    fileName = field.name;
    stream = field.stream();
  }
  if (!albumId || !stream) return fail("A valid albumId and file are required.", 400);
  if (!fileName || fileName === "." || fileName === ".." ||
      /[\\/\x00-\x1f:*?"<>|]/.test(fileName) || fileName.length > 255) {
    return fail("Invalid file name.", 400);
  }
  const extension = path.extname(fileName).toLowerCase();
  const mime = MIME_BY_EXT[extension];
  if (!mime) return fail("Unsupported image or video file extension.", 415);

  const dbFile = albumDbPath(drivePath);
  assertWritable(drivePath);
  const readDb = openReadableDb(dbFile);
  let relativePath: string;
  try {
    const album = readDb.prepare("SELECT relative_path FROM albums WHERE id = ?").get(albumId) as { relative_path: string } | undefined;
    if (!album) return fail("Album not found.", 404);
    relativePath = album.relative_path;
  } finally { readDb.close(); }

  const directory = await albumPath(drivePath, relativePath!);
  const base = path.basename(fileName, extension);
  let target = "";
  let file: fs.promises.FileHandle | null = null;
  for (let suffix = 0; suffix < 10000; suffix++) {
    target = path.join(directory, suffix ? `${base}_${suffix}${extension}` : fileName);
    try { file = await fs.promises.open(target, "wx"); break; }
    catch (error: any) { if (error.code !== "EEXIST") throw error; }
  }
  if (!file) return fail("Could not choose an unused file name.", 409);

  let db: Database | null = null;
  let committed = false;
  try {
    const reader = stream.getReader();
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_UPLOAD_BYTES) throw new Error("Upload is too large.");
        await file.writeFile(value);
      }
    } finally { reader.releaseLock(); }
    await file.sync();
    await file.close();
    file = null;
    if (!size) throw new Error("Empty files are not supported.");

    const currentRelativePath = path.relative(drivePath, target).replace(/\\/g, "/");
    const hash = randomUUID();
    db = getDatabaseConnection(dbFile);
    if (!db.prepare("SELECT 1 FROM albums WHERE id = ?").get(albumId)) throw new Error("Album was removed during upload.");
    const result = db.prepare(`INSERT INTO media_items
      (file_hash, original_relative_path, current_relative_path, file_size, mime_type, album_id)
      VALUES (?, ?, ?, ?, ?, ?)`).run(hash, currentRelativePath, currentRelativePath, size, mime, albumId);
    committed = true;
    const item = db.prepare("SELECT * FROM media_items WHERE id = ?").get(Number(result.lastInsertRowid));
    try { backgroundThumbnailQueue.add(target, path.join(albumRoot(drivePath), "thumbs", `${hash}.jpg`)); }
    catch { /* Upload succeeded; the thumbnail can be generated on demand. */ }
    return json({ item }, 201);
  } catch (error: any) {
    if (error.message === "Upload is too large.") return fail(error.message, 413);
    if (error.message === "Empty files are not supported.") return fail(error.message, 400);
    if (error.message === "Album was removed during upload.") return fail(error.message, 404);
    throw error;
  } finally {
    db?.close();
    if (file) await file.close();
    if (!committed) await fs.promises.unlink(target).catch(() => {});
  }
}

export async function handleMobileCrud(request: Request, drivePath: string, url: URL): Promise<Response> {
  const route = url.pathname.replace(/\/$/, "");
  const method = request.method;
  const albumMatch = /^\/api\/albums\/(\d+)$/.exec(route);
  const mediaMatch = /^\/api\/media\/(\d+)(?:\/details)?$/.exec(route);

  if (route === "/api/albums") {
    if (method === "GET") {
      const result = await albumHandlers.getAlbums({ drivePath });
      return json(result, result.error ? 500 : 200);
    }
    if (method === "POST") {
      const body = await bodyObject(request);
      if (typeof body?.name !== "string" || !body.name.trim() ||
          (body.description !== undefined && typeof body.description !== "string")) return fail("A name and optional description are required.", 400);
      const result = await albumHandlers.createAlbum({ drivePath, name: body.name, description: body.description as string | undefined });
      return json(result, result.success ? 201 : errorStatus(result.error || ""));
    }
  }

  if (albumMatch) {
    const albumId = Number(albumMatch[1]);
    if (!Number.isSafeInteger(albumId)) return fail("Invalid album ID.", 400);
    if (method === "GET") {
      const result = await albumHandlers.getAlbum({ drivePath, albumId });
      return json(result, result.error ? errorStatus(result.error) : 200);
    }
    if (method === "PATCH") {
      const body = await bodyObject(request);
      if (!body || (body.name !== undefined && typeof body.name !== "string") ||
          (body.description !== undefined && body.description !== null && typeof body.description !== "string")) return fail("Invalid album update.", 400);
      const current = await albumHandlers.getAlbum({ drivePath, albumId });
      if (!current.album) return fail(current.error || "Album not found.", 404);
      const result = await albumHandlers.editAlbum({
        drivePath, albumId, newName: (body.name as string | undefined) ?? current.album.name,
        newDescription: body.description === undefined ? current.album.description || undefined : body.description as string | undefined,
      });
      return json(result, result.success ? 200 : errorStatus(result.error || ""));
    }
    if (method === "DELETE") {
      const permanent = url.searchParams.get("permanent") === "true";
      const result = await albumHandlers.deleteAlbum({ drivePath, albumId, permanent });
      return json(result, result.success ? 200 : errorStatus(result.error || ""));
    }
  }

  if (route === "/api/media") {
    if (method === "GET") {
      const limit = integer(url.searchParams.get("limit"), 50);
      const offset = integer(url.searchParams.get("offset"), 0);
      const albumId = integer(url.searchParams.get("albumId"));
      if (limit === null || limit > 500 || offset === null || (url.searchParams.has("albumId") && !albumId)) return fail("Invalid pagination or albumId.", 400);
      const search = url.searchParams.get("search") || undefined;
      const filter = url.searchParams.get("filter") || "all";
      const sortBy = url.searchParams.get("sortBy") || "date";
      const sortOrder = url.searchParams.get("sortOrder") || "desc";
      if (!["all", "images", "videos"].includes(filter) || !["date", "name", "size"].includes(sortBy) || !["asc", "desc"].includes(sortOrder)) return fail("Invalid filter or sort value.", 400);
      const options = { drivePath, limit, offset, search, filter: filter as "all" | "images" | "videos", sortBy: sortBy as "date" | "name" | "size", sortOrder: sortOrder as "asc" | "desc" };
      const result = albumId ? await albumHandlers.getAlbumMedia({ ...options, albumId }) : await mediaHandlers.getMediaItems(options);
      return json(result, result.error ? 500 : 200);
    }
    if (method === "POST") return uploadMedia(request, drivePath, url);
  }

  if (mediaMatch) {
    const itemId = Number(mediaMatch[1]);
    if (!Number.isSafeInteger(itemId)) return fail("Invalid media ID.", 400);
    if (method === "GET") {
      const result = await mediaHandlers.getMediaItem({ drivePath, itemId });
      return json(result, result.error ? errorStatus(result.error) : 200);
    }
    if (method === "PATCH") {
      const body = await bodyObject(request);
      const targetAlbumId = integer(body?.albumId == null ? null : String(body.albumId));
      if (!targetAlbumId) return fail("A valid albumId is required.", 400);
      const current = await mediaHandlers.getMediaItem({ drivePath, itemId });
      if (!current.item) return fail(current.error || "Media item not found.", 404);
      if ((current.item as { album_id?: number }).album_id === targetAlbumId) return json({ success: true, movedCount: 0 });
      const result = await mediaHandlers.moveMediaItemsToAlbum({ drivePath, mediaIds: [itemId], targetAlbumId });
      return json(result, result.success ? 200 : errorStatus(result.error || ""));
    }
    if (method === "DELETE") {
      const result = await mediaHandlers.deleteMediaItems({ drivePath, mediaIds: [itemId] });
      return json(result, result.success ? 200 : errorStatus(result.error || ""));
    }
  }

  return fail("Not found or method not allowed.", 404);
}
