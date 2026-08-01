import path from "node:path";

const VIDEO_MIME_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".ogv": "video/ogg",
  ".ts": "video/mp2t",
  // Windows-common formats
  ".wmv": "video/x-ms-wmv",
  ".asf": "video/x-ms-asf",
  ".flv": "video/x-flv",
  ".f4v": "video/mp4",
  ".m2ts": "video/mp2t",
  ".mts": "video/mp2t",
  ".3gp": "video/3gpp",
  ".3g2": "video/3gpp2",
  ".rm": "application/vnd.rn-realmedia",
  ".rmvb": "application/vnd.rn-realmedia-vbr",
};

/**
 * Get the MIME type for a video file based on its extension.
 * Includes common Windows video formats.
 * 
 * Supported by Chromium/WebKit:
 * - video/mp4 (H.264 codec)
 * - video/webm (VP8/VP9)
 * - video/quicktime (MOV files)
 * - video/ogg (Theora)
 */
export function getVideoMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = VIDEO_MIME_TYPES[ext] ?? "video/mp4";
  return mimeType;
}

/**
 * Check if a video format is likely supported by modern browsers.
 * Returns true for widely-supported formats.
 */
export function isSupportedVideoFormat(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const supportedFormats = [".mp4", ".m4v", ".webm", ".mov", ".ogv", ".ts"];
  return supportedFormats.includes(ext);
}

/**
 * Get all supported video extensions for client-side filtering.
 */
export function getSupportedVideoExtensions(): string[] {
  return [".mp4", ".m4v", ".webm", ".mov", ".ogv", ".ts", ".m2ts", ".mts"];
}

