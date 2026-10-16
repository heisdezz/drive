import { For, Show } from "solid-js";
import { Link } from "@tanstack/solid-router";
import {
  File,
  FolderOpen,
  Calendar,
  HardDrive,
  Folder,
  Hash,
  Clock,
} from "lucide-solid";
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

export default function VideoMetadata(props: VideoMetadataProps) {
  const extraMeta = () => {
    if (props.item.metadata_json) {
      try {
        return JSON.parse(props.item.metadata_json);
      } catch {
        return {};
      }
    }
    return {};
  };

  const extraKeys = () => Object.keys(extraMeta());

  return (
    <div
      class={`p-6 rounded-2xl bg-gradient-to-br from-base-200/60 to-base-300/40 border border-base-200 shadow-xl space-y-6 transition-all duration-300 ${props.loading ? "opacity-40 pointer-events-none filter blur-[0.5px]" : "opacity-100"}`}
    >
      <div>
        <h3
          class="text-base font-black text-base-content leading-tight mb-1 truncate"
          title={props.fileName}
        >
          {props.fileName}
        </h3>
        <span class="badge badge-sm badge-secondary font-mono font-bold uppercase tracking-wider">
          {props.item.mime_type.split("/")[1] || props.item.mime_type}
        </span>
      </div>

      <div class="space-y-4 text-xs">
        {/* File size */}
        <div class="flex gap-3 items-start border-b border-base-200/80 pb-3">
          <File class="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <div>
            <span class="block text-[10px] uppercase font-bold text-base-content/40 tracking-wider">
              File Size
            </span>
            <span class="font-mono text-base-content text-xs">
              {formatBytes(props.item.file_size)}
            </span>
          </div>
        </div>

        {/* Discovered At */}
        <div class="flex gap-3 items-start border-b border-base-200/80 pb-3">
          <Calendar class="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <div>
            <span class="block text-[10px] uppercase font-bold text-base-content/40 tracking-wider">
              Discovered At
            </span>
            <span class="text-base-content text-xs">
              {new Date(props.item.created_at).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Album */}
        <Show when={props.item.album_id}>
          <div class="flex gap-3 items-start border-b border-base-200/80 pb-3">
            <Folder class="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <div class="min-w-0">
              <span class="block text-[10px] uppercase font-bold text-base-content/40 tracking-wider">
                Album
              </span>
              <Link
                to="/album/$id"
                params={{ id: String(props.item.album_id) }}
                class="text-primary hover:underline font-bold text-xs block truncate"
              >
                {props.item.album_name === "unknown"
                  ? "Unsorted Media"
                  : props.item.album_name || "Unknown Album"}
              </Link>
            </div>
          </div>
        </Show>

        {/* Storage Volume */}
        <div class="flex gap-3 items-start border-b border-base-200/80 pb-3">
          <HardDrive class="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <div class="min-w-0">
            <span class="block text-[10px] uppercase font-bold text-base-content/40 tracking-wider">
              Storage Volume
            </span>
            <span class="text-base-content text-xs block truncate font-medium">
              {props.driveName}
            </span>
            <span class="text-[9px] font-mono text-base-content/40 block truncate">
              {props.drivePath}
            </span>
          </div>
        </div>

        {/* Original Location */}
        <div class="flex gap-3 items-start border-b border-base-200/80 pb-3">
          <FolderOpen class="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <div class="min-w-0 flex-grow">
            <span class="block text-[10px] uppercase font-bold text-base-content/40 tracking-wider">
              Original Location
            </span>
            <p class="text-base-content/60 font-mono text-[10px] select-all break-all leading-normal">
              {props.item.original_relative_path}
            </p>
          </div>
        </div>

        {/* Active Catalog Path */}
        <div class="flex gap-3 items-start border-b border-base-200/80 pb-3">
          <FolderOpen class="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
          <div class="min-w-0 flex-grow">
            <span class="block text-[10px] uppercase font-bold text-base-content/40 tracking-wider">
              Active Catalog Path
            </span>
            <p class="text-base-content/80 font-mono text-[10px] select-all break-all leading-normal">
              {props.item.current_relative_path}
            </p>
          </div>
        </div>

        {/* Full MIME Type */}
        <div class="flex gap-3 items-start border-b border-base-200/80 pb-3">
          <File class="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <div>
            <span class="block text-[10px] uppercase font-bold text-base-content/40 tracking-wider">
              Full MIME Type
            </span>
            <span class="font-mono text-base-content/80 text-xs">
              {props.item.mime_type}
            </span>
          </div>
        </div>

        {/* File Hash */}
        <div class="flex gap-3 items-start border-b border-base-200/80 pb-3">
          <Hash class="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <div class="min-w-0">
            <span class="block text-[10px] uppercase font-bold text-base-content/40 tracking-wider">
              File Hash Identifier
            </span>
            <span class="font-mono text-base-content/60 text-[10px] select-all break-all leading-normal">
              {props.item.file_hash}
            </span>
          </div>
        </div>

        {/* Duration */}
        <Show when={props.item.duration_seconds != null}>
          <div class="flex gap-3 items-start border-b border-base-200/80 pb-3">
            <Clock class="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <span class="block text-[10px] uppercase font-bold text-base-content/40 tracking-wider">
                Duration
              </span>
              <span class="text-base-content text-xs">
                {formatDuration(props.item.duration_seconds!)}
              </span>
            </div>
          </div>
        </Show>

        {/* Embedded Metadata */}
        <Show when={extraKeys().length > 0}>
          <div class="border-t border-base-200/80 pt-4 mt-4 space-y-3">
            <h4 class="text-[10px] uppercase font-black text-base-content/60 tracking-wider">
              Embedded Metadata
            </h4>
            <For each={extraKeys()}>
              {(key) => (
                <div class="flex justify-between items-start gap-2 border-b border-base-200/50 pb-1.5 last:border-0 last:pb-0">
                  <span class="text-base-content/40 font-mono text-[10px]">
                    {key}
                  </span>
                  <span class="text-base-content font-mono text-[10px] break-all select-all text-right">
                    {typeof extraMeta()[key] === "object"
                      ? JSON.stringify(extraMeta()[key])
                      : String(extraMeta()[key])}
                  </span>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>

      <Link
        to={props.albumId ? "/album/$id" : "/medias"}
        params={props.albumId ? { id: String(props.albumId) } : undefined}
        class="btn btn-outline btn-sm w-full font-bold"
      >
        {props.albumId ? "Return to Album" : "Return to Catalog List"}
      </Link>
    </div>
  );
}
