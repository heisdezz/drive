import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { rpc } from "@/lib/rpc";
import DialogModal, { type ModalHandle } from "@/components/DialogModal";
import type { Album } from "@/components/AlbumCard";
import type { AlbumDialogHandle } from "@/components/EditAlbumModal";

interface DeleteAlbumModalProps {
  drivePath: string;
}

// Self-contained delete confirmation: owns its mutation so it re-renders
// independently of the albums page.
export const DeleteAlbumModal = forwardRef<
  AlbumDialogHandle,
  DeleteAlbumModalProps
>(function DeleteAlbumModal({ drivePath }, ref) {
  const modalRef = useRef<ModalHandle>(null);
  const queryClient = useQueryClient();
  const [deletingAlbum, setDeletingAlbum] = useState<Album | null>(null);

  useImperativeHandle(ref, () => ({
    open: (album: Album) => {
      setDeletingAlbum(album);
      modalRef.current?.open();
    },
  }));

  const mutation = useMutation({
    mutationFn: async (albumId: number) => {
      const res = await rpc.request.deleteAlbum({ drivePath, albumId });
      if (!res.success) {
        throw new Error(res.error || "Failed to delete album");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["albums", drivePath] });
      modalRef.current?.close();
      setDeletingAlbum(null);
    },
    onError: (err: any) => {
      alert(err.message || "Failed to delete album.");
    },
  });

  return (
    <DialogModal
      ref={modalRef}
      title="Delete Album"
      actions={
        <>
          <button
            type="button"
            onClick={() => modalRef.current?.close()}
            className="btn btn-sm btn-ghost text-base-content/60 hover:text-base-content"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (deletingAlbum) mutation.mutate(deletingAlbum.id);
            }}
            disabled={mutation.isPending}
            className="btn btn-sm btn-error font-bold shadow-lg shadow-error/25 text-error-content"
          >
            {mutation.isPending ? "Deleting..." : "Delete Album"}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-left">
        <p className="text-xs text-base-content/70 leading-relaxed">
          Are you sure you want to delete the album{" "}
          <span className="font-bold text-base-content">
            "{deletingAlbum?.name}"
          </span>
          ?
        </p>
        <div className="alert alert-info text-xs p-3 rounded-xl flex gap-2 items-start leading-relaxed bg-info/10 border-info/20 text-base-content">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block mb-0.5">
              Important Protection Details
            </span>
            Your physical media files will{" "}
            <span className="font-bold text-primary">not</span> be deleted. They
            will be safely relocated back to the{" "}
            <span className="font-bold">Unsorted Media (unknown)</span> section.
          </div>
        </div>
      </div>
    </DialogModal>
  );
});
