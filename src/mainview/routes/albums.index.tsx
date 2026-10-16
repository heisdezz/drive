import { createSignal, createMemo, Show, For } from "solid-js";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/solid-router";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { useDriveStore } from "@/store/drive_store";
import { useSettingsStore } from "@/store/settings_store";
import { rpc } from "@/lib/rpc";
import { Library, Loader2, FolderPlus, RotateCw } from "lucide-solid";
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
import { MergeAlbumModal } from "@/components/MergeAlbumModal";
import {
  AlbumsFilterBar,
  type AlbumSortBy,
} from "@/components/AlbumsFilterBar";
import { NoDriveSelected, DriveUnmounted } from "@/components/AlbumsEmptyState";

interface AlbumsSearch {
  search?: string;
}

export const Route = createFileRoute("/albums/")({
  component: AlbumsIndexComponent,
  validateSearch: (search: Record<string, unknown>): AlbumsSearch => ({
    search: typeof search.search === "string" && search.search ? search.search : undefined,
  }),
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
      search: (previous: AlbumsSearch) => ({ ...previous, search: value || undefined }),
      replace: true,
      resetScroll: false,
    });
  };
  const [sortBy, setSortBy] = createSignal<AlbumSortBy>("name");

  let createModalRef: ModalHandle | undefined;
  let editModalRef: AlbumDialogHandle | undefined;
  let deleteModalRef: AlbumDialogHandle | undefined;
  let mergeModalRef: AlbumDialogHandle | undefined;

  const handleEdit = (album: Album) => editModalRef?.open(album);
  const handleDelete = (album: Album) => deleteModalRef?.open(album);
  const handleMerge = (album: Album) => mergeModalRef?.open(album);

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

  return (
    <Show when={drive.selectedDrive} fallback={<NoDriveSelected />}>
      <Show
        when={drive.selectedDrive!.status !== "unmounted"}
        fallback={<DriveUnmounted drive={drive.selectedDrive!} />}
      >
        <div class="space-y-6 max-w-[1600px]">
          {/* Drive Header */}
          <div class="p-6 rounded-2xl bg-gradient-to-br from-base-200/60 to-base-300/40 border border-base-200 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-xl bg-gradient-to-tr from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/15 flex-shrink-0">
                <Library class="w-6 h-6 text-primary-content" />
              </div>
              <div>
                <h2 class="text-xl font-black text-base-content leading-tight">
                  Albums Gallery
                </h2>
                <span class="text-[10px] font-mono text-base-content/40 uppercase font-bold tracking-wider">
                  {drive.selectedDrive!.name} · {albums().length} Total Albums
                </span>
              </div>
            </div>
            <button onClick={validateFiles} disabled={validating()} class="btn btn-sm btn-outline gap-1.5 ml-auto md:ml-0">
              <RotateCw class={`w-3.5 h-3.5 ${validating() ? "animate-spin" : ""}`} /> Validate Files
            </button>
            <button
              onClick={() => createModalRef?.open()}
              class="btn btn-sm btn-primary font-bold shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex items-center gap-1.5 ml-auto md:ml-0"
            >
              <FolderPlus class="w-3.5 h-3.5" /> Create Album
            </button>
          </div>

          <Show when={validationMessage()}><p role="status" class="text-xs text-base-content/70">{validationMessage()}</p></Show>

          {/* Filter & Sort Bar */}
          <AlbumsFilterBar
            searchQuery={searchQuery()}
            onSearchChange={setSearchQuery}
            sortBy={sortBy()}
            onSortChange={setSortBy}
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
          />
        </div>
      </Show>
    </Show>
  );
}
