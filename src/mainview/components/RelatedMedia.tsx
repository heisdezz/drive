import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, Loader2 } from "lucide-react";
import { rpc } from "@/lib/rpc";
import { MediaCard, type MediaItem } from "@/components/MediaCard";
import { useSelectionStore } from "@/store/selection_store";

interface RelatedMediaProps {
  itemId: number;
  drivePath: string;
}

export default function RelatedMedia({ itemId, drivePath }: RelatedMediaProps) {
  const isSelecting = useSelectionStore((s) => s.isSelecting);

  const { data, isLoading } = useQuery({
    queryKey: ["relatedMedia", drivePath, itemId],
    queryFn: () =>
      rpc.request.getRelatedMedia({ drivePath, itemId, limit: 12 }),
    staleTime: 60_000,
  });

  const related = (data?.items ?? []) as MediaItem[];

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center gap-2">
        <LayoutGrid className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-black tracking-wider text-base-content/80 uppercase">
          Related Media
        </h3>
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 text-base-content/40 animate-spin" />
        ) : (
          related.length > 0 && (
            <span className="badge badge-sm badge-outline border-base-300 text-base-content/40 font-bold">
              {related.length}
            </span>
          )
        )}
      </div>

      {isLoading && related.length === 0 ? (
        <div className="flex items-center gap-2 text-base-content/40 text-xs py-8">
          <Loader2 className="w-4 h-4 animate-spin" /> Finding related media...
        </div>
      ) : related.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-base-100/20 border border-base-200/50 text-base-content/30 text-xs">
          No related media found in this folder.
        </div>
      ) : (
        <div
          className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 transition-opacity duration-300 ${isLoading ? "opacity-40 pointer-events-none" : "opacity-100"} ${isSelecting ? "is-selecting" : ""}`}
        >
          {related.map((r) => (
            <MediaCard key={r.id} item={r} drivePath={drivePath} />
          ))}
        </div>
      )}
    </div>
  );
}
