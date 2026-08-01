import { useState, useRef, useEffect, memo, useCallback, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  Image as ImageIcon,
  Film as FilmIcon,
  Play,
  Folder,
} from "lucide-react";
import { useSelectionStore } from "@/store/selection_store";
import { useSettingsStore } from "@/store/settings_store";

export interface MediaItem {
  id: number;
  file_hash: string;
  original_relative_path: string;
  current_relative_path: string;
  file_size: number;
  mime_type: string;
  created_at: string;
  album_id?: number | null;
  album_name?: string | null;
  album_relative_path?: string | null;
  duration_seconds?: number | null;
  metadata_json?: string | null;
}

interface MediaCardProps {
  item: MediaItem;
  drivePath: string;
  albumId?: number;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}

export const MediaCard = memo(function MediaCard({
  item,
  drivePath,
  albumId,
  onClick,
}: MediaCardProps) {
  const showThumbnails = useSettingsStore((state) => state.show_thumbnails);
  const [hasError, setHasError] = useState(false);
  const [inView, setInView] = useState(false);
  const cardRef = useRef<HTMLAnchorElement>(null);
  const checkboxRef = useRef<HTMLInputElement>(null);

  // Transient selection: instead of subscribing reactively (which re-renders
  // this card — and every other card — on any selection change, causing the
  // select-all lag over 200+ items), subscribe imperatively and mutate only
  // this card's own DOM node. Zero React re-renders when selection changes.
  useEffect(() => {
    const apply = (selected: Set<number>) => {
      const isSel = selected.has(item.id);
      if (cardRef.current) {
        cardRef.current.dataset.selected = isSel ? "true" : "false";
      }
      if (checkboxRef.current) {
        checkboxRef.current.checked = isSel;
      }
    };
    apply(useSelectionStore.getState().selected);
    return useSelectionStore.subscribe((state, prev) => {
      if (state.selected !== prev.selected) apply(state.selected);
    });
  }, [item.id]);

  useEffect(() => {
    const el = cardRef.current;
    if (!el || !showThumbnails) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [showThumbnails]);

  const isVideo = useMemo(
    () => item.mime_type.startsWith("video"),
    [item.mime_type],
  );

  const fileName = useMemo(
    () =>
      item.original_relative_path.split("/").pop() ||
      item.original_relative_path,
    [item.original_relative_path],
  );

  const thumbUrl = useMemo(
    () =>
      `http://localhost:51789/media/thumb?drivePath=${encodeURIComponent(drivePath)}&relativePath=${encodeURIComponent(item.current_relative_path)}&fileHash=${item.file_hash}`,
    [drivePath, item.current_relative_path, item.file_hash],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      const { isSelecting, toggle } = useSelectionStore.getState();
      if (isSelecting) {
        e.preventDefault();
        e.stopPropagation();
        toggle(item.id);
      } else if (onClick) {
        onClick(e);
      }
    },
    [item.id, onClick],
  );

  return (
    <Link
      ref={cardRef}
      to="/item/$id"
      params={{ id: String(item.id) }}
      search={albumId ? { albumId } : undefined}
      onClick={handleClick}
      data-selected={
        useSelectionStore.getState().selected.has(item.id) ? "true" : "false"
      }
      className="group relative rounded-2xl overflow-hidden bg-base-300/60 border shadow-lg aspect-square flex flex-col justify-end transition-[box-shadow,border-color] duration-300 hover:shadow-2xl cursor-pointer border-base-200 hover:border-base-300 data-[selected=true]:ring-2 data-[selected=true]:ring-primary data-[selected=true]:border-primary data-[selected=true]:hover:border-primary"
    >
      {/* Media content */}
      <div className="absolute inset-0 flex items-center justify-center bg-base-300">
        {!showThumbnails || hasError ? (
          <div className="flex flex-col items-center justify-center text-base-content/40 gap-2">
            <div className={`p-4 rounded-full ${isVideo ? "bg-info/10 text-info" : "bg-secondary/10 text-secondary"}`}>
              {isVideo ? (
                <FilmIcon className="w-8 h-8" />
              ) : (
                <ImageIcon className="w-8 h-8" />
              )}
            </div>
            <span className="text-[10px] font-mono truncate max-w-[80%] px-2 text-center text-base-content/60">
              {fileName}
            </span>
          </div>
        ) : inView ? (
          <img
            src={thumbUrl}
            alt={fileName}
            onError={() => setHasError(true)}
            className="w-full h-full object-cover transition-transform duration-300 opacity-100 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full animate-pulse bg-base-200/40" />
        )}
      </div>

      {/* Media type badge — top right */}
      <div className="absolute top-3 right-3 px-2 py-1 rounded-md bg-base-300/80 backdrop-blur-md border border-base-200 flex items-center gap-1 text-[9px] font-bold text-base-content shadow-md">
        {isVideo ? (
          <>
            <Play className="w-2.5 h-2.5 text-secondary fill-secondary" /> VIDEO
          </>
        ) : (
          <>
            <ImageIcon className="w-2.5 h-2.5 text-info" /> IMAGE
          </>
        )}
      </div>

      {/* Selection checkbox */}
      <div className="absolute top-3 left-3 z-30 opacity-0 scale-75 pointer-events-none transition-[opacity,transform] duration-150 [.is-selecting_&]:opacity-100 [.is-selecting_&]:scale-100 [.is-selecting_&]:pointer-events-auto">
        <input
          ref={checkboxRef}
          type="checkbox"
          defaultChecked={useSelectionStore.getState().selected.has(item.id)}
          readOnly
          className="checkbox checkbox-primary border-2 border-base-content/60 checked:border-primary bg-base-300/90 checkbox-sm cursor-pointer shadow-lg"
        />
      </div>

      {/* Album badge — top left, fades on hover and when selecting */}
      {item.album_name && (
        <div className="absolute top-3 left-3 px-2 py-1 rounded-md bg-base-300/80 backdrop-blur-sm border border-base-200 text-[9px] font-bold text-base-content shadow-md z-10 pointer-events-none truncate max-w-[60%] group-hover:opacity-0 [.is-selecting_&]:opacity-0 transition-opacity duration-200 flex items-center gap-1">
          <Folder className="w-2.5 h-2.5 text-primary fill-primary/10 shrink-0" />
          <span className="truncate">
            {item.album_name === "unknown" ? "Unsorted Media" : item.album_name}
          </span>
        </div>
      )}

      {/* Info overlay (visible on hover) */}
      <div className="absolute inset-0 bg-gradient-to-t from-base-300 via-base-300/25 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4 pointer-events-none">
        <h4
          className="text-xs font-black text-base-content truncate leading-tight mb-1"
          title={fileName}
        >
          {fileName}
        </h4>
        <div className="flex items-center justify-between text-[9px] text-base-content/60 font-medium">
          <span>{(item.file_size / 1024 / 1024).toFixed(2)} MB</span>
          <span>{new Date(item.created_at).toLocaleDateString()}</span>
        </div>
      </div>
    </Link>
  );
});
