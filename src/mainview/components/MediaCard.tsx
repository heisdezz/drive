import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { Link } from "@tanstack/solid-router";
import {
  Image as ImageIcon,
  Film as FilmIcon,
  Play,
  Folder,
} from "lucide-solid";
import { useSelectionStore } from "@/store/selection_store";
import { useSettingsStore } from "@/store/settings_store";

export interface MediaItem {
  id: number;
  file_hash: string;
  original_relative_path: string;
  current_relative_path: string;
  file_size: number;
  mime_type: string;
  created_at: string;
  album_id?: number | null;
  album_name?: string | null;
  album_relative_path?: string | null;
  duration_seconds?: number | null;
  metadata_json?: string | null;
}

interface MediaCardProps {
  item: MediaItem;
  drivePath: string;
  albumId?: number;
  onClick?: (e: MouseEvent) => void;
}

export function MediaCard(props: MediaCardProps) {
  const settings = useSettingsStore();
  const selection = useSelectionStore();
  const [hasError, setHasError] = createSignal(false);
  const [inView, setInView] = createSignal(false);
  let cardRef: HTMLAnchorElement | undefined;

  onMount(() => {
    if (!cardRef || !settings.show_thumbnails) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(cardRef);
    onCleanup(() => observer.disconnect());
  });

  const isVideo = () => props.item.mime_type.startsWith("video");

  const fileName = () =>
    props.item.original_relative_path.split("/").pop() ||
    props.item.original_relative_path;

  const thumbUrl = () =>
    `http://localhost:51789/media/thumb?drivePath=${encodeURIComponent(props.drivePath)}&relativePath=${encodeURIComponent(props.item.current_relative_path)}&fileHash=${props.item.file_hash}`;

  const isSelected = () => selection.selected.has(props.item.id);

  const handleClick = (e: MouseEvent) => {
    if (selection.isSelecting) {
      e.preventDefault();
      e.stopPropagation();
      selection.toggle(props.item.id);
    } else if (props.onClick) {
      props.onClick(e);
    }
  };

  return (
    <Link
      ref={cardRef}
      to="/item/$id"
      params={{ id: String(props.item.id) }}
      search={props.albumId ? { albumId: props.albumId } : undefined}
      preload={false}
      onClick={handleClick}
      data-selected={isSelected() ? "true" : "false"}
      class="group relative rounded-2xl overflow-hidden bg-base-300/60 border shadow-lg aspect-square flex flex-col justify-end transition-[box-shadow,border-color] duration-300 hover:shadow-2xl cursor-pointer border-base-200 hover:border-base-300 data-[selected=true]:ring-2 data-[selected=true]:ring-primary data-[selected=true]:border-primary data-[selected=true]:hover:border-primary transform-gpu isolate"
    >
      {/* Media content */}
      <div class="absolute inset-0 flex items-center justify-center bg-base-300 overflow-hidden pointer-events-none">
        <Show
          when={settings.show_thumbnails && !hasError() && inView()}
          fallback={
            <div class="flex flex-col items-center justify-center text-base-content/40 gap-2">
              <div
                class={`p-4 rounded-full ${isVideo() ? "bg-info/10 text-info" : "bg-secondary/10 text-secondary"}`}
              >
                <Show when={isVideo()} fallback={<ImageIcon class="w-8 h-8" />}>
                  <FilmIcon class="w-8 h-8" />
                </Show>
              </div>
              <span class="text-[10px] font-mono truncate max-w-[80%] px-2 text-center text-base-content/60">
                {fileName()}
              </span>
            </div>
          }
        >
          <img
            src={thumbUrl()}
            alt={fileName()}
            onError={() => setHasError(true)}
            class="w-full h-full object-cover transition-transform duration-300 ease-out will-change-transform transform-gpu group-hover:scale-105"
          />
        </Show>
      </div>

      {/* Media type badge */}
      <div class="absolute top-3 right-3 px-2 py-1 rounded-md bg-base-300/90 backdrop-blur-sm border border-base-200/80 flex items-center gap-1 text-[9px] font-bold text-base-content shadow-md pointer-events-none z-10">
        <Show
          when={isVideo()}
          fallback={
            <>
              <ImageIcon class="w-2.5 h-2.5 text-info" /> IMAGE
            </>
          }
        >
          <Play class="w-2.5 h-2.5 text-secondary fill-secondary" /> VIDEO
        </Show>
      </div>

      {/* Selection checkbox */}
      <Show when={selection.isSelecting}>
        <div class="absolute top-3 left-3 z-30 flex items-center pointer-events-auto">
          <input
            type="checkbox"
            checked={isSelected()}
            readOnly
            class="checkbox checkbox-primary border-2 border-base-content/60 checked:border-primary bg-base-300/90 checkbox-sm cursor-pointer shadow-lg"
          />
        </div>
      </Show>

      {/* Album badge */}
      <Show when={props.item.album_name && !selection.isSelecting}>
        <div class="absolute top-3 left-3 px-2 py-1 rounded-md bg-base-300/90 backdrop-blur-sm border border-base-200/80 text-[9px] font-bold text-base-content shadow-md z-10 pointer-events-none truncate max-w-[60%] flex items-center gap-1">
          <Folder class="w-2.5 h-2.5 text-primary fill-primary/10 shrink-0" />
          <span class="truncate">
            {props.item.album_name === "unknown"
              ? "Unsorted Media"
              : props.item.album_name}
          </span>
        </div>
      </Show>

      {/* Info overlay (visible on hover) */}
      <div class="absolute inset-0 bg-gradient-to-t from-base-300/95 via-base-300/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 ease-out flex flex-col justify-end p-4 pointer-events-none z-10">
        <h4
          class="text-xs font-black text-base-content truncate leading-tight mb-1"
          title={fileName()}
        >
          {fileName()}
        </h4>
        <div class="flex items-center justify-between text-[9px] text-base-content/70 font-medium">
          <span>{(props.item.file_size / 1024 / 1024).toFixed(2)} MB</span>
          <span>{new Date(props.item.created_at).toLocaleDateString()}</span>
        </div>
      </div>
    </Link>
  );
}
