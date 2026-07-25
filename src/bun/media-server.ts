import path from "node:path";
import { addLog } from "./logger";
import { getOrGenerateThumbnail } from "./thumbnails";

const VIDEO_MIME_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".ogv": "video/ogg",
  ".ts": "video/mp2t",
};

function getVideoMimeType(filePath: string): string {
  return VIDEO_MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

// Local HTTP server to bypass CORS/file scheme security policies
export const MEDIA_SERVER_PORT = 51789;

export function startMediaServer() {
  const mediaServer = Bun.serve({
    port: MEDIA_SERVER_PORT,
    async fetch(req) {
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Range, Accept-Encoding, *",
        "Access-Control-Expose-Headers":
          "Content-Range, Accept-Ranges, Content-Length, Content-Type",
        // Add timing allow origin for media element timing
        "Timing-Allow-Origin": "*",
      };

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
          const file = Bun.file(filePath);
          if (!(await file.exists())) {
            return new Response("File not found", {
              status: 404,
              headers: corsHeaders,
            });
          }

          const total = file.size;
          // Bun's file.type is extension-based and covers common formats, but
          // falls back to application/octet-stream for containers like .mkv.
          // Override only when Bun doesn't know the type.
          const bunType = file.type;
          const contentType =
            bunType && bunType !== "application/octet-stream"
              ? bunType
              : getVideoMimeType(filePath);
          const rangeHeader = req.headers.get("range");

          // Serve HTTP range requests (206) so <video> can buffer ahead and seek.
          if (rangeHeader) {
            const match = /^bytes=(\d+)?-(\d+)?$/.exec(rangeHeader);
            if (!match) {
              return new Response("Invalid Range", {
                status: 400,
                headers: corsHeaders,
              });
            }

            let start = match[1] ? parseInt(match[1], 10) : 0;
            let end = match[2] ? parseInt(match[2], 10) : total - 1;

            // Clamp and validate
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

            // Bun.slice is exclusive at end, so use end + 1
            const sliced = file.slice(start, end + 1);

            return new Response(sliced, {
              status: 206,
              headers: {
                ...corsHeaders,
                "Content-Type": contentType,
                "Content-Range": `bytes ${start}-${end}/${total}`,
                "Accept-Ranges": "bytes",
                "Content-Length": String(end - start + 1),
                "Cache-Control": "no-cache", // Don't cache range requests
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
            },
          });
        } catch (err: any) {
          return new Response(err.message, {
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
    },
  });

  addLog(
    "info",
    `Local media server running at http://localhost:${mediaServer.port}`,
  );
  return mediaServer;
}
