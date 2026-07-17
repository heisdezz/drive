import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useDriveStore } from "@/store/drive_store";
import { rpc } from "@/lib/rpc";
import {
  ChevronLeft,
  ChevronRight,
  Info,
  File,
  FolderOpen,
  Calendar,
  HardDrive,
  Loader2,
  ExternalLink,
  LayoutGrid,
  Folder,
  Hash,
  Clock,
} from "lucide-react";
import { MediaCard, MediaItem } from "@/components/MediaCard";

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

function ItemViewerComponent() {
  const { id } = Route.useParams();
  const { albumId } = Route.useSearch();
  const navigate = useNavigate();
  const { selectedDrive } = useDriveStore();
  const [item, setItem] = useState<MediaItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [related, setRelated] = useState<MediaItem[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [nextId, setNextId] = useState<number | null>(null);
  const [prevId, setPrevId] = useState<number | null>(null);

  useEffect(() => {
    if (!selectedDrive?.path) return;

    let active = true;
    const loadItem = async () => {
      setLoading(true);
      setError(null);
      // The main process may briefly be busy with a scan, so a first RPC can
      // time out. A backend response (res.error / res.item) is authoritative;
      // only a thrown/timed-out request is retried with a short backoff.
      const maxAttempts = 4;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const res = await rpc.request.getMediaItem({
            drivePath: selectedDrive.path,
            itemId: Number(id),
            albumId,
          });
          if (!active) return;
          if (res.error) setError(res.error);
          else if (res.item) {
            setItem(res.item);
            setNextId(res.nextId ?? null);
            setPrevId(res.prevId ?? null);
          } else setError("Media item not found");
          setLoading(false);
          return;
        } catch (err: any) {
          if (!active) return;
          if (attempt === maxAttempts) {
            setError(err.message || "Failed to load item");
            setLoading(false);
            return;
          }
          await new Promise((r) => setTimeout(r, 300 * attempt));
        }
      }
    };

    loadItem();
    return () => {
      active = false;
    };
  }, [selectedDrive, id, albumId]);

  // Keyboard navigation support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }
      if (e.key === "ArrowLeft" && prevId) {
        navigate({ to: "/item/$id", params: { id: String(prevId) }, search: { albumId } });
      } else if (e.key === "ArrowRight" && nextId) {
        navigate({ to: "/item/$id", params: { id: String(nextId) }, search: { albumId } });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextId, prevId, albumId, navigate]);

  // Load related media (siblings from the same source folder, backfilled with
  // recent items) in parallel with the main item.
  useEffect(() => {
    if (!selectedDrive?.path) return;

    let active = true;
    const loadRelated = async () => {
      setRelatedLoading(true);
      try {
        const res = await rpc.request.getRelatedMedia({
          drivePath: selectedDrive.path,
          itemId: Number(id),
          limit: 12,
        });
        if (active && res.items) setRelated(res.items);
      } catch (err) {
        console.error("Failed to load related media:", err);
      } finally {
        if (active) setRelatedLoading(false);
      }
    };

    loadRelated();
    return () => {
      active = false;
    };
  }, [selectedDrive, id]);

  // Format filename
  const fileName =
    item?.original_relative_path.split("/").pop() ||
    item?.original_relative_path ||
    "Media Viewer";

  // Format media URL using Bun server path parameter
  const mediaUrl =
    item && selectedDrive
      ? `http://localhost:51789/media?path=${encodeURIComponent(selectedDrive.path + "/" + item.current_relative_path)}`
      : "";

  const isVideo = item?.mime_type.startsWith("video");

  const openInExternalPlayer = async () => {
    if (!item || !selectedDrive) return;
    setLaunching(true);
    setLaunchError(null);
    try {
      const res = await rpc.request.openExternal({
        drivePath: selectedDrive.path,
        relativePath: item.current_relative_path,
      });
      if (!res.success) {
        setLaunchError(res.error || "Failed to launch external player");
      }
    } catch (err: any) {
      setLaunchError(err.message || "Failed to launch external player");
    } finally {
      setLaunching(false);
    }
  };

  if (!selectedDrive) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center p-6">
        <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
        <h3 className="text-white font-bold text-lg">
          Waiting for Drive Selection...
        </h3>
        <p className="text-slate-500 text-xs mt-1 max-w-xs">
          Please select the correct drive in the sidebar or wait for the system
          to mount it.
        </p>
        <Link to="/medias" className="btn btn-outline btn-sm mt-6">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to Catalog
        </Link>
      </div>
    );
  }

  if (loading && !item) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh]">
        <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
        <p className="text-slate-500 text-xs font-bold">
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
        <h3 className="text-white font-bold text-lg">Unable to Load Media</h3>
        <p className="text-slate-500 text-xs mt-1 max-w-sm">
          {error ||
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
          className="btn btn-sm btn-ghost border border-slate-900 bg-slate-950/40 text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <span className={`text-xs text-slate-500 font-mono truncate max-w-xs md:max-w-md transition-opacity duration-300 ${loading ? 'opacity-40' : 'opacity-100'}`}>
          {fileName}
        </span>
      </div>

      {/* Layout Wrapper */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column: Media Player (2/3 width on desktop) */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-900 bg-slate-950 overflow-hidden shadow-2xl flex flex-col items-center justify-center h-[50vh] md:h-[60vh] lg:h-[65vh] p-4 relative group">
          {/* Previous item button overlay */}
          {prevId && (
            <Link
              to="/item/$id"
              params={{ id: String(prevId) }}
              search={{ albumId }}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-2.5 sm:p-3.5 rounded-full bg-slate-950/70 hover:bg-slate-900 border border-slate-800/80 hover:border-slate-700 text-slate-400 hover:text-white shadow-xl transition-all md:opacity-0 md:group-hover:opacity-100 opacity-90 duration-200 cursor-pointer flex items-center justify-center hover:scale-105 active:scale-95"
              title="Previous item (Left Arrow)"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
          )}

          {/* Next item button overlay */}
          {nextId && (
            <Link
              to="/item/$id"
              params={{ id: String(nextId) }}
              search={{ albumId }}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-2.5 sm:p-3.5 rounded-full bg-slate-950/70 hover:bg-slate-900 border border-slate-800/80 hover:border-slate-700 text-slate-400 hover:text-white shadow-lg transition-all md:opacity-0 md:group-hover:opacity-100 opacity-90 duration-200 cursor-pointer flex items-center justify-center hover:scale-105 active:scale-95"
              title="Next item (Right Arrow)"
            >
              <ChevronRight className="w-5 h-5" />
            </Link>
          )}

          {isVideo ? (
            <>
              <video
                key={item.id}
                controls
                autoPlay
                src={mediaUrl}
                className="w-full h-full max-h-[70vh] object-contain rounded-lg bg-black"
              />
              {/* Floating overlay so it never steals width from the player */}
              <button
                onClick={openInExternalPlayer}
                disabled={launching}
                className="absolute top-3 right-3 z-10 btn btn-xs btn-ghost bg-slate-950/70 backdrop-blur-md border border-slate-800 text-slate-300 hover:text-white font-bold flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Open in your system player (mpv)"
              >
                {launching ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">External Player</span>
              </button>
              {launchError && (
                <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-error text-[11px] bg-slate-950/80 px-2 py-1 rounded-md border border-error/20">
                  {launchError}
                </p>
              )}
            </>
          ) : (
            <img
              key={item.id}
              src={mediaUrl}
              alt={fileName}
              className="w-full h-full max-h-[70vh] object-contain rounded-lg shadow-lg"
            />
          )}

          {/* Transition Loading Overlay inside player */}
          {loading && (
            <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-[2px] flex flex-col items-center justify-center z-20 transition-all duration-300">
              <Loader2 className="w-8 h-8 text-primary animate-spin mb-2" />
              <p className="text-slate-400 text-xs font-bold">Loading media details...</p>
            </div>
          )}
        </div>

        {/* Right Column: Metadata Details Panel (1/3 width) */}
        <div className={`p-6 rounded-2xl bg-gradient-to-br from-slate-900/60 to-slate-950/40 border border-slate-900 shadow-xl space-y-6 transition-all duration-300 ${loading ? 'opacity-40 pointer-events-none filter blur-[0.5px]' : 'opacity-100'}`}>
          <div>
            <h3
              className="text-base font-black text-white leading-tight mb-1 truncate"
              title={fileName}
            >
              {fileName}
            </h3>
            <span className="badge badge-sm badge-secondary font-mono font-bold uppercase tracking-wider">
              {item.mime_type.split("/")[1] || item.mime_type}
            </span>
          </div>

          {/* Metadata Info Cards */}
          <div className="space-y-4 text-xs">
            {/* File size & type */}
            <div className="flex gap-3 items-start border-b border-slate-900/80 pb-3">
              <File className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  File Size
                </span>
                <span className="font-mono text-white text-xs">
                  {formatBytes(item.file_size)}
                </span>
              </div>
            </div>

            {/* Scan / Creation Date */}
            <div className="flex gap-3 items-start border-b border-slate-900/80 pb-3">
              <Calendar className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  Discovered At
                </span>
                <span className="text-white text-xs">
                  {new Date(item.created_at).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Album Link */}
            {item.album_id && (
              <div className="flex gap-3 items-start border-b border-slate-900/80 pb-3">
                <Folder className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <span className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    Album
                  </span>
                  <Link
                    to="/album/$id"
                    params={{ id: String(item.album_id) }}
                    className="text-primary hover:underline font-bold text-xs block truncate"
                  >
                    {item.album_name === "unknown" ? "Unsorted Media" : (item.album_name || "Unknown Album")}
                  </Link>
                </div>
              </div>
            )}

            {/* Storage Volume info */}
            <div className="flex gap-3 items-start border-b border-slate-900/80 pb-3">
              <HardDrive className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <span className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  Storage Volume
                </span>
                <span className="text-white text-xs block truncate font-medium">
                  {selectedDrive.name}
                </span>
                <span className="text-[9px] font-mono text-slate-500 block truncate">
                  {selectedDrive.path}
                </span>
              </div>
            </div>

            {/* Original Path before catalog sorting */}
            <div className="flex gap-3 items-start border-b border-slate-900/80 pb-3">
              <FolderOpen className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-grow">
                <span className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  Original Location
                </span>
                <p className="text-slate-400 font-mono text-[10px] select-all break-all leading-normal">
                  {item.original_relative_path}
                </p>
              </div>
            </div>

            {/* Catalog Active Sorted Path */}
            <div className="flex gap-3 items-start border-b border-slate-900/80 pb-3">
              <FolderOpen className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-grow">
                <span className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  Active Catalog Path
                </span>
                <p className="text-slate-300 font-mono text-[10px] select-all break-all leading-normal">
                  {item.current_relative_path}
                </p>
              </div>
            </div>

            {/* Full MIME Type */}
            <div className="flex gap-3 items-start border-b border-slate-900/80 pb-3">
              <File className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  Full MIME Type
                </span>
                <span className="font-mono text-slate-300 text-xs">
                  {item.mime_type}
                </span>
              </div>
            </div>

            {/* File Hash Identifier */}
            <div className="flex gap-3 items-start border-b border-slate-900/80 pb-3">
              <Hash className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <span className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  File Hash Identifier
                </span>
                <span className="font-mono text-slate-400 text-[10px] select-all break-all leading-normal">
                  {item.file_hash}
                </span>
              </div>
            </div>

            {/* Video Duration */}
            {item.duration_seconds !== null && item.duration_seconds !== undefined && (
              <div className="flex gap-3 items-start border-b border-slate-900/80 pb-3">
                <Clock className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <span className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    Duration
                  </span>
                  <span className="text-white text-xs">
                    {formatDuration(item.duration_seconds)}
                  </span>
                </div>
              </div>
            )}

            {/* Embedded Metadata JSON */}
            {(() => {
              let extraMeta: Record<string, any> = {};
              if (item.metadata_json) {
                try {
                  extraMeta = JSON.parse(item.metadata_json);
                } catch (e) {
                  // Ignore
                }
              }
              const keys = Object.keys(extraMeta);
              if (keys.length === 0) return null;
              return (
                <div className="border-t border-slate-900/80 pt-4 mt-4 space-y-3">
                  <h4 className="text-[10px] uppercase font-black text-slate-400 tracking-wider">
                    Embedded Metadata
                  </h4>
                  {keys.map((key) => (
                    <div key={key} className="flex justify-between items-start gap-2 border-b border-slate-900/50 pb-1.5 last:border-0 last:pb-0">
                      <span className="text-slate-500 font-mono text-[10px]">{key}</span>
                      <span className="text-white font-mono text-[10px] break-all select-all text-right">
                        {typeof extraMeta[key] === "object" ? JSON.stringify(extraMeta[key]) : String(extraMeta[key])}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          <Link
            to={albumId ? "/album/$id" : "/medias"}
            params={albumId ? { id: String(albumId) } : undefined}
            className="btn btn-outline btn-sm w-full font-bold"
          >
            {albumId ? "Return to Album" : "Return to Catalog List"}
          </Link>
        </div>
      </div>

      {/* Related Media */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-black tracking-wider text-slate-300 uppercase">
            Related Media
          </h3>
          {relatedLoading ? (
            <Loader2 className="w-3.5 h-3.5 text-slate-500 animate-spin" />
          ) : related.length > 0 && (
            <span className="badge badge-sm badge-outline border-slate-800 text-slate-500 font-bold">
              {related.length}
            </span>
          )}
        </div>

        {relatedLoading && related.length === 0 ? (
          <div className="flex items-center gap-2 text-slate-500 text-xs py-8">
            <Loader2 className="w-4 h-4 animate-spin" /> Finding related media...
          </div>
        ) : related.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-slate-900/20 border border-slate-900/50 text-slate-600 text-xs">
            No related media found in this folder.
          </div>
        ) : (
          <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 transition-opacity duration-300 ${relatedLoading ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
            {related.map((r) => (
              <MediaCard key={r.id} item={r} drivePath={selectedDrive.path} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
