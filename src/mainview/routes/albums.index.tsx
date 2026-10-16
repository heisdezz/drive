import { createSignal, createMemo, Show, For } from "solid-js";
import { createFileRoute } from "@tanstack/solid-router";
import { createQuery } from "@tanstack/solid-query";
import { useDriveStore } from "@/store/drive_store";
import { rpc } from "@/lib/rpc";
import { Library, Loader2, FolderPlus } from "lucide-solid";
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
import {
  AlbumsFilterBar,
  type AlbumSortBy,
} from "@/components/AlbumsFilterBar";
import { NoDriveSelected, DriveUnmounted } from "@/components/AlbumsEmptyState";

export const Route = createFileRoute("/albums/")({
  component: AlbumsIndexComponent,
});

function AlbumsIndexComponent() {
  const drive = useDriveStore();

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

  const [searchQuery, setSearchQuery] = createSignal("");
  const [sortBy, setSortBy] = createSignal<AlbumSortBy>("name");

  let createModalRef: ModalHandle | undefined;
  let editModalRef: AlbumDialogHandle | undefined;
  let deleteModalRef: AlbumDialogHandle | undefined;

  const handleEdit = (album: Album) => editModalRef?.open(album);
  const handleDelete = (album: Album) => deleteModalRef?.open(album);

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
        <div class="space-y-6 max-w-5xl">
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
            <button
              onClick={() => createModalRef?.open()}
              class="btn btn-sm btn-primary font-bold shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex items-center gap-1.5 ml-auto md:ml-0"
            >
              <FolderPlus class="w-3.5 h-3.5" /> Create Album
            </button>
          </div>

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
              <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                <For each={filteredAlbums()}>
                  {(album) => (
                    <AlbumCard
                      album={album}
                      drivePath={drive.selectedDrive!.path}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
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
        </div>
      </Show>
    </Show>
  );
}
