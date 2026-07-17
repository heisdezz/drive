import { useCallback } from "react";
import {
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { rpc } from "@/lib/rpc";
import { MediaItem } from "@/components/MediaCard";

export function useMediaCatalog(
  drivePath: string | undefined | null,
  page: number,
  itemsPerPage: number,
  search?: string,
  filter?: "all" | "images" | "videos",
) {
  const queryClient = useQueryClient();

  const { data: scanStatus = null } = useQuery({
    queryKey: ["scanStatus", drivePath],
    queryFn: () => rpc.request.getScanStatus({ drivePath: drivePath! }),
    enabled: !!drivePath,
    refetchInterval: (query) => (query.state.data?.scanning ? 2000 : false),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["media", drivePath, page, itemsPerPage, search, filter],
    queryFn: async () => {
      const res = await rpc.request.getMediaItems({
        drivePath: drivePath!,
        limit: itemsPerPage,
        offset: page * itemsPerPage,
        search: search || undefined,
        filter: filter || undefined,
      });
      if (res.error) {
        throw new Error(res.error);
      }
      return { items: res.items as MediaItem[], total: res.total };
    },
    enabled: !!drivePath,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    refetchInterval: scanStatus?.scanning ? 2000 : false,
  });

  const refresh = useCallback(() => {
    if (drivePath) {
      queryClient.invalidateQueries({ queryKey: ["media", drivePath] });
    }
  }, [queryClient, drivePath]);

  return {
    mediaItems: data?.items ?? [],
    totalItems: data?.total ?? 0,
    loading: isLoading,
    scanStatus,
    refresh,
  };
}
