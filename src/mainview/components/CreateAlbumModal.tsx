import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { rpc } from "@/lib/rpc";
import DialogModal, { type ModalHandle } from "@/components/DialogModal";

export type { ModalHandle };

interface Props {
  drivePath: string;
}

export const CreateAlbumModal = forwardRef<ModalHandle, Props>(
  function CreateAlbumModal({ drivePath }, ref) {
    const dialogRef = useRef<ModalHandle>(null);
    const { register, handleSubmit, reset, watch } = useForm({
      defaultValues: { name: "", description: "" },
    });
    const watchName = watch("name");
    const queryClient = useQueryClient();
    const [createError, setCreateError] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
      open: () => {
        reset();
        setCreateError(null);
        dialogRef.current?.open();
      },
      close: () => dialogRef.current?.close(),
    }));

    const mutation = useMutation({
      mutationFn: async (vars: { name: string; description?: string }) => {
        const res = await rpc.request.createAlbum({
          drivePath,
          name: vars.name,
          description: vars.description,
        });
        if (!res.success) throw new Error(res.error || "Failed to create album");
        return res.album;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["albums", drivePath] });
        dialogRef.current?.close();
        reset();
        setCreateError(null);
      },
      onError: (err: any) => {
        setCreateError(err.message || "Failed to create album.");
      },
    });

    const onSubmit = handleSubmit((data) => {
      const cleanName = data.name.trim();
      if (!cleanName) {
        setCreateError("Album name cannot be empty.");
        return;
      }
      setCreateError(null);
      mutation.mutate({ name: cleanName, description: data.description?.trim() || undefined });
    });

    return (
      <DialogModal
        ref={dialogRef}
        title="Create New Album"
        actions={
          <>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="btn btn-sm btn-ghost text-base-content/60 hover:text-base-content"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="create-album-form"
              disabled={mutation.isPending || !watchName?.trim()}
              className="btn btn-sm btn-primary font-bold shadow-lg shadow-primary/25"
            >
              {mutation.isPending ? "Creating..." : "Create"}
            </button>
          </>
        }
      >
        <form id="create-album-form" onSubmit={onSubmit} className="space-y-4 text-left">
          {createError && (
            <div className="alert alert-error text-xs p-3 rounded-xl flex gap-2 items-center">
              <Info className="w-4 h-4 flex-shrink-0" />
              <span>{createError}</span>
            </div>
          )}

          <div className="form-control w-full">
            <label className="label py-1">
              <span className="label-text font-bold text-xs text-base-content/70">Album Name</span>
            </label>
            <input
              type="text"
              placeholder="e.g., Summer Trip 2026"
              {...register("name", { required: true, maxLength: 50 })}
              className="input input-bordered input-sm w-full bg-base-100/60 border-base-300 text-xs text-base-content placeholder-base-content/30 focus:outline-none focus:border-primary/60"
              maxLength={50}
            />
          </div>

          <div className="form-control w-full">
            <label className="label py-1">
              <span className="label-text font-bold text-xs text-base-content/70">Description (Optional)</span>
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
