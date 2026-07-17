import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { useDriveStore } from "@/store/drive_store";
import { rpc } from "@/lib/rpc";
import {
  Compass,
  HardDrive,
  Info,
  Image as ImageIcon,
  Loader2,
  FolderPlus,
} from "lucide-react";
import { MediaCard, MediaItem } from "@/components/MediaCard";
import { Pagination } from "@/components/Pagination";
import { FilterBar } from "@/components/FilterBar";
import { useMediaCatalog } from "@/hooks/useMediaCatalog";
import { LegendList } from "@legendapp/list/react";
import DialogModal, { ModalHandle } from "@/components/DialogModal";

interface MediaSearch {
  page?: number;
  search?: string;
  filter?: "all" | "images" | "videos";
}

export const Route = createFileRoute("/medias/")({
  component: MediasComponent,
  validateSearch: (search: Record<string, unknown>): MediaSearch => {
    return {
      page: Number(search.page) || 0,
      search: (search.search as string) || "",
      filter: (search.filter as "all" | "images" | "videos") || "all",
    };
  },
});

function MediasComponent() {
  const { selectedDrive, fetchDrives } = useDriveStore();
  const { page = 0, search = "", filter = "all" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const itemsPerPage = 24;

  const { mediaItems, totalItems, loading, scanStatus, refresh } =
    useMediaCatalog(selectedDrive?.path, page, itemsPerPage, search, filter);

  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [albums, setAlbums] = useState<any[]>([]);
  const [targetAlbumId, setTargetAlbumId] = useState<number | null>(null);
  const [albumSearchQuery, setAlbumSearchQuery] = useState("");
  const [moving, setMoving] = useState(false);
  const modalRef = useRef<ModalHandle>(null);

  const filteredAlbums = (albums || []).filter((alb: any) =>
    alb.name.toLowerCase().includes(albumSearchQuery.toLowerCase()),
  );

  const toggleItemSelection = (id: number) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleOpenMoveModal = async () => {
    if (!selectedDrive?.path) return;
    try {
      const res = await rpc.request.getAlbums({
        drivePath: selectedDrive.path,
      });
      if (res.albums && !res.error) {
        setAlbums(res.albums);
      }
      modalRef.current?.open();
    } catch (err) {
      console.error("Failed to fetch albums for selection:", err);
    }
  };

  const handleMoveItems = async () => {
    if (!selectedDrive?.path || selectedItems.size === 0 || !targetAlbumId)
      return;
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
        setAlbumSearchQuery("");
        refresh();
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

  const setPage = (newPage: number) => {
    navigate({ search: (prev) => ({ ...prev, page: newPage }) });
  };

  const setSearchQuery = (newSearch: string) => {
    navigate({ search: (prev) => ({ ...prev, search: newSearch, page: 0 }) });
  };

  const setFilterType = (newFilter: "all" | "images" | "videos") => {
    navigate({ search: (prev) => ({ ...prev, filter: newFilter, page: 0 }) });
  };

  // Pagination math
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  // Chunk helper for LegendList grid layout
  const chunk = <T,>(arr: T[], size: number): T[][] => {
    const chunked: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunked.push(arr.slice(i, i + size));
    }
    return chunked;
  };

  const chunkedMedias = chunk(mediaItems, 4);

  // Case 1: No drive is selected
  if (!selectedDrive) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 sm:p-12">
        <div className="w-20 h-20 rounded-full bg-base-100 border border-slate-800 flex items-center justify-center mb-6 shadow-xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          <Compass className="w-10 h-10 text-slate-500 group-hover:text-primary transition-colors duration-300" />
        </div>
        <h3 className="text-2xl font-black text-white mb-2">
          No Drive Selected
        </h3>
        <p className="text-slate-400 text-sm max-w-sm leading-relaxed mb-6">
          Please select a connected drive or storage volume from the sidebar to
          inspect cataloged media files.
        </p>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-base-100/60 border border-slate-900 text-[10px] text-slate-500 font-medium">
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
        <div className="w-20 h-20 rounded-full bg-base-100 border border-slate-800 flex items-center justify-center mb-6 shadow-xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/10 to-transparent opacity-100 transition-opacity duration-300"></div>
          <HardDrive className="w-10 h-10 text-slate-500 group-hover:text-amber-400 transition-colors duration-300 animate-pulse" />
        </div>
        <h3 className="text-2xl font-black text-white mb-2">
          {selectedDrive.name} is Unmounted
        </h3>
        <p className="text-slate-400 text-sm max-w-sm leading-relaxed mb-6">
          This storage device needs to be mounted before you can view its media
          files.
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

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Drive Header / Scan status block */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900/60 to-slate-950/40 border border-slate-900 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/15 flex-shrink-0">
            <ImageIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white leading-tight">
              Media Catalog
            </h2>
            <span className="text-[10px] font-mono text-slate-500 uppercase font-bold tracking-wider">
              {selectedDrive.name} · {totalItems} Cataloged Items
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 ml-auto md:ml-0">
          {scanStatus?.scanning && (
            <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-primary/10 border border-primary/20">
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
              <div className="text-left">
                <span className="block text-[10px] font-bold text-primary uppercase tracking-wider">
                  Indexing Active
                </span>
                <span className="block text-[9px] text-slate-400">
                  Found {scanStatus.foundCount} medias...
                </span>
              </div>
            </div>
          )}

          {isSelecting && mediaItems.length > 0 && (
            <button
              onClick={() => {
                const allVisibleSelected = mediaItems.every((item) =>
                  selectedItems.has(item.id),
                );
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
              className="btn btn-sm btn-outline border-slate-800 text-slate-300 font-bold hover:bg-base-100 cursor-pointer"
            >
              {mediaItems.every((item) => selectedItems.has(item.id))
                ? "Deselect All"
                : "Select All"}
            </button>
          )}

          <button
            onClick={() => {
              setIsSelecting(!isSelecting);
              setSelectedItems(new Set());
            }}
            className={`btn btn-sm font-bold shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer ${
              isSelecting
                ? "btn-secondary text-white"
                : "btn-outline border-slate-800 text-slate-300"
            }`}
          >
            {isSelecting ? "Cancel" : "Select Items"}
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <FilterBar
        searchQuery={search}
        onSearchChange={setSearchQuery}
        filterType={filter}
        onFilterChange={setFilterType}
      />

      {/* Media Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] py-12">
          <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
          <p className="text-xs text-slate-500 font-bold">
            Querying Catalog Database...
          </p>
        </div>
      ) : mediaItems.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-base-100/20 border border-slate-900/50">
          <ImageIcon className="w-12 h-12 text-slate-700 mx-auto mb-4" />
          <h3 className="text-white font-bold">No Media Found</h3>
          <p className="text-slate-500 text-xs mt-1.5 max-w-sm mx-auto">
            No items matched your filters or search query, or this drive has not
            been scanned yet. Go to Discover to index.
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
                        className="checkbox checkbox-primary border-2 border-slate-400 checked:border-primary bg-slate-950/90 checkbox-sm cursor-pointer shadow-lg transition-all"
                      />
                    </div>
                  )}
                  <MediaCard
                    item={item}
                    drivePath={selectedDrive.path}
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
                ))}
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
              onClick={() => {
                setAlbumSearchQuery("");
                modalRef.current?.close();
              }}
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
            Choose the target album to move the{" "}
            <span className="text-white font-bold">{selectedItems.size}</span>{" "}
            selected media files to. This will physically move the files on disk
            and update their active catalog paths.
          </p>

          <div className="relative">
            <input
              type="text"
              placeholder="Search albums..."
              value={albumSearchQuery}
              onChange={(e) => setAlbumSearchQuery(e.target.value)}
              className="input input-bordered input-sm w-full bg-base-100/60 border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary/60 pr-8"
            />
            {albumSearchQuery && (
              <button
                onClick={() => setAlbumSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
              >
                Clear
              </button>
            )}
          </div>

          <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
            {filteredAlbums.map((alb: any) => (
              <label
                key={alb.id}
                onClick={() => setTargetAlbumId(alb.id)}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                  targetAlbumId === alb.id
                    ? "bg-primary/10 border-primary/45 text-white"
                    : "bg-base-100/40 border-slate-800/80 text-slate-300 hover:bg-base-100"
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
            {filteredAlbums.length === 0 && (
              <p className="text-center text-slate-500 text-xs py-4">
                No matching albums found.
              </p>
            )}
          </div>
        </div>
      </DialogModal>
    </div>
  );
}
