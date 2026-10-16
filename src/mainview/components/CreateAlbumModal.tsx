import { createSignal, Show, onMount } from "solid-js";
import { createMutation, useQueryClient } from "@tanstack/solid-query";
import { Info } from "lucide-solid";
import { rpc } from "@/lib/rpc";
import DialogModal, { type ModalHandle } from "@/components/DialogModal";

export type { ModalHandle };

interface Props {
  drivePath: string;
  ref?:
    | ModalHandle
    | { current: ModalHandle | null }
    | ((handle: ModalHandle) => void);
}

export function CreateAlbumModal(props: Props) {
  let dialogRef: ModalHandle | undefined;
  const queryClient = useQueryClient();

  const [name, setName] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [createError, setCreateError] = createSignal<string | null>(null);

  const handle: ModalHandle = {
    open: () => {
      setName("");
      setDescription("");
      setCreateError(null);
      dialogRef?.open();
    },
    close: () => dialogRef?.close(),
  };

  onMount(() => {
    if (typeof props.ref === "function") {
      props.ref(handle);
    } else if (props.ref && typeof props.ref === "object") {
      (props.ref as any).current = handle;
    }
  });

  const mutation = createMutation(() => ({
    mutationFn: async (vars: { name: string; description?: string }) => {
      const res = await rpc.request.createAlbum({
        drivePath: props.drivePath,
        name: vars.name,
        description: vars.description,
      });
      if (!res.success) throw new Error(res.error || "Failed to create album");
      return res.album;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["albums", props.drivePath] });
      dialogRef?.close();
      setName("");
      setDescription("");
      setCreateError(null);
    },
    onError: (err: any) => {
      setCreateError(err.message || "Failed to create album.");
    },
  }));

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    const cleanName = name().trim();
    if (!cleanName) {
      setCreateError("Album name cannot be empty.");
      return;
    }
    setCreateError(null);
    mutation.mutate({
      name: cleanName,
      description: description().trim() || undefined,
    });
  };

  return (
    <DialogModal
      ref={(el) => (dialogRef = el)}
      title="Create New Album"
      actions={
        <>
          <button
            type="button"
            onClick={() => dialogRef?.close()}
            class="btn btn-sm btn-ghost text-base-content/60 hover:text-base-content"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="create-album-form"
            disabled={mutation.isPending || !name().trim()}
            class="btn btn-sm btn-primary font-bold shadow-lg shadow-primary/25"
          >
            {mutation.isPending ? "Creating..." : "Create"}
          </button>
        </>
      }
    >
      <form
        id="create-album-form"
        onSubmit={handleSubmit}
        class="space-y-4 text-left"
      >
        <Show when={createError()}>
          <div class="alert alert-error text-xs p-3 rounded-xl flex gap-2 items-center">
            <Info class="w-4 h-4 flex-shrink-0" />
            <span>{createError()}</span>
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
