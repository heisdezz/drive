import { useEffect, useState, useRef } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useDriveStore } from "@/store/drive_store";
import { rpc } from "@/lib/rpc";
import { MediaCard, MediaItem } from "@/components/MediaCard";
import { Pagination } from "@/components/Pagination";
import {
  Compass,
  HardDrive,
  Info,
  Loader2,
  Image as ImageIcon,
  ChevronLeft,
  Calendar,
  FolderOpen,
  FolderPlus,
} from "lucide-react";
import { LegendList } from "@legendapp/list/react";
import DialogModal, { ModalHandle } from "@/components/DialogModal";

interface AlbumSearch {
  page?: number;
  limit?: number;
}

export const Route = createFileRoute("/album/$id/")({
  component: AlbumDetailComponent,
  validateSearch: (search: Record<string, unknown>): AlbumSearch => {
    return {
      page: Number(search.page) || 0,
      limit: Number(search.limit) || 100,
    };
  },
});

function AlbumDetailComponent() {
  const { selectedDrive, fetchDrives } = useDriveStore();
  const { id } = Route.useParams();
  const { page = 0, limit = 100 } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const [album, setAlbum] = useState<{ id: number; name: string; relative_path: string; created_at: string } | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [albums, setAlbums] = useState<any[]>([]);
  const [targetAlbumId, setTargetAlbumId] = useState<number | null>(null);
  const [moving, setMoving] = useState(false);
  const modalRef = useRef<ModalHandle>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const albumId = Number(id);

  const setPage = (newPage: number) => {
    navigate({ search: (prev) => ({ ...prev, page: newPage }) });
  };

  const handleLimitChange = (newLimit: number) => {
    navigate({ search: (prev) => ({ ...prev, page: 0, limit: newLimit }) });
  };

  const toggleItemSelection = (itemId: number) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleOpenMoveModal = async () => {
    if (!selectedDrive?.path) return;
    try {
      const res = await rpc.request.getAlbums({ drivePath: selectedDrive.path });
      if (res.albums && !res.error) {
        setAlbums(res.albums);
      }
      modalRef.current?.open();
    } catch (err) {
      console.error("Failed to fetch albums for selection:", err);
    }
  };

  const handleMoveItems = async () => {
    if (!selectedDrive?.path || selectedItems.size === 0 || !targetAlbumId) return;
    setMoving(true);
    try {
      const res = await rpc.request.moveMediaItemsToAlbum({
        drivePath: selectedDrive.path,
        mediaIds: Array.from(selectedItems),
        targetAlbumId,
      });
      if (res.success) {
        modalRef.current?.close();
        setSelectedItems(new Set());
        setIsSelecting(false);
        setTargetAlbumId(null);
        setRefreshTrigger((prev) => prev + 1);
      } else {
        alert(`Failed to move: ${res.error}`);
      }
    } catch (err: any) {
      console.error(err);
      alert(`Error moving items: ${err.message}`);
    } finally {
      setMoving(false);
    }
  };

  useEffect(() => {
    if (!selectedDrive?.path || isNaN(albumId)) return;
    
    let active = true;
    const fetchAlbumData = async () => {
      setLoading(true);
      setError(null);
      try {
        const albumRes = await rpc.request.getAlbum({
          drivePath: selectedDrive.path,
          albumId,
        });

        if (albumRes.error) {
          if (active) setError(albumRes.error);
          return;
        }

        if (albumRes.album) {
          if (active) setAlbum(albumRes.album);

          const mediaRes = await rpc.request.getAlbumMedia({
            drivePath: selectedDrive.path,
            albumId,
            limit: limit,
            offset: page * limit,
          });

          if (active) {
            if (mediaRes.error) {
              setError(mediaRes.error);
            } else {
              setMediaItems(mediaRes.items as MediaItem[]);
              setTotalItems(mediaRes.total);
            }
          }
        } else {
          if (active) setError("Album details not found.");
        }
      } catch (err: any) {
        console.error("Failed to load album media details:", err);
        if (active) setError(err.message || "Failed to load album data");
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchAlbumData();

    return () => {
      active = false;
    };
  }, [selectedDrive?.path, albumId, page, limit, refreshTrigger]);

  // Case 1: No drive is selected
  if (!selectedDrive) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 sm:p-12">
        <div className="w-20 h-20 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-6 shadow-xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          <Compass className="w-10 h-10 text-slate-500 group-hover:text-primary transition-colors duration-300" />
        </div>
        <h3 className="text-2xl font-black text-white mb-2">
          No Drive Selected
        </h3>
        <p className="text-slate-400 text-sm max-w-sm leading-relaxed mb-6">
          Please select a connected drive or storage volume from the sidebar to inspect cataloged albums.
        </p>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/60 border border-slate-900 text-[10px] text-slate-500 font-medium">
          <Info className="w-3.5 h-3.5" />
          Select a drive then scan it under the Discover tab.
        </div>
      </div>
    );
  }

  // Case 2: Selected drive is unmounted
  if (selectedDrive.status === "unmounted") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 sm:p-12">
        <div className="w-20 h-20 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-6 shadow-xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/10 to-transparent opacity-100 transition-opacity duration-300"></div>
          <HardDrive className="w-10 h-10 text-slate-500 group-hover:text-amber-400 transition-colors duration-300 animate-pulse" />
        </div>
        <h3 className="text-2xl font-black text-white mb-2">
          {selectedDrive.name} is Unmounted
        </h3>
        <p className="text-slate-400 text-sm max-w-sm leading-relaxed mb-6">
          This storage device needs to be mounted before you can view its albums.
        </p>
        <button
          onClick={async () => {
            try {
              const res = await rpc.request.mountBlockDevice({
                deviceId: selectedDrive.id,
              });
              if (res.success && res.mountPath) {
                await fetchDrives();
              } else {
                alert(`Failed to mount: ${res.error}`);
              }
            } catch (err: any) {
              console.error(err);
            }
          }}
          className="btn btn-primary px-8 font-bold text-sm tracking-wide shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          Mount Drive
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 max-w-5xl">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (window.history.length > 1) {
                window.history.back();
              } else {
                navigate({ to: "/albums" });
              }
            }}
            className="btn btn-sm btn-ghost gap-1.5 font-bold text-xs text-slate-400 hover:text-white cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Back
          </button>
        </div>
        <div className="p-12 text-center rounded-2xl bg-slate-900/20 border border-slate-900/50">
          <Info className="w-12 h-12 text-error mx-auto mb-4" />
          <h3 className="text-white font-bold">Error Loading Album</h3>
          <p className="text-slate-500 text-xs mt-1.5 max-w-sm mx-auto">
            {error}
          </p>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(totalItems / limit);

  // Chunk helper for LegendList grid layout
  const chunk = <T,>(arr: T[], size: number): T[][] => {
    const chunked: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunked.push(arr.slice(i, i + size));
    }
    return chunked;
  };

  const chunkedMedias = chunk(mediaItems, 4);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Navigation / Breadcrumb */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            if (window.history.length > 1) {
              window.history.back();
            } else {
              navigate({ to: "/albums" });
            }
          }}
          className="btn btn-sm btn-ghost gap-1.5 font-bold text-xs text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Back
        </button>
      </div>

      {/* Album Header Block */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900/60 to-slate-950/40 border border-slate-900 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-primary to-indigo-500 flex items-center justify-center shadow-lg shadow-primary/15 flex-shrink-0">
            <FolderOpen className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white leading-tight">
              {album?.name === "unknown" ? "Unsorted Media" : (album?.name || "Loading Album...")}
            </h2>
            <span className="text-[10px] font-mono text-slate-500 uppercase font-bold tracking-wider block mt-0.5">
              {album?.relative_path} · {totalItems} items
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-3 ml-auto md:ml-0">
          {album && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-[10px] text-slate-400 font-mono">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>Indexed: {new Date(album.created_at).toLocaleDateString()}</span>
            </div>
          )}
          
          {isSelecting && mediaItems.length > 0 && (
            <button
              onClick={() => {
                const allVisibleSelected = mediaItems.every((item) => selectedItems.has(item.id));
                if (allVisibleSelected) {
                  setSelectedItems((prev) => {
                    const next = new Set(prev);
                    mediaItems.forEach((item) => next.delete(item.id));
                    return next;
                  });
                } else {
                  setSelectedItems((prev) => {
                    const next = new Set(prev);
                    mediaItems.forEach((item) => next.add(item.id));
                    return next;
                  });
                }
              }}
              className="btn btn-sm btn-outline border-slate-800 text-slate-300 font-bold hover:bg-slate-900 cursor-pointer"
            >
              {mediaItems.every((item) => selectedItems.has(item.id)) ? "Deselect All" : "Select All"}
            </button>
          )}

          <button
            onClick={() => {
              setIsSelecting(!isSelecting);
              setSelectedItems(new Set());
            }}
            className={`btn btn-sm font-bold shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer ${
              isSelecting ? "btn-secondary text-white" : "btn-outline border-slate-800 text-slate-300"
            }`}
          >
            {isSelecting ? "Cancel" : "Select Items"}
          </button>
        </div>
      </div>

      {/* Control Bar */}
      <div className="flex justify-end items-center gap-2 bg-slate-950/50 border border-slate-900 px-4 py-2.5 rounded-xl shadow-md">
        <span className="text-xs text-slate-400 font-medium">Items per page:</span>
        <select
          value={limit}
          onChange={(e) => handleLimitChange(Number(e.target.value))}
          className="select select-bordered select-xs text-xs rounded-lg bg-slate-900/60 border-slate-800 text-slate-300 focus:outline-none focus:border-primary/60 cursor-pointer"
        >
          {[10, 20, 40, 80, 100, 160, 240, 320, 400, 480, 560, 640].map((val) => (
            <option key={val} value={val}>
              {val}
            </option>
          ))}
        </select>
      </div>

      {/* Media Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] py-12">
          <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
          <p className="text-xs text-slate-500 font-bold">
            Loading Album Content...
          </p>
        </div>
      ) : mediaItems.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-slate-900/20 border border-slate-900/50">
          <ImageIcon className="w-12 h-12 text-slate-700 mx-auto mb-4" />
          <h3 className="text-white font-bold">No Items Found</h3>
          <p className="text-slate-500 text-xs mt-1.5 max-w-sm mx-auto">
            This album is currently empty.
          </p>
        </div>
      ) : (
        <LegendList<MediaItem[]>
          data={chunkedMedias}
          estimatedItemSize={290}
          keyExtractor={(_: MediaItem[], index: number) => `row-${index}`}
          renderItem={({ item: rowItems }: { item: MediaItem[] }) => (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-4">
              {rowItems.map((item: MediaItem) => (
                <div key={item.id} className="relative">
                  {isSelecting && (
                    <div className="absolute top-3 left-3 z-30">
                      <input
                        type="checkbox"
                        checked={selectedItems.has(item.id)}
                        onChange={() => toggleItemSelection(item.id)}
                        className="checkbox checkbox-primary bg-slate-950/80 border-slate-700 checkbox-sm cursor-pointer shadow-md"
                      />
                    </div>
                  )}
                  <MediaCard
                    item={item}
                    drivePath={selectedDrive.path}
                    albumId={albumId}
                    onClick={(e) => {
                      if (isSelecting) {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleItemSelection(item.id);
                      }
                    }}
                  />
                </div>
              ))}
              {rowItems.length < 4 &&
                Array.from({ length: 4 - rowItems.length }).map((_, idx) => (
                  <div key={`empty-${idx}`} className="hidden md:block"></div>
                ))
              }
            </div>
          )}
        />
      )}

      {/* Pagination Footer */}
      <Pagination
        page={page}
        totalPages={totalPages}
        totalItems={totalItems}
        onPageChange={setPage}
      />

      {/* Selection Floating Bar */}
      {isSelecting && selectedItems.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-950/95 border border-slate-900 shadow-2xl rounded-2xl px-6 py-4 flex items-center gap-6 animate-fade-in backdrop-blur-md max-w-lg w-full justify-between">
          <div className="text-sm font-bold text-white">
            <span className="text-primary mr-1.5">{selectedItems.size}</span>
            {selectedItems.size === 1 ? "item" : "items"} selected
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedItems(new Set())}
              className="btn btn-xs btn-ghost text-slate-400 hover:text-white font-medium"
            >
              Clear
            </button>
            <button
              onClick={handleOpenMoveModal}
              className="btn btn-xs btn-primary font-bold shadow-lg shadow-primary/25 flex items-center gap-1 cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5" /> Move to Album
            </button>
          </div>
        </div>
      )}

      {/* Move to Album Modal */}
      <DialogModal
        ref={modalRef}
        title="Move to Album"
        actions={
          <>
            <button
              onClick={() => modalRef.current?.close()}
              className="btn btn-sm btn-ghost text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleMoveItems}
              disabled={moving || !targetAlbumId}
              className="btn btn-sm btn-primary font-bold shadow-lg shadow-primary/25"
            >
              {moving ? "Moving..." : "Move Items"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-slate-400 text-xs leading-relaxed">
            Choose the target album to move the <span className="text-white font-bold">{selectedItems.size}</span> selected media files to.
            This will physically move the files on disk and update their active catalog paths.
          </p>

          <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
            {albums.map((alb) => (
              <label
                key={alb.id}
                onClick={() => setTargetAlbumId(alb.id)}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                  targetAlbumId === alb.id
                    ? "bg-primary/10 border-primary/45 text-white"
                    : "bg-slate-900/40 border-slate-800/80 text-slate-300 hover:bg-slate-900"
                }`}
              >
                <input
                  type="radio"
                  name="targetAlbum"
                  checked={targetAlbumId === alb.id}
                  onChange={() => setTargetAlbumId(alb.id)}
                  className="radio radio-primary radio-xs pointer-events-none"
                />
                <span className="font-bold text-xs text-white">
                  {alb.name === "unknown" ? "Unsorted Media" : alb.name}
                </span>
                <span className="text-[10px] text-slate-500 font-mono ml-auto">
                  {alb.media_count} items
                </span>
              </label>
            ))}
            {albums.length === 0 && (
              <p className="text-center text-slate-500 text-xs py-4">No albums available.</p>
            )}
          </div>
        </div>
      </DialogModal>
    </div>
  );
}
