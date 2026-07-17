import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
}

export const MoveToAlbumModal = forwardRef<MoveModalHandle, Props>(
  function MoveToAlbumModal({ drivePath, currentAlbumId, onSuccess }, ref) {
    const dialogRef = useRef<ModalHandle>(null);
    const queryClient = useQueryClient();

    const [pendingIds, setPendingIds] = useState<number[]>([]);
    const [albumSearchQuery, setAlbumSearchQuery] = useState("");
    const [targetAlbumId, setTargetAlbumId] = useState<number | null>(null);

    const { data: albums = [] } = useQuery<any[]>({
      queryKey: ["albums", drivePath],
      queryFn: async () => {
        const res = await rpc.request.getAlbums({ drivePath });
        if (res.error) throw new Error(res.error);
        return res.albums || [];
      },
      enabled: !!drivePath,
    });

    const filteredAlbums = useMemo(
      () => albums.filter((a) => a.name.toLowerCase().includes(albumSearchQuery.toLowerCase())),
      [albums, albumSearchQuery],
    );

    useImperativeHandle(ref, () => ({
      open: (ids) => {
        setPendingIds(ids);
        setAlbumSearchQuery("");
        setTargetAlbumId(null);
        dialogRef.current?.open();
      },
      close: () => dialogRef.current?.close(),
    }));

    const mutation = useMutation({
      mutationFn: async () => {
        if (!targetAlbumId) throw new Error("No album selected");
        const res = await rpc.request.moveMediaItemsToAlbum({
          drivePath,
          mediaIds: pendingIds,
          targetAlbumId,
        });
        if (!res.success) throw new Error(res.error || "Failed to move items");
        return res;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["album", drivePath, currentAlbumId] });
        queryClient.invalidateQueries({ queryKey: ["album-media", drivePath, currentAlbumId] });
        queryClient.invalidateQueries({ queryKey: ["albums", drivePath] });
        dialogRef.current?.close();
        setTargetAlbumId(null);
        setAlbumSearchQuery("");
        onSuccess();
      },
      onError: (err: any) => {
        console.error(err);
        alert(`Error moving items: ${err.message}`);
      },
    });

    return (
      <DialogModal
        ref={dialogRef}
        title="Move to Album"
        actions={
          <>
            <button
              onClick={() => dialogRef.current?.close()}
              className="btn btn-sm btn-ghost text-base-content/60 hover:text-base-content"
            >
              Cancel
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !targetAlbumId}
              className="btn btn-sm btn-primary font-bold shadow-lg shadow-primary/25"
            >
              {mutation.isPending ? "Moving..." : "Move Items"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-base-content/60 text-xs leading-relaxed">
            Choose the target album to move the{" "}
            <span className="text-base-content font-bold">{pendingIds.length}</span>{" "}
            selected media files to. This will physically move the files on disk and update their
            active catalog paths.
          </p>

          <div className="relative">
            <input
              type="text"
              placeholder="Search albums..."
              value={albumSearchQuery}
              onChange={(e) => setAlbumSearchQuery(e.target.value)}
              className="input input-bordered input-sm w-full bg-base-100/60 border-base-300 text-xs text-base-content placeholder-base-content/30 focus:outline-none focus:border-primary/60 pr-8"
            />
            {albumSearchQuery && (
              <button
                onClick={() => setAlbumSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content text-xs"
              >
                Clear
              </button>
            )}
          </div>

          <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
            {filteredAlbums.map((alb: any) => (
              <label
                key={alb.id}
                onClick={() => setTargetAlbumId(alb.id)}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                  targetAlbumId === alb.id
                    ? "bg-primary/10 border-primary/45 text-base-content"
                    : "bg-base-100/40 border-base-300/80 text-base-content/80 hover:bg-base-100"
                }`}
              >
                <input
                  type="radio"
                  name="targetAlbum"
                  checked={targetAlbumId === alb.id}
                  onChange={() => setTargetAlbumId(alb.id)}
                  className="radio radio-primary radio-xs pointer-events-none"
                />
                <span className="font-bold text-xs text-base-content">
                  {alb.name === "unknown" ? "Unsorted Media" : alb.name}
                </span>
                <span className="text-[10px] text-base-content/40 font-mono ml-auto">
                  {alb.media_count} items
                </span>
              </label>
            ))}
            {filteredAlbums.length === 0 && (
              <p className="text-center text-base-content/40 text-xs py-4">
                No matching albums found.
              </p>
            )}
          </div>
        </div>
      </DialogModal>
    );
  },
);
