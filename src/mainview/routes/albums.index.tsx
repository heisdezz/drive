import { createSignal, createMemo, createEffect, Show, For } from "solid-js";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/solid-router";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { useDriveStore } from "@/store/drive_store";
import { useSettingsStore } from "@/store/settings_store";
import { rpc } from "@/lib/rpc";
import { Library, Loader2, FolderPlus, RotateCw, CheckSquare, FolderInput } from "lucide-solid";
import { patchSearch, validateAlbumsSearch, type AlbumsSearch, type AlbumSortBy } from "@/lib/catalogSearch";
import { AlbumCard, type Album } from "@/components/AlbumCard";
import {
  CreateAlbumModal,
  type ModalHandle,
} from "@/components/CreateAlbumModal";
import {
  EditAlbumModal,
  type AlbumDialogHandle,
} from "@/components/EditAlbumModal";
import { DeleteAlbumModal } from "@/components/DeleteAlbumModal";
import { MergeAlbumModal, type MergeAlbumDialogHandle } from "@/components/MergeAlbumModal";
import { AlbumsFilterBar } from "@/components/AlbumsFilterBar";
import { NoDriveSelected, DriveUnmounted } from "@/components/AlbumsEmptyState";

export const Route = createFileRoute("/albums/")({
  component: AlbumsIndexComponent,
  validateSearch: validateAlbumsSearch,
});

function AlbumsIndexComponent() {
  const drive = useDriveStore();
  const settings = useSettingsStore();
  const queryClient = useQueryClient();
  const routeSearch = useSearch({ from: Route.id });
  const navigate = useNavigate({ from: Route.id });
  const [validating, setValidating] = createSignal(false);
  const [validationMessage, setValidationMessage] = createSignal("");

  const validateFiles = async () => {
    const drivePath = drive.selectedDrive?.path;
    if (!drivePath) return;
    setValidating(true);
    try {
      const result = await rpc.request.validateAlbumFiles({ drivePath });
      if (!result.success) throw new Error(result.error || "Validation failed");
      setValidationMessage(`Checked ${result.checked} files; removed ${result.removed} missing entries.`);
      await queryClient.invalidateQueries({ queryKey: ["albums", drivePath] });
    } catch (err: any) {
      setValidationMessage(err.message || "Validation failed");
    } finally {
      setValidating(false);
    }
  };

  const albumsQuery = createQuery(() => ({
    queryKey: ["albums", drive.selectedDrive?.path],
    queryFn: async () => {
      const path = drive.selectedDrive?.path;
      if (!path) return [] as Album[];
      const res = await rpc.request.getAlbums({ drivePath: path });
      if (res.error) throw new Error(res.error);
      return (res.albums || []) as Album[];
    },
    enabled: !!drive.selectedDrive?.path,
  }));

  const searchQuery = () => routeSearch().search || "";
  const setSearchQuery = (value: string) => {
    navigate({
      search: (previous: AlbumsSearch) => patchSearch(previous, { search: value || undefined }),
      replace: true,
      resetScroll: false,
    });
  };
  const sortBy = () => routeSearch().sortBy || "name";
  const setSortBy = (value: AlbumSortBy) => navigate({
    search: (previous: AlbumsSearch) => patchSearch(previous, { sortBy: value }),
    replace: true,
    resetScroll: false,
  });
  const [selecting, setSelecting] = createSignal(false);
  const [selectedIds, setSelectedIds] = createSignal<Set<number>>(new Set());
  createEffect(() => {
    drive.selectedDrive?.path;
    setSelecting(false);
    setSelectedIds(new Set<number>());
  });

  let createModalRef: ModalHandle | undefined;
  let editModalRef: AlbumDialogHandle | undefined;
  let deleteModalRef: AlbumDialogHandle | undefined;
  let mergeModalRef: MergeAlbumDialogHandle | undefined;

  const handleEdit = (album: Album) => editModalRef?.open(album);
  const handleDelete = (album: Album) => deleteModalRef?.open(album);
  const handleMerge = (album: Album) => mergeModalRef?.open(album);
  const toggleSelected = (album: Album) => {
    setSelecting(true);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(album.id)) next.delete(album.id);
      else next.add(album.id);
      return next;
    });
  };
  const cancelSelection = () => {
    setSelecting(false);
    setSelectedIds(new Set<number>());
  };

  const albums = () => albumsQuery.data || [];

  const filteredAlbums = createMemo(() => {
    const query = searchQuery().toLowerCase();
    const sort = sortBy();
    return albums()
      .filter(
        (album) =>
          album.name.toLowerCase().includes(query) ||
          (album.description?.toLowerCase().includes(query) ?? false),
      )
      .sort((a, b) => {
        if (sort === "count") return b.media_count - a.media_count;
        if (sort === "date") {
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        }
        return a.name.localeCompare(b.name);
      });
  });
  const selectedAlbums = createMemo(() => albums().filter((album) => selectedIds().has(album.id)));
  const allVisibleSelected = () => filteredAlbums().length > 0 && filteredAlbums().every((album) => selectedIds().has(album.id));
  const selectVisible = () => {
    const remove = allVisibleSelected();
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const album of filteredAlbums()) {
        if (remove) next.delete(album.id);
        else next.add(album.id);
      }
      return next;
    });
  };

  return (
    <Show when={drive.selectedDrive} fallback={<NoDriveSelected />}>
      <Show
        when={drive.selectedDrive!.status !== "unmounted"}
        fallback={<DriveUnmounted drive={drive.selectedDrive!} />}
      >
        <div class="max-w-[1600px] space-y-3">
          {/* Drive Header */}
          <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-base-200 bg-gradient-to-br from-base-200/60 to-base-300/40 px-4 py-3 shadow-lg">
            <div class="flex min-w-0 items-center gap-3">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-primary to-secondary shadow-md shadow-primary/15">
                <Library class="h-5 w-5 text-primary-content" />
              </div>
              <div class="min-w-0">
                <h2 class="text-lg font-black leading-tight text-base-content">
                  Albums Gallery
                </h2>
                <span class="block truncate font-mono text-[10px] font-bold uppercase tracking-wider text-base-content/50">
                  {drive.selectedDrive!.name} · {albums().length} Total Albums
                </span>
                <Show when={validationMessage()}><span role="status" class="block text-xs text-base-content/70">{validationMessage()}</span></Show>
              </div>
            </div>
            <div class="ml-auto flex items-center gap-2">
              <button onClick={validateFiles} disabled={validating()} class="btn btn-sm btn-ghost gap-1.5" title="Check for missing files">
                <RotateCw class={`h-3.5 w-3.5 ${validating() ? "animate-spin" : ""}`} /> Validate
              </button>
              <button onClick={() => createModalRef?.open()} class="btn btn-sm btn-primary gap-1.5 font-bold">
                <FolderPlus class="h-3.5 w-3.5" /> Create Album
              </button>
            </div>
          </div>

          {/* Filter & Sort Bar */}
          <AlbumsFilterBar
            searchQuery={searchQuery()}
            onSearchChange={setSearchQuery}
            sortBy={sortBy()}
            onSortChange={setSortBy}
            actions={
              <div class="flex flex-wrap items-center gap-1.5 sm:ml-auto">
                <button type="button" class="btn btn-sm btn-outline gap-1.5" aria-pressed={selecting()} onClick={() => selecting() ? cancelSelection() : setSelecting(true)}>
                  <CheckSquare class="h-4 w-4" /> {selecting() ? "Cancel" : "Select"}
                </button>
                <Show when={selecting()}>
                  <span class="min-w-8 text-center text-xs font-medium tabular-nums text-base-content/70" aria-live="polite">{selectedAlbums().length} selected</span>
                  <button type="button" class="btn btn-sm btn-ghost" disabled={!filteredAlbums().length} onClick={selectVisible}>{allVisibleSelected() ? "Deselect visible" : "Select visible"}</button>
                  <button type="button" class="btn btn-sm btn-primary gap-1.5" disabled={selectedAlbums().length < 2} onClick={() => mergeModalRef?.openMany(selectedAlbums())}>
                    <FolderInput class="h-4 w-4" /> Merge
                  </button>
                </Show>
              </div>
            }
          />

          {/* Albums Grid */}
          <Show
            when={!albumsQuery.isLoading}
            fallback={
              <div class="flex flex-col items-center justify-center min-h-[40vh] py-12">
                <Loader2 class="w-10 h-10 text-primary animate-spin mb-4" />
                <p class="text-xs text-base-content/40 font-bold">
                  Querying Albums Database...
                </p>
              </div>
            }
          >
            <Show
              when={filteredAlbums().length > 0}
              fallback={
                <div class="p-12 text-center rounded-2xl bg-base-100/20 border border-base-200/50">
                  <Library class="w-12 h-12 text-base-content/20 mx-auto mb-4" />
                  <h3 class="text-base-content font-bold">No Albums Found</h3>
                  <p class="text-base-content/40 text-xs mt-1.5 max-w-sm mx-auto">
                    {searchQuery()
                      ? "No albums match your search query."
                      : "This drive doesn't have any albums indexed yet. Subdirectories containing media will appear here as albums after running a Discover scan."}
                  </p>
                </div>
              }
            >
              <div
                class="catalog-grid catalog-grid--albums"
                style={{ "--catalog-columns": settings.columns }}
              >
                <For each={filteredAlbums()}>
                  {(album) => (
                    <AlbumCard
                      album={album}
                      drivePath={drive.selectedDrive!.path}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onMerge={handleMerge}
                      selecting={selecting()}
                      selected={selectedIds().has(album.id)}
                      onSelect={toggleSelected}
                    />
                  )}
                </For>
              </div>
            </Show>
          </Show>

          <CreateAlbumModal
            ref={(el) => (createModalRef = el)}
            drivePath={drive.selectedDrive!.path}
          />
          <EditAlbumModal
            ref={(el) => (editModalRef = el)}
            drivePath={drive.selectedDrive!.path}
          />
          <DeleteAlbumModal
            ref={(el) => (deleteModalRef = el)}
            drivePath={drive.selectedDrive!.path}
          />
          <MergeAlbumModal
            ref={(el) => (mergeModalRef = el)}
            drivePath={drive.selectedDrive!.path}
            albums={albums()}
            onMerged={cancelSelection}
          />
        </div>
      </Show>
    </Show>
  );
}
