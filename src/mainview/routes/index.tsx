import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useDriveStore } from "@/store/drive_store";
import { useSelectionStore } from "@/store/selection_store";
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
      className="group flex items-center gap-4 p-4 rounded-2xl bg-base-300/60 border border-base-200 shadow-md hover:border-base-300 hover:scale-[1.02] active:scale-[0.99] transition-all duration-300 cursor-pointer"
    >
      <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-base-100 border border-base-200 flex-shrink-0 flex items-center justify-center">
        {thumbUrl && !hasError ? (
          <img
            src={thumbUrl}
            alt={displayName}
            onError={() => setHasError(true)}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
          />
        ) : (
          <Library className="w-6 h-6 text-base-content/40 group-hover:text-primary transition-colors" />
        )}
      </div>
      <div className="min-w-0 flex-grow">
        <h4 className="font-bold text-base-content text-sm truncate group-hover:text-primary transition-colors leading-tight mb-1">
          {displayName}
        </h4>
        <p className="text-[10px] text-base-content/60 font-medium">
          {album.media_count} {album.media_count === 1 ? "item" : "items"}
        </p>
        <p className="text-[9px] text-base-content/30 font-mono mt-1">
          Created: {new Date(album.created_at).toLocaleDateString()}
        </p>
      </div>
    </Link>
  );
}

function Index() {
  const isSelecting = useSelectionStore((s) => s.isSelecting);
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
  const [totalMedia, setTotalMedia] = useState(0);
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
          setTotalMedia(mediaRes.total || 0);
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
              setTotalMedia(freshMedia.total || 0);
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
        setTotalMedia(mediaRes.total || 0);
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

  // Case 2: Selected drive is unmounted
  if (selectedDrive && selectedDrive.status === "unmounted") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 sm:p-12">
        <div className="w-20 h-20 rounded-full bg-base-100 border border-base-300 flex items-center justify-center mb-6 shadow-xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-tr from-warning/10 to-transparent opacity-100 transition-opacity duration-300" />
          <HardDrive className="w-10 h-10 text-base-content/40 group-hover:text-warning transition-colors duration-300 animate-pulse" />
        </div>
        <h3 className="text-2xl font-black text-base-content mb-2">
          {selectedDrive.name} is Unmounted
        </h3>
        <p className="text-base-content/60 text-sm max-w-sm leading-relaxed mb-6">
          This storage device needs to be mounted before you can view its albums.
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
          className="btn btn-primary btn-sm font-bold shadow-lg shadow-primary/25 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
        >
          Mount Drive
        </button>
      </div>
    );
  }

  // 1. Render empty state (select a drive)
  if (!selectedDrive) {
    const nonSystemDevices = devices.filter(
      (d) => d.path !== "/" && !d.name.startsWith("System Drive (")
    );
    return (
      <div className="space-y-8">
        {/* Welcome Hero Card */}
        <div className="hero rounded-3xl bg-gradient-to-br from-primary/5 via-base-200/50 to-secondary/5 border border-base-200 shadow-2xl p-6 sm:p-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl -z-10 animate-pulse"></div>
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-secondary/10 rounded-full blur-3xl -z-10 animate-pulse"></div>

          <div className="hero-content text-left justify-start p-0 max-w-3xl">
            <div>
              <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-base-content mb-4 leading-tight">
                Welcome to{" "}
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary via-accent to-secondary">
                  Antigravity Drive
                </span>
              </h2>
              <p className="text-base-content/80 text-lg mb-8 leading-relaxed">
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
          <div className="flex items-center justify-between border-b border-base-200 pb-3">
            <h3 className="text-sm font-black tracking-wider text-base-content/60 uppercase">
              Select a Connected Drive
            </h3>
            {loadingDrives && (
              <span className="loading loading-spinner loading-xs text-primary"></span>
            )}
          </div>

          {nonSystemDevices.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-base-100/20 border border-base-200/50">
              <HardDrive className="w-12 h-12 text-base-content/20 mx-auto mb-4 animate-pulse" />
              <h3 className="text-base-content font-bold">No Drives Connected</h3>
              <p className="text-base-content/40 text-xs mt-1.5 max-w-sm mx-auto">
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
                        ? "bg-base-100/35 border-base-200 hover:border-primary/50 hover:bg-base-100/60 hover:scale-[1.02] cursor-pointer"
                        : "bg-base-300/50 border-base-300/80 cursor-default opacity-85"
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
                              ? "bg-base-200 border border-base-300"
                              : "bg-base-100 border border-base-300"
                          }`}
                        >
                          {device.type === "internal" ? (
                            <HardDrive className="w-5 h-5 text-info" />
                          ) : device.type === "external" ? (
                            <Usb className="w-5 h-5 text-success" />
                          ) : (
                            <Globe className="w-5 h-5 text-secondary" />
                          )}
                        </div>
                        <div>
                          <h4
                            className="font-extrabold text-base-content text-sm tracking-tight leading-snug truncate max-w-[120px]"
                            title={device.name}
                          >
                            {device.name}
                          </h4>
                          <span className="text-[10px] font-mono text-base-content/40 font-bold uppercase tracking-wider">
                            {device.size}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`badge badge-sm font-bold capitalize ${
                          isMounted
                            ? "badge-success text-success-content"
                            : "bg-neutral text-neutral-content border border-base-content/20"
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
                        <div className="flex justify-between text-[10px] font-mono text-base-content/40">
                          <span>{device.usedPercentage}% used</span>
                          <span>{device.size} total</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between mt-4 bg-base-100/40 p-2.5 rounded-xl border border-base-200/60">
                        <span className="text-[10px] text-base-content/40 font-medium">
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
      <div className="p-6 rounded-2xl bg-gradient-to-br from-base-200/60 to-base-300/40 border border-base-200 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/15 flex-shrink-0">
            {selectedDrive.type === "internal" ? (
              <HardDrive className="w-6 h-6 text-primary-content" />
            ) : selectedDrive.type === "external" ? (
              <Usb className="w-6 h-6 text-primary-content" />
            ) : (
              <Globe className="w-6 h-6 text-primary-content" />
            )}
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-black text-base-content leading-tight truncate">
              {selectedDrive.name}
            </h2>
            <span className="text-[10px] font-mono text-base-content/40 uppercase font-bold tracking-wider block mt-0.5">
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
                <span className="block text-[9px] text-base-content/60 mt-0.5">
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
              className="btn btn-square btn-outline btn-xs border-base-300 hover:border-base-content/30"
              title="Refresh view"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loadingMedia || loadingAlbums ? "animate-spin text-primary" : "text-base-content/60"}`}
              />
            </button>
            <button
              onClick={() => selectDrive(null)}
              className="btn btn-square btn-outline btn-xs border-error text-error hover:bg-error hover:border-error hover:text-error-content"
              title="Disconnect drive"
            >
              <Power className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Stats Panel */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="p-5 rounded-2xl bg-base-300/40 border border-base-200 shadow-md flex items-center gap-4 animate-fade-in">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <ImageIcon className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-[10px] font-bold text-base-content/40 uppercase tracking-wider">Total Media Items</span>
            <span className="text-xl font-extrabold text-base-content mt-0.5 block">{totalMedia}</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-base-300/40 border border-base-200 shadow-md flex items-center gap-4 animate-fade-in">
          <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary">
            <Folder className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-[10px] font-bold text-base-content/40 uppercase tracking-wider">Total Albums</span>
            <span className="text-xl font-extrabold text-base-content mt-0.5 block">{albums.length}</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-base-300/40 border border-base-200 shadow-md flex flex-col justify-center gap-2 animate-fade-in">
          <div className="flex items-center justify-between text-[10px] font-bold text-base-content/40 uppercase tracking-wider">
            <span>Storage Used</span>
            <span className="font-mono text-base-content">{selectedDrive.usedPercentage}%</span>
          </div>
          <progress
            className={`progress progress-xs w-full h-2 rounded-full ${
              selectedDrive.usedPercentage > 80
                ? "progress-error"
                : selectedDrive.usedPercentage > 50
                  ? "progress-primary"
                  : "progress-success"
            }`}
            value={selectedDrive.usedPercentage}
            max="100"
          />
          <div className="flex justify-between text-[9px] font-mono text-base-content/40">
            <span>{selectedDrive.size} total capacity</span>
          </div>
        </div>
      </div>

      {/* Recently Added Media */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-base-200 pb-2.5">
          <h3 className="text-sm font-black tracking-wider text-base-content/60 uppercase">
            Recently Added Media
          </h3>
          <Link
            to="/medias"
            className="text-xs font-bold text-base-content/60 hover:text-primary transition-colors flex items-center gap-1"
          >
            View All Media
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loadingMedia && mediaItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
            <p className="text-xs text-base-content/40 font-semibold">
              Querying catalog database...
            </p>
          </div>
        ) : mediaItems.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-base-100/10 border border-base-200 border-dashed">
            <ImageIcon className="w-12 h-12 text-base-content/15 mx-auto mb-4" />
            <h3 className="text-base-content font-bold">No Media Found</h3>
            <p className="text-base-content/40 text-xs mt-1.5 max-w-sm mx-auto">
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
          <div
            className={`grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-4 ${isSelecting ? "is-selecting" : ""}`}
          >
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
        <div className="flex items-center justify-between border-b border-base-200 pb-2.5">
          <h3 className="text-sm font-black tracking-wider text-base-content/60 uppercase">
            Recent Albums
          </h3>
          <Link
            to="/albums"
            className="text-xs font-bold text-base-content/60 hover:text-primary transition-colors flex items-center gap-1"
          >
            View All Albums
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loadingAlbums && albums.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
            <p className="text-xs text-base-content/40 font-semibold">
              Loading albums...
            </p>
          </div>
        ) : sortedAlbums.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-base-100/10 border border-base-200 border-dashed">
            <Folder className="w-12 h-12 text-base-content/15 mx-auto mb-4" />
            <h3 className="text-base-content font-bold">No Albums Found</h3>
            <p className="text-base-content/40 text-xs mt-1.5 max-w-sm mx-auto">
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
