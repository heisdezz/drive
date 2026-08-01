import path from "node:path";
import { addLog } from "./logger";
import { getOrGenerateThumbnail } from "./thumbnails";
import { normalizePath, getVideoMimeType } from "./windows";

// Local HTTP server to bypass CORS/file scheme security policies
export const MEDIA_SERVER_PORT = 51789;

// Configuration for stable media streaming on Windows
const MAX_CHUNK_SIZE = 2 * 1024 * 1024; // 2MB max per range request to prevent buffer overflow
const IDLE_TIMEOUT = 60; // seconds - keep connections alive longer

export function startMediaServer() {
  const mediaServer = Bun.serve({
    port: MEDIA_SERVER_PORT,
    idleTimeout: IDLE_TIMEOUT,
    async fetch(req) {
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Range, Accept-Encoding, *",
        "Access-Control-Expose-Headers":
          "Content-Range, Accept-Ranges, Content-Length, Content-Type",
        // Add timing allow origin for media element timing
        "Timing-Allow-Origin": "*",
        // Critical: prevent connection drops during streaming
        "Connection": "keep-alive",
        "Keep-Alive": "timeout=5, max=100",
      };

      try {
        if (req.method === "OPTIONS") {
          return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(req.url);
        if (url.pathname === "/media") {
          const filePath = url.searchParams.get("path");
          const rangeHeader = req.headers.get("range");
          addLog("info", `[MediaServer] Incoming request`, `path: ${filePath?.substring(0, 100)}..., range: ${rangeHeader}`);
        
        if (!filePath) {
          addLog("error", `[MediaServer] Missing path parameter`, "");
          return new Response("Missing path parameter", {
            status: 400,
            headers: corsHeaders,
          });
        }
        try {
          const normalizedPath = normalizePath(filePath);
          addLog("info", `[MediaServer] Normalized path`, `from: ${filePath?.substring(0, 100)}, to: ${normalizedPath.substring(0, 100)}`);
          
          const file = Bun.file(normalizedPath);
          const exists = await file.exists();
          addLog("info", `[MediaServer] File existence check`, `path: ${normalizedPath.substring(0, 100)}, exists: ${exists}`);
          
          if (!exists) {
            addLog("warn", `[MediaServer] File not found`, normalizedPath);
            return new Response("File not found", {
              status: 404,
              headers: corsHeaders,
            });
          }

          const total = file.size;
          addLog("info", `[MediaServer] File opened successfully`, `size: ${total} bytes, path: ${normalizedPath.substring(0, 100)}`);
          
          // Bun's file.type is extension-based and covers common formats, but
          // falls back to application/octet-stream for containers like .mkv.
          // Override only when Bun doesn't know the type.
          const bunType = file.type;
          const fileExt = path.extname(normalizedPath).toLowerCase();
          const contentType =
            bunType && bunType !== "application/octet-stream"
              ? bunType
              : getVideoMimeType(normalizedPath);
          addLog("info", `[MediaServer] Content type determined`, `fileExt: ${fileExt}, bunType: ${bunType}, final: ${contentType}`);

          // Serve HTTP range requests (206) so <video> can buffer ahead and seek.
          if (rangeHeader) {
            const match = /^bytes=(\d+)?-(\d+)?$/.exec(rangeHeader);
            if (!match) {
              addLog("warn", `[MediaServer] Invalid range format`, rangeHeader);
              return new Response("Invalid Range", {
                status: 400,
                headers: corsHeaders,
              });
            }

            let start: number;
            let end: number;
            if (match[1] === undefined && match[2] !== undefined) {
              // Suffix range: "bytes=-N" means the last N bytes of the file.
              const suffixLength = parseInt(match[2], 10);
              start = Math.max(0, total - suffixLength);
              end = total - 1;
            } else {
              start = match[1] ? parseInt(match[1], 10) : 0;
              // CRITICAL: Limit chunk size to prevent buffer overflow on Windows
              const requestedEnd = match[2] ? parseInt(match[2], 10) : total - 1;
              end = Math.min(requestedEnd, start + MAX_CHUNK_SIZE - 1, total - 1);
            }

            // Clamp and validate
            if (start < 0) start = 0;
            if (end >= total) end = total - 1;
            if (start > end || start >= total) {
              addLog("warn", `[MediaServer] Range not satisfiable`, `start: ${start}, end: ${end}, total: ${total}`);
              return new Response("Range Not Satisfiable", {
                status: 416,
                headers: {
                  ...corsHeaders,
                  "Content-Range": `bytes */${total}`,
                },
              });
            }

            // Bun.slice is exclusive at end, so use end + 1
            const chunkSize = end - start + 1;
            addLog("info", `[MediaServer] Range request processing`, `start: ${start}, end: ${end}, chunkSize: ${chunkSize}, maxChunk: ${MAX_CHUNK_SIZE}, total: ${total}`);
            
            try {
              const sliced = file.slice(start, end + 1);
              addLog("info", `[MediaServer] File slice created successfully`, `chunkSize: ${chunkSize}`);
              
              const response = new Response(sliced, {
                status: 206,
                headers: {
                  ...corsHeaders,
                  "Content-Type": contentType,
                  "Content-Range": `bytes ${start}-${end}/${total}`,
                  "Accept-Ranges": "bytes",
                  "Content-Length": String(chunkSize),
                  "Cache-Control": "no-cache", // Don't cache range requests
                },
              });
              
              // Log successful response to track when connection might drop
              addLog("info", `[MediaServer] Range response ready to send`, `status: 206, contentLength: ${chunkSize}`);
              return response;
            } catch (sliceErr: any) {
              addLog("error", `[MediaServer] Error creating file slice`, `error: ${sliceErr.message}, start: ${start}, end: ${end}`);
              throw sliceErr;
            }
          }

          addLog("info", `[MediaServer] Serving full file`, `size: ${total}, contentType: ${contentType}`);
          
          // Create a proper streaming response that stays open
          let response: Response;
          try {
            response = new Response(file, {
              headers: {
                ...corsHeaders,
                "Content-Type": contentType,
                "Content-Length": String(total),
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=86400",
              },
            });
          } catch (respErr: any) {
            addLog("error", `[MediaServer] Error creating response object`, `error: ${respErr.message}`);
            throw respErr;
          }
          
          addLog("info", `[MediaServer] Full file response ready`, `status: 200, contentLength: ${total}`);
          return response;
        } catch (err: any) {
          addLog("error", `[MediaServer] Request handler exception`, `error: ${err.message}, stack: ${err.stack}`);
          return new Response(`Server error: ${err.message}`, {
            status: 500,
            headers: corsHeaders,
          });
        }
      }

      if (url.pathname === "/media/thumb") {
        const drivePath = url.searchParams.get("drivePath");
        const relativePath = url.searchParams.get("relativePath");
        const fileHash = url.searchParams.get("fileHash");

        if (!drivePath || !relativePath || !fileHash) {
          return new Response(
            "Missing parameter (drivePath/relativePath/fileHash)",
            { status: 400, headers: corsHeaders },
          );
        }

        const thumbPath = path.join(
          drivePath,
          "albums",
          "thumbs",
          `${fileHash}.jpg`,
        );
        const fullMediaPath = path.join(drivePath, relativePath);

        try {
          const success = await getOrGenerateThumbnail(
            fullMediaPath,
            thumbPath,
          );
          if (success) {
            const file = Bun.file(thumbPath);
            return new Response(file, {
              headers: {
                ...corsHeaders,
                "Cache-Control": "public, max-age=31536000, immutable",
              },
            });
          }
          // Generation failed for this specific file (e.g. ffmpeg couldn't
          // decode it). This is "no thumbnail available", not a server fault —
          // 404 lets the <img onError> fallback icon kick in without logging a
          // scary 500. Log which file so it's still diagnosable.
          addLog("warn", `Thumbnail unavailable for media file`, fullMediaPath);
          return new Response("Thumbnail not available", {
            status: 404,
            headers: corsHeaders,
          });
        } catch (err: any) {
          return new Response(err.message, {
            status: 500,
            headers: corsHeaders,
          });
        }
      }
      return new Response("Not found", { status: 404, headers: corsHeaders });
      } catch (globalErr: any) {
        addLog("error", `[MediaServer] Unhandled fetch error`, `error: ${globalErr.message}, stack: ${globalErr.stack}`);
        return new Response(`Internal server error: ${globalErr.message}`, {
          status: 500,
          headers: corsHeaders,
        });
      }
    },
  });

  addLog(
    "info",
    `Local media server running at http://localhost:${mediaServer.port}`,
  );
  return mediaServer;
}
