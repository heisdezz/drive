import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import { createMutation, useQueryClient } from "@tanstack/solid-query";
import { FolderInput, Search, X } from "lucide-solid";
import { rpc } from "@/lib/rpc";
import DialogModal, { type ModalHandle } from "@/components/DialogModal";
import type { Album } from "@/components/AlbumCard";

export interface MergeAlbumDialogHandle {
  open: (album: Album) => void;
  openMany: (albums: Album[]) => void;
}

interface MergeAlbumModalProps {
  drivePath: string;
  albums: Album[];
  onMerged?: () => void;
  ref?: MergeAlbumDialogHandle | { current: MergeAlbumDialogHandle | null } | ((handle: MergeAlbumDialogHandle) => void);
}

const displayName = (album: Album) => album.name === "unknown" ? "Unsorted Media" : album.name;

export function MergeAlbumModal(props: MergeAlbumModalProps) {
  let modalRef: ModalHandle | undefined;
  const queryClient = useQueryClient();
  const [sources, setSources] = createSignal<Album[]>([]);
  const [batchMode, setBatchMode] = createSignal(false);
  const [targetId, setTargetId] = createSignal<number | null>(null);
  const [targetSearch, setTargetSearch] = createSignal("");
  const [error, setError] = createSignal("");
  const targets = createMemo(() => {
    if (!batchMode()) return props.albums.filter((album) => album.id !== sources()[0]?.id);
    const mustKeepUnsorted = sources().some((album) => album.name === "unknown");
    const available = mustKeepUnsorted
      ? props.albums.filter((album) => album.name === "unknown")
      : props.albums;
    return [...available].sort((a, b) =>
      a.name === "unknown" ? -1 : b.name === "unknown" ? 1 : a.name.localeCompare(b.name),
    );
  });
  const filteredTargets = createMemo(() => {
    const query = targetSearch().trim().toLocaleLowerCase();
    return query
      ? targets().filter((album) => displayName(album).toLocaleLowerCase().includes(query))
      : targets();
  });
  const selectedTarget = createMemo(() => targets().find((album) => album.id === targetId()));
  let searchRef: HTMLInputElement | undefined;

  const open = (albums: Album[], batch: boolean) => {
    setSources(albums);
    setBatchMode(batch);
    setTargetId(batch ? (albums.find((album) => album.name === "unknown")?.id ?? null) : null);
    setTargetSearch("");
    setError("");
    modalRef?.open();
    searchRef?.focus();
  };
  const handle: MergeAlbumDialogHandle = {
    open: (album) => {
      open([album], false);
    },
    openMany: (albums) => { if (albums.length >= 2) open(albums, true); },
  };

  onMount(() => {
    if (typeof props.ref === "function") props.ref(handle);
    else if (props.ref && typeof props.ref === "object" && "current" in props.ref) props.ref.current = handle;
  });

  const mutation = createMutation(() => ({
    mutationFn: async ({ sourceAlbumIds, targetAlbumId }: { sourceAlbumIds: number[]; targetAlbumId: number }) => {
      const result = await rpc.request.mergeAlbums({ drivePath: props.drivePath, sourceAlbumIds, targetAlbumId });
      if (!result.success) throw new Error(result.error || "Could not merge albums.");
      return result;
    },
    onSuccess: (_, { sourceAlbumIds, targetAlbumId }) => {
      modalRef?.close();
      setSources([]);
      props.onMerged?.();
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["albums", props.drivePath] }),
        queryClient.invalidateQueries({ queryKey: ["album", props.drivePath, targetAlbumId] }),
        queryClient.invalidateQueries({ queryKey: ["album-media", props.drivePath, targetAlbumId] }),
        ...sourceAlbumIds.flatMap((id) => [
          queryClient.invalidateQueries({ queryKey: ["album", props.drivePath, id] }),
          queryClient.invalidateQueries({ queryKey: ["album-media", props.drivePath, id] }),
        ]),
      ]);
    },
    onError: (err: Error) => setError(err.message),
  }));

  return (
    <DialogModal
      ref={(el) => (modalRef = el)}
      title={batchMode() ? "Merge albums" : "Merge album"}
      actions={
        <>
          <button type="button" class="btn btn-sm btn-ghost" disabled={mutation.isPending} onClick={() => modalRef?.close()}>Cancel</button>
          <button
            type="button"
            class="btn btn-sm btn-primary gap-2"
            disabled={mutation.isPending || !selectedTarget()}
            onClick={() => {
              const targetAlbumId = targetId();
              const sourceAlbumIds = sources().filter((album) => album.id !== targetAlbumId).map((album) => album.id);
              if (sourceAlbumIds.length && targetAlbumId != null) mutation.mutate({ sourceAlbumIds, targetAlbumId });
            }}
          >
            <FolderInput class="h-4 w-4" /> {mutation.isPending ? "Merging…" : "Merge albums"}
          </button>
        </>
      }
    >
      <div class="space-y-4 text-left text-base-content">
        <p class="text-sm leading-relaxed">
          <Show when={batchMode()} fallback={<>Move {sources()[0]?.media_count ?? 0} items from <strong>{sources()[0] && displayName(sources()[0])}</strong> into another album. The source album will be removed; any child albums will remain.</>}>
            Move the items from {sources().length} selected albums into a destination album. Select an existing album or one of the selected albums to keep; the other selected albums will be removed.
          </Show>
        </p>
        <div class="space-y-2">
          <label for="merge-album-search" class="block text-xs font-bold">Destination album</label>
          <div class="relative">
            <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/50" />
            <input
              id="merge-album-search"
              ref={searchRef}
              type="text"
              autocomplete="off"
              placeholder="Search albums"
              value={targetSearch()}
              onInput={(event) => setTargetSearch(event.currentTarget.value)}
              disabled={mutation.isPending}
              class="input input-bordered w-full bg-base-200 pl-9 pr-9 text-sm text-base-content focus:border-primary focus:outline-none"
            />
            <Show when={targetSearch()}>
              <button
                type="button"
                aria-label="Clear album search"
                onClick={() => { setTargetSearch(""); searchRef?.focus(); }}
                disabled={mutation.isPending}
                class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-base-content/60 hover:text-base-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              ><X class="h-4 w-4" /></button>
            </Show>
          </div>
          <Show when={selectedTarget()}>
            {(album) => <p class="text-xs text-base-content/75">Destination: <strong class="text-base-content">{displayName(album())}</strong><Show when={batchMode()}> · {sources().length - Number(sources().some((source) => source.id === album().id))} selected albums will be removed</Show></p>}
          </Show>
          <Show when={batchMode() && sources().some((album) => album.name === "unknown")}>
            <p class="text-xs text-base-content/70">Unsorted Media must be kept when it is selected.</p>
          </Show>
          <div role="radiogroup" aria-label="Destination album" class="max-h-56 overflow-y-auto rounded-lg border border-base-300 bg-base-200/50 p-1">
            <Show when={filteredTargets().length > 0} fallback={<p class="px-3 py-5 text-center text-xs text-base-content/70">No albums match your search.</p>}>
              <For each={filteredTargets()}>
                {(album) => (
                  <label class="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-base-200 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary">
                    <input
                      type="radio"
                      name="merge-target-album"
                      value={album.id}
                      checked={targetId() === album.id}
                      onChange={() => setTargetId(album.id)}
                      disabled={mutation.isPending}
                      class="radio radio-primary radio-xs shrink-0"
                    />
                    <span class="min-w-0 flex-1 truncate" title={displayName(album)}>{displayName(album)}</span>
                    <span class="shrink-0 text-xs tabular-nums text-base-content/60">{album.media_count} items</span>
                  </label>
                )}
              </For>
            </Show>
          </div>
        </div>
        <p class="text-xs text-base-content/70">Files with the same name get a numbered suffix. Existing destination files stay in place.</p>
        <Show when={error()}><p role="alert" class="rounded-lg border border-error/30 bg-error/10 p-3 text-xs text-error">{error()}</p></Show>
      </div>
    </DialogModal>
  );
}
