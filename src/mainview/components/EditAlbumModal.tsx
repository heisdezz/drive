import { createSignal, Show, onMount } from "solid-js";
import { createMutation, useQueryClient } from "@tanstack/solid-query";
import { Info } from "lucide-solid";
import { rpc } from "@/lib/rpc";
import DialogModal, { type ModalHandle } from "@/components/DialogModal";
import type { Album } from "@/components/AlbumCard";

export interface AlbumDialogHandle {
  open: (album: Album) => void;
}

interface EditAlbumModalProps {
  drivePath: string;
  ref?:
    | AlbumDialogHandle
    | { current: AlbumDialogHandle | null }
    | ((handle: AlbumDialogHandle) => void);
}

export function EditAlbumModal(props: EditAlbumModalProps) {
  let modalRef: ModalHandle | undefined;
  const queryClient = useQueryClient();

  const [editingAlbum, setEditingAlbum] = createSignal<Album | null>(null);
  const [name, setName] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [editError, setEditError] = createSignal<string | null>(null);

  const handle: AlbumDialogHandle = {
    open: (album: Album) => {
      setEditingAlbum(album);
      setName(album.name);
      setDescription(album.description || "");
      setEditError(null);
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
    mutationFn: async (variables: {
      albumId: number;
      name: string;
      description?: string;
    }) => {
      const res = await rpc.request.editAlbum({
        drivePath: props.drivePath,
        albumId: variables.albumId,
        newName: variables.name,
        newDescription: variables.description,
      });
      if (!res.success) {
        throw new Error(res.error || "Failed to update album");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["albums", props.drivePath] });
      modalRef?.close();
      setEditingAlbum(null);
    },
    onError: (err: any) => {
      setEditError(err.message || "Failed to update album.");
    },
  }));

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    const current = editingAlbum();
    if (!current) return;
    const cleanName = name().trim();
    if (!cleanName) {
      setEditError("Album name cannot be empty.");
      return;
    }
    setEditError(null);
    mutation.mutate({
      albumId: current.id,
      name: cleanName,
      description: description().trim() || undefined,
    });
  };

  return (
    <DialogModal
      ref={(el) => (modalRef = el)}
      title="Edit Album Details"
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
            type="submit"
            form="edit-album-form"
            disabled={mutation.isPending || !name().trim()}
            class="btn btn-sm btn-primary font-bold shadow-lg shadow-primary/25"
          >
            {mutation.isPending ? "Saving..." : "Save Changes"}
          </button>
        </>
      }
    >
      <form
        id="edit-album-form"
        onSubmit={handleSubmit}
        class="space-y-4 text-left"
      >
        <Show when={editError()}>
          <div class="alert alert-error text-xs p-3 rounded-xl flex gap-2 items-center">
            <Info class="w-4 h-4 flex-shrink-0" />
            <span>{editError()}</span>
          </div>
        </Show>

        <div class="form-control w-full">
          <label class="label py-1">
            <span class="label-text font-bold text-xs text-base-content/70">
              Album Name
            </span>
          </label>
          <input
            type="text"
            placeholder="e.g., Summer Trip 2026"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            class="input input-bordered input-sm w-full bg-base-100/60 border-base-300 text-xs text-base-content placeholder-base-content/30 focus:outline-none focus:border-primary/60"
            maxLength={50}
            disabled={editingAlbum()?.name === "unknown"}
          />
        </div>

        <div class="form-control w-full">
          <label class="label py-1">
            <span class="label-text font-bold text-xs text-base-content/70">
              Description (Optional)
            </span>
          </label>
          <textarea
            placeholder="Provide a brief description of the album's contents..."
            value={description()}
            onInput={(e) => setDescription(e.currentTarget.value)}
            class="textarea textarea-bordered textarea-sm w-full h-20 bg-base-100/60 border-base-300 text-xs text-base-content placeholder-base-content/30 focus:outline-none focus:border-primary/60"
            maxLength={200}
          />
        </div>
      </form>
    </DialogModal>
  );
}
