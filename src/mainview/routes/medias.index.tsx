import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { memo, useState, useRef, useCallback, useMemo } from "react";
import { useDriveStore } from "@/store/drive_store";
import { rpc } from "@/lib/rpc";
import {
  Compass,
  HardDrive,
  Info,
  Image as ImageIcon,
  Loader2,
  FolderPlus,
  Trash,
} from "lucide-react";
import { MediaCard, MediaItem } from "@/components/MediaCard";
import { Pagination } from "@/components/Pagination";
import { FilterBar } from "@/components/FilterBar";
import { useMutation } from "@tanstack/react-query";
import { useSelectionStore } from "@/store/selection_store";
import { useMediaCatalog } from "@/hooks/useMediaCatalog";
import { LegendList } from "@legendapp/list/react";
import DialogModal, { ModalHandle } from "@/components/DialogModal";

interface MediaSearch {
  page?: number;
  search?: string;
  filter?: "all" | "images" | "videos";
  sortBy?: "date" | "name" | "size";
  sortOrder?: "asc" | "desc";
}

export const Route = createFileRoute("/medias/")({
  component: MediasComponent,
  validateSearch: (search: Record<string, unknown>): MediaSearch => {
    return {
      page: Number(search.page) || 0,
      search: (search.search as string) || "",
      filter: (search.filter as "all" | "images" | "videos") || "all",
      sortBy: (search.sortBy as "date" | "name" | "size") || "date",
      sortOrder: (search.sortOrder as "asc" | "desc") || "desc",
    };
  },
});

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size)
    result.push(arr.slice(i, i + size));
  return result;
}

// ---------------------------------------------------------------------------
// Isolated selection components
// ---------------------------------------------------------------------------

const SelectionControls = memo(function SelectionControls({
  mediaItems,
  onStart,
  onCancel,
}: {
  mediaItems: MediaItem[];
  onStart: () => void;
  onCancel: () => void;
}) {
  const isSelecting = useSelectionStore((s) => s.isSelecting);
  const selectMany = useSelectionStore((s) => s.selectMany);
  const deselectMany = useSelectionStore((s) => s.deselectMany);
  const allSelected = useSelectionStore(
    (s) =>
      mediaItems.length > 0 &&
      mediaItems.every((item) => s.selected.has(item.id)),
  );

  return (
    <>
      {isSelecting && mediaItems.length > 0 && (
        <button
          onClick={() => {
            if (allSelected) deselectMany(mediaItems.map((item) => item.id));
            else selectMany(mediaItems.map((item) => item.id));
          }}
          className="btn btn-sm btn-outline border-base-300 text-base-content/80 font-bold hover:bg-base-100 cursor-pointer"
        >
          {allSelected ? "Deselect All" : "Select All"}
        </button>
      )}
      <button
        onClick={() => (isSelecting ? onCancel() : onStart())}
        className={`btn btn-sm font-bold shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer ${
          isSelecting
            ? "btn-secondary text-secondary-content"
            : "btn-outline border-base-300 text-base-content/80"
        }`}
      >
        {isSelecting ? "Cancel" : "Select Items"}
      </button>
    </>
  );
});

const SelectionFloatingBar = memo(function SelectionFloatingBar({
  onMove,
  onDelete,
  onClear,
}: {
  onMove: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const isSelecting = useSelectionStore((s) => s.isSelecting);
  const selectedCount = useSelectionStore((s) => s.selected.size);

  if (!isSelecting || selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-base-300/95 border border-base-200 shadow-2xl rounded-2xl px-6 py-4 flex items-center gap-6 animate-fade-in backdrop-blur-md max-w-lg w-full justify-between">
      <div className="text-sm font-bold text-base-content">
        <span className="text-primary mr-1.5">{selectedCount}</span>
        {selectedCount === 1 ? "item" : "items"} selected
      </div>
      <div className="flex gap-2">
        <button
          onClick={onClear}
          className="btn btn-xs btn-ghost text-base-content/60 hover:text-base-content font-medium"
        >
          Clear
        </button>
        <button
          onClick={onDelete}
          className="btn btn-xs btn-outline btn-error font-bold flex items-center gap-1 cursor-pointer"
        >
          <Trash className="w-3.5 h-3.5" /> Delete
        </button>
        <button
          onClick={onMove}
          className="btn btn-xs btn-primary font-bold shadow-lg shadow-primary/25 flex items-center gap-1 cursor-pointer"
        >
          <FolderPlus className="w-3.5 h-3.5" /> Move to Album
        </button>
      </div>
    </div>
  );
});

const SelectableMediaGrid = memo(function SelectableMediaGrid({
  data,
  renderItem,
}: {
  data: MediaItem[][];
  renderItem: ({ item }: { item: MediaItem[] }) => React.ReactNode;
}) {
  const isSelecting = useSelectionStore((s) => s.isSelecting);
  return (
    <div className={isSelecting ? "is-selecting" : ""}>
      <LegendList<MediaItem[]>
        data={data}
        estimatedItemSize={290}
        keyExtractor={(_: MediaItem[], index: number) => `row-${index}`}
        renderItem={renderItem}
      />
    </div>
  );
});

const MoveModalSelectedCount = memo(function MoveModalSelectedCount() {
  const selectedCount = useSelectionStore((s) => s.selected.size);
  return <span className="text-base-content font-bold">{selectedCount}</span>;
});

const DeleteDialogBody = memo(function DeleteDialogBody() {
  const selectedCount = useSelectionStore((s) => s.selected.size);
  return (
    <div className="space-y-3 text-left">
      <p className="text-xs text-base-content/70 leading-relaxed">
        Are you sure you want to permanently delete the{" "}
        <span className="font-bold text-base-content">{selectedCount}</span>{" "}
        selected media file{selectedCount === 1 ? "" : "s"}?
      </p>
      <div className="alert alert-error text-xs p-3 rounded-xl flex gap-2 items-start leading-relaxed bg-error/10 border-error/20 text-base-content">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-bold block mb-0.5">Warning: Permanent Deletion</span>
          This will physically delete the selected files from your disk and
          database cache. This action <span className="font-bold">cannot</span>{" "}
          be undone.
        </div>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main page component — reads nothing reactive from the selection store.
// ---------------------------------------------------------------------------

function MediasComponent() {
  const { selectedDrive, fetchDrives } = useDriveStore();
  const {
    page = 0,
    search = "",
    filter = "all",
    sortBy = "date",
    sortOrder = "desc",
  } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const itemsPerPage = 24;

  const { mediaItems, totalItems, loading, scanStatus, refresh } =
    useMediaCatalog(
      selectedDrive?.path,
      page,
      itemsPerPage,
      search,
      filter,
      sortBy,
      sortOrder,
    );

  // Only stable action functions — never cause re-renders.
  const startSelection = useSelectionStore((s) => s.start);
  const cancelSelection = useSelectionStore((s) => s.cancel);
  const clearSelection = useSelectionStore((s) => s.clear);

  const [albums, setAlbums] = useState<any[]>([]);
  const [targetAlbumId, setTargetAlbumId] = useState<number | null>(null);
  const [albumSearchQuery, setAlbumSearchQuery] = useState("");
  const [moving, setMoving] = useState(false);
  const modalRef = useRef<ModalHandle>(null);
  const deleteModalRef = useRef<ModalHandle>(null);

  const deleteMediaMutation = useMutation({
    mutationFn: async (mediaIds: number[]) => {
      if (!selectedDrive?.path) throw new Error("No active drive");
      const res = await rpc.request.deleteMediaItems({
        drivePath: selectedDrive.path,
        mediaIds,
      });
      if (!res.success) throw new Error(res.error || "Failed to delete items");
      return res.deletedCount;
    },
    onSuccess: (deletedCount) => {
      deleteModalRef.current?.close();
      useSelectionStore.getState().cancel();
      refresh();
      console.log(`Successfully deleted ${deletedCount} media items.`);
    },
    onError: (err: any) => {
      alert(err.message || "Failed to delete selected media items.");
    },
  });

  const filteredAlbums = useMemo(
    () =>
      (albums || []).filter((alb: any) =>
        alb.name.toLowerCase().includes(albumSearchQuery.toLowerCase()),
      ),
    [albums, albumSearchQuery],
  );

  const handleOpenMoveModal = useCallback(async () => {
    if (!selectedDrive?.path) return;
    try {
      const res = await rpc.request.getAlbums({ drivePath: selectedDrive.path });
      if (res.albums && !res.error) setAlbums(res.albums);
      modalRef.current?.open();
    } catch (err) {
      console.error("Failed to fetch albums for selection:", err);
    }
  }, [selectedDrive?.path]);

  const handleMoveItems = useCallback(async () => {
    if (!selectedDrive?.path || !targetAlbumId) return;
    const { selected } = useSelectionStore.getState();
    if (selected.size === 0) return;
    setMoving(true);
    try {
      const res = await rpc.request.moveMediaItemsToAlbum({
        drivePath: selectedDrive.path,
        mediaIds: Array.from(selected),
        targetAlbumId,
      });
      if (res.success) {
        modalRef.current?.close();
        useSelectionStore.getState().cancel();
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
  }, [selectedDrive?.path, targetAlbumId, refresh]);

  const setPage = useCallback(
    (newPage: number) =>
      navigate({ search: (prev) => ({ ...prev, page: newPage }) }),
    [navigate],
  );

  const setSearchQuery = useCallback(
    (newSearch: string) =>
      navigate({ search: (prev) => ({ ...prev, search: newSearch, page: 0 }) }),
    [navigate],
  );

  const setFilterType = useCallback(
    (newFilter: "all" | "images" | "videos") =>
      navigate({ search: (prev) => ({ ...prev, filter: newFilter, page: 0 }) }),
    [navigate],
  );

  const setSortBy = useCallback(
    (newSortBy: "date" | "name" | "size") =>
      navigate({ search: (prev) => ({ ...prev, sortBy: newSortBy, page: 0 }) }),
    [navigate],
  );

  const toggleSortOrder = useCallback(
    () =>
      navigate({
        search: (prev) => ({
          ...prev,
          sortOrder: prev.sortOrder === "asc" ? "desc" : "asc",
          page: 0,
        }),
      }),
    [navigate],
  );

  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const chunkedMedias = useMemo(() => chunk(mediaItems, 4), [mediaItems]);

  // isSelecting removed from deps — class applied by SelectableMediaGrid.
  const renderMediaRow = useCallback(
    ({ item: rowItems }: { item: MediaItem[] }) => (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-4">
        {rowItems.map((item: MediaItem) => (
          <MediaCard
            key={item.id}
            item={item}
            drivePath={selectedDrive?.path ?? ""}
          />
        ))}
        {rowItems.length < 4 &&
          Array.from({ length: 4 - rowItems.length }).map((_, idx) => (
            <div key={`empty-${idx}`} className="hidden md:block" />
          ))}
      </div>
    ),
    [selectedDrive?.path],
  );

  if (!selectedDrive) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 sm:p-12">
        <div className="w-20 h-20 rounded-full bg-base-100 border border-base-300 flex items-center justify-center mb-6 shadow-xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <Compass className="w-10 h-10 text-base-content/40 group-hover:text-primary transition-colors duration-300" />
        </div>
        <h3 className="text-2xl font-black text-base-content mb-2">No Drive Selected</h3>
        <p className="text-base-content/60 text-sm max-w-sm leading-relaxed mb-6">
          Please select a connected drive or storage volume from the sidebar to
          inspect cataloged media files.
        </p>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-base-100/60 border border-base-200 text-[10px] text-base-content/40 font-medium">
          <Info className="w-3.5 h-3.5" />
          Select a drive then scan it under the Discover tab.
        </div>
      </div>
    );
  }

  if (selectedDrive.status === "unmounted") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 sm:p-12">
        <div className="w-20 h-20 rounded-full bg-base-100 border border-base-300 flex items-center justify-center mb-6 shadow-xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-tr from-warning/10 to-transparent opacity-100 transition-opacity duration-300" />
          <HardDrive className="w-10 h-10 text-base-content/40 group-hover:text-warning transition-colors duration-300 animate-pulse" />
        </div>
        <h3 className="text-2xl font-black text-base-content mb-2">
          {selectedDrive.name} is Unmounted
        </h3>
        <p className="text-base-content/60 text-sm max-w-sm leading-relaxed mb-6">
          This storage device needs to be mounted before you can view its media files.
        </p>
        <button
          onClick={async () => {
            try {
              const res = await rpc.request.mountBlockDevice({ deviceId: selectedDrive.id });
              if (res.success && res.mountPath) await fetchDrives();
              else alert(`Failed to mount: ${res.error}`);
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
      {/* Drive Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-base-200/60 to-base-300/40 border border-base-200 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/15 flex-shrink-0">
            <ImageIcon className="w-6 h-6 text-primary-content" />
          </div>
          <div>
            <h2 className="text-xl font-black text-base-content leading-tight">Media Catalog</h2>
            <span className="text-[10px] font-mono text-base-content/40 uppercase font-bold tracking-wider">
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
                <span className="block text-[9px] text-base-content/60">
                  Found {scanStatus.foundCount} medias...
                </span>
              </div>
            </div>
          )}
          <SelectionControls
            mediaItems={mediaItems}
            onStart={startSelection}
            onCancel={cancelSelection}
          />
        </div>
      </div>

      {/* Filter & Search Bar */}
      <FilterBar
        searchQuery={search}
        onSearchChange={setSearchQuery}
        filterType={filter}
        onFilterChange={setFilterType}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        sortOrder={sortOrder}
        onToggleSortOrder={toggleSortOrder}
        totalItems={totalItems}
      />

      {/* Media Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] py-12">
          <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
          <p className="text-xs text-base-content/40 font-bold">Querying Catalog Database...</p>
        </div>
      ) : mediaItems.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-base-100/20 border border-base-200/50">
          <ImageIcon className="w-12 h-12 text-base-content/20 mx-auto mb-4" />
          <h3 className="text-base-content font-bold">No Media Found</h3>
          <p className="text-base-content/40 text-xs mt-1.5 max-w-sm mx-auto">
            No items matched your filters or search query, or this drive has not
            been scanned yet. Go to Discover to index.
          </p>
        </div>
      ) : (
        <SelectableMediaGrid data={chunkedMedias} renderItem={renderMediaRow} />
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        totalItems={totalItems}
        onPageChange={setPage}
      />

      <SelectionFloatingBar
        onMove={handleOpenMoveModal}
        onDelete={() => deleteModalRef.current?.open()}
        onClear={clearSelection}
      />

      {/* Move to Album Modal */}
      <DialogModal
        ref={modalRef}
        title="Move to Album"
        actions={
          <>
            <button
              onClick={() => { setAlbumSearchQuery(""); modalRef.current?.close(); }}
              className="btn btn-sm btn-ghost text-base-content/60 hover:text-base-content"
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
          <p className="text-base-content/60 text-xs leading-relaxed">
            Choose the target album to move the{" "}
            <MoveModalSelectedCount />{" "}
            selected media files to. This will physically move the files on disk
            and update their active catalog paths.
          </p>
          <div className="relative">
            <input
              type="text"
              placeholder="Search albums..."
              value={albumSearchQuery}
              onChange={(e) => setAlbumSearchQuery(e.target.value)}
              className="input input-bordered input-sm w-full bg-base-100/60 border-base-300 text-xs text-base-content placeholder-base-content/30 focus:outline-none focus:border-primary/60 pr-8"
            />
            {albumSearchQuery && (
              <button
                onClick={() => setAlbumSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content text-xs"
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
                    ? "bg-primary/10 border-primary/45 text-base-content"
                    : "bg-base-100/40 border-base-300/80 text-base-content/80 hover:bg-base-100"
                }`}
              >
                <input
                  type="radio"
                  name="targetAlbum"
                  checked={targetAlbumId === alb.id}
                  onChange={() => setTargetAlbumId(alb.id)}
                  className="radio radio-primary radio-xs pointer-events-none"
                />
                <span className="font-bold text-xs text-base-content">
                  {alb.name === "unknown" ? "Unsorted Media" : alb.name}
                </span>
                <span className="text-[10px] text-base-content/40 font-mono ml-auto">
                  {alb.media_count} items
                </span>
              </label>
            ))}
            {filteredAlbums.length === 0 && (
              <p className="text-center text-base-content/40 text-xs py-4">
                No matching albums found.
              </p>
            )}
          </div>
        </div>
      </DialogModal>

      {/* Delete Media Confirmation */}
      <DialogModal
        ref={deleteModalRef}
        title="Delete Media Items"
        actions={
          <>
            <button
              type="button"
              onClick={() => deleteModalRef.current?.close()}
              className="btn btn-sm btn-ghost text-base-content/60 hover:text-base-content"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const { selected } = useSelectionStore.getState();
                deleteMediaMutation.mutate(Array.from(selected));
              }}
              disabled={deleteMediaMutation.isPending}
              className="btn btn-sm btn-error font-bold shadow-lg shadow-error/25 text-error-content"
            >
              {deleteMediaMutation.isPending ? "Deleting..." : "Delete Permanently"}
            </button>
          </>
        }
      >
        <DeleteDialogBody />
      </DialogModal>
    </div>
  );
}
