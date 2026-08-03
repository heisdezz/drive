import path from "node:path";
import { addLog } from "./logger";
import { getOrGenerateThumbnail } from "./thumbnails";
import { normalizePath, getVideoMimeType } from "./windows";

export const MEDIA_SERVER_PORT = 51789;

// Cap each range response. Seeking aborts the in-flight response; a bounded
// body drains quickly so it can't bleed into the next request's byte stream.
const MAX_CHUNK_SIZE = 50 * 1024 * 1024;
const IDLE_TIMEOUT = 60;

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
        "Timing-Allow-Origin": "*",
      };

      try {
        if (req.method === "OPTIONS") {
          return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(req.url);

        if (url.pathname === "/media") {
          const filePath = url.searchParams.get("path");
          if (!filePath) {
            return new Response("Missing path parameter", {
              status: 400,
              headers: corsHeaders,
            });
          }

          try {
            const normalizedPath = normalizePath(filePath);
            const file = Bun.file(normalizedPath);
            const total = file.size;
            const contentType =
              file.type && file.type !== "application/octet-stream"
                ? file.type
                : getVideoMimeType(normalizedPath);
            const rangeHeader = req.headers.get("range");

            if (rangeHeader) {
              const match = /^bytes=(\d+)?-(\d+)?$/.exec(rangeHeader);
              if (!match) {
                return new Response("Invalid Range", {
                  status: 400,
                  headers: corsHeaders,
                });
              }

              let start: number;
              let end: number;
              if (match[1] === undefined && match[2] !== undefined) {
                // Suffix range: "bytes=-N" → last N bytes
                const suffixLength = parseInt(match[2], 10);
                start = Math.max(0, total - suffixLength);
                end = total - 1;
              } else {
                start = match[1] ? parseInt(match[1], 10) : 0;
                const requestedEnd = match[2]
                  ? parseInt(match[2], 10)
                  : total - 1;
                end = Math.min(
                  requestedEnd,
                  start + MAX_CHUNK_SIZE - 1,
                  total - 1,
                );
              }

              if (start < 0) start = 0;
              if (end >= total) end = total - 1;
              if (start > end || start >= total) {
                return new Response("Range Not Satisfiable", {
                  status: 416,
                  headers: {
                    ...corsHeaders,
                    "Content-Range": `bytes */${total}`,
                  },
                });
              }

              const chunkSize = end - start + 1;
              // Read the (capped) chunk fully into memory rather than returning
              // a lazily-streamed file slice. Bun 1.3.13's sendfile path
              // segfaults when a seek aborts the connection mid-stream; a
              // materialized buffer sidesteps that crash and, being ≤8 MB,
              // is cheap.
              const chunk = await file.slice(start, end + 1).arrayBuffer();
              return new Response(chunk, {
                status: 206,
                headers: {
                  ...corsHeaders,
                  "Content-Type": contentType,
                  "Content-Range": `bytes ${start}-${end}/${total}`,
                  "Accept-Ranges": "bytes",
                  "Content-Length": String(chunkSize),
                  "Cache-Control": "no-cache",
                },
              });
            }

            return new Response(file, {
              headers: {
                ...corsHeaders,
                "Content-Type": contentType,
                "Content-Length": String(total),
                "Accept-Ranges": "bytes",
                "Cache-Control": "no-cache",
              },
            });
          } catch (err: any) {
            if (err.code === "ENOENT") {
              return new Response("File not found", {
                status: 404,
                headers: corsHeaders,
              });
            }
            addLog(
              "error",
              `[MediaServer] /media error`,
              `${err.message}\n${err.stack}`,
            );
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
              return new Response(Bun.file(thumbPath), {
                headers: {
                  ...corsHeaders,
                  "Cache-Control": "public, max-age=31536000, immutable",
                },
              });
            }
            addLog("warn", `Thumbnail unavailable`, fullMediaPath);
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
        addLog(
          "error",
          `[MediaServer] Unhandled fetch error`,
          `${globalErr.message}\n${globalErr.stack}`,
        );
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
