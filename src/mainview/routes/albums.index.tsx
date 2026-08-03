import { useCallback, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useDriveStore } from "@/store/drive_store";
import { rpc } from "@/lib/rpc";
import { Library, Loader2, FolderPlus } from "lucide-react";
import { AlbumCard, type Album } from "@/components/AlbumCard";
import { CreateAlbumModal, type ModalHandle } from "@/components/CreateAlbumModal";
import {
  EditAlbumModal,
  type AlbumDialogHandle,
} from "@/components/EditAlbumModal";
import { DeleteAlbumModal } from "@/components/DeleteAlbumModal";
import {
  AlbumsFilterBar,
  type AlbumSortBy,
} from "@/components/AlbumsFilterBar";
import {
  NoDriveSelected,
  DriveUnmounted,
} from "@/components/AlbumsEmptyState";

export const Route = createFileRoute("/albums/")({
  component: AlbumsIndexComponent,
});

function AlbumsIndexComponent() {
  const selectedDrive = useDriveStore((s) => s.selectedDrive);
  const { data: albums = [], isLoading: loading } = useQuery<Album[]>({
    queryKey: ["albums", selectedDrive?.path],
    queryFn: async () => {
      if (!selectedDrive?.path) return [];
      const res = await rpc.request.getAlbums({ drivePath: selectedDrive.path });
      if (res.error) throw new Error(res.error);
      return res.albums || [];
    },
    enabled: !!selectedDrive?.path,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<AlbumSortBy>("name");
  const createModalRef = useRef<ModalHandle>(null);
  const editModalRef = useRef<AlbumDialogHandle>(null);
  const deleteModalRef = useRef<AlbumDialogHandle>(null);

  // Stable identities so the memoized AlbumCard isn't re-rendered every time.
  const handleEdit = useCallback(
    (album: Album) => editModalRef.current?.open(album),
    [],
  );
  const handleDelete = useCallback(
    (album: Album) => deleteModalRef.current?.open(album),
    [],
  );

  const filteredAlbums = useMemo(
    () =>
      albums
        .filter(
          (album) =>
            album.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (album.description
              ?.toLowerCase()
              .includes(searchQuery.toLowerCase()) ??
              false),
        )
        .sort((a, b) => {
          if (sortBy === "count") return b.media_count - a.media_count;
          if (sortBy === "date")
            return (
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime()
            );
          return a.name.localeCompare(b.name);
        }),
    [albums, searchQuery, sortBy],
  );

  if (!selectedDrive) return <NoDriveSelected />;
  if (selectedDrive.status === "unmounted")
    return <DriveUnmounted drive={selectedDrive} />;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Drive Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-base-200/60 to-base-300/40 border border-base-200 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/15 flex-shrink-0">
            <Library className="w-6 h-6 text-primary-content" />
          </div>
          <div>
            <h2 className="text-xl font-black text-base-content leading-tight">
              Albums Gallery
            </h2>
            <span className="text-[10px] font-mono text-base-content/40 uppercase font-bold tracking-wider">
              {selectedDrive.name} · {albums.length} Total Albums
            </span>
          </div>
        </div>
        <button
          onClick={() => createModalRef.current?.open()}
          className="btn btn-sm btn-primary font-bold shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex items-center gap-1.5 ml-auto md:ml-0"
        >
          <FolderPlus className="w-3.5 h-3.5" /> Create Album
        </button>
      </div>

      {/* Filter & Sort Bar */}
      <AlbumsFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        sortBy={sortBy}
        onSortChange={setSortBy}
      />

      {/* Albums Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] py-12">
          <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
          <p className="text-xs text-base-content/40 font-bold">
            Querying Albums Database...
          </p>
        </div>
      ) : filteredAlbums.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-base-100/20 border border-base-200/50">
          <Library className="w-12 h-12 text-base-content/20 mx-auto mb-4" />
          <h3 className="text-base-content font-bold">No Albums Found</h3>
          <p className="text-base-content/40 text-xs mt-1.5 max-w-sm mx-auto">
            {searchQuery
              ? "No albums match your search query."
              : "This drive doesn't have any albums indexed yet. Subdirectories containing media will appear here as albums after running a Discover scan."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {filteredAlbums.map((album) => (
            <AlbumCard
              key={album.id}
              album={album}
              drivePath={selectedDrive.path}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <CreateAlbumModal ref={createModalRef} drivePath={selectedDrive.path} />
      <EditAlbumModal ref={editModalRef} drivePath={selectedDrive.path} />
      <DeleteAlbumModal ref={deleteModalRef} drivePath={selectedDrive.path} />
    </div>
  );
}
