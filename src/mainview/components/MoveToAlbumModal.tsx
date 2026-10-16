import { createSignal, createMemo, Show, onMount, For } from "solid-js";
import {
  createMutation,
  createQuery,
  useQueryClient,
} from "@tanstack/solid-query";
import { rpc } from "@/lib/rpc";
import DialogModal, { type ModalHandle } from "@/components/DialogModal";

export interface MoveModalHandle {
  open: (mediaIds: number[]) => void;
  close: () => void;
}

interface Props {
  drivePath: string;
  currentAlbumId: number;
  onSuccess: () => void;
  ref?:
    | MoveModalHandle
    | { current: MoveModalHandle | null }
    | ((handle: MoveModalHandle) => void);
}

export function MoveToAlbumModal(props: Props) {
  let dialogRef: ModalHandle | undefined;
  const queryClient = useQueryClient();

  const [pendingIds, setPendingIds] = createSignal<number[]>([]);
  const [albumSearchQuery, setAlbumSearchQuery] = createSignal("");
  const [targetAlbumId, setTargetAlbumId] = createSignal<number | null>(null);

  const albumsQuery = createQuery(() => ({
    queryKey: ["albums", props.drivePath],
    queryFn: async () => {
      const res = await rpc.request.getAlbums({ drivePath: props.drivePath });
      if (res.error) throw new Error(res.error);
      return res.albums || [];
    },
    enabled: !!props.drivePath,
  }));

  const filteredAlbums = createMemo(() => {
    const list = albumsQuery.data || [];
    const query = albumSearchQuery().toLowerCase();
    return list.filter((a: any) => a.name.toLowerCase().includes(query));
  });

  const handle: MoveModalHandle = {
    open: (ids) => {
      setPendingIds(ids);
      setAlbumSearchQuery("");
      setTargetAlbumId(null);
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
    mutationFn: async () => {
      const targetId = targetAlbumId();
      if (!targetId) throw new Error("No album selected");
      const res = await rpc.request.moveMediaItemsToAlbum({
        drivePath: props.drivePath,
        mediaIds: pendingIds(),
        targetAlbumId: targetId,
      });
      if (!res.success) throw new Error(res.error || "Failed to move items");
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["album", props.drivePath, props.currentAlbumId],
      });
      queryClient.invalidateQueries({
        queryKey: ["album-media", props.drivePath, props.currentAlbumId],
      });
      queryClient.invalidateQueries({ queryKey: ["albums", props.drivePath] });
      dialogRef?.close();
      setTargetAlbumId(null);
      setAlbumSearchQuery("");
      props.onSuccess();
    },
    onError: (err: any) => {
      console.error(err);
      alert(`Error moving items: ${err.message}`);
    },
  }));

  return (
    <DialogModal
      ref={(el) => (dialogRef = el)}
      title="Move to Album"
      actions={
        <>
          <button
            onClick={() => dialogRef?.close()}
            class="btn btn-sm btn-ghost text-base-content/60 hover:text-base-content"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !targetAlbumId()}
            class="btn btn-sm btn-primary font-bold shadow-lg shadow-primary/25"
          >
            {mutation.isPending ? "Moving..." : "Move Items"}
          </button>
        </>
      }
    >
      <div class="space-y-4">
        <p class="text-base-content/60 text-xs leading-relaxed">
          Choose the target album to move the{" "}
          <span class="text-base-content font-bold">{pendingIds().length}</span>{" "}
          selected media files to. This will physically move the files on disk
          and update their active catalog paths.
        </p>

        <div class="relative">
          <input
            type="text"
            placeholder="Search albums..."
            value={albumSearchQuery()}
            onInput={(e) => setAlbumSearchQuery(e.currentTarget.value)}
            class="input input-bordered input-sm w-full bg-base-100/60 border-base-300 text-xs text-base-content placeholder-base-content/30 focus:outline-none focus:border-primary/60 pr-8"
          />
          <Show when={albumSearchQuery()}>
            <button
              onClick={() => setAlbumSearchQuery("")}
              class="absolute right-2.5 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content text-xs"
            >
              Clear
            </button>
          </Show>
        </div>

        <div class="max-h-60 overflow-y-auto space-y-2 pr-1">
          <For
            each={filteredAlbums()}
            fallback={
              <p class="text-center text-base-content/40 text-xs py-4">
                No matching albums found.
              </p>
            }
          >
            {(alb: any) => (
              <label
                onClick={() => setTargetAlbumId(alb.id)}
                class={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                  targetAlbumId() === alb.id
                    ? "bg-primary/10 border-primary/45 text-base-content"
                    : "bg-base-100/40 border-base-300/80 text-base-content/80 hover:bg-base-100"
                }`}
              >
                <input
                  type="radio"
                  name="targetAlbum"
                  checked={targetAlbumId() === alb.id}
                  onChange={() => setTargetAlbumId(alb.id)}
                  class="radio radio-primary radio-xs pointer-events-none"
                />
                <span class="font-bold text-xs text-base-content">
                  {alb.name === "unknown" ? "Unsorted Media" : alb.name}
                </span>
                <span class="text-[10px] text-base-content/40 font-mono ml-auto">
                  {alb.media_count} items
                </span>
              </label>
            )}
          </For>
        </div>
      </div>
    </DialogModal>
  );
}
