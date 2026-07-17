import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useDriveStore } from "@/store/drive_store";
import { rpc } from "@/lib/rpc";
import {
  Compass,
  HardDrive,
  Info,
  Library,
  Loader2,
  Search,
  ArrowUpDown,
  FolderPlus,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { AlbumCard, type Album } from "@/components/AlbumCard";
import { CreateAlbumModal, type ModalHandle } from "@/components/CreateAlbumModal";
import DialogModal from "@/components/DialogModal";

export const Route = createFileRoute("/albums/")({
  component: AlbumsIndexComponent,
});

function AlbumsIndexComponent() {
  const { selectedDrive, fetchDrives } = useDriveStore();
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
  const [sortBy, setSortBy] = useState<"name" | "count" | "date">("name");
  const createModalRef = useRef<ModalHandle>(null);

  // Edit & Delete states, refs, and forms
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null);
  const [deletingAlbum, setDeletingAlbum] = useState<Album | null>(null);
  const editModalRef = useRef<ModalHandle>(null);
  const deleteConfirmModalRef = useRef<ModalHandle>(null);
  const queryClient = useQueryClient();
  const [editError, setEditError] = useState<string | null>(null);

  const { register: registerEdit, handleSubmit: handleSubmitEdit, reset: resetEdit, watch: watchEdit } = useForm({
    defaultValues: {
      name: "",
      description: "",
    }
  });

  const watchEditName = watchEdit("name");

  const editAlbumMutation = useMutation({
    mutationFn: async (variables: { albumId: number; name: string; description?: string }) => {
      if (!selectedDrive?.path) throw new Error("No active drive selected");
      const res = await rpc.request.editAlbum({
        drivePath: selectedDrive.path,
        albumId: variables.albumId,
        newName: variables.name,
        newDescription: variables.description,
      });
      if (!res.success) {
        throw new Error(res.error || "Failed to update album");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["albums", selectedDrive?.path] });
      editModalRef.current?.close();
      setEditingAlbum(null);
    },
    onError: (err: any) => {
      setEditError(err.message || "Failed to update album.");
    }
  });

  const deleteAlbumMutation = useMutation({
    mutationFn: async (albumId: number) => {
      if (!selectedDrive?.path) throw new Error("No active drive selected");
      const res = await rpc.request.deleteAlbum({
        drivePath: selectedDrive.path,
        albumId,
      });
      if (!res.success) {
        throw new Error(res.error || "Failed to delete album");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["albums", selectedDrive?.path] });
      deleteConfirmModalRef.current?.close();
      setDeletingAlbum(null);
    },
    onError: (err: any) => {
      alert(err.message || "Failed to delete album.");
    }
  });

  const handleOpenEditModal = (album: Album) => {
    setEditingAlbum(album);
    resetEdit({
      name: album.name,
      description: album.description || "",
    });
    setEditError(null);
    editModalRef.current?.open();
  };

  const handleOpenDeleteModal = (album: Album) => {
    setDeletingAlbum(album);
    deleteConfirmModalRef.current?.open();
  };

  const onEditSubmit = handleSubmitEdit((data) => {
    if (!editingAlbum) return;
    const cleanName = data.name.trim();
    if (!cleanName) {
      setEditError("Album name cannot be empty.");
      return;
    }
    setEditError(null);
    editAlbumMutation.mutate({
      albumId: editingAlbum.id,
      name: cleanName,
      description: data.description?.trim() || undefined,
    });
  });

  const filteredAlbums = useMemo(
    () =>
      albums
        .filter(
          (album) =>
            album.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (album.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false),
        )
        .sort((a, b) => {
          if (sortBy === "count") return b.media_count - a.media_count;
          if (sortBy === "date")
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          return a.name.localeCompare(b.name);
        }),
    [albums, searchQuery, sortBy],
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
          Please select a connected drive or storage volume from the sidebar to inspect cataloged
          albums.
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
          This storage device needs to be mounted before you can view its albums.
        </p>
        <button
          onClick={async () => {
            try {
              const res = await rpc.request.mountBlockDevice({ deviceId: selectedDrive.id });
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
      {/* Drive Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-base-200/60 to-base-300/40 border border-base-200 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/15 flex-shrink-0">
            <Library className="w-6 h-6 text-primary-content" />
          </div>
          <div>
            <h2 className="text-xl font-black text-base-content leading-tight">Albums Gallery</h2>
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
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-base-300/50 border border-base-200 p-4 rounded-xl">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/40" />
          <input
            type="text"
            placeholder="Search albums..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-base-100/60 border border-base-300 text-base-content placeholder-base-content/30 focus:outline-none focus:border-primary/60 transition-colors"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <ArrowUpDown className="w-3.5 h-3.5 text-base-content/40" />
          <span className="text-xs text-base-content/60 mr-1 hidden sm:inline">Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="select select-bordered select-xs text-xs rounded-lg bg-base-100/60 border-base-300 text-base-content/80 focus:outline-none focus:border-primary/60"
          >
            <option value="name">Name (A-Z)</option>
            <option value="count">File Count</option>
            <option value="date">Date Discovered</option>
          </select>
        </div>
      </div>

      {/* Albums Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] py-12">
          <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
          <p className="text-xs text-base-content/40 font-bold">Querying Albums Database...</p>
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
              onEdit={handleOpenEditModal}
              onDelete={handleOpenDeleteModal}
            />
          ))}
        </div>
      )}

      <CreateAlbumModal ref={createModalRef} drivePath={selectedDrive.path} />

      {/* Edit Album Dialog Modal */}
      <DialogModal
        ref={editModalRef}
        title="Edit Album Details"
        actions={
          <>
            <button
              type="button"
              onClick={() => editModalRef.current?.close()}
              className="btn btn-sm btn-ghost text-base-content/60 hover:text-base-content"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-album-form"
              disabled={editAlbumMutation.isPending || !watchEditName?.trim()}
              className="btn btn-sm btn-primary font-bold shadow-lg shadow-primary/25"
            >
              {editAlbumMutation.isPending ? "Saving..." : "Save Changes"}
            </button>
          </>
        }
      >
        <form id="edit-album-form" onSubmit={onEditSubmit} className="space-y-4 text-left">
          {editError && (
            <div className="alert alert-error text-xs p-3 rounded-xl flex gap-2 items-center">
              <Info className="w-4 h-4 flex-shrink-0" />
              <span>{editError}</span>
            </div>
          )}

          <div className="form-control w-full">
            <label className="label py-1">
              <span className="label-text font-bold text-xs text-base-content/70">Album Name</span>
            </label>
            <input
              type="text"
              placeholder="e.g., Summer Trip 2026"
              {...registerEdit("name", { required: true, maxLength: 50 })}
              className="input input-bordered input-sm w-full bg-base-100/60 border-base-300 text-xs text-base-content placeholder-base-content/30 focus:outline-none focus:border-primary/60"
              maxLength={50}
              disabled={editingAlbum?.name === "unknown"}
            />
          </div>

          <div className="form-control w-full">
            <label className="label py-1">
              <span className="label-text font-bold text-xs text-base-content/70">Description (Optional)</span>
            </label>
            <textarea
              placeholder="Provide a brief description of the album's contents..."
              {...registerEdit("description", { maxLength: 200 })}
              className="textarea textarea-bordered textarea-sm w-full h-20 bg-base-100/60 border-base-300 text-xs text-base-content placeholder-base-content/30 focus:outline-none focus:border-primary/60"
              maxLength={200}
            />
          </div>
        </form>
      </DialogModal>

      {/* Delete Album Confirmation Dialog Modal */}
      <DialogModal
        ref={deleteConfirmModalRef}
        title="Delete Album"
        actions={
          <>
            <button
              type="button"
              onClick={() => deleteConfirmModalRef.current?.close()}
              className="btn btn-sm btn-ghost text-base-content/60 hover:text-base-content"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (deletingAlbum) {
                  deleteAlbumMutation.mutate(deletingAlbum.id);
                }
              }}
              disabled={deleteAlbumMutation.isPending}
              className="btn btn-sm btn-error font-bold shadow-lg shadow-error/25 text-error-content"
            >
              {deleteAlbumMutation.isPending ? "Deleting..." : "Delete Album"}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-left">
          <p className="text-xs text-base-content/70 leading-relaxed">
            Are you sure you want to delete the album <span className="font-bold text-base-content">"{deletingAlbum?.name}"</span>?
          </p>
          <div className="alert alert-info text-xs p-3 rounded-xl flex gap-2 items-start leading-relaxed bg-info/10 border-info/20 text-base-content">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block mb-0.5">Important Protection Details</span>
              Your physical media files will <span className="font-bold text-primary">not</span> be deleted. They will be safely relocated back to the <span className="font-bold">Unsorted Media (unknown)</span> section.
            </div>
          </div>
        </div>
      </DialogModal>
    </div>
  );
}
