import {
  createFileRoute,
  Link,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/solid-router";
import { onMount, onCleanup, createMemo, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { useDriveStore } from "@/store/drive_store";
import { rpc } from "@/lib/rpc";
import { ChevronLeft, Info, Loader2 } from "lucide-solid";
import type { MediaItem } from "@/components/MediaCard";
import { MediaPlayer } from "@/components/MediaPlayer";
import RelatedMedia from "@/components/RelatedMedia";
import VideoMetadata from "@/components/VideoMetadata";

interface ItemSearch {
  albumId?: number;
}

export const Route = createFileRoute("/item/$id/")({
  component: ItemViewerComponent,
  validateSearch: (search: Record<string, unknown>): ItemSearch => {
    return {
      albumId: search.albumId ? Number(search.albumId) : undefined,
    };
  },
});

function ItemViewerComponent() {
  const params = useParams({ from: Route.id });
  const search = useSearch({ from: Route.id });
  const navigate = useNavigate();
  const drive = useDriveStore();

  const id = () => params().id;
  const albumId = () => search().albumId;

  const itemQuery = createQuery(() => {
    const currentId = id();
    const currentAlbumId = albumId();
    const path = drive.selectedDrive?.path;

    return {
      queryKey: ["mediaItem", path, currentId, currentAlbumId],
      queryFn: async () => {
        if (!path) throw new Error("No active drive");
        const res = await rpc.request.getMediaItem({
          drivePath: path,
          itemId: Number(currentId),
          albumId: currentAlbumId,
        });
        if (res.error) throw new Error(res.error);
        if (!res.item) throw new Error("Media item not found");
        return res;
      },
      enabled: !!path && !!currentId,
      retry: 3,
      retryDelay: (attempt: number) => attempt * 300,
    };
  });

  const item = () => itemQuery.data?.item as MediaItem | undefined;
  const nextId = () => itemQuery.data?.nextId ?? null;
  const prevId = () => itemQuery.data?.prevId ?? null;

  // Keyboard navigation
  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (active?.tagName === "INPUT" || active?.tagName === "TEXTAREA") {
        return;
      }
      const prev = prevId();
      const next = nextId();
      const currentAlbumId = albumId();

      if (e.key === "ArrowLeft" && prev) {
        navigate({
          to: "/item/$id",
          params: { id: String(prev) },
          search: { albumId: currentAlbumId },
        });
      } else if (e.key === "ArrowRight" && next) {
        navigate({
          to: "/item/$id",
          params: { id: String(next) },
          search: { albumId: currentAlbumId },
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
  });

  const fileName = () => {
    const it = item();
    return (
      it?.original_relative_path.split("/").pop() ||
      it?.original_relative_path ||
      "Media Viewer"
    );
  };

  const mediaUrl = createMemo(() => {
    const it = item();
    const d = drive.selectedDrive;
    if (!it || !d) return "";
    const drivePath = d.path.replace(/\\/g, "/");
    const mediaPath = it.current_relative_path.replace(/\\/g, "/");
    const fullPath = drivePath.endsWith("/")
      ? `${drivePath}${mediaPath}`
      : `${drivePath}/${mediaPath}`;
    return `http://localhost:51789/media?path=${encodeURIComponent(fullPath)}`;
  });

  const isVideo = () => item()?.mime_type.startsWith("video") ?? false;

  return (
    <Show
      when={drive.selectedDrive}
      fallback={
        <div class="flex flex-col items-center justify-center min-h-[70vh] text-center p-6">
          <Loader2 class="w-8 h-8 text-primary animate-spin mb-4" />
          <h3 class="text-base-content font-bold text-lg">
            Waiting for Drive Selection...
          </h3>
          <p class="text-base-content/40 text-xs mt-1 max-w-xs">
            Please select the correct drive in the sidebar or wait for the
            system to mount it.
          </p>
          <Link to="/medias" class="btn btn-outline btn-sm mt-6">
            <ChevronLeft class="w-4 h-4 mr-1" /> Back to Catalog
          </Link>
        </div>
      }
    >
      <Show
        when={!itemQuery.isLoading || item()}
        fallback={
          <div class="flex flex-col items-center justify-center min-h-[70vh]">
            <Loader2 class="w-10 h-10 text-primary animate-spin mb-4" />
            <p class="text-base-content/40 text-xs font-bold">
              Loading media file details...
            </p>
          </div>
        }
      >
        <Show
          when={!itemQuery.error && item()}
          fallback={
            <div class="flex flex-col items-center justify-center min-h-[70vh] text-center p-6">
              <div class="w-16 h-16 rounded-full bg-error/10 border border-error/25 flex items-center justify-center mb-4 text-error">
                <Info class="w-8 h-8" />
              </div>
              <h3 class="text-base-content font-bold text-lg">
                Unable to Load Media
              </h3>
              <p class="text-base-content/40 text-xs mt-1 max-w-sm">
                {(itemQuery.error as Error)?.message ||
                  "The selected media item was not found in this drive's catalog database."}
              </p>
              <Link
                to="/medias"
                class="btn btn-primary btn-sm mt-6 font-bold shadow-lg shadow-primary/20"
              >
                <ChevronLeft class="w-4 h-4 mr-1" /> Back to Catalog
              </Link>
            </div>
          }
        >
          <div class="space-y-6 max-w-6xl pb-10">
            {/* Navigation Header */}
            <div class="flex items-center gap-3">
              <button
                onClick={() => {
                  if (window.history.length > 1) {
                    window.history.back();
                  } else if (albumId()) {
                    navigate({
                      to: "/album/$id",
                      params: { id: String(albumId()) },
                    });
                  } else {
                    navigate({ to: "/medias" });
                  }
                }}
                class="btn btn-sm btn-ghost border border-base-200 bg-base-300/40 text-base-content/60 hover:text-base-content flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft class="w-4 h-4" /> Back
              </button>
              <span
                class={`text-xs text-base-content/40 font-mono truncate max-w-xs md:max-w-md transition-opacity duration-300 ${itemQuery.isLoading ? "opacity-40" : "opacity-100"}`}
              >
                {fileName()}
              </span>
            </div>

            {/* Layout Wrapper */}
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              {/* Left Column: Media Player (2/3 width on desktop) */}
              <MediaPlayer
                item={item()!}
                drivePath={drive.selectedDrive!.path}
                mediaUrl={mediaUrl()}
                fileName={fileName()}
                isVideo={isVideo()}
                prevId={prevId()}
                nextId={nextId()}
                albumId={albumId()}
                loading={itemQuery.isLoading}
              />
              {/* Right Column: Metadata Details Panel (1/3 width) */}
              <VideoMetadata
                item={item()!}
                fileName={fileName()}
                loading={itemQuery.isLoading}
                albumId={albumId()}
                driveName={drive.selectedDrive!.name}
                drivePath={drive.selectedDrive!.path}
              />
            </div>

            {/* Related Media */}
            <RelatedMedia
              itemId={Number(id())}
              drivePath={drive.selectedDrive!.path}
            />
          </div>
        </Show>
      </Show>
    </Show>
  );
}
