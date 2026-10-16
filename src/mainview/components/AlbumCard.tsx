import { createSignal, Show } from "solid-js";
import { Link } from "@tanstack/solid-router";
import { Folder, Layers, Calendar, Edit2, Trash2 } from "lucide-solid";
import { useSettingsStore } from "@/store/settings_store";

export interface Album {
  id: number;
  name: string;
  relative_path: string;
  description?: string;
  created_at: string;
  media_count: number;
  preview_item?: {
    file_hash: string;
    current_relative_path: string;
    mime_type: string;
  };
}

interface AlbumCoverProps {
  previewItem?: Album["preview_item"];
  drivePath: string;
  albumName: string;
}

function AlbumCover(props: AlbumCoverProps) {
  const settings = useSettingsStore();
  const [hasError, setHasError] = createSignal(false);

  const displayName = () =>
    props.albumName === "unknown" ? "Unsorted Media" : props.albumName;
  const thumbUrl = () =>
    props.previewItem && settings.show_thumbnails
      ? `http://localhost:51789/media/thumb?drivePath=${encodeURIComponent(props.drivePath)}&relativePath=${encodeURIComponent(props.previewItem.current_relative_path)}&fileHash=${props.previewItem.file_hash}`
      : null;

  return (
    <Show
      when={thumbUrl() && !hasError()}
      fallback={
        <div class="w-full h-full bg-gradient-to-br from-base-200 to-base-300 flex flex-col items-center justify-center gap-2 border-b border-base-200/50">
          <Folder class="w-10 h-10 text-base-content/30 group-hover:text-primary transition-colors duration-300" />
        </div>
      }
    >
      <img
        src={thumbUrl()!}
        alt={displayName()}
        onError={() => setHasError(true)}
        class="w-full h-full object-cover transition-transform duration-500 ease-out will-change-transform transform-gpu group-hover:scale-105 pointer-events-none"
      />
    </Show>
  );
}

interface AlbumCardProps {
  album: Album;
  drivePath: string;
  onEdit?: (album: Album) => void;
  onDelete?: (album: Album) => void;
}

export function AlbumCard(props: AlbumCardProps) {
  return (
    <Link
      to="/album/$id"
      params={{ id: String(props.album.id) }}
      preload={false}
      style={{
        "content-visibility": "auto",
        "contain-intrinsic-size": "auto 320px",
      }}
      class="group flex flex-col bg-base-300/60 border border-base-200 rounded-2xl overflow-hidden shadow-lg transition-[transform,box-shadow,border-color] duration-300 ease-out hover:scale-[1.02] hover:shadow-2xl hover:border-base-300 cursor-pointer transform-gpu isolate"
    >
      <div class="aspect-[4/3] w-full relative overflow-hidden bg-base-300 flex items-center justify-center pointer-events-none">
        <AlbumCover
          previewItem={props.album.preview_item}
          drivePath={props.drivePath}
          albumName={props.album.name}
        />
        <div class="absolute bottom-3 right-3 px-2 py-1 rounded-md bg-base-300 border border-base-200/80 flex items-center gap-1.5 text-[10px] font-bold text-base-content shadow-md pointer-events-none">
          <Layers class="w-3.5 h-3.5 text-primary" />
          <span>{props.album.media_count} items</span>
        </div>
      </div>

      <div class="p-4 flex flex-col justify-between flex-grow">
        <div>
          <h4 class="text-sm font-black text-base-content leading-tight group-hover:text-primary transition-colors truncate">
            {props.album.name === "unknown"
              ? "Unsorted Media"
              : props.album.name}
          </h4>
          <span class="text-[10px] text-base-content/40 font-mono block mt-1.5 truncate">
            {props.album.relative_path}
          </span>
        </div>

        <div class="mt-4 pt-3 border-t border-base-200/60 flex items-center justify-between text-[9px] text-base-content/40 font-medium">
          <span class="flex items-center gap-1">
            <Calendar class="w-3 h-3" />
            {new Date(props.album.created_at).toLocaleDateString()}
          </span>
          <Show when={props.album.name !== "unknown"}>
            <div class="flex gap-1.5">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  props.onEdit?.(props.album);
                }}
                class="btn btn-xs btn-circle btn-ghost hover:bg-base-200"
              >
                <Edit2 class="w-3 h-3 text-base-content/60 hover:text-base-content" />
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  props.onDelete?.(props.album);
                }}
                class="btn btn-xs btn-circle btn-ghost hover:bg-error/10 text-error/60 hover:text-error"
              >
                <Trash2 class="w-3 h-3" />
              </button>
            </div>
          </Show>
        </div>
      </div>
    </Link>
  );
}
