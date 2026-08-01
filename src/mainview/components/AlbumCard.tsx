import { memo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Folder, Calendar, Layers, Edit, Trash } from "lucide-react";
import { useSettingsStore } from "@/store/settings_store";

export interface PreviewItem {
  id: number;
  file_hash: string;
  original_relative_path: string;
  current_relative_path: string;
  mime_type: string;
}

export interface Album {
  id: number;
  name: string;
  relative_path: string;
  description: string | null;
  created_at: string;
  media_count: number;
  preview_item?: PreviewItem | null;
}

interface AlbumCoverProps {
  previewItem?: PreviewItem | null;
  drivePath: string;
  albumName: string;
}

function AlbumCover({ previewItem, drivePath, albumName }: AlbumCoverProps) {
  const showThumbnails = useSettingsStore((state) => state.show_thumbnails);
  const [hasError, setHasError] = useState(false);

  const displayName = albumName === "unknown" ? "Unsorted Media" : albumName;
  const thumbUrl = previewItem && showThumbnails
    ? `http://localhost:51789/media/thumb?drivePath=${encodeURIComponent(drivePath)}&relativePath=${encodeURIComponent(previewItem.current_relative_path)}&fileHash=${previewItem.file_hash}`
    : null;

  if (thumbUrl && !hasError) {
    return (
      <img
        src={thumbUrl}
        alt={displayName}
        onError={() => setHasError(true)}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
    );
  }

  return (
    <div className="w-full h-full bg-gradient-to-br from-base-200 to-base-300 flex flex-col items-center justify-center gap-2 border-b border-base-200/50">
      <Folder className="w-10 h-10 text-base-content/30 group-hover:text-primary transition-colors duration-300" />
    </div>
  );
}

interface AlbumCardProps {
  album: Album;
  drivePath: string;
  onEdit?: (album: Album) => void;
  onDelete?: (album: Album) => void;
}

export const AlbumCard = memo(function AlbumCard({ album, drivePath, onEdit, onDelete }: AlbumCardProps) {
  return (
    <Link
      to="/album/$id"
      params={{ id: String(album.id) }}
      className="group flex flex-col bg-base-300/60 border border-base-200 rounded-2xl overflow-hidden shadow-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:border-base-300 cursor-pointer"
    >
      <div className="aspect-[4/3] w-full relative overflow-hidden bg-base-300 flex items-center justify-center">
        <AlbumCover
          previewItem={album.preview_item}
          drivePath={drivePath}
          albumName={album.name}
        />
        <div className="absolute bottom-3 right-3 px-2 py-1 rounded-md bg-base-300/80 backdrop-blur-md border border-base-200/80 flex items-center gap-1.5 text-[10px] font-bold text-base-content shadow-md">
          <Layers className="w-3.5 h-3.5 text-primary" />
          <span>{album.media_count} items</span>
        </div>
      </div>

      <div className="p-4 flex flex-col justify-between flex-grow">
        <div>
          <h4 className="text-sm font-black text-base-content leading-tight group-hover:text-primary transition-colors truncate">
            {album.name === "unknown" ? "Unsorted Media" : album.name}
          </h4>
          <span className="text-[10px] text-base-content/40 font-mono block mt-1.5 truncate">
            {album.relative_path}
          </span>
        </div>

        <div className="mt-4 pt-3 border-t border-base-200/60 flex items-center justify-between text-[9px] text-base-content/40 font-medium">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {new Date(album.created_at).toLocaleDateString()}
          </span>
          {album.name !== "unknown" && (
            <div className="flex gap-1.5">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onEdit?.(album);
                }}
                className="btn btn-xs btn-circle btn-ghost hover:bg-base-200"
                title="Edit album"
              >
                <Edit className="w-3.5 h-3.5 text-info" />
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDelete?.(album);
                }}
                className="btn btn-xs btn-circle btn-ghost hover:bg-base-200"
                title="Delete album"
              >
                <Trash className="w-3.5 h-3.5 text-error" />
              </button>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
});
