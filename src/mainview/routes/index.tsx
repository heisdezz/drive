import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useDriveStore } from "@/store/drive_store";
import { rpc } from "@/lib/rpc";
import { MediaCard } from "@/components/MediaCard";
import {
  HardDrive,
  Usb,
  Globe,
  RefreshCw,
  Library,
  Folder,
  Compass,
  ArrowRight,
  Loader2,
  Power,
  ImageIcon,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

interface Album {
  id: number;
  name: string;
  relative_path: string;
  description: string | null;
  created_at: string;
  media_count: number;
  preview_item?: {
    id: number;
    file_hash: string;
    original_relative_path: string;
    current_relative_path: string;
    mime_type: string;
  };
}

interface AlbumCardProps {
  album: Album;
  drivePath: string;
}

function AlbumCard({ album, drivePath }: AlbumCardProps) {
  const [hasError, setHasError] = useState(false);
  const preview = album.preview_item;
  const displayName = album.name === "unknown" ? "Unsorted Media" : album.name;

  const thumbUrl = preview
    ? `http://localhost:51789/media/thumb?drivePath=${encodeURIComponent(drivePath)}&relativePath=${encodeURIComponent(preview.current_relative_path)}&fileHash=${preview.file_hash}`
    : null;

  return (
    <Link
      to="/album/$id"
      params={{ id: String(album.id) }}
      className="group flex items-center gap-4 p-4 rounded-2xl bg-slate-950/60 border border-slate-900 shadow-md hover:border-slate-800 hover:scale-[1.02] active:scale-[0.99] transition-all duration-300 cursor-pointer"
    >
      <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-base-100 border border-slate-850 flex-shrink-0 flex items-center justify-center">
        {thumbUrl && !hasError ? (
          <img
            src={thumbUrl}
            alt={displayName}
            onError={() => setHasError(true)}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
          />
        ) : (
          <Library className="w-6 h-6 text-slate-600 group-hover:text-primary transition-colors" />
        )}
      </div>
      <div className="min-w-0 flex-grow">
        <h4 className="font-bold text-white text-sm truncate group-hover:text-primary transition-colors leading-tight mb-1">
          {displayName}
        </h4>
        <p className="text-[10px] text-slate-400 font-medium">
          {album.media_count} {album.media_count === 1 ? "item" : "items"}
        </p>
        <p className="text-[9px] text-slate-600 font-mono mt-1">
          Created: {new Date(album.created_at).toLocaleDateString()}
        </p>
      </div>
    </Link>
  );
}

function Index() {
  const {
    selectedDrive,
    devices,
    loading: loadingDrives,
    selectDrive,
    fetchDrives,
  } = useDriveStore();
  const [scanStatus, setScanStatus] = useState<any>(null);
  const [mediaItems, setMediaItems] = useState<any[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [loadingAlbums, setLoadingAlbums] = useState(false);

  // Load dashboard data and handle live updates during scans
  useEffect(() => {
    if (!selectedDrive) return;

    let active = true;
    const loadData = async () => {
      setLoadingMedia(true);
      setLoadingAlbums(true);
      try {
        const mediaRes = await rpc.request.getMediaItems({
          drivePath: selectedDrive.path,
          limit: 8,
          offset: 0,
        });
        if (active && mediaRes && !mediaRes.error) {
          setMediaItems(mediaRes.items || []);
        }

        const albumsRes = await rpc.request.getAlbums({
          drivePath: selectedDrive.path,
        });
        if (active && albumsRes && !albumsRes.error) {
          setAlbums(albumsRes.albums || []);
        }
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      } finally {
        if (active) {
          setLoadingMedia(false);
          setLoadingAlbums(false);
        }
      }
    };

    loadData();

    const checkScanStatus = async () => {
      try {
        const status = await rpc.request.getScanStatus({
          drivePath: selectedDrive.path,
        });
        if (active) {
          setScanStatus(status);
          if (status.scanning) {
            const freshMedia = await rpc.request.getMediaItems({
              drivePath: selectedDrive.path,
              limit: 8,
              offset: 0,
            });
            if (active && freshMedia && !freshMedia.error) {
              setMediaItems(freshMedia.items || []);
            }
            const freshAlbums = await rpc.request.getAlbums({
              drivePath: selectedDrive.path,
            });
            if (active && freshAlbums && !freshAlbums.error) {
              setAlbums(freshAlbums.albums || []);
            }
          }
        }
        return status.scanning;
      } catch (err) {
        console.error("Failed to check scan status:", err);
        return false;
      }
    };

    checkScanStatus();
    const interval = setInterval(async () => {
      const isScanning = await checkScanStatus();
      if (!isScanning) {
        clearInterval(interval);
      }
    }, 3000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [selectedDrive]);

  const refreshDashboard = async () => {
    if (!selectedDrive) return;
    setLoadingMedia(true);
    setLoadingAlbums(true);
    try {
      const mediaRes = await rpc.request.getMediaItems({
        drivePath: selectedDrive.path,
        limit: 8,
        offset: 0,
      });
      if (mediaRes && !mediaRes.error) {
        setMediaItems(mediaRes.items || []);
      }

      const albumsRes = await rpc.request.getAlbums({
        drivePath: selectedDrive.path,
      });
      if (albumsRes && !albumsRes.error) {
        setAlbums(albumsRes.albums || []);
      }
    } catch (err) {
      console.error("Failed to refresh dashboard:", err);
    } finally {
      setLoadingMedia(false);
      setLoadingAlbums(false);
    }
  };

  const handleMount = async (e: React.MouseEvent, deviceId: string) => {
    e.stopPropagation();
    try {
      const res = await rpc.request.mountBlockDevice({ deviceId });
      if (res.success) {
        await fetchDrives();
      } else {
        alert(`Failed to mount: ${res.error}`);
      }
    } catch (err) {
      console.error("Mount failed:", err);
    }
  };

  // 1. Render empty state (select a drive)
  if (!selectedDrive) {
    const nonSystemDevices = devices.filter((d) => d.path !== "/");
    return (
      <div className="space-y-8">
        {/* Welcome Hero Card */}
        <div className="hero rounded-3xl bg-gradient-to-br from-indigo-950/40 via-slate-900/50 to-purple-950/40 border border-slate-900 shadow-2xl p-6 sm:p-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl -z-10 animate-pulse"></div>
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-secondary/10 rounded-full blur-3xl -z-10 animate-pulse"></div>

          <div className="hero-content text-left justify-start p-0 max-w-3xl">
            <div>
              <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-white mb-4 leading-tight">
                Welcome to{" "}
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary via-indigo-400 to-secondary">
                  Antigravity Drive
                </span>
              </h2>
              <p className="text-slate-300 text-lg mb-8 leading-relaxed">
                An ultra-lightweight desktop media library & photo explorer
                powered by React, Electrobun, and Zig. Connect and select a
                storage volume to automatically catalog, preview, and search
                your photo albums.
              </p>
            </div>
          </div>
        </div>

        {/* Drive Selection Section */}
        <section className="space-y-6">
          <div className="flex items-center justify-between border-b border-slate-900 pb-3">
            <h3 className="text-sm font-black tracking-wider text-slate-400 uppercase">
              Select a Connected Drive
            </h3>
            {loadingDrives && (
              <span className="loading loading-spinner loading-xs text-primary"></span>
            )}
          </div>

          {nonSystemDevices.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-base-100/20 border border-slate-900/50">
              <HardDrive className="w-12 h-12 text-slate-700 mx-auto mb-4 animate-pulse" />
              <h3 className="text-white font-bold">No Drives Connected</h3>
              <p className="text-slate-500 text-xs mt-1.5 max-w-sm mx-auto">
                Connect a storage drive or click "Mount Drive" in the sidebar to
                load and inspect catalog files.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {nonSystemDevices.map((device) => {
                const isMounted = device.status === "mounted";
                return (
                  <div
                    key={device.id}
                    onClick={() => isMounted && selectDrive(device)}
                    className={`p-5 rounded-2xl border transition-all duration-300 flex flex-col gap-4 relative overflow-hidden ${
                      isMounted
                        ? "bg-base-100/35 border-slate-900 hover:border-primary/50 hover:bg-base-100/60 hover:scale-[1.02] cursor-pointer"
                        : "bg-slate-950/50 border-slate-950/80 cursor-default opacity-85"
                    }`}
                  >
                    {isMounted && (
                      <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl -z-10"></div>
                    )}

                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-3 rounded-xl ${
                            isMounted
                              ? "bg-slate-950 border border-slate-850"
                              : "bg-base-100 border border-slate-800"
                          }`}
                        >
                          {device.type === "internal" ? (
                            <HardDrive className="w-5 h-5 text-sky-400" />
                          ) : device.type === "external" ? (
                            <Usb className="w-5 h-5 text-emerald-400" />
                          ) : (
                            <Globe className="w-5 h-5 text-indigo-400" />
                          )}
                        </div>
                        <div>
                          <h4
                            className="font-extrabold text-white text-sm tracking-tight leading-snug truncate max-w-[120px]"
                            title={device.name}
                          >
                            {device.name}
                          </h4>
                          <span className="text-[10px] font-mono text-slate-500 font-bold uppercase tracking-wider">
                            {device.size}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`badge badge-sm font-bold capitalize ${
                          isMounted
                            ? "badge-success text-white"
                            : "bg-slate-800 text-slate-400 border border-slate-700"
                        }`}
                      >
                        {device.status}
                      </span>
                    </div>

                    {isMounted ? (
                      <div className="space-y-1.5 mt-2">
                        <progress
                          className={`progress progress-xs w-full h-1.5 ${
                            device.usedPercentage > 80
                              ? "progress-error"
                              : device.usedPercentage > 50
                                ? "progress-primary"
                                : "progress-success"
                          }`}
                          value={device.usedPercentage}
                          max="100"
                        ></progress>
                        <div className="flex justify-between text-[10px] font-mono text-slate-500">
                          <span>{device.usedPercentage}% used</span>
                          <span>{device.size} total</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between mt-4 bg-base-100/40 p-2.5 rounded-xl border border-slate-900/60">
                        <span className="text-[10px] text-slate-500 font-medium">
                          Mount required to explore
                        </span>
                        <button
                          onClick={(e) => handleMount(e, device.id)}
                          className="btn btn-primary btn-xs font-bold shadow-md shadow-primary/10 hover:scale-105"
                        >
                          Mount
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    );
  }

  // Sorted albums client-side by creation timestamp (recently created/updated)
  const sortedAlbums = [...albums]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, 4);

  return (
    <div className="space-y-8">
      {/* Drive Header Panel */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900/60 to-slate-950/40 border border-slate-900 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/15 flex-shrink-0">
            {selectedDrive.type === "internal" ? (
              <HardDrive className="w-6 h-6 text-white" />
            ) : selectedDrive.type === "external" ? (
              <Usb className="w-6 h-6 text-white" />
            ) : (
              <Globe className="w-6 h-6 text-white" />
            )}
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-black text-white leading-tight truncate">
              {selectedDrive.name}
            </h2>
            <span className="text-[10px] font-mono text-slate-500 uppercase font-bold tracking-wider block mt-0.5">
              {selectedDrive.path} · {selectedDrive.size} Total
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
          {/* Scan indicator */}
          {scanStatus?.scanning ? (
            <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-primary/10 border border-primary/20">
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
              <div className="text-left">
                <span className="block text-[10px] font-bold text-primary uppercase tracking-wider leading-none">
                  Indexing Active
                </span>
                <span className="block text-[9px] text-slate-400 mt-0.5">
                  Found {scanStatus.foundCount} items...
                </span>
              </div>
            </div>
          ) : (
            <Link
              to="/discover"
              className="btn btn-outline btn-xs px-3 rounded-lg flex items-center gap-1.5"
            >
              <Compass className="w-3.5 h-3.5" /> Scan Volume
            </Link>
          )}

          {/* Refresh / Disconnect */}
          <div className="flex items-center gap-2">
            <button
              onClick={refreshDashboard}
              disabled={loadingMedia || loadingAlbums}
              className="btn btn-square btn-outline btn-xs border-slate-800 hover:border-slate-700"
              title="Refresh view"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loadingMedia || loadingAlbums ? "animate-spin text-primary" : "text-slate-400"}`}
              />
            </button>
            <button
              onClick={() => selectDrive(null)}
              className="btn btn-square btn-outline btn-xs border-slate-800 text-rose-500 hover:bg-rose-500 hover:border-rose-500 hover:text-white"
              title="Disconnect drive"
            >
              <Power className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Recently Added Media */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-900 pb-2.5">
          <h3 className="text-sm font-black tracking-wider text-slate-400 uppercase">
            Recently Added Media
          </h3>
          <Link
            to="/medias"
            className="text-xs font-bold text-slate-400 hover:text-primary transition-colors flex items-center gap-1"
          >
            View All Media
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loadingMedia && mediaItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
            <p className="text-xs text-slate-500 font-semibold">
              Querying catalog database...
            </p>
          </div>
        ) : mediaItems.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-base-100/10 border border-slate-900 border-dashed">
            <ImageIcon className="w-12 h-12 text-slate-800 mx-auto mb-4" />
            <h3 className="text-white font-bold">No Media Found</h3>
            <p className="text-slate-500 text-xs mt-1.5 max-w-sm mx-auto">
              This storage volume has not been cataloged yet. Switch to the
              Discover tab to scan files.
            </p>
            <Link
              to="/discover"
              className="btn btn-primary btn-sm font-bold mt-4 shadow-lg shadow-primary/15"
            >
              Scan Folder
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-4">
            {mediaItems.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                drivePath={selectedDrive.path}
              />
            ))}
          </div>
        )}
      </section>

      {/* Recent Updated Albums */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-900 pb-2.5">
          <h3 className="text-sm font-black tracking-wider text-slate-400 uppercase">
            Recent Albums
          </h3>
          <Link
            to="/albums"
            className="text-xs font-bold text-slate-400 hover:text-primary transition-colors flex items-center gap-1"
          >
            View All Albums
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loadingAlbums && albums.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
            <p className="text-xs text-slate-500 font-semibold">
              Loading albums...
            </p>
          </div>
        ) : sortedAlbums.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-base-100/10 border border-slate-900 border-dashed">
            <Folder className="w-12 h-12 text-slate-800 mx-auto mb-4" />
            <h3 className="text-white font-bold">No Albums Found</h3>
            <p className="text-slate-500 text-xs mt-1.5 max-w-sm mx-auto">
              Media folders have not been mapped to albums. Scanning folders
              will auto-group them into albums.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {sortedAlbums.map((album) => (
              <AlbumCard
                key={album.id}
                album={album}
                drivePath={selectedDrive.path}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
