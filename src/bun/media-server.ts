import path from "node:path";
import { addLog } from "./logger";
import { getOrGenerateThumbnail } from "./thumbnails";

// Local HTTP server to bypass CORS/file scheme security policies
export const MEDIA_SERVER_PORT = 51789;

export function startMediaServer() {
	const mediaServer = Bun.serve({
		port: MEDIA_SERVER_PORT,
		async fetch(req) {
			const corsHeaders = {
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
				"Access-Control-Allow-Headers": "*",
				"Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length",
			};

			if (req.method === "OPTIONS") {
				return new Response(null, { headers: corsHeaders });
			}

			const url = new URL(req.url);
			if (url.pathname === "/media") {
				const filePath = url.searchParams.get("path");
				if (!filePath) {
					return new Response("Missing path parameter", { status: 400, headers: corsHeaders });
				}
				try {
					const file = Bun.file(filePath);
					if (!(await file.exists())) {
						return new Response("File not found", { status: 404, headers: corsHeaders });
					}

					const total = file.size;
					const contentType = file.type || "application/octet-stream";
					const rangeHeader = req.headers.get("range");

					// Serve HTTP range requests (206) so <video> can buffer ahead and seek.
					if (rangeHeader) {
						const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
						let start = match && match[1] ? parseInt(match[1], 10) : 0;
						let end = match && match[2] ? parseInt(match[2], 10) : total - 1;

						if (
							Number.isNaN(start) ||
							Number.isNaN(end) ||
							start > end ||
							start >= total
						) {
							return new Response("Range Not Satisfiable", {
								status: 416,
								headers: { ...corsHeaders, "Content-Range": `bytes */${total}` },
							});
						}
						if (end >= total) end = total - 1;

						return new Response(file.slice(start, end + 1), {
							status: 206,
							headers: {
								...corsHeaders,
								"Content-Type": contentType,
								"Content-Range": `bytes ${start}-${end}/${total}`,
								"Accept-Ranges": "bytes",
								"Content-Length": String(end - start + 1),
								"Cache-Control": "public, max-age=86400",
							},
						});
					}

					return new Response(file, {
						headers: {
							...corsHeaders,
							"Content-Type": contentType,
							"Content-Length": String(total),
							"Accept-Ranges": "bytes",
							"Cache-Control": "public, max-age=86400",
						}
					});
				} catch (err: any) {
					return new Response(err.message, { status: 500, headers: corsHeaders });
				}
			}

			if (url.pathname === "/media/thumb") {
				const drivePath = url.searchParams.get("drivePath");
				const relativePath = url.searchParams.get("relativePath");
				const fileHash = url.searchParams.get("fileHash");

				if (!drivePath || !relativePath || !fileHash) {
					return new Response("Missing parameter (drivePath/relativePath/fileHash)", { status: 400, headers: corsHeaders });
				}

				const thumbPath = path.join(drivePath, "albums", "thumbs", `${fileHash}.jpg`);
				const fullMediaPath = path.join(drivePath, relativePath);

				try {
					const success = await getOrGenerateThumbnail(fullMediaPath, thumbPath);
					if (success) {
						const file = Bun.file(thumbPath);
						return new Response(file, {
							headers: {
								...corsHeaders,
								"Cache-Control": "public, max-age=31536000, immutable",
							}
						});
					}
					// Generation failed for this specific file (e.g. ffmpeg couldn't
					// decode it). This is "no thumbnail available", not a server fault —
					// 404 lets the <img onError> fallback icon kick in without logging a
					// scary 500. Log which file so it's still diagnosable.
					addLog("warn", `Thumbnail unavailable for media file`, fullMediaPath);
					return new Response("Thumbnail not available", { status: 404, headers: corsHeaders });
				} catch (err: any) {
					return new Response(err.message, { status: 500, headers: corsHeaders });
				}
			}
			return new Response("Not found", { status: 404, headers: corsHeaders });
		}
	});

	addLog("info", `Local media server running at http://localhost:${mediaServer.port}`);
	return mediaServer;
}
