import { createSignal, onMount } from "solid-js";
import { createMutation, useQueryClient } from "@tanstack/solid-query";
import { Info } from "lucide-solid";
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

  const handle: AlbumDialogHandle = {
    open: (album: Album) => {
      setDeletingAlbum(album);
      modalRef?.open();
    },
  };

  onMount(() => {
    if (typeof props.ref === "function") {
      props.ref(handle);
    } else if (props.ref && typeof props.ref === "object") {
      (props.ref as any).current = handle;
    }
  });

  const mutation = createMutation(() => ({
    mutationFn: async (albumId: number) => {
      const res = await rpc.request.deleteAlbum({
        drivePath: props.drivePath,
        albumId,
      });
      if (!res.success) {
        throw new Error(res.error || "Failed to delete album");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["albums", props.drivePath] });
      modalRef?.close();
      setDeletingAlbum(null);
    },
    onError: (err: any) => {
      alert(err.message || "Failed to delete album.");
    },
  }));

  return (
    <DialogModal
      ref={(el) => (modalRef = el)}
      title="Delete Album"
      actions={
        <>
          <button
            type="button"
            onClick={() => modalRef?.close()}
            class="btn btn-sm btn-ghost text-base-content/60 hover:text-base-content"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              const album = deletingAlbum();
              if (album) mutation.mutate(album.id);
            }}
            disabled={mutation.isPending}
            class="btn btn-sm btn-error font-bold shadow-lg shadow-error/25 text-error-content"
          >
            {mutation.isPending ? "Deleting..." : "Delete Album"}
          </button>
        </>
      }
    >
      <div class="space-y-3 text-left">
        <p class="text-xs text-base-content/70 leading-relaxed">
          Are you sure you want to delete the album{" "}
          <span class="font-bold text-base-content">
            "{deletingAlbum()?.name}"
          </span>
          ?
        </p>
        <div class="alert alert-info text-xs p-3 rounded-xl flex gap-2 items-start leading-relaxed bg-info/10 border-info/20 text-base-content">
          <Info class="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <span class="font-bold block mb-0.5">
              Important Protection Details
            </span>
            Your physical media files will{" "}
            <span class="font-bold text-primary">not</span> be deleted. They
            will be safely relocated back to the{" "}
            <code class="bg-base-300/50 px-1 py-0.5 rounded font-mono text-[10px]">
              unknown/
            </code>{" "}
            staging folder automatically.
          </div>
        </div>
      </div>
    </DialogModal>
  );
}
