import { Link } from "@tanstack/react-router";
import {
  File,
  FolderOpen,
  Calendar,
  HardDrive,
  Folder,
  Hash,
  Clock,
} from "lucide-react";
import type { MediaItem } from "@/components/MediaCard";

interface VideoMetadataProps {
  item: MediaItem;
  fileName: string;
  loading: boolean;
  albumId?: number;
  driveName: string;
  drivePath: string;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatDuration(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function VideoMetadata({
  item,
  fileName,
  loading,
  albumId,
  driveName,
  drivePath,
}: VideoMetadataProps) {
  let extraMeta: Record<string, any> = {};
  if (item.metadata_json) {
    try {
      extraMeta = JSON.parse(item.metadata_json);
    } catch {
      // malformed JSON — ignore
    }
  }
  const extraKeys = Object.keys(extraMeta);

  return (
    <div
      className={`p-6 rounded-2xl bg-gradient-to-br from-base-200/60 to-base-300/40 border border-base-200 shadow-xl space-y-6 transition-all duration-300 ${loading ? "opacity-40 pointer-events-none filter blur-[0.5px]" : "opacity-100"}`}
    >
      <div>
        <h3
          className="text-base font-black text-base-content leading-tight mb-1 truncate"
          title={fileName}
        >
          {fileName}
        </h3>
        <span className="badge badge-sm badge-secondary font-mono font-bold uppercase tracking-wider">
          {item.mime_type.split("/")[1] || item.mime_type}
        </span>
      </div>

      <div className="space-y-4 text-xs">
        {/* File size */}
        <div className="flex gap-3 items-start border-b border-base-200/80 pb-3">
          <File className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <div>
            <span className="block text-[10px] uppercase font-bold text-base-content/40 tracking-wider">
              File Size
            </span>
            <span className="font-mono text-base-content text-xs">
              {formatBytes(item.file_size)}
            </span>
          </div>
        </div>

        {/* Discovered At */}
        <div className="flex gap-3 items-start border-b border-base-200/80 pb-3">
          <Calendar className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <div>
            <span className="block text-[10px] uppercase font-bold text-base-content/40 tracking-wider">
              Discovered At
            </span>
            <span className="text-base-content text-xs">
              {new Date(item.created_at).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Album */}
        {item.album_id && (
          <div className="flex gap-3 items-start border-b border-base-200/80 pb-3">
            <Folder className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <span className="block text-[10px] uppercase font-bold text-base-content/40 tracking-wider">
                Album
              </span>
              <Link
                to="/album/$id"
                params={{ id: String(item.album_id) }}
                className="text-primary hover:underline font-bold text-xs block truncate"
              >
                {item.album_name === "unknown"
                  ? "Unsorted Media"
                  : item.album_name || "Unknown Album"}
              </Link>
            </div>
          </div>
        )}

        {/* Storage Volume */}
        <div className="flex gap-3 items-start border-b border-base-200/80 pb-3">
          <HardDrive className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <span className="block text-[10px] uppercase font-bold text-base-content/40 tracking-wider">
              Storage Volume
            </span>
            <span className="text-base-content text-xs block truncate font-medium">
              {driveName}
            </span>
            <span className="text-[9px] font-mono text-base-content/40 block truncate">
              {drivePath}
            </span>
          </div>
        </div>

        {/* Original Location */}
        <div className="flex gap-3 items-start border-b border-base-200/80 pb-3">
          <FolderOpen className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <div className="min-w-0 flex-grow">
            <span className="block text-[10px] uppercase font-bold text-base-content/40 tracking-wider">
              Original Location
            </span>
            <p className="text-base-content/60 font-mono text-[10px] select-all break-all leading-normal">
              {item.original_relative_path}
            </p>
          </div>
        </div>

        {/* Active Catalog Path */}
        <div className="flex gap-3 items-start border-b border-base-200/80 pb-3">
          <FolderOpen className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
          <div className="min-w-0 flex-grow">
            <span className="block text-[10px] uppercase font-bold text-base-content/40 tracking-wider">
              Active Catalog Path
            </span>
            <p className="text-base-content/80 font-mono text-[10px] select-all break-all leading-normal">
              {item.current_relative_path}
            </p>
          </div>
        </div>

        {/* Full MIME Type */}
        <div className="flex gap-3 items-start border-b border-base-200/80 pb-3">
          <File className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <div>
            <span className="block text-[10px] uppercase font-bold text-base-content/40 tracking-wider">
              Full MIME Type
            </span>
            <span className="font-mono text-base-content/80 text-xs">
              {item.mime_type}
            </span>
          </div>
        </div>

        {/* File Hash */}
        <div className="flex gap-3 items-start border-b border-base-200/80 pb-3">
          <Hash className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <span className="block text-[10px] uppercase font-bold text-base-content/40 tracking-wider">
              File Hash Identifier
            </span>
            <span className="font-mono text-base-content/60 text-[10px] select-all break-all leading-normal">
              {item.file_hash}
            </span>
          </div>
        </div>

        {/* Duration */}
        {item.duration_seconds != null && (
          <div className="flex gap-3 items-start border-b border-base-200/80 pb-3">
            <Clock className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <span className="block text-[10px] uppercase font-bold text-base-content/40 tracking-wider">
                Duration
              </span>
              <span className="text-base-content text-xs">
                {formatDuration(item.duration_seconds)}
              </span>
            </div>
          </div>
        )}

        {/* Embedded Metadata */}
        {extraKeys.length > 0 && (
          <div className="border-t border-base-200/80 pt-4 mt-4 space-y-3">
            <h4 className="text-[10px] uppercase font-black text-base-content/60 tracking-wider">
              Embedded Metadata
            </h4>
            {extraKeys.map((key) => (
              <div
                key={key}
                className="flex justify-between items-start gap-2 border-b border-base-200/50 pb-1.5 last:border-0 last:pb-0"
              >
                <span className="text-base-content/40 font-mono text-[10px]">
                  {key}
                </span>
                <span className="text-base-content font-mono text-[10px] break-all select-all text-right">
                  {typeof extraMeta[key] === "object"
                    ? JSON.stringify(extraMeta[key])
                    : String(extraMeta[key])}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Link
        to={albumId ? "/album/$id" : "/medias"}
        params={albumId ? { id: String(albumId) } : undefined}
        className="btn btn-outline btn-sm w-full font-bold"
      >
        {albumId ? "Return to Album" : "Return to Catalog List"}
      </Link>
    </div>
  );
}
