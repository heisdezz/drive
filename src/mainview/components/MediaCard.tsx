import { useEffect, useState, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { rpc } from "@/lib/rpc";
import { Image as ImageIcon, Film as FilmIcon, Play } from "lucide-react";

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

export function MediaCard({ item, drivePath, albumId, onClick }: MediaCardProps) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const cardRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;

    let active = true;
    const loadThumb = async () => {
      setLoading(true);
      try {
        const res = await rpc.request.getThumbnail({
          mediaId: item.id,
          relativePath: item.current_relative_path, // Use current active path of the file
          drivePath: drivePath,
          fileHash: item.file_hash,
        });
        if (active && res.success && res.url) {
          setThumbUrl(res.url);
        }
      } catch (err) {
        console.error("Failed to load thumbnail:", err);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadThumb();
    return () => {
      active = false;
    };
  }, [visible, item, drivePath]);

  const isVideo = item.mime_type.startsWith("video");
  const fileName =
    item.original_relative_path.split("/").pop() || item.original_relative_path;

  return (
    <Link
      ref={cardRef}
      to="/item/$id"
      params={{ id: String(item.id) }}
      search={albumId ? { albumId } : undefined}
      onClick={onClick}
      className="group relative rounded-2xl overflow-hidden bg-slate-950/60 border border-slate-900 shadow-lg aspect-square flex flex-col justify-end transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl hover:border-slate-800 cursor-pointer"
    >
      {/* Media content */}
      <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={fileName}
            className="w-full h-full object-cover transition-opacity duration-500 opacity-100"
            loading="lazy"
          />
        ) : loading ? (
          <div className="w-full h-full bg-slate-900/60 animate-pulse flex items-center justify-center">
            <span className="loading loading-spinner loading-sm text-slate-700"></span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-700 gap-2">
            {isVideo ? (
              <FilmIcon className="w-8 h-8" />
            ) : (
              <ImageIcon className="w-8 h-8" />
            )}
            <span className="text-[9px] font-mono truncate max-w-[80%] px-2 text-center">
              {fileName}
            </span>
          </div>
        )}
      </div>

      {/* Video duration/type badge */}
      {isVideo && (
        <div className="absolute top-3 right-3 px-2 py-1 rounded-md bg-slate-950/80 backdrop-blur-md border border-slate-900 flex items-center gap-1 text-[9px] font-bold text-white shadow-md">
          <Play className="w-2.5 h-2.5 text-secondary fill-secondary" /> VIDEO
        </div>
      )}

      {/* Info overlay (visible on hover) */}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/25 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4 pointer-events-none">
        <h4
          className="text-xs font-black text-white truncate leading-tight mb-1"
          title={fileName}
        >
          {fileName}
        </h4>
        <div className="flex items-center justify-between text-[9px] text-slate-400 font-medium">
          <span>{(item.file_size / 1024 / 1024).toFixed(2)} MB</span>
          <span>{new Date(item.created_at).toLocaleDateString()}</span>
        </div>
      </div>
    </Link>
  );
}
