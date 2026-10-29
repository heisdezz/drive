import { createFileRoute, Link } from "@tanstack/solid-router";
import {
  createSignal,
  createEffect,
  onCleanup,
  createMemo,
  For,
  Show,
} from "solid-js";
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
  Image as ImageIcon,
} from "lucide-solid";

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

function AlbumCard(props: AlbumCardProps) {
  const [hasError, setHasError] = createSignal(false);
  const preview = () => props.album.preview_item;
  const displayName = () =>
    props.album.name === "unknown" ? "Unsorted Media" : props.album.name;

  const thumbUrl = () => {
    const p = preview();
    return p
      ? `http://localhost:51789/media/thumb?drivePath=${encodeURIComponent(props.drivePath)}&relativePath=${encodeURIComponent(p.current_relative_path)}&fileHash=${p.file_hash}`
      : null;
  };

  return (
    <Link
      to="/album/$id"
      params={{ id: String(props.album.id) }}
      class="group flex items-center gap-4 p-4 rounded-2xl bg-base-300/60 border border-base-200 shadow-md hover:border-base-300 hover:scale-[1.02] active:scale-[0.99] transition-all duration-300 cursor-pointer"
    >
      <div class="relative w-16 h-16 rounded-xl overflow-hidden bg-base-100 border border-base-200 flex-shrink-0 flex items-center justify-center">
        <Show
          when={thumbUrl() && !hasError()}
          fallback={
            <Library class="w-6 h-6 text-base-content/40 group-hover:text-primary transition-colors" />
          }
        >
          <img
            src={thumbUrl()!}
            alt={displayName()}
            onError={() => setHasError(true)}
            class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
          />
        </Show>
      </div>
      <div class="min-w-0 flex-grow">
        <h4 class="font-bold text-base-content text-sm truncate group-hover:text-primary transition-colors leading-tight mb-1">
          {displayName()}
        </h4>
        <p class="text-[10px] text-base-content/60 font-medium">
          {props.album.media_count}{" "}
          {props.album.media_count === 1 ? "item" : "items"}
        </p>
        <p class="text-[9px] text-base-content/30 font-mono mt-1">
          Created: {new Date(props.album.created_at).toLocaleDateString()}
        </p>
      </div>
    </Link>
  );
}

function Index() {
  const selection = useSelectionStore();
  const drive = useDriveStore();

  const [scanStatus, setScanStatus] = createSignal<any>(null);
  const [albumLocation, setAlbumLocation] = createSignal("");
  const [mediaItems, setMediaItems] = createSignal<any[]>([]);
  const [albums, setAlbums] = createSignal<Album[]>([]);
  const [totalMedia, setTotalMedia] = createSignal(0);
  const [loadingMedia, setLoadingMedia] = createSignal(false);
  const [loadingAlbums, setLoadingAlbums] = createSignal(false);

  // Load dashboard data and handle live updates during scans
  createEffect(() => {
    const selectedDrive = drive.selectedDrive;
    if (!selectedDrive) return;

    let active = true;
    void rpc.request
      .getAlbumLocation({ drivePath: selectedDrive.path })
      .then((result) => {
        if (active) setAlbumLocation(result.absolutePath);
      })
      .catch(() => {
        if (active) setAlbumLocation("");
      });
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

    onCleanup(() => {
      active = false;
      clearInterval(interval);
    });
  });

  const refreshDashboard = async () => {
    const selectedDrive = drive.selectedDrive;
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

  const handleMount = async (e: MouseEvent, deviceId: string) => {
    e.stopPropagation();
    try {
      const res = await rpc.request.mountBlockDevice({ deviceId });
      if (res.success) {
        await drive.fetchDrives();
      } else {
        alert(`Failed to mount: ${res.error}`);
      }
    } catch (err) {
      console.error("Mount failed:", err);
    }
  };

  const sortedAlbums = createMemo(() =>
    [...albums()]
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      .slice(0, 4),
  );

  return (
    <div class="space-y-8">
      {/* Case 1: No drive is selected */}
      <Show when={!drive.selectedDrive}>
        {(() => {
          const nonSystemDevices = () =>
            drive.devices.filter(
              (d: any) =>
                d.path !== "/" && !d.name.startsWith("System Drive ("),
            );
          return (
            <div class="space-y-8">
              {/* Welcome Hero Card */}
              <div class="hero rounded-3xl bg-gradient-to-br from-primary/5 via-base-200/50 to-secondary/5 border border-base-200 shadow-2xl p-6 sm:p-12 relative overflow-hidden">
                <div class="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl -z-10 animate-pulse" />
                <div class="absolute bottom-0 left-0 w-96 h-96 bg-secondary/10 rounded-full blur-3xl -z-10 animate-pulse" />

                <div class="hero-content text-left justify-start p-0 max-w-3xl">
                  <div>
                    <h2 class="text-4xl sm:text-5xl font-black tracking-tight text-base-content mb-4 leading-tight">
                      Welcome to{" "}
                      <span class="bg-clip-text text-transparent bg-gradient-to-r from-primary via-accent to-secondary">
                        D-Stream
                      </span>
                    </h2>
                    <p class="text-base-content/80 text-lg mb-8 leading-relaxed">
                      An ultra-lightweight desktop media library & photo
                      explorer powered by SolidJS, Electrobun, and Zig. Connect
                      and select a storage volume to automatically catalog,
                      preview, and search your photo albums.
                    </p>
                  </div>
                </div>
              </div>

              {/* Drive Selection Section */}
              <section class="space-y-6">
                <div class="flex items-center justify-between border-b border-base-200 pb-3">
                  <h3 class="text-sm font-black tracking-wider text-base-content/60 uppercase">
                    Select a Connected Drive
                  </h3>
                  <Show when={drive.loading}>
                    <span class="loading loading-spinner loading-xs text-primary" />
                  </Show>
                </div>

                <Show
                  when={nonSystemDevices().length > 0}
                  fallback={
                    <div class="p-12 text-center rounded-2xl bg-base-100/20 border border-base-200/50">
                      <HardDrive class="w-12 h-12 text-base-content/20 mx-auto mb-4 animate-pulse" />
                      <h3 class="text-base-content font-bold">
                        No Drives Connected
                      </h3>
                      <p class="text-base-content/40 text-xs mt-1.5 max-w-sm mx-auto">
                        Connect a storage drive or click "Mount Drive" in the
                        sidebar to load and inspect catalog files.
                      </p>
                    </div>
                  }
                >
                  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <For each={nonSystemDevices()}>
                      {(device) => {
                        const isMounted = () => device.status === "mounted";
                        return (
                          <div
                            onClick={() =>
                              isMounted() && drive.selectDrive(device)
                            }
                            class={`p-5 rounded-2xl border transition-all duration-300 flex flex-col gap-4 relative overflow-hidden ${
                              isMounted()
                                ? "bg-base-100/35 border-base-200 hover:border-primary/50 hover:bg-base-100/60 hover:scale-[1.02] cursor-pointer"
                                : "bg-base-300/50 border-base-300/80 cursor-default opacity-85"
                            }`}
                          >
                            <Show when={isMounted()}>
                              <div class="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl -z-10" />
                            </Show>

                            <div class="flex items-start justify-between">
                              <div class="flex items-center gap-3">
                                <div
                                  class={`p-3 rounded-xl ${
                                    isMounted()
                                      ? "bg-base-200 border border-base-300"
                                      : "bg-base-100 border border-base-300"
                                  }`}
                                >
                                  {device.type === "internal" ? (
                                    <HardDrive class="w-5 h-5 text-info" />
                                  ) : device.type === "external" ? (
                                    <Usb class="w-5 h-5 text-success" />
                                  ) : (
                                    <Globe class="w-5 h-5 text-secondary" />
                                  )}
                                </div>
                                <div>
                                  <h4
                                    class="font-extrabold text-base-content text-sm tracking-tight leading-snug truncate max-w-[120px]"
                                    title={device.name}
                                  >
                                    {device.name}
                                  </h4>
                                  <span class="text-[10px] font-mono text-base-content/40 font-bold uppercase tracking-wider">
                                    {device.size}
                                  </span>
                                </div>
                              </div>

                              <span
                                class={`badge badge-sm font-bold capitalize ${
                                  isMounted()
                                    ? "badge-success text-success-content"
                                    : "bg-neutral text-neutral-content border border-base-content/20"
                                }`}
                              >
                                {device.status}
                              </span>
                            </div>

                            <Show
                              when={isMounted()}
                              fallback={
                                <div class="flex items-center justify-between mt-4 bg-base-100/40 p-2.5 rounded-xl border border-base-200/60">
                                  <span class="text-[10px] text-base-content/40 font-medium">
                                    Mount required to explore
                                  </span>
                                  <button
                                    onClick={(e) => handleMount(e, device.id)}
                                    class="btn btn-primary btn-xs font-bold shadow-md shadow-primary/10 hover:scale-105"
                                  >
                                    Mount
                                  </button>
                                </div>
                              }
                            >
                              <div class="space-y-1.5 mt-2">
                                <progress
                                  class={`progress progress-xs w-full h-1.5 ${
                                    device.usedPercentage > 80
                                      ? "progress-error"
                                      : device.usedPercentage > 50
                                        ? "progress-primary"
                                        : "progress-success"
                                  }`}
                                  value={device.usedPercentage}
                                  max="100"
                                />
                                <div class="flex justify-between text-[10px] font-mono text-base-content/40">
                                  <span>{device.usedPercentage}% used</span>
                                  <span>{device.size} total</span>
                                </div>
                              </div>
                            </Show>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              </section>
            </div>
          );
        })()}
      </Show>

      {/* Case 2: Selected drive is unmounted */}
      <Show
        when={drive.selectedDrive && drive.selectedDrive.status === "unmounted"}
      >
        <div class="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 sm:p-12">
          <div class="w-20 h-20 rounded-full bg-base-100 border border-base-300 flex items-center justify-center mb-6 shadow-xl relative overflow-hidden group">
            <div class="absolute inset-0 bg-gradient-to-tr from-warning/10 to-transparent opacity-100 transition-opacity duration-300" />
            <HardDrive class="w-10 h-10 text-base-content/40 group-hover:text-warning transition-colors duration-300 animate-pulse" />
          </div>
          <h3 class="text-2xl font-black text-base-content mb-2">
            {drive.selectedDrive?.name} is Unmounted
          </h3>
          <p class="text-base-content/60 text-sm max-w-sm leading-relaxed mb-6">
            This storage device needs to be mounted before you can view its
            albums.
          </p>
          <button
            onClick={async () => {
              try {
                const res = await rpc.request.mountBlockDevice({
                  deviceId: drive.selectedDrive!.id,
                });
                if (res.success && res.mountPath) {
                  await drive.fetchDrives();
                } else {
                  alert(`Failed to mount: ${res.error}`);
                }
              } catch (err: any) {
                console.error(err);
              }
            }}
            class="btn btn-primary btn-sm font-bold shadow-lg shadow-primary/25 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
          >
            Mount Drive
          </button>
        </div>
      </Show>

      {/* Case 3: Selected drive is mounted */}
      <Show
        when={drive.selectedDrive && drive.selectedDrive.status !== "unmounted"}
      >
        <div class="space-y-8">
          {/* Drive Header Panel */}
          <div class="p-6 rounded-2xl bg-gradient-to-br from-base-200/60 to-base-300/40 border border-base-200 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div class="flex items-center gap-4 min-w-0">
              <div class="w-12 h-12 rounded-xl bg-gradient-to-tr from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/15 flex-shrink-0">
                {drive.selectedDrive!.type === "internal" ? (
                  <HardDrive class="w-6 h-6 text-primary-content" />
                ) : drive.selectedDrive!.type === "external" ? (
                  <Usb class="w-6 h-6 text-primary-content" />
                ) : (
                  <Globe class="w-6 h-6 text-primary-content" />
                )}
              </div>
              <div class="min-w-0">
                <h2 class="text-xl font-black text-base-content leading-tight truncate">
                  {drive.selectedDrive!.name}
                </h2>
                <span class="text-[10px] font-mono text-base-content/40 uppercase font-bold tracking-wider block mt-0.5">
                  {drive.selectedDrive!.path} · {drive.selectedDrive!.size}{" "}
                  Total
                </span>
                <Show when={albumLocation()}>
                  <p class="text-xs text-base-content/70 mt-1 break-all">
                    Album folder:{" "}
                    <span class="font-mono select-all">{albumLocation()}</span>
                  </p>
                </Show>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-4 w-full md:w-auto">
              <Show
                when={scanStatus()?.scanning}
                fallback={
                  <Link
                    to="/discover"
                    class="btn btn-outline btn-xs px-3 rounded-lg flex items-center gap-1.5"
                  >
                    <Compass class="w-3.5 h-3.5" /> Scan Volume
                  </Link>
                }
              >
                <div class="flex items-center gap-3 px-4 py-2 rounded-xl bg-primary/10 border border-primary/20">
                  <Loader2 class="w-4 h-4 text-primary animate-spin" />
                  <div class="text-left">
                    <span class="block text-[10px] font-bold text-primary uppercase tracking-wider leading-none">
                      Indexing Active
                    </span>
                    <span class="block text-[9px] text-base-content/60 mt-0.5">
                      Found {scanStatus()?.foundCount} items...
                    </span>
                  </div>
                </div>
              </Show>

              <div class="flex items-center gap-2">
                <button
                  onClick={refreshDashboard}
                  disabled={loadingMedia() || loadingAlbums()}
                  class="btn btn-square btn-outline btn-xs border-base-300 hover:border-base-content/30"
                  title="Refresh view"
                >
                  <RefreshCw
                    class={`w-3.5 h-3.5 ${loadingMedia() || loadingAlbums() ? "animate-spin text-primary" : "text-base-content/60"}`}
                  />
                </button>
                <button
                  onClick={() => drive.selectDrive(null)}
                  class="btn btn-square btn-outline btn-xs border-error text-error hover:bg-error hover:border-error hover:text-error-content"
                  title="Disconnect drive"
                >
                  <Power class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Stats Panel */}
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div class="p-5 rounded-2xl bg-base-300/40 border border-base-200 shadow-md flex items-center gap-4 animate-fade-in">
              <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <ImageIcon class="w-5 h-5" />
              </div>
              <div>
                <span class="block text-[10px] font-bold text-base-content/40 uppercase tracking-wider">
                  Total Media Items
                </span>
                <span class="text-xl font-extrabold text-base-content mt-0.5 block">
                  {totalMedia()}
                </span>
              </div>
            </div>

            <div class="p-5 rounded-2xl bg-base-300/40 border border-base-200 shadow-md flex items-center gap-4 animate-fade-in">
              <div class="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary">
                <Folder class="w-5 h-5" />
              </div>
              <div>
                <span class="block text-[10px] font-bold text-base-content/40 uppercase tracking-wider">
                  Total Albums
                </span>
                <span class="text-xl font-extrabold text-base-content mt-0.5 block">
                  {albums().length}
                </span>
              </div>
            </div>

            <div class="p-5 rounded-2xl bg-base-300/40 border border-base-200 shadow-md flex flex-col justify-center gap-2 animate-fade-in">
              <div class="flex items-center justify-between text-[10px] font-bold text-base-content/40 uppercase tracking-wider">
                <span>Storage Used</span>
                <span class="font-mono text-base-content">
                  {drive.selectedDrive!.usedPercentage}%
                </span>
              </div>
              <progress
                class={`progress progress-xs w-full h-2 rounded-full ${
                  drive.selectedDrive!.usedPercentage > 80
                    ? "progress-error"
                    : drive.selectedDrive!.usedPercentage > 50
                      ? "progress-primary"
                      : "progress-success"
                }`}
                value={drive.selectedDrive!.usedPercentage}
                max="100"
              />
              <div class="flex justify-between text-[9px] font-mono text-base-content/40">
                <span>{drive.selectedDrive!.size} total capacity</span>
              </div>
            </div>
          </div>

          {/* Recently Added Media */}
          <section class="space-y-4">
            <div class="flex items-center justify-between border-b border-base-200 pb-2.5">
              <h3 class="text-sm font-black tracking-wider text-base-content/60 uppercase">
                Recently Added Media
              </h3>
              <Link
                to="/medias"
                class="text-xs font-bold text-base-content/60 hover:text-primary transition-colors flex items-center gap-1"
              >
                View All Media
                <ArrowRight class="w-3.5 h-3.5" />
              </Link>
            </div>

            <Show
              when={!loadingMedia() || mediaItems().length > 0}
              fallback={
                <div class="flex flex-col items-center justify-center py-16">
                  <Loader2 class="w-8 h-8 text-primary animate-spin mb-3" />
                  <p class="text-xs text-base-content/40 font-semibold">
                    Querying catalog database...
                  </p>
                </div>
              }
            >
              <Show
                when={mediaItems().length > 0}
                fallback={
                  <div class="p-12 text-center rounded-2xl bg-base-100/10 border border-base-200 border-dashed">
                    <ImageIcon class="w-12 h-12 text-base-content/15 mx-auto mb-4" />
                    <h3 class="text-base-content font-bold">No Media Found</h3>
                    <p class="text-base-content/40 text-xs mt-1.5 max-w-sm mx-auto">
                      This storage volume has not been cataloged yet. Switch to
                      the Discover tab to scan files.
                    </p>
                    <Link
                      to="/discover"
                      class="btn btn-primary btn-sm font-bold mt-4 shadow-lg shadow-primary/15"
                    >
                      Scan Folder
                    </Link>
                  </div>
                }
              >
                <div
                  class={`grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-4 ${selection.isSelecting ? "is-selecting" : ""}`}
                >
                  <For each={mediaItems()}>
                    {(item) => (
                      <MediaCard
                        item={item}
                        drivePath={drive.selectedDrive!.path}
                      />
                    )}
                  </For>
                </div>
              </Show>
            </Show>
          </section>

          {/* Recent Updated Albums */}
          <section class="space-y-4">
            <div class="flex items-center justify-between border-b border-base-200 pb-2.5">
              <h3 class="text-sm font-black tracking-wider text-base-content/60 uppercase">
                Recent Albums
              </h3>
              <Link
                to="/albums"
                class="text-xs font-bold text-base-content/60 hover:text-primary transition-colors flex items-center gap-1"
              >
                View All Albums
                <ArrowRight class="w-3.5 h-3.5" />
              </Link>
            </div>

            <Show
              when={!loadingAlbums() || albums().length > 0}
              fallback={
                <div class="flex flex-col items-center justify-center py-12">
                  <Loader2 class="w-8 h-8 text-primary animate-spin mb-3" />
                  <p class="text-xs text-base-content/40 font-semibold">
                    Loading albums...
                  </p>
                </div>
              }
            >
              <Show
                when={sortedAlbums().length > 0}
                fallback={
                  <div class="p-12 text-center rounded-2xl bg-base-100/10 border border-base-200 border-dashed">
                    <Folder class="w-12 h-12 text-base-content/15 mx-auto mb-4" />
                    <h3 class="text-base-content font-bold">No Albums Found</h3>
                    <p class="text-base-content/40 text-xs mt-1.5 max-w-sm mx-auto">
                      Media folders have not been mapped to albums. Scanning
                      folders will auto-group them into albums.
                    </p>
                  </div>
                }
              >
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <For each={sortedAlbums()}>
                    {(album) => (
                      <AlbumCard
                        album={album}
                        drivePath={drive.selectedDrive!.path}
                      />
                    )}
                  </For>
                </div>
              </Show>
            </Show>
          </section>
        </div>
      </Show>
    </div>
  );
}
