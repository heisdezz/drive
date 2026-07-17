import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useDriveStore } from "@/store/drive_store";
import { rpc } from "@/lib/rpc";
import {
  Compass,
  HardDrive,
  Info,
  Library,
  Loader2,
  Folder,
  Calendar,
  Layers,
  Search,
  ArrowUpDown,
} from "lucide-react";

export const Route = createFileRoute("/albums/")({
  component: AlbumsIndexComponent,
});

interface PreviewItem {
  id: number;
  file_hash: string;
  original_relative_path: string;
  current_relative_path: string;
  mime_type: string;
}

interface Album {
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
  const [hasError, setHasError] = useState(false);

  const displayName = albumName === "unknown" ? "Unsorted Media" : albumName;
  const thumbUrl = previewItem
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

function AlbumsIndexComponent() {
  const { selectedDrive, fetchDrives } = useDriveStore();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "count" | "date">("name");

  const loadAlbums = async () => {
    if (!selectedDrive?.path) return;
    setLoading(true);
    try {
      const res = await rpc.request.getAlbums({
        drivePath: selectedDrive.path,
      });
      if (res.albums && !res.error) {
        setAlbums(res.albums);
      }
    } catch (err) {
      console.error("Failed to fetch albums:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlbums();
  }, [selectedDrive?.path]);

  // Case 1: No drive is selected
  if (!selectedDrive) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 sm:p-12">
        <div className="w-20 h-20 rounded-full bg-base-100 border border-base-300 flex items-center justify-center mb-6 shadow-xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          <Compass className="w-10 h-10 text-base-content/40 group-hover:text-primary transition-colors duration-300" />
        </div>
        <h3 className="text-2xl font-black text-base-content mb-2">
          No Drive Selected
        </h3>
        <p className="text-base-content/60 text-sm max-w-sm leading-relaxed mb-6">
          Please select a connected drive or storage volume from the sidebar to
          inspect cataloged albums.
        </p>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-base-100/60 border border-base-200 text-[10px] text-base-content/40 font-medium">
          <Info className="w-3.5 h-3.5" />
          Select a drive then scan it under the Discover tab.
        </div>
      </div>
    );
  }

  // Case 2: Selected drive is unmounted
  if (selectedDrive.status === "unmounted") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 sm:p-12">
        <div className="w-20 h-20 rounded-full bg-base-100 border border-base-300 flex items-center justify-center mb-6 shadow-xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-tr from-warning/10 to-transparent opacity-100 transition-opacity duration-300"></div>
          <HardDrive className="w-10 h-10 text-base-content/40 group-hover:text-warning transition-colors duration-300 animate-pulse" />
        </div>
        <h3 className="text-2xl font-black text-base-content mb-2">
          {selectedDrive.name} is Unmounted
        </h3>
        <p className="text-base-content/60 text-sm max-w-sm leading-relaxed mb-6">
          This storage device needs to be mounted before you can view its
          albums.
        </p>
        <button
          onClick={async () => {
            try {
              const res = await rpc.request.mountBlockDevice({
                deviceId: selectedDrive.id,
              });
              if (res.success && res.mountPath) {
                await fetchDrives();
              } else {
                alert(`Failed to mount: ${res.error}`);
              }
            } catch (err: any) {
              console.error(err);
            }
          }}
          className="btn btn-primary px-8 font-bold text-sm tracking-wide shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          Mount Drive
        </button>
      </div>
    );
  }

  // Filtered & Sorted Albums
  const filteredAlbums = albums
    .filter((album) => {
      return (
        album.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (album.description &&
          album.description.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    })
    .sort((a, b) => {
      if (sortBy === "count") {
        return b.media_count - a.media_count;
      }
      if (sortBy === "date") {
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }
      return a.name.localeCompare(b.name);
    });

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Drive Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-base-200/60 to-base-300/40 border border-base-200 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/15 flex-shrink-0">
            <Library className="w-6 h-6 text-primary-content" />
          </div>
          <div>
            <h2 className="text-xl font-black text-base-content leading-tight">
              Albums Gallery
            </h2>
            <span className="text-[10px] font-mono text-base-content/40 uppercase font-bold tracking-wider">
              {selectedDrive.name} · {albums.length} Total Albums
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Sort Bar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-base-300/50 border border-base-200 p-4 rounded-xl">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/40" />
          <input
            type="text"
            placeholder="Search albums..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-base-100/60 border border-base-300 text-base-content placeholder-base-content/30 focus:outline-none focus:border-primary/60 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <ArrowUpDown className="w-3.5 h-3.5 text-base-content/40" />
          <span className="text-xs text-base-content/60 mr-1 hidden sm:inline">
            Sort by:
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="select select-bordered select-xs text-xs rounded-lg bg-base-100/60 border-base-300 text-base-content/80 focus:outline-none focus:border-primary/60"
          >
            <option value="name">Name (A-Z)</option>
            <option value="count">File Count</option>
            <option value="date">Date Discovered</option>
          </select>
        </div>
      </div>

      {/* Albums Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] py-12">
          <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
          <p className="text-xs text-base-content/40 font-bold">
            Querying Albums Database...
          </p>
        </div>
      ) : filteredAlbums.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-base-100/20 border border-base-200/50">
          <Library className="w-12 h-12 text-base-content/20 mx-auto mb-4" />
          <h3 className="text-base-content font-bold">No Albums Found</h3>
          <p className="text-base-content/40 text-xs mt-1.5 max-w-sm mx-auto">
            {searchQuery
              ? "No albums match your search query."
              : "This drive doesn't have any albums indexed yet. Subdirectories containing media will appear here as albums after running a Discover scan."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {filteredAlbums.map((album) => (
            <Link
              key={album.id}
              to="/album/$id"
              params={{ id: String(album.id) }}
              className="group flex flex-col bg-base-300/60 border border-base-200 rounded-2xl overflow-hidden shadow-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:border-base-300 cursor-pointer"
            >
              {/* Cover area */}
              <div className="aspect-[4/3] w-full relative overflow-hidden bg-base-300 flex items-center justify-center">
                <AlbumCover
                  previewItem={album.preview_item}
                  drivePath={selectedDrive.path}
                  albumName={album.name}
                />

                {/* Count badge overlay */}
                <div className="absolute bottom-3 right-3 px-2 py-1 rounded-md bg-base-300/80 backdrop-blur-md border border-base-200/80 flex items-center gap-1.5 text-[10px] font-bold text-base-content shadow-md">
                  <Layers className="w-3.5 h-3.5 text-primary" />
                  <span>{album.media_count} items</span>
                </div>
              </div>

              {/* Title / details */}
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
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
