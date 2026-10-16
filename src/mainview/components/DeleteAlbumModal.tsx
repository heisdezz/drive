import { createSignal, onMount } from "solid-js";
import { createMutation, useQueryClient } from "@tanstack/solid-query";
import { Info, Trash2 } from "lucide-solid";
import { rpc } from "@/lib/rpc";
import DialogModal, { type ModalHandle } from "@/components/DialogModal";
import type { Album } from "@/components/AlbumCard";
import type { AlbumDialogHandle } from "@/components/EditAlbumModal";

interface DeleteAlbumModalProps {
  drivePath: string;
  ref?:
    | AlbumDialogHandle
    | { current: AlbumDialogHandle | null }
    | ((handle: AlbumDialogHandle) => void);
}

export function DeleteAlbumModal(props: DeleteAlbumModalProps) {
  let modalRef: ModalHandle | undefined;
  const queryClient = useQueryClient();
  const [deletingAlbum, setDeletingAlbum] = createSignal<Album | null>(null);
  const [deleteError, setDeleteError] = createSignal("");

  const handle: AlbumDialogHandle = {
    open: (album: Album) => {
      setDeletingAlbum(album);
      setDeleteError("");
      modalRef?.open();
    },
  };

  onMount(() => {
    if (typeof props.ref === "function") {
      props.ref(handle);
    } else if (props.ref && typeof props.ref === "object" && "current" in props.ref) {
      props.ref.current = handle;
    }
  });

  const mutation = createMutation(() => ({
    mutationFn: async ({ albumId, permanent }: { albumId: number; permanent: boolean }) => {
      const res = await rpc.request.deleteAlbum({
        drivePath: props.drivePath,
        albumId,
        permanent,
      });
      if (!res.success) {
        throw new Error(res.error || "Failed to delete album");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["albums", props.drivePath] });
      queryClient.invalidateQueries({ queryKey: ["album", props.drivePath], refetchType: "none" });
      queryClient.invalidateQueries({ queryKey: ["album-media", props.drivePath], refetchType: "none" });
      queryClient.invalidateQueries({ queryKey: ["mediaItem", props.drivePath], refetchType: "none" });
      modalRef?.close();
      setDeletingAlbum(null);
    },
    onError: (err: Error) => setDeleteError(err.message || "Failed to delete album."),
  }));

  const deleteAlbum = (permanent: boolean) => {
    const album = deletingAlbum();
    if (album) mutation.mutate({ albumId: album.id, permanent });
  };

  return (
    <DialogModal
      ref={(el) => (modalRef = el)}
      title="Delete Album"
      actions={
        <>
          <button
            type="button"
            onClick={() => modalRef?.close()}
            disabled={mutation.isPending}
            class="btn btn-sm btn-ghost text-base-content/60 hover:text-base-content"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => deleteAlbum(false)}
            disabled={mutation.isPending}
            class="btn btn-sm btn-outline font-bold"
          >
            {mutation.isPending && mutation.variables?.permanent === false ? "Moving files..." : "Keep files"}
          </button>
          <button
            type="button"
            onClick={() => deleteAlbum(true)}
            disabled={mutation.isPending}
            class="btn btn-sm btn-error font-bold text-error-content"
          >
            <Trash2 class="h-4 w-4" /> {mutation.isPending && mutation.variables?.permanent ? "Deleting..." : "Delete permanently"}
          </button>
        </>
      }
    >
      <div class="space-y-3 text-left">
        <p class="text-sm text-base-content/80 leading-relaxed">
          Remove the album{" "}
          <span class="font-bold text-base-content">
            "{deletingAlbum()?.name}"
          </span>
          ? It contains {deletingAlbum()?.media_count ?? 0} indexed media files.
        </p>
        <div class="alert alert-info text-xs p-3 rounded-xl flex gap-2 items-start leading-relaxed bg-info/10 border-info/20 text-base-content">
          <Info class="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <strong>Keep files</strong> moves this album's media to Unsorted Media. <strong>Delete permanently</strong> removes its indexed media files from disk and the catalog. Child albums and their files remain in either case.
          </div>
        </div>
        {deleteError() && <p role="alert" class="rounded-lg border border-error/30 bg-error/10 p-3 text-xs text-error">{deleteError()}</p>}
      </div>
    </DialogModal>
  );
}
