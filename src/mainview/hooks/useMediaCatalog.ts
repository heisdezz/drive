import {
  createQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/solid-query";
import { rpc } from "@/lib/rpc";
import type { MediaItem } from "@/components/MediaCard";

export function useMediaCatalog(
  drivePath: () => string | undefined | null,
  page: () => number,
  itemsPerPage: number,
  search?: () => string,
  filter?: () => "all" | "images" | "videos",
  sortBy?: () => "date" | "name" | "size",
  sortOrder?: () => "asc" | "desc",
) {
  const queryClient = useQueryClient();

  const scanStatusQuery = createQuery(() => ({
    queryKey: ["scanStatus", drivePath()],
    queryFn: () => rpc.request.getScanStatus({ drivePath: drivePath()! }),
    enabled: !!drivePath(),
    refetchInterval: (query: any) =>
      query.state.data?.scanning ? 2000 : false,
  }));

  const mediaQuery = createQuery(() => ({
    queryKey: [
      "media",
      drivePath(),
      page(),
      itemsPerPage,
      search ? search() : "",
      filter ? filter() : "all",
      sortBy ? sortBy() : "date",
      sortOrder ? sortOrder() : "desc",
    ],
    queryFn: async () => {
      const p = drivePath();
      if (!p) return { items: [] as MediaItem[], total: 0 };
      const res = await rpc.request.getMediaItems({
        drivePath: p,
        limit: itemsPerPage,
        offset: page() * itemsPerPage,
        search: search ? search() || undefined : undefined,
        filter: filter && filter() !== "all" ? filter() : undefined,
        sortBy: sortBy ? sortBy() : undefined,
        sortOrder: sortOrder ? sortOrder() : undefined,
      });
      if (res.error) {
        throw new Error(res.error);
      }
      return { items: (res.items || []) as MediaItem[], total: res.total || 0 };
    },
    enabled: !!drivePath(),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    refetchInterval: scanStatusQuery.data?.scanning ? 2000 : false,
  }));

  const refresh = () => {
    const p = drivePath();
    if (p) {
      queryClient.invalidateQueries({ queryKey: ["media", p] });
    }
  };

  return {
    get mediaItems(): MediaItem[] {
      return mediaQuery.data?.items ?? [];
    },
    get totalItems(): number {
      return mediaQuery.data?.total ?? 0;
    },
    get loading(): boolean {
      return mediaQuery.isLoading;
    },
    get scanStatus() {
      return scanStatusQuery.data ?? null;
    },
    refresh,
  };
}
