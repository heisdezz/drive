import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { rpc } from "@/lib/rpc";
import DialogModal, { type ModalHandle } from "@/components/DialogModal";
import type { Album } from "@/components/AlbumCard";

export interface AlbumDialogHandle {
  open: (album: Album) => void;
}

interface EditAlbumModalProps {
  drivePath: string;
}

// Self-contained edit dialog: owns its form, mutation and error state so
// keystrokes in the name/description fields only re-render this modal instead
// of the whole albums page.
export const EditAlbumModal = forwardRef<AlbumDialogHandle, EditAlbumModalProps>(
  function EditAlbumModal({ drivePath }, ref) {
    const modalRef = useRef<ModalHandle>(null);
    const queryClient = useQueryClient();
    const [editingAlbum, setEditingAlbum] = useState<Album | null>(null);
    const [editError, setEditError] = useState<string | null>(null);

    const { register, handleSubmit, reset, watch } = useForm({
      defaultValues: { name: "", description: "" },
    });
    const watchName = watch("name");

    useImperativeHandle(ref, () => ({
      open: (album: Album) => {
        setEditingAlbum(album);
        reset({ name: album.name, description: album.description || "" });
        setEditError(null);
        modalRef.current?.open();
      },
    }));

    const mutation = useMutation({
      mutationFn: async (variables: {
        albumId: number;
        name: string;
        description?: string;
      }) => {
        const res = await rpc.request.editAlbum({
          drivePath,
          albumId: variables.albumId,
          newName: variables.name,
          newDescription: variables.description,
        });
        if (!res.success) {
          throw new Error(res.error || "Failed to update album");
        }
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["albums", drivePath] });
        modalRef.current?.close();
        setEditingAlbum(null);
      },
      onError: (err: any) => {
        setEditError(err.message || "Failed to update album.");
      },
    });

    const onSubmit = handleSubmit((data) => {
      if (!editingAlbum) return;
      const cleanName = data.name.trim();
      if (!cleanName) {
        setEditError("Album name cannot be empty.");
        return;
      }
      setEditError(null);
      mutation.mutate({
        albumId: editingAlbum.id,
        name: cleanName,
        description: data.description?.trim() || undefined,
      });
    });

    return (
      <DialogModal
        ref={modalRef}
        title="Edit Album Details"
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
              type="submit"
              form="edit-album-form"
              disabled={mutation.isPending || !watchName?.trim()}
              className="btn btn-sm btn-primary font-bold shadow-lg shadow-primary/25"
            >
              {mutation.isPending ? "Saving..." : "Save Changes"}
            </button>
          </>
        }
      >
        <form id="edit-album-form" onSubmit={onSubmit} className="space-y-4 text-left">
          {editError && (
            <div className="alert alert-error text-xs p-3 rounded-xl flex gap-2 items-center">
              <Info className="w-4 h-4 flex-shrink-0" />
              <span>{editError}</span>
            </div>
          )}

          <div className="form-control w-full">
            <label className="label py-1">
              <span className="label-text font-bold text-xs text-base-content/70">
                Album Name
              </span>
            </label>
            <input
              type="text"
              placeholder="e.g., Summer Trip 2026"
              {...register("name", { required: true, maxLength: 50 })}
              className="input input-bordered input-sm w-full bg-base-100/60 border-base-300 text-xs text-base-content placeholder-base-content/30 focus:outline-none focus:border-primary/60"
              maxLength={50}
              disabled={editingAlbum?.name === "unknown"}
            />
          </div>

          <div className="form-control w-full">
            <label className="label py-1">
              <span className="label-text font-bold text-xs text-base-content/70">
                Description (Optional)
              </span>
            </label>
            <textarea
              placeholder="Provide a brief description of the album's contents..."
              {...register("description", { maxLength: 200 })}
              className="textarea textarea-bordered textarea-sm w-full h-20 bg-base-100/60 border-base-300 text-xs text-base-content placeholder-base-content/30 focus:outline-none focus:border-primary/60"
              maxLength={200}
            />
          </div>
        </form>
      </DialogModal>
    );
  },
);
