import { createMemo, createSignal, Show, For } from "solid-js";
import {
  createFileRoute,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/solid-router";
import { useDriveStore } from "@/store/drive_store";
import { useSettingsStore } from "@/store/settings_store";
import { rpc } from "@/lib/rpc";
import { MediaCard, type MediaItem } from "@/components/MediaCard";
import { Pagination } from "@/components/Pagination";
import {
  Compass,
  HardDrive,
  Info,
  Loader2,
  Image as ImageIcon,
  ChevronLeft,
  FolderOpen,
  FolderPlus,
  RotateCw,
  Trash,
} from "lucide-solid";
import {
  createQuery,
  useQueryClient,
  createMutation,
} from "@tanstack/solid-query";
import SearchBar from "@/components/Searchbar";
import {
  MoveToAlbumModal,
  type MoveModalHandle,
} from "@/components/MoveToAlbumModal";
import { useSelectionStore } from "@/store/selection_store";
import DialogModal, { type ModalHandle } from "@/components/DialogModal";
import {
  validateAlbumMediaSearch,
  patchSearch,
  patchPagedSearch,
  type AlbumMediaSearch,
} from "@/lib/catalogSearch";

export const Route = createFileRoute("/album/$id/")({
  component: AlbumDetailComponent,
  validateSearch: validateAlbumMediaSearch,
});

function AlbumDetailComponent() {
  const drive = useDriveStore();
  const settings = useSettingsStore();
  const params = useParams({ from: Route.id });
  const search = useSearch({ from: Route.id });
  const navigate = useNavigate({ from: Route.id });
  const queryClient = useQueryClient();
  const selection = useSelectionStore();
  const [validating, setValidating] = createSignal(false);
  const [validationMessage, setValidationMessage] = createSignal("");
  const [validationError, setValidationError] = createSignal(false);

  const validateFiles = async () => {
    const drivePath = drive.selectedDrive?.path;
    const id = albumId();
    if (!drivePath || !Number.isSafeInteger(id)) return;
    setValidationError(false);
    setValidationMessage("Checking album files…");
    setValidating(true);
    try {
      const result = await rpc.request.validateAlbumFiles({
        drivePath,
        albumId: id,
      });
      if (!result.success) throw new Error(result.error || "Validation failed");
      setValidationMessage(
        `Checked ${result.checked} files; removed ${result.removed} missing entries.`,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["album-media", drivePath, id] }),
        queryClient.invalidateQueries({ queryKey: ["album", drivePath, id] }),
        queryClient.invalidateQueries({ queryKey: ["albums", drivePath] }),
      ]);
    } catch (err: any) {
      setValidationError(true);
      setValidationMessage(err.message || "Validation failed");
    } finally {
      setValidating(false);
    }
  };

  const albumId = () => Number(params().id);

  const albumQuery = createQuery(() => ({
    queryKey: ["album", drive.selectedDrive?.path, albumId()],
    queryFn: async () => {
      const path = drive.selectedDrive?.path;
      const id = albumId();
      if (!path || isNaN(id)) return null;
      const res = await rpc.request.getAlbum({
        drivePath: path,
        albumId: id,
      });
      if (res.error) throw new Error(res.error);
      return res.album || null;
    },
    enabled: !!drive.selectedDrive?.path && !isNaN(albumId()),
  }));

  const mediaQuery = createQuery(() => {
    const s = search();
    const id = albumId();
    const path = drive.selectedDrive?.path;
    const page = s.page || 0;
    const limit = s.limit || 100;
    const searchQueryStr = s.search || "";
    const filter = s.filter || "all";
    const sortBy = s.sortBy || "date";
    const sortOrder = s.sortOrder || "desc";

    return {
      queryKey: [
        "album-media",
        path,
        id,
        page,
        limit,
        searchQueryStr,
        filter,
        sortBy,
        sortOrder,
      ],
      queryFn: async () => {
        if (!path || isNaN(id)) return { items: [] as MediaItem[], total: 0 };
        const res = await rpc.request.getAlbumMedia({
          drivePath: path,
          albumId: id,
          limit,
          offset: page * limit,
          search: searchQueryStr,
          filter: filter === "all" ? undefined : filter,
          sortBy,
          sortOrder,
        });
        if (res.error) throw new Error(res.error);
        return {
          items: (res.items as MediaItem[]) || [],
          total: res.total || 0,
        };
      },
      enabled: !!path && !isNaN(id),
    };
  });

  let moveModalRef: MoveModalHandle | undefined;
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
      queryClient.invalidateQueries({
        queryKey: ["album-media", drive.selectedDrive?.path, albumId()],
      });
      queryClient.invalidateQueries({
        queryKey: ["album", drive.selectedDrive?.path, albumId()],
      });
      console.log(`Successfully deleted ${deletedCount} media items.`);
    },
    onError: (err: any) => {
      alert(err.message || "Failed to delete selected media items.");
    },
  }));

  const mediaItems = () => mediaQuery.data?.items || [];
  const totalItems = () => mediaQuery.data?.total || 0;
  const album = () => albumQuery.data;
  const loading = () => albumQuery.isLoading || mediaQuery.isLoading;
  const error = () =>
    albumQuery.error?.message || mediaQuery.error?.message || null;

  const setPage = (newPage: number) => {
    navigate({
      search: (prev: AlbumMediaSearch) => patchSearch(prev, { page: newPage }),
    });
  };

  const handleLimitChange = (newLimit: number) => {
    navigate({
      search: (prev: AlbumMediaSearch) =>
        patchPagedSearch(prev, { limit: newLimit }),
    });
  };

  const setSearchQuery = (newSearch: string) => {
    navigate({
      search: (prev: AlbumMediaSearch) =>
        patchPagedSearch(prev, { search: newSearch }),
    });
  };

  const handleFilterChange = (newFilter: "all" | "images" | "videos") => {
    navigate({
      search: (prev: AlbumMediaSearch) =>
        patchPagedSearch(prev, { filter: newFilter }),
    });
  };

  const handleSortByChange = (newSortBy: "date" | "name" | "size") => {
    navigate({
      search: (prev: AlbumMediaSearch) =>
        patchPagedSearch(prev, { sortBy: newSortBy }),
    });
  };

  const toggleSortOrder = () => {
    navigate({
      search: (prev: AlbumMediaSearch) =>
        patchPagedSearch(prev, {
          sortOrder: prev.sortOrder === "asc" ? "desc" : "asc",
        }),
    });
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({
      queryKey: ["album", drive.selectedDrive?.path, albumId()],
    });
    queryClient.invalidateQueries({
      queryKey: ["album-media", drive.selectedDrive?.path, albumId()],
    });
  };

  const handleMoveSuccess = () => {
    selection.cancel();
  };

  const totalPages = () => Math.ceil(totalItems() / (search().limit || 100));

  const allSelected = createMemo(() => {
    const items = mediaItems();
    return items.length > 0 && items.every((i) => selection.selected.has(i.id));
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
            to inspect cataloged albums.
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
              albums.
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
        <Show
          when={!error()}
          fallback={
            <div class="space-y-6 max-w-[1600px]">
              <div class="flex items-center gap-2">
                <button
                  onClick={() =>
                    window.history.length > 1
                      ? window.history.back()
                      : navigate({ to: "/albums" })
                  }
                  class="btn btn-sm btn-ghost gap-1.5 font-bold text-xs text-base-content/60 hover:text-base-content cursor-pointer"
                >
                  <ChevronLeft class="w-3.5 h-3.5" /> Back
                </button>
              </div>
              <div class="p-12 text-center rounded-2xl bg-base-100/20 border border-base-200/50">
                <Info class="w-12 h-12 text-error mx-auto mb-4" />
                <h3 class="text-base-content font-bold">Error Loading Album</h3>
                <p class="text-base-content/40 text-xs mt-1.5 max-w-sm mx-auto">
                  {error()}
                </p>
              </div>
            </div>
          }
        >
          <div class="max-w-[1600px] space-y-3">
            <section class="flex flex-wrap items-center gap-3 rounded-xl border border-base-200 bg-gradient-to-br from-base-200/60 to-base-300/40 px-4 py-3 shadow-lg">
              <button
                type="button"
                onClick={() => window.history.length > 1 ? window.history.back() : navigate({ to: "/albums" })}
                class="btn btn-sm btn-ghost btn-square shrink-0"
                aria-label="Back to albums"
                title="Back to albums"
              >
                <ChevronLeft class="h-4 w-4" />
              </button>
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-primary to-secondary shadow-md shadow-primary/15">
                <FolderOpen class="h-5 w-5 text-primary-content" />
              </div>
              <div class="min-w-0 flex-1">
                <h2 class="truncate text-lg font-black leading-tight text-base-content" title={album()?.name}>
                  {album()?.name === "unknown" ? "Unsorted Media" : album()?.name || "Loading Album..."}
                </h2>
                <span class="block truncate font-mono text-[10px] font-bold uppercase tracking-wider text-base-content/50" title={album()?.relative_path}>
                  {album()?.relative_path} · {totalItems()} items
                </span>
                <Show when={validationMessage()}>
                  <span role={validationError() ? "alert" : "status"} class={`block text-xs ${validationError() ? "text-error" : "text-base-content/70"}`}>{validationMessage()}</span>
                </Show>
              </div>
              <div class="ml-auto flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={validateFiles} disabled={validating()} class="btn btn-sm btn-ghost gap-1.5" title="Check this album for missing files">
                  <RotateCw class={`h-3.5 w-3.5 ${validating() ? "animate-spin" : ""}`} />
                  {validating() ? "Checking…" : "Validate"}
                </button>
                <Show when={selection.isSelecting && mediaItems().length > 0}>
                  <button
                    type="button"
                    onClick={() => allSelected() ? selection.deselectMany(mediaItems().map((item) => item.id)) : selection.selectMany(mediaItems().map((item) => item.id))}
                    class="btn btn-sm btn-ghost"
                  >
                    {allSelected() ? "Deselect page" : "Select page"}
                  </button>
                </Show>
                <button
                  type="button"
                  onClick={() => selection.isSelecting ? selection.cancel() : selection.start()}
                  class={`btn btn-sm ${selection.isSelecting ? "btn-secondary" : "btn-outline"}`}
                  aria-pressed={selection.isSelecting}
                >
                  {selection.isSelecting ? "Cancel" : "Select items"}
                </button>
              </div>
            </section>

            <div class="flex flex-wrap items-center gap-2 rounded-xl border border-base-200 bg-base-200/70 p-2.5">
              <div class="min-w-48 flex-1">
                <SearchBar value={search().search} onChange={setSearchQuery} />
              </div>
              <div class="tabs tabs-boxed border border-base-200/50 bg-base-300 p-0.5" aria-label="Media type">
                <button type="button" onClick={() => handleFilterChange("all")} class={`tab tab-sm rounded-lg font-bold ${search().filter === "all" || !search().filter ? "tab-active" : "text-base-content/60"}`}>All</button>
                <button type="button" onClick={() => handleFilterChange("images")} class={`tab tab-sm rounded-lg font-bold ${search().filter === "images" ? "tab-active" : "text-base-content/60"}`}>Photos</button>
                <button type="button" onClick={() => handleFilterChange("videos")} class={`tab tab-sm rounded-lg font-bold ${search().filter === "videos" ? "tab-active" : "text-base-content/60"}`}>Videos</button>
              </div>
              <select
                aria-label="Sort media by"
                value={search().sortBy || "date"}
                onChange={(event) => handleSortByChange(event.currentTarget.value as "date" | "name" | "size")}
                class="select select-bordered select-xs rounded-lg border-base-300 bg-base-100/60 text-xs text-base-content focus:border-primary/60 focus:outline-none"
              >
                <option value="date">Date added</option>
                <option value="name">File name</option>
                <option value="size">File size</option>
              </select>
              <button
                type="button"
                onClick={toggleSortOrder}
                class="btn btn-sm btn-ghost px-2 text-xs"
                aria-label={search().sortOrder === "asc" ? "Sort ascending" : "Sort descending"}
                title={search().sortOrder === "asc" ? "Ascending order" : "Descending order"}
              >
                {search().sortOrder === "asc" ? "ASC ↑" : "DESC ↓"}
              </button>
              <button type="button" onClick={handleRefresh} disabled={loading()} class="btn btn-sm btn-ghost btn-square" aria-label="Refresh album" title="Refresh album">
                <RotateCw class={`h-3.5 w-3.5 ${loading() ? "animate-spin" : ""}`} />
              </button>
              <label class="flex items-center gap-1.5 text-xs text-base-content/60">
                <span class="sr-only">Items per page</span>
                <select
                  aria-label="Items per page"
                  value={search().limit || 100}
                  onChange={(event) => handleLimitChange(Number(event.currentTarget.value))}
                  class="select select-bordered select-xs rounded-lg border-base-300 bg-base-100/60 text-xs text-base-content focus:border-primary/60 focus:outline-none"
                  title="Items per page"
                >
                  <For each={[10, 20, 40, 80, 100, 160, 240, 320, 400, 480, 560, 640]}>
                    {(value) => <option value={value}>{value} per page</option>}
                  </For>
                </select>
              </label>
            </div>

            {/* Media Grid */}
            <Show
              when={!loading() || mediaItems().length > 0}
              fallback={
                <div class="flex flex-col items-center justify-center min-h-[40vh] py-12">
                  <Loader2 class="w-10 h-10 text-primary animate-spin mb-4" />
                  <p class="text-xs text-base-content/40 font-bold">
                    Loading Album Content...
                  </p>
                </div>
              }
            >
              <Show
                when={mediaItems().length > 0}
                fallback={
                  <div class="p-12 text-center rounded-2xl bg-base-100/20 border border-base-200/50">
                    <ImageIcon class="w-12 h-12 text-base-content/20 mx-auto mb-4" />
                    <h3 class="text-base-content font-bold">No Items Found</h3>
                    <p class="text-base-content/40 text-xs mt-1.5 max-w-sm mx-auto">
                      This album is currently empty.
                    </p>
                  </div>
                }
              >
                <div
                  class={`catalog-grid catalog-grid--media ${selection.isSelecting ? "is-selecting" : ""}`}
                  style={{ "--catalog-columns": settings.columns }}
                >
                  <For each={mediaItems()}>
                    {(item) => (
                      <MediaCard
                        item={item}
                        drivePath={drive.selectedDrive?.path ?? ""}
                        albumId={albumId()}
                      />
                    )}
                  </For>
                </div>
              </Show>
            </Show>

            <Pagination
              page={search().page || 0}
              totalPages={totalPages()}
              totalItems={totalItems()}
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
                    onClick={() => {
                      const ids = Array.from(selection.selected) as number[];
                      moveModalRef?.open(ids);
                    }}
                    class="btn btn-xs btn-primary font-bold shadow-lg shadow-primary/25 flex items-center gap-1 cursor-pointer"
                  >
                    <FolderPlus class="w-3.5 h-3.5" /> Move to Album
                  </button>
                </div>
              </div>
            </Show>

            <MoveToAlbumModal
              ref={(el) => (moveModalRef = el)}
              drivePath={drive.selectedDrive!.path}
              currentAlbumId={albumId()}
              onSuccess={handleMoveSuccess}
            />

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
                      deleteMediaMutation.mutate(
                        Array.from(selection.selected),
                      );
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
                    This will physically delete the selected files from your
                    disk and database cache. This action{" "}
                    <span class="font-bold">cannot</span> be undone.
                  </div>
                </div>
              </div>
            </DialogModal>
          </div>
        </Show>
      </Show>
    </Show>
  );
}
