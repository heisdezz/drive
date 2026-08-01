import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDriveStore } from "@/store/drive_store";
import { rpc } from "@/lib/rpc";
import { ChevronLeft, Info, Loader2 } from "lucide-react";
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
  const { id } = Route.useParams();
  const { albumId } = Route.useSearch();
  const navigate = useNavigate();
  const { selectedDrive } = useDriveStore();
  // useEffect(() => {
  //   console.log("page changing");
  // });
  const { data, isLoading, error } = useQuery({
    queryKey: ["mediaItem", selectedDrive?.path, id, albumId],
    queryFn: async () => {
      const res = await rpc.request.getMediaItem({
        drivePath: selectedDrive!.path,
        itemId: Number(id),
        albumId,
      });
      if (res.error) throw new Error(res.error);
      if (!res.item) throw new Error("Media item not found");
      return res;
    },
    enabled: !!selectedDrive?.path,
    retry: 3,
    retryDelay: (attempt) => attempt * 300,
  });

  const item = data?.item as MediaItem | undefined;
  const nextId = data?.nextId ?? null;
  const prevId = data?.prevId ?? null;

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }
      if (e.key === "ArrowLeft" && prevId) {
        navigate({
          to: "/item/$id",
          params: { id: String(prevId) },
          search: { albumId },
        });
      } else if (e.key === "ArrowRight" && nextId) {
        navigate({
          to: "/item/$id",
          params: { id: String(nextId) },
          search: { albumId },
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextId, prevId, albumId, navigate]);

  const fileName =
    item?.original_relative_path.split("/").pop() ||
    item?.original_relative_path ||
    "Media Viewer";

  // Stable URL — only changes when the actual media changes, not on background refetches.
  const mediaUrl = useMemo(
    () => {
      if (!item || !selectedDrive) return "";
      // Properly construct path using forward slashes for HTTP URL
      const drivePath = selectedDrive.path.replace(/\\/g, "/");
      const mediaPath = item.current_relative_path.replace(/\\/g, "/");
      const fullPath = drivePath.endsWith("/") 
        ? `${drivePath}${mediaPath}`
        : `${drivePath}/${mediaPath}`;
      const url = `http://localhost:51789/media?path=${encodeURIComponent(fullPath)}`;
      console.log("[MediaPlayer] Constructed URL:", url);
      return url;
    },
    [item?.id, item?.current_relative_path, selectedDrive?.path],
  );

  const isVideo = item?.mime_type.startsWith("video") ?? false;

  if (!selectedDrive) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center p-6">
        <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
        <h3 className="text-base-content font-bold text-lg">
          Waiting for Drive Selection...
        </h3>
        <p className="text-base-content/40 text-xs mt-1 max-w-xs">
          Please select the correct drive in the sidebar or wait for the system
          to mount it.
        </p>
        <Link to="/medias" className="btn btn-outline btn-sm mt-6">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to Catalog
        </Link>
      </div>
    );
  }

  if (isLoading && !item) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh]">
        <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
        <p className="text-base-content/40 text-xs font-bold">
          Loading media file details...
        </p>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center p-6">
        <div className="w-16 h-16 rounded-full bg-error/10 border border-error/25 flex items-center justify-center mb-4 text-error">
          <Info className="w-8 h-8" />
        </div>
        <h3 className="text-base-content font-bold text-lg">
          Unable to Load Media
        </h3>
        <p className="text-base-content/40 text-xs mt-1 max-w-sm">
          {(error as Error)?.message ||
            "The selected media item was not found in this drive's catalog database."}
        </p>
        <Link
          to="/medias"
          className="btn btn-primary btn-sm mt-6 font-bold shadow-lg shadow-primary/20"
        >
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to Catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl pb-10">
      {/* Navigation Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            if (window.history.length > 1) {
              window.history.back();
            } else if (albumId) {
              navigate({ to: "/album/$id", params: { id: String(albumId) } });
            } else {
              navigate({ to: "/medias" });
            }
          }}
          className="btn btn-sm btn-ghost border border-base-200 bg-base-300/40 text-base-content/60 hover:text-base-content flex items-center gap-1 cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <span
          className={`text-xs text-base-content/40 font-mono truncate max-w-xs md:max-w-md transition-opacity duration-300 ${isLoading ? "opacity-40" : "opacity-100"}`}
        >
          {fileName}
        </span>
      </div>

      {/* Layout Wrapper */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column: Media Player (2/3 width on desktop) */}
        <MediaPlayer
          item={item}
          drivePath={selectedDrive.path}
          mediaUrl={mediaUrl}
          fileName={fileName}
          isVideo={isVideo}
          prevId={prevId}
          nextId={nextId}
          albumId={albumId}
          loading={isLoading}
        />
        {/* Right Column: Metadata Details Panel (1/3 width) */}
        <VideoMetadata
          item={item}
          fileName={fileName}
          loading={isLoading}
          albumId={albumId}
          driveName={selectedDrive.name}
          drivePath={selectedDrive.path}
        />
      </div>

      {/* Related Media */}
      <RelatedMedia itemId={Number(id)} drivePath={selectedDrive.path} />
    </div>
  );
}
