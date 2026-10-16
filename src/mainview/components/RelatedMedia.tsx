import { createQuery } from "@tanstack/solid-query";
import { LayoutGrid, Loader2 } from "lucide-solid";
import { For, Show } from "solid-js";
import { rpc } from "@/lib/rpc";
import { MediaCard, type MediaItem } from "@/components/MediaCard";
import { useSelectionStore } from "@/store/selection_store";

interface RelatedMediaProps {
  itemId: number;
  drivePath: string;
}

export default function RelatedMedia(props: RelatedMediaProps) {
  const selection = useSelectionStore();

  const query = createQuery(() => ({
    queryKey: ["relatedMedia", props.drivePath, props.itemId],
    queryFn: () =>
      rpc.request.getRelatedMedia({
        drivePath: props.drivePath,
        itemId: props.itemId,
        limit: 12,
      }),
    staleTime: 60_000,
  }));

  const related = () => (query.data?.items ?? []) as MediaItem[];

  return (
    <div class="space-y-4 pt-2">
      <div class="flex items-center gap-2">
        <LayoutGrid class="w-4 h-4 text-primary" />
        <h3 class="text-sm font-black tracking-wider text-base-content/80 uppercase">
          Related Media
        </h3>
        <Show
          when={!query.isLoading}
          fallback={
            <Loader2 class="w-3.5 h-3.5 text-base-content/40 animate-spin" />
          }
        >
          <Show when={related().length > 0}>
            <span class="badge badge-sm badge-outline border-base-300 text-base-content/40 font-bold">
              {related().length}
            </span>
          </Show>
        </Show>
      </div>

      <Show
        when={!query.isLoading || related().length > 0}
        fallback={
          <div class="flex items-center gap-2 text-base-content/40 text-xs py-8">
            <Loader2 class="w-4 h-4 animate-spin" /> Finding related media...
          </div>
        }
      >
        <Show
          when={related().length > 0}
          fallback={
            <div class="p-8 text-center rounded-2xl bg-base-100/20 border border-base-200/50 text-base-content/30 text-xs">
              No related media found in this folder.
            </div>
          }
        >
          <div
            class={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 transition-opacity duration-300 ${query.isLoading ? "opacity-40 pointer-events-none" : "opacity-100"} ${selection.isSelecting ? "is-selecting" : ""}`}
          >
            <For each={related()}>
              {(r) => <MediaCard item={r} drivePath={props.drivePath} />}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}
