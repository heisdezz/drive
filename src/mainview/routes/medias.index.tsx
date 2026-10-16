import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/solid-router";
import { createSignal, createMemo, Show, For } from "solid-js";
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
} from "lucide-solid";
import { MediaCard } from "@/components/MediaCard";
import { Pagination } from "@/components/Pagination";
import { FilterBar } from "@/components/FilterBar";
import { createMutation } from "@tanstack/solid-query";
import { useSelectionStore } from "@/store/selection_store";
import { useMediaCatalog } from "@/hooks/useMediaCatalog";
import DialogModal, { type ModalHandle } from "@/components/DialogModal";

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

function MediasComponent() {
  const drive = useDriveStore();
  const search = useSearch({ from: Route.id });
  const navigate = useNavigate({ from: Route.id });
  const selection = useSelectionStore();
  const itemsPerPage = 24;

  const catalog = useMediaCatalog(
    () => drive.selectedDrive?.path,
    () => search().page || 0,
    itemsPerPage,
    () => search().search || "",
    () => search().filter || "all",
    () => search().sortBy || "date",
    () => search().sortOrder || "desc",
  );

  const [albums, setAlbums] = createSignal<any[]>([]);
  const [targetAlbumId, setTargetAlbumId] = createSignal<number | null>(null);
  const [albumSearchQuery, setAlbumSearchQuery] = createSignal("");
  const [moving, setMoving] = createSignal(false);
  let modalRef: ModalHandle | undefined;
  let deleteModalRef: ModalHandle | undefined;

  const deleteMediaMutation = createMutation(() => ({
    mutationFn: async (mediaIds: number[]) => {
      const path = drive.selectedDrive?.path;
      if (!path) throw new Error("No active drive");
      const res = await rpc.request.deleteMediaItems({
        drivePath: path,
        mediaIds,
      });
      if (!res.success) throw new Error(res.error || "Failed to delete items");
      return res.deletedCount;
    },
    onSuccess: (deletedCount) => {
      deleteModalRef?.close();
      selection.cancel();
      catalog.refresh();
      console.log(`Successfully deleted ${deletedCount} media items.`);
    },
    onError: (err: any) => {
      alert(err.message || "Failed to delete selected media items.");
    },
  }));

  const filteredAlbums = createMemo(() => {
    const list = albums();
    const query = albumSearchQuery().toLowerCase();
    return list.filter((alb: any) => alb.name.toLowerCase().includes(query));
  });

  const handleOpenMoveModal = async () => {
    const path = drive.selectedDrive?.path;
    if (!path) return;
    try {
      const res = await rpc.request.getAlbums({ drivePath: path });
      if (res.albums && !res.error) setAlbums(res.albums);
      modalRef?.open();
    } catch (err) {
      console.error("Failed to fetch albums for selection:", err);
    }
  };

  const handleMoveItems = async () => {
    const path = drive.selectedDrive?.path;
    const targetId = targetAlbumId();
    if (!path || !targetId) return;
    if (selection.selected.size === 0) return;
    setMoving(true);
    try {
      const res = await rpc.request.moveMediaItemsToAlbum({
        drivePath: path,
        mediaIds: Array.from(selection.selected),
        targetAlbumId: targetId,
      });
      if (res.success) {
        modalRef?.close();
        selection.cancel();
        setTargetAlbumId(null);
        setAlbumSearchQuery("");
        catalog.refresh();
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
    navigate({
      search: (prev: MediaSearch) => ({ ...prev, page: newPage }),
    });
  };

  const setSearchQuery = (newSearch: string) => {
    navigate({
      search: (prev: MediaSearch) => ({
        ...prev,
        search: newSearch,
        page: 0,
      }),
    });
  };

  const setFilterType = (newFilter: "all" | "images" | "videos") => {
    navigate({
      search: (prev: MediaSearch) => ({
        ...prev,
        filter: newFilter,
        page: 0,
      }),
    });
  };

  const setSortBy = (newSortBy: "date" | "name" | "size") => {
    navigate({
      search: (prev: MediaSearch) => ({
        ...prev,
        sortBy: newSortBy,
        page: 0,
      }),
    });
  };

  const toggleSortOrder = () => {
    navigate({
      search: (prev: MediaSearch) => ({
        ...prev,
        sortOrder: prev.sortOrder === "asc" ? "desc" : "asc",
        page: 0,
      }),
    });
  };

  const totalPages = () => Math.ceil(catalog.totalItems / itemsPerPage);

  const allSelected = createMemo(() => {
    const items = catalog.mediaItems;
    return (
      items.length > 0 && items.every((item) => selection.selected.has(item.id))
    );
  });

  return (
    <Show
      when={drive.selectedDrive}
      fallback={
        <div class="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 sm:p-12">
          <div class="w-20 h-20 rounded-full bg-base-100 border border-base-300 flex items-center justify-center mb-6 shadow-xl relative overflow-hidden group">
            <div class="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <Compass class="w-10 h-10 text-base-content/40 group-hover:text-primary transition-colors duration-300" />
          </div>
          <h3 class="text-2xl font-black text-base-content mb-2">
            No Drive Selected
          </h3>
          <p class="text-base-content/60 text-sm max-w-sm leading-relaxed mb-6">
            Please select a connected drive or storage volume from the sidebar
            to inspect cataloged media files.
          </p>
          <div class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-base-100/60 border border-base-200 text-[10px] text-base-content/40 font-medium">
            <Info class="w-3.5 h-3.5" />
            Select a drive then scan it under the Discover tab.
          </div>
        </div>
      }
    >
      <Show
        when={drive.selectedDrive!.status !== "unmounted"}
        fallback={
          <div class="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 sm:p-12">
            <div class="w-20 h-20 rounded-full bg-base-100 border border-base-300 flex items-center justify-center mb-6 shadow-xl relative overflow-hidden group">
              <div class="absolute inset-0 bg-gradient-to-tr from-warning/10 to-transparent opacity-100 transition-opacity duration-300" />
              <HardDrive class="w-10 h-10 text-base-content/40 group-hover:text-warning transition-colors duration-300 animate-pulse" />
            </div>
            <h3 class="text-2xl font-black text-base-content mb-2">
              {drive.selectedDrive!.name} is Unmounted
            </h3>
            <p class="text-base-content/60 text-sm max-w-sm leading-relaxed mb-6">
              This storage device needs to be mounted before you can view its
              media files.
            </p>
            <button
              onClick={async () => {
                try {
                  const res = await rpc.request.mountBlockDevice({
                    deviceId: drive.selectedDrive!.id,
                  });
                  if (res.success && res.mountPath) await drive.fetchDrives();
                  else alert(`Failed to mount: ${res.error}`);
                } catch (err: any) {
                  console.error(err);
                }
              }}
              class="btn btn-primary px-8 font-bold text-sm tracking-wide shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              Mount Drive
            </button>
          </div>
        }
      >
        <div class="space-y-6 max-w-5xl">
          {/* Drive Header */}
          <div class="p-6 rounded-2xl bg-gradient-to-br from-base-200/60 to-base-300/40 border border-base-200 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-xl bg-gradient-to-tr from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/15 flex-shrink-0">
                <ImageIcon class="w-6 h-6 text-primary-content" />
              </div>
              <div>
                <h2 class="text-xl font-black text-base-content leading-tight">
                  Media Catalog
                </h2>
                <span class="text-[10px] font-mono text-base-content/40 uppercase font-bold tracking-wider">
                  {drive.selectedDrive!.name} · {catalog.totalItems} Cataloged
                  Items
                </span>
              </div>
            </div>

            <div class="flex items-center gap-3 ml-auto md:ml-0">
              <Show when={catalog.scanStatus?.scanning}>
                <div class="flex items-center gap-3 px-4 py-2 rounded-xl bg-primary/10 border border-primary/20">
                  <Loader2 class="w-4 h-4 text-primary animate-spin" />
                  <div class="text-left">
                    <span class="block text-[10px] font-bold text-primary uppercase tracking-wider">
                      Indexing Active
                    </span>
                    <span class="block text-[9px] text-base-content/60">
                      Found {catalog.scanStatus?.foundCount} medias...
                    </span>
                  </div>
                </div>
              </Show>

              {/* Selection Controls */}
              <Show
                when={selection.isSelecting && catalog.mediaItems.length > 0}
              >
                <button
                  onClick={() => {
                    if (allSelected()) {
                      selection.deselectMany(
                        catalog.mediaItems.map((i) => i.id),
                      );
                    } else {
                      selection.selectMany(catalog.mediaItems.map((i) => i.id));
                    }
                  }}
                  class="btn btn-sm btn-outline border-base-300 text-base-content/80 font-bold hover:bg-base-100 cursor-pointer"
                >
                  {allSelected() ? "Deselect All" : "Select All"}
                </button>
              </Show>

              <button
                onClick={() =>
                  selection.isSelecting ? selection.cancel() : selection.start()
                }
                class={`btn btn-sm font-bold shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer ${
                  selection.isSelecting
                    ? "btn-secondary text-secondary-content"
                    : "btn-outline border-base-300 text-base-content/80"
                }`}
              >
                {selection.isSelecting ? "Cancel" : "Select Items"}
              </button>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <FilterBar
            searchQuery={search().search || ""}
            onSearchChange={setSearchQuery}
            filterType={search().filter || "all"}
            onFilterChange={setFilterType}
            sortBy={search().sortBy || "date"}
            onSortByChange={setSortBy}
            sortOrder={search().sortOrder || "desc"}
            onToggleSortOrder={toggleSortOrder}
            totalItems={catalog.totalItems}
          />

          {/* Media Grid */}
          <Show
            when={!catalog.loading || catalog.mediaItems.length > 0}
            fallback={
              <div class="flex flex-col items-center justify-center min-h-[40vh] py-12">
                <Loader2 class="w-10 h-10 text-primary animate-spin mb-4" />
                <p class="text-xs text-base-content/40 font-bold">
                  Querying Catalog Database...
                </p>
              </div>
            }
          >
            <Show
              when={catalog.mediaItems.length > 0}
              fallback={
                <div class="p-12 text-center rounded-2xl bg-base-100/20 border border-base-200/50">
                  <ImageIcon class="w-12 h-12 text-base-content/20 mx-auto mb-4" />
                  <h3 class="text-base-content font-bold">No Media Found</h3>
                  <p class="text-base-content/40 text-xs mt-1.5 max-w-sm mx-auto">
                    No items matched your filters or search query, or this drive
                    has not been scanned yet. Go to Discover to index.
                  </p>
                </div>
              }
            >
              <div
                class={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 ${selection.isSelecting ? "is-selecting" : ""}`}
              >
                <For each={catalog.mediaItems}>
                  {(item) => (
                    <MediaCard
                      item={item}
                      drivePath={drive.selectedDrive?.path ?? ""}
                    />
                  )}
                </For>
              </div>
            </Show>
          </Show>

          <Pagination
            page={search().page || 0}
            totalPages={totalPages()}
            totalItems={catalog.totalItems}
            onPageChange={setPage}
          />

          {/* Selection Floating Bar */}
          <Show when={selection.isSelecting && selection.selected.size > 0}>
            <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-base-300/95 border border-base-200 shadow-2xl rounded-2xl px-6 py-4 flex items-center gap-6 animate-fade-in max-w-lg w-full justify-between">
              <div class="text-sm font-bold text-base-content">
                <span class="text-primary mr-1.5">
                  {selection.selected.size}
                </span>
                {selection.selected.size === 1 ? "item" : "items"} selected
              </div>
              <div class="flex gap-2">
                <button
                  onClick={() => selection.clear()}
                  class="btn btn-xs btn-ghost text-base-content/60 hover:text-base-content font-medium"
                >
                  Clear
                </button>
                <button
                  onClick={() => deleteModalRef?.open()}
                  class="btn btn-xs btn-outline btn-error font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Trash class="w-3.5 h-3.5" /> Delete
                </button>
                <button
                  onClick={handleOpenMoveModal}
                  class="btn btn-xs btn-primary font-bold shadow-lg shadow-primary/25 flex items-center gap-1 cursor-pointer"
                >
                  <FolderPlus class="w-3.5 h-3.5" /> Move to Album
                </button>
              </div>
            </div>
          </Show>

          {/* Move to Album Modal */}
          <DialogModal
            ref={(el) => (modalRef = el)}
            title="Move to Album"
            actions={
              <>
                <button
                  onClick={() => {
                    setAlbumSearchQuery("");
                    modalRef?.close();
                  }}
                  class="btn btn-sm btn-ghost text-base-content/60 hover:text-base-content"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMoveItems}
                  disabled={moving() || !targetAlbumId()}
                  class="btn btn-sm btn-primary font-bold shadow-lg shadow-primary/25"
                >
                  {moving() ? "Moving..." : "Move Items"}
                </button>
              </>
            }
          >
            <div class="space-y-4">
              <p class="text-base-content/60 text-xs leading-relaxed">
                Choose the target album to move the{" "}
                <span class="text-base-content font-bold">
                  {selection.selected.size}
                </span>{" "}
                selected media files to. This will physically move the files on
                disk and update their active catalog paths.
              </p>
              <div class="relative">
                <input
                  type="text"
                  placeholder="Search albums..."
                  value={albumSearchQuery()}
                  onInput={(e) => setAlbumSearchQuery(e.currentTarget.value)}
                  class="input input-bordered input-sm w-full bg-base-100/60 border-base-300 text-xs text-base-content placeholder-base-content/30 focus:outline-none focus:border-primary/60 pr-8"
                />
                <Show when={albumSearchQuery()}>
                  <button
                    onClick={() => setAlbumSearchQuery("")}
                    class="absolute right-2.5 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content text-xs"
                  >
                    Clear
                  </button>
                </Show>
              </div>
              <div class="max-h-60 overflow-y-auto space-y-2 pr-1">
                <For
                  each={filteredAlbums()}
                  fallback={
                    <p class="text-center text-base-content/40 text-xs py-4">
                      No matching albums found.
                    </p>
                  }
                >
                  {(alb: any) => (
                    <label
                      onClick={() => setTargetAlbumId(alb.id)}
                      class={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                        targetAlbumId() === alb.id
                          ? "bg-primary/10 border-primary/45 text-base-content"
                          : "bg-base-100/40 border-base-300/80 text-base-content/80 hover:bg-base-100"
                      }`}
                    >
                      <input
                        type="radio"
                        name="targetAlbum"
                        checked={targetAlbumId() === alb.id}
                        onChange={() => setTargetAlbumId(alb.id)}
                        class="radio radio-primary radio-xs pointer-events-none"
                      />
                      <span class="font-bold text-xs text-base-content">
                        {alb.name === "unknown" ? "Unsorted Media" : alb.name}
                      </span>
                      <span class="text-[10px] text-base-content/40 font-mono ml-auto">
                        {alb.media_count} items
                      </span>
                    </label>
                  )}
                </For>
              </div>
            </div>
          </DialogModal>

          {/* Delete Media Confirmation */}
          <DialogModal
            ref={(el) => (deleteModalRef = el)}
            title="Delete Media Items"
            actions={
              <>
                <button
                  type="button"
                  onClick={() => deleteModalRef?.close()}
                  class="btn btn-sm btn-ghost text-base-content/60 hover:text-base-content"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    deleteMediaMutation.mutate(Array.from(selection.selected));
                  }}
                  disabled={deleteMediaMutation.isPending}
                  class="btn btn-sm btn-error font-bold shadow-lg shadow-error/25 text-error-content"
                >
                  {deleteMediaMutation.isPending
                    ? "Deleting..."
                    : "Delete Permanently"}
                </button>
              </>
            }
          >
            <div class="space-y-3 text-left">
              <p class="text-xs text-base-content/70 leading-relaxed">
                Are you sure you want to permanently delete the{" "}
                <span class="font-bold text-base-content">
                  {selection.selected.size}
                </span>{" "}
                selected media file
                {selection.selected.size === 1 ? "" : "s"}?
              </p>
              <div class="alert alert-error text-xs p-3 rounded-xl flex gap-2 items-start leading-relaxed bg-error/10 border-error/20 text-base-content">
                <Info class="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <span class="font-bold block mb-0.5">
                    Warning: Permanent Deletion
                  </span>
                  This will physically delete the selected files from your disk
                  and database cache. This action{" "}
                  <span class="font-bold">cannot</span> be undone.
                </div>
              </div>
            </div>
          </DialogModal>
        </div>
      </Show>
    </Show>
  );
}
