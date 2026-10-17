import { createSignal, Show } from "solid-js";
import { Link, useNavigate } from "@tanstack/solid-router";
import { Folder, Layers, Calendar, Edit2, Trash2, FolderInput, ExternalLink, CheckSquare } from "lucide-solid";
import { useSettingsStore } from "@/store/settings_store";
import { AppContextMenu } from "@/components/AppContextMenu";

export interface Album {
  id: number;
  name: string;
  relative_path: string;
  description: string | null;
  created_at: string;
  media_count: number;
  preview_item?: {
    id: number;
    file_hash: string;
    original_relative_path: string;
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
        loading="lazy"
        onError={() => setHasError(true)}
        class="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105 pointer-events-none"
      />
    </Show>
  );
}

interface AlbumCardProps {
  album: Album;
  drivePath: string;
  onEdit?: (album: Album) => void;
  onDelete?: (album: Album) => void;
  onMerge?: (album: Album) => void;
  selecting?: boolean;
  selected?: boolean;
  onSelect?: (album: Album) => void;
}

export function AlbumCard(props: AlbumCardProps) {
  const navigate = useNavigate();
  return (
    <AppContextMenu
      label={`Actions for ${props.album.name === "unknown" ? "Unsorted Media" : props.album.name}`}
      actions={[
        { label: "Open album", icon: <ExternalLink class="h-4 w-4" />, onSelect: () => navigate({ to: "/album/$id", params: { id: String(props.album.id) } }) },
        { label: props.selected ? "Deselect album" : "Select album", icon: <CheckSquare class="h-4 w-4" />, onSelect: () => props.onSelect?.(props.album), disabled: !props.onSelect },
        { label: "Edit album", icon: <Edit2 class="h-4 w-4" />, onSelect: () => props.onEdit?.(props.album), disabled: props.album.name === "unknown" || !props.onEdit, separatorBefore: true },
        { label: "Merge into…", icon: <FolderInput class="h-4 w-4" />, onSelect: () => props.onMerge?.(props.album), disabled: props.album.name === "unknown" || !props.onMerge },
        { label: "Delete album", icon: <Trash2 class="h-4 w-4" />, onSelect: () => props.onDelete?.(props.album), disabled: props.album.name === "unknown" || !props.onDelete, destructive: true, separatorBefore: true },
      ]}
      trigger={
    <Link
      to="/album/$id"
      params={{ id: String(props.album.id) }}
      preload={false}
      onClick={(event) => {
        if (props.selecting) {
          event.preventDefault();
          props.onSelect?.(props.album);
        }
      }}
      onKeyDown={(event) => {
        if (props.selecting && event.key === " ") {
          event.preventDefault();
          props.onSelect?.(props.album);
        }
      }}
      role={props.selecting ? "button" : undefined}
      aria-label={props.selecting ? `${props.selected ? "Deselect" : "Select"} ${props.album.name === "unknown" ? "Unsorted Media" : props.album.name}` : undefined}
      aria-pressed={props.selecting ? props.selected : undefined}
      data-selected={props.selected ? "true" : "false"}
      style={{
        "content-visibility": "auto",
        "contain-intrinsic-size": "auto 320px",
      }}
      class="group flex flex-col bg-base-300/60 border border-base-200 rounded-2xl overflow-hidden shadow-lg transition-[transform,box-shadow,border-color] duration-300 ease-out hover:scale-[1.02] hover:shadow-2xl hover:border-base-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary data-[selected=true]:ring-2 data-[selected=true]:ring-primary data-[selected=true]:border-primary"
    >
      <div class="aspect-[4/3] w-full relative overflow-hidden bg-base-300 flex items-center justify-center pointer-events-none">
        <AlbumCover
          previewItem={props.album.preview_item}
          drivePath={props.drivePath}
          albumName={props.album.name}
        />
        <Show when={props.selecting}>
          <span aria-hidden="true" class={`absolute left-3 top-3 flex h-6 w-6 items-center justify-center rounded-md border-2 shadow-md ${props.selected ? "border-primary bg-primary text-primary-content" : "border-base-content/70 bg-base-300/90 text-transparent"}`}>
            <CheckSquare class="h-4 w-4" />
          </span>
        </Show>
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
          <Show when={props.album.name !== "unknown" && !props.selecting}>
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
      }
    />
  );
}
