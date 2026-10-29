import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { Link, useNavigate } from "@tanstack/solid-router";
import {
  Image as ImageIcon,
  Film as FilmIcon,
  Play,
  Folder,
  ExternalLink,
  CheckSquare,
  FolderInput,
  Trash2,
} from "lucide-solid";
import { useSelectionStore } from "@/store/selection_store";
import { useSettingsStore } from "@/store/settings_store";
import { AppContextMenu } from "@/components/AppContextMenu";

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
  selectable?: boolean;
  onMove?: (itemId: number) => void;
  onDelete?: (itemId: number) => void;
}

export function MediaCard(props: MediaCardProps) {
  const navigate = useNavigate();
  const settings = useSettingsStore();
  const selection = useSelectionStore();
  const [hasError, setHasError] = createSignal(false);
  const [inView, setInView] = createSignal(false);
  let containerRef: HTMLDivElement | undefined;

  onMount(() => {
    if (!containerRef || !settings.show_thumbnails) {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(containerRef);
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
  const selectItem = () => {
    if (!selection.isSelecting) {
      selection.start();
      selection.selectMany([props.item.id]);
    } else {
      selection.toggle(props.item.id);
    }
  };
  return (
    <AppContextMenu
      label={`Actions for ${fileName()}`}
      actions={[
        {
          label: "Open media",
          icon: <ExternalLink class="h-4 w-4" />,
          onSelect: () =>
            navigate({
              to: "/item/$id",
              params: { id: String(props.item.id) },
              search: props.albumId ? { albumId: props.albumId } : undefined,
            }),
        },
        ...(props.item.album_id || props.albumId
          ? [
              {
                label: "Open album",
                icon: <Folder class="h-4 w-4" />,
                onSelect: () =>
                  navigate({
                    to: "/album/$id",
                    params: {
                      id: String(props.albumId ?? props.item.album_id),
                    },
                  }),
              },
            ]
          : []),
        ...(props.selectable
          ? [
              {
                label: isSelected() ? "Deselect media" : "Select media",
                icon: <CheckSquare class="h-4 w-4" />,
                onSelect: selectItem,
                separatorBefore: true,
              },
            ]
          : []),
        ...(props.onMove
          ? [
              {
                label: "Move to album",
                icon: <FolderInput class="h-4 w-4" />,
                onSelect: () => props.onMove?.(props.item.id),
              },
            ]
          : []),
        ...(props.onDelete
          ? [
              {
                label: "Delete media",
                icon: <Trash2 class="h-4 w-4" />,
                onSelect: () => props.onDelete?.(props.item.id),
                destructive: true,
                separatorBefore: true,
              },
            ]
          : []),
      ]}
      trigger={
        <Link
          to="/item/$id"
          params={{ id: String(props.item.id) }}
          search={props.albumId ? { albumId: props.albumId } : undefined}
          preload={false}
          onClick={handleClick}
          data-selected={isSelected() ? "true" : "false"}
          class="group relative block aspect-square overflow-hidden rounded-xl border border-base-200 bg-base-300 shadow-md cursor-pointer hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary data-[selected=true]:ring-2 data-[selected=true]:ring-primary data-[selected=true]:border-primary isolate"
        >
          {/* Media content */}
          <div
            ref={(el) => (containerRef = el)}
            class="absolute inset-0 flex items-center justify-center bg-base-300 overflow-hidden pointer-events-none overflow-hidden"
          >
            <Show
              when={settings.show_thumbnails && !hasError() && inView()}
              fallback={
                <div class="flex flex-col items-center justify-center text-base-content/40 gap-2">
                  <div
                    class={`p-4 rounded-full ${isVideo() ? "bg-info/10 text-info" : "bg-secondary/10 text-secondary"}`}
                  >
                    <Show
                      when={isVideo()}
                      fallback={<ImageIcon class="w-8 h-8" />}
                    >
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
                loading="lazy"
                onError={() => setHasError(true)}
                class="block w-full h-full object-cover"
              />
            </Show>
          </div>
          {/* Media type badge */}
          <div class="absolute top-3 right-3 px-2 py-1 rounded-md bg-base-300 border border-base-200/80 flex items-center gap-1 text-[9px] font-bold text-base-content shadow-md pointer-events-none z-20">
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
                class="checkbox checkbox-primary border-2 border-base-content/60 checked:border-primary bg-base-300 checkbox-sm cursor-pointer shadow-lg"
              />
            </div>
          </Show>
          {/* Album badge */}
          <Show when={props.item.album_name && !selection.isSelecting}>
            <div class="absolute top-3 left-3 px-2 py-1 rounded-md bg-base-300 border border-base-200/80 text-[9px] font-bold text-base-content shadow-md z-20 pointer-events-none truncate max-w-[60%] flex items-center gap-1">
              <Folder class="w-2.5 h-2.5 text-primary fill-primary/10 shrink-0" />
              <span class="truncate">
                {props.item.album_name === "unknown"
                  ? "Unsorted Media"
                  : props.item.album_name}
              </span>
            </div>
          </Show>
          {/* Details stay below the badges and are visible for keyboard and touch input. */}
          <div class="absolute inset-x-0 bottom-0 z-10 bg-linear-0 via-base-100/50 from-base-100 px-3 py-2.5 pointer-events-none opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100 ">
            <h4
              class="text-xs font-black text-base-content truncate leading-tight mb-1"
              title={fileName()}
            >
              {fileName()}
            </h4>
            <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-base-content/70 font-medium">
              <span>{(props.item.file_size / 1024 / 1024).toFixed(2)} MB</span>
              <span>
                {new Date(props.item.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </Link>
      }
    />
  );
}
