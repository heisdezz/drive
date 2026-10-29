import { createFileRoute } from "@tanstack/solid-router";
import { createSignal, createEffect, onCleanup, For, Show } from "solid-js";
import { useDriveStore } from "@/store/drive_store";
import { useSettingsStore } from "@/store/settings_store";
import { rpc } from "@/lib/rpc";
import {
  HardDrive,
  AlertCircle,
  Loader2,
  Info,
  Database,
  Compass,
  Search,
  Image as ImageIcon,
  Film as FilmIcon,
  Folder,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  FolderMinus,
  FolderOpen,
  Plus,
  X,
  RotateCcw,
  Pause,
  Play,
  Square,
  Shield,
  Tag,
} from "lucide-solid";

export const Route = createFileRoute("/discover/")({
  component: DiscoverComponent,
});

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function DiscoverComponent() {
  const drive = useDriveStore();
  const settings = useSettingsStore();

  let scanPickerRef: HTMLInputElement | undefined;
  let ignorePickerRef: HTMLInputElement | undefined;

  const [albumLocation, setAlbumLocation] = createSignal("");
  const [albumLocationBusy, setAlbumLocationBusy] = createSignal(false);
  const [albumLocationError, setAlbumLocationError] = createSignal("");
  const [albumLocationMessage, setAlbumLocationMessage] = createSignal("");
  const [albumRescanStatus, setAlbumRescanStatus] = createSignal<{
    scanning: boolean; paused?: boolean; stopped?: boolean; checked: number; added: number; updated: number; missing: number; albums: number; recoveredDatabase: boolean; error?: string;
  } | null>(null);
  const [albumRescanError, setAlbumRescanError] = createSignal("");
  const [albumRescanStarted, setAlbumRescanStarted] = createSignal(false);
  const [albumRescanHandled, setAlbumRescanHandled] = createSignal(false);
  const [albumRescanControlBusy, setAlbumRescanControlBusy] = createSignal(false);

  const startAlbumRescan = async () => {
    const drivePath = drive.selectedDrive?.path;
    if (!drivePath) return;
    setAlbumRescanError("");
    setAlbumRescanStarted(true);
    setAlbumRescanHandled(false);
    setAlbumRescanStatus({ scanning: true, checked: 0, added: 0, updated: 0, missing: 0, albums: 0, recoveredDatabase: false });
    try {
      const result = await rpc.request.startAlbumRescan({ drivePath });
      if (!result.success) throw new Error(result.error || "Could not start album rescan.");
    } catch (error: any) {
      setAlbumRescanError(error.message || "Could not start album rescan.");
      setAlbumRescanStatus(null);
      setAlbumRescanStarted(false);
    }
  };

  const toggleAlbumRescanPause = async () => {
    const drivePath = drive.selectedDrive?.path;
    if (!drivePath || !albumRescanStatus()?.scanning) return;
    const paused = !albumRescanStatus()?.paused;
    setAlbumRescanControlBusy(true);
    setAlbumRescanError("");
    try {
      const result = await rpc.request.pauseAlbumRescan({ drivePath, paused });
      if (!result.success) throw new Error(result.error || "Could not change rescan state.");
      setAlbumRescanStatus(current => current ? { ...current, paused } : current);
    } catch (error: any) { setAlbumRescanError(error.message || "Could not change rescan state."); }
    finally { setAlbumRescanControlBusy(false); }
  };

  const stopAlbumRescan = async () => {
    const drivePath = drive.selectedDrive?.path;
    if (!drivePath || !albumRescanStatus()?.scanning) return;
    setAlbumRescanControlBusy(true);
    setAlbumRescanError("");
    try {
      const result = await rpc.request.stopAlbumRescan({ drivePath });
      if (!result.success) throw new Error(result.error || "Could not stop rescan.");
      setAlbumRescanStatus(current => current ? { ...current, scanning: false, paused: false, stopped: true } : current);
    } catch (error: any) { setAlbumRescanError(error.message || "Could not stop rescan."); }
    finally { setAlbumRescanControlBusy(false); }
  };


  const chooseAlbumFolder = async () => {
    const drivePath = drive.selectedDrive?.path;
    if (!drivePath) return;
    setAlbumLocationError("");
    setAlbumLocationMessage("");
    try {
      const picked = await rpc.request.selectFolder({ defaultPath: albumLocation() || drivePath, title: "Choose album folder on this drive" });
      if (!picked.success || !picked.folderPath) return;
      setAlbumLocationBusy(true);
      const result = await rpc.request.setAlbumLocation({ drivePath, folderPath: picked.folderPath });
      if (!result.success) throw new Error(result.error || "Could not save album folder.");
      setAlbumLocation(result.absolutePath || picked.folderPath);
      setAlbumRescanStatus(null);
      setAlbumRescanStarted(false);
      setAlbumRescanHandled(false);
      setAlbumRescanError("");
      setAlbumLocationMessage("Album folder switched. Existing files and databases were left in place.");
      await rpc.request.setActiveMediaDrive({ drivePath });
      await runScaffolding(drivePath);
    } catch (error: any) {
      setAlbumLocationError(error.message || "Could not change album folder.");
    } finally { setAlbumLocationBusy(false); }
  };

  const [scaffolding, setScaffolding] = createSignal(false);
  const [scaffoldResult, setScaffoldResult] = createSignal<{
    success: boolean;
    error?: string;
  } | null>(null);

  // Scanning states
  const [scanPath, setScanPath] = createSignal("");
  const [newIgnoreInput, setNewIgnoreInput] = createSignal("");
  const [scanningError, setScanningError] = createSignal<string | null>(null);
  const [scanInitiated, setScanInitiated] = createSignal(false);
  const [scanStatus, setScanStatus] = createSignal<{
    scanning: boolean;
    scannedCount: number;
    foundCount: number;
    folderPath: string;
  } | null>(null);

  // Media items grid states
  const [mediaItems, setMediaItems] = createSignal<any[]>([]);
  const [totalItems, setTotalItems] = createSignal(0);
  const [page, setPage] = createSignal(0);
  const [_itemsLoaded, setItemsLoaded] = createSignal(false);
  const itemsPerPage = 8;

  const handleAddIgnore = () => {
    const input = newIgnoreInput().trim();
    if (input) {
      settings.addIgnorePath(input);
      setNewIgnoreInput("");
    }
  };

  const handlePickScanFolder = async () => {
    try {
      const res = await rpc.request.selectFolder({
        defaultPath: scanPath() || drive.selectedDrive?.path,
        title: "Select Folder to Scan",
      });
      if (res.success && res.folderPath) {
        setScanPath(res.folderPath);
      } else if (res.error?.includes("cancelled")) {
        return;
      } else {
        scanPickerRef?.click();
      }
    } catch (err) {
      scanPickerRef?.click();
    }
  };

  const handlePickIgnoreFolder = async () => {
    try {
      const res = await rpc.request.selectFolder({
        defaultPath: drive.selectedDrive?.path,
        title: "Select Folder to Add to Ignorelist",
      });
      if (res.success && res.folderPath) {
        const driveRoot = drive.selectedDrive?.path || "";
        let rel = res.folderPath;
        if (driveRoot && res.folderPath.startsWith(driveRoot)) {
          rel = res.folderPath
            .slice(driveRoot.length)
            .replace(/^\/+|\/+$/g, "");
        }
        const ignoreVal =
          rel || res.folderPath.split("/").pop() || res.folderPath;
        settings.addIgnorePath(ignoreVal);
      } else if (res.error?.includes("cancelled")) {
        return;
      } else {
        ignorePickerRef?.click();
      }
    } catch (err) {
      ignorePickerRef?.click();
    }
  };

  const runScaffolding = async (drivePath: string, maxAttempts = 5) => {
    setScaffolding(true);
    setScaffoldResult((prev) => (prev?.success ? prev : null));

    let lastError = "Failed to trigger native scaffolding";
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(
          `Scaffolding drive library at: ${drivePath} (attempt ${attempt}/${maxAttempts})`,
        );
        const res = await rpc.request.scaffoldLibrary({ drivePath });
        if (res.success) {
          setScaffoldResult({ success: true });
          if (drive.selectedDrive?.path === drivePath) {
            void rpc.request.setActiveMediaDrive({ drivePath }).catch(error => console.error("Could not activate media server:", error));
          }
          setScaffolding(false);
          return;
        }
        lastError = res.error || "Unknown filesystem error";
      } catch (err: any) {
        lastError = err.message || "Failed to trigger native scaffolding";
        console.warn(`Scaffolding attempt ${attempt} failed: ${lastError}`);
      }

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
      }
    }

    setScaffoldResult({ success: false, error: lastError });
    setScaffolding(false);
  };

  const startScanning = async () => {
    const selectedDrive = drive.selectedDrive;
    if (!selectedDrive) return;
    setScanningError(null);

    const targetPath = scanPath().trim() || selectedDrive.path;
    try {
      const res = await rpc.request.startScan({
        drivePath: selectedDrive.path,
        folderPath: targetPath,
        ignoreList: settings.ignore_list,
      });
      if (res.success) {
        setScanStatus((prev) => ({
          scanning: true,
          scannedCount: prev?.scannedCount || 0,
          foundCount: prev?.foundCount || 0,
          folderPath: targetPath,
        }));
        setScanInitiated(true);
      } else {
        setScanningError(res.error || "Failed to start scanning folder");
      }
    } catch (err: any) {
      setScanningError(err.message || "RPC connection error starting scan");
    }
  };

  const fetchMediaItems = async (drivePath: string, currentPage: number) => {
    try {
      const res = await rpc.request.getMediaItems({
        drivePath,
        limit: itemsPerPage,
        offset: currentPage * itemsPerPage,
      });
      if (res.items) {
        setMediaItems(res.items);
        setTotalItems(res.total);
      }
    } catch (err) {
      console.error("Failed to load indexed media items from SQLite:", err);
    } finally {
      setItemsLoaded(true);
    }
  };

  // 1. Scaffold drive when drive selection changes
  createEffect(() => {
    const path = drive.selectedDrive?.path;
    if (path) {
      setAlbumRescanStatus(null);
      setAlbumRescanStarted(false);
      setAlbumRescanHandled(false);
      setAlbumRescanError("");
      void rpc.request.getAlbumLocation({ drivePath: path }).then(result => {
        if (drive.selectedDrive?.path === path) setAlbumLocation(result.absolutePath);
      }).catch(error => setAlbumLocationError(error.message));
      runScaffolding(path);
      setScanPath(path);
      setPage(0);
      setScanInitiated(false);
      setItemsLoaded(false);
    } else {
      setScaffoldResult(null);
      setAlbumLocation("");
      setAlbumRescanStatus(null);
      setAlbumRescanStarted(false);
      setAlbumRescanError("");
      setMediaItems([]);
      setTotalItems(0);
      setItemsLoaded(false);
    }
  });

  // 2. Poll scanner status and load DB results on completion
  createEffect(() => {
    const path = drive.selectedDrive?.path;
    const isScaffolding = scaffolding();
    const isScaffoldSuccess = scaffoldResult()?.success;
    const currentPage = page();

    if (!path || isScaffolding || !isScaffoldSuccess) return;

    const checkStatus = async () => {
      try {
        const status = await rpc.request.getScanStatus({
          drivePath: path,
        });
        setScanStatus(status);
        if (status.scanning) {
          setScanInitiated(true);
        }
        return status.scanning;
      } catch (err) {
        console.error("Failed to poll scan status:", err);
        return false;
      }
    };

    checkStatus().then(() => {
      fetchMediaItems(path, currentPage);
    });

    const interval = setInterval(async () => {
      await checkStatus();
      fetchMediaItems(path, currentPage);
    }, 1500);

    onCleanup(() => clearInterval(interval));
  });

  createEffect(() => {
    const drivePath = drive.selectedDrive?.path;
    if (!drivePath) return;
    let active = true;
    const refresh = async () => {
      try {
        const result = await rpc.request.getAlbumRescanStatus({ drivePath });
        if (!active) return;
        setAlbumRescanStatus(result);
        if (result.scanning || result.stopped || result.checked || result.error || result.recoveredDatabase) setAlbumRescanStarted(true);
        if (result.error) setAlbumRescanError(result.error);
        if (albumRescanStarted() && !albumRescanHandled() && !result.scanning && !result.error) {
          setAlbumRescanHandled(true);
          if (!result.stopped && !scaffoldResult()?.success) void runScaffolding(drivePath);
        }
      } catch (error) { if (active) console.error("Could not read album rescan status:", error); }
    };
    void refresh();
    const interval = setInterval(refresh, 1500);
    onCleanup(() => { active = false; clearInterval(interval); });
  });

  // Common Ignorelist Section component for rendering in both views
  const renderIgnoreListSection = () => (
    <div class="p-4 rounded-xl bg-base-200/50 border border-base-300/80 space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <FolderMinus class="w-4 h-4 text-warning" />
          <span class="text-xs font-bold text-base-content">
            Folder & Path Ignorelist
          </span>
          <span class="badge badge-xs badge-warning font-mono font-bold">
            {settings.ignore_list.length} custom
          </span>
        </div>

        <button
          onClick={() => settings.resetIgnoreList()}
          class="btn btn-ghost btn-xs text-[10px] text-base-content/40 hover:text-base-content flex items-center gap-1"
          title="Reset to default ignore list"
        >
          <RotateCcw class="w-3 h-3" /> Reset Defaults
        </button>
      </div>

      <p class="text-[10px] text-base-content/50 leading-relaxed">
        The scanner will automatically bypass matching folder names or path
        segments during discovery.
      </p>

      {/* Input to add new path */}
      <div class="flex gap-2">
        <input
          type="text"
          placeholder="Add folder/path (e.g. temp, raw_dumps)"
          value={newIgnoreInput()}
          onInput={(e) => setNewIgnoreInput(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddIgnore();
            }
          }}
          disabled={scanStatus()?.scanning}
          class="input input-bordered input-xs flex-grow bg-base-100 border-base-300 text-xs text-base-content focus:border-warning"
        />
        <button
          type="button"
          onClick={handlePickIgnoreFolder}
          disabled={scanStatus()?.scanning}
          class="btn btn-outline btn-xs px-2 border-base-300 text-base-content/70 hover:bg-base-200 flex items-center gap-1"
          title="Browse & select folder using native file picker"
        >
          <FolderOpen class="w-3 h-3 text-warning" />
          <span class="hidden sm:inline">Browse</span>
        </button>
        <button
          onClick={handleAddIgnore}
          disabled={scanStatus()?.scanning || !newIgnoreInput().trim()}
          class="btn btn-warning btn-xs px-3 font-bold flex items-center gap-1"
        >
          <Plus class="w-3 h-3" /> Add
        </button>
      </div>

      {/* Preset Quick Add suggestions */}
      <div class="flex flex-wrap gap-1.5 items-center pt-1">
        <span class="text-[9px] font-bold text-base-content/40 uppercase tracking-wider mr-1">
          Quick Presets:
        </span>
        <For each={["temp", "cache", "raw", "backups", "archive"]}>
          {(preset) => {
            const isAdded = () =>
              settings.ignore_list.some(
                (item: string) => item.toLowerCase() === preset.toLowerCase(),
              );
            return (
              <Show when={!isAdded()}>
                <button
                  onClick={() => settings.addIgnorePath(preset)}
                  disabled={scanStatus()?.scanning}
                  class="px-2 py-0.5 rounded-full bg-base-300/60 hover:bg-warning/20 hover:text-warning text-base-content/60 text-[9px] font-mono transition-all flex items-center gap-0.5 border border-base-300"
                >
                  <Plus class="w-2.5 h-2.5" /> {preset}
                </button>
              </Show>
            );
          }}
        </For>
      </div>

      {/* Active Ignore Items Cloud */}
      <div class="pt-2 border-t border-base-300/50 space-y-2">
        <div class="flex flex-wrap gap-1.5">
          <div class="flex items-center gap-1 px-2 py-1 rounded-md bg-base-300/40 border border-base-300 text-[10px] font-mono text-base-content/40">
            <Shield class="w-3 h-3 text-base-content/30" />
            <span>{albumLocation() || "albums/"}</span>
          </div>
          <div class="flex items-center gap-1 px-2 py-1 rounded-md bg-base-300/40 border border-base-300 text-[10px] font-mono text-base-content/40">
            <Shield class="w-3 h-3 text-base-content/30" />
            <span>node_modules/</span>
          </div>
          <div class="flex items-center gap-1 px-2 py-1 rounded-md bg-base-300/40 border border-base-300 text-[10px] font-mono text-base-content/40">
            <Shield class="w-3 h-3 text-base-content/30" />
            <span>.* (hidden)</span>
          </div>
          <div class="flex items-center gap-1 px-2 py-1 rounded-md bg-base-300/40 border border-base-300 text-[10px] font-mono text-base-content/40">
            <Shield class="w-3 h-3 text-base-content/30" />
            <span>lost+found</span>
          </div>

          <For each={settings.ignore_list}>
            {(item) => (
              <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-warning/10 border border-warning/30 text-warning text-[11px] font-mono font-semibold shadow-xs">
                <Tag class="w-3 h-3 text-warning/70" />
                <span>{item}</span>
                <button
                  onClick={() => settings.removeIgnorePath(item)}
                  disabled={scanStatus()?.scanning}
                  class="hover:bg-warning/20 p-0.5 rounded transition-colors text-warning/70 hover:text-warning"
                  title={`Remove '${item}' from ignorelist`}
                >
                  <X class="w-3 h-3" />
                </button>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );

  return (
    <div class="space-y-8 max-w-5xl">
      {/* Hidden file inputs for directory pick fallback */}
      <input
        type="file"
        ref={scanPickerRef}
        // @ts-ignore
        webkitdirectory=""
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.currentTarget.files && e.currentTarget.files[0]) {
            const first = e.currentTarget.files[0];
            const p = (first as any).path;
            if (p) {
              const dir = p.substring(0, p.lastIndexOf("/"));
              if (dir) setScanPath(dir);
            }
          }
        }}
      />
      <input
        type="file"
        ref={ignorePickerRef}
        // @ts-ignore
        webkitdirectory=""
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.currentTarget.files && e.currentTarget.files[0]) {
            const first = e.currentTarget.files[0];
            const p = (first as any).path;
            if (p) {
              const dir = p.substring(0, p.lastIndexOf("/"));
              const driveRoot = drive.selectedDrive?.path || "";
              let rel = dir;
              if (driveRoot && dir.startsWith(driveRoot)) {
                rel = dir.slice(driveRoot.length).replace(/^\/+|\/+$/g, "");
              }
              const val = rel || dir.split("/").pop() || dir;
              settings.addIgnorePath(val);
            }
          }
        }}
      />

      {/* Case 1: No drive is selected */}
      <Show when={!drive.selectedDrive}>
        <div class="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 sm:p-12">
          <div class="w-20 h-20 rounded-full bg-base-100 border border-base-300 flex items-center justify-center mb-6 shadow-xl relative overflow-hidden group">
            <div class="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <Compass class="w-10 h-10 text-base-content/40 group-hover:text-primary transition-colors duration-300" />
          </div>
          <h3 class="text-2xl font-black text-base-content mb-2">
            No Drive Selected
          </h3>
          <p class="text-base-content/60 text-sm max-w-sm leading-relaxed mb-6">
            Please select a connected drive or storage volume from the sidebar
            to inspect files and configure folder structures.
          </p>
          <div class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-base-100/60 border border-base-200 text-[10px] text-base-content/40 font-medium">
            <Info class="w-3.5 h-3.5" />
            Compatible with NTFS, exFAT, ext4, and APFS drives.
          </div>
        </div>
      </Show>

      {/* Case 1.5: Selected drive is unmounted */}
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
            This storage device needs to be mounted before you can view, scan,
            or organize files on it.
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
            class="btn btn-primary px-8 font-bold text-sm tracking-wide shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            Mount Drive
          </button>
        </div>
      </Show>

      {/* Case 2: Drive selected and mounted */}
      <Show
        when={drive.selectedDrive && drive.selectedDrive.status !== "unmounted"}
      >
        {/* Drive Header Summary Card */}
        <div class="p-6 rounded-2xl bg-gradient-to-br from-base-200/60 to-base-300/40 border border-base-200 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-tr from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/15 flex-shrink-0">
              <HardDrive class="w-6 h-6 text-primary-content" />
            </div>
            <div>
              <h2 class="text-xl font-black text-base-content leading-tight">
                {drive.selectedDrive!.name}
              </h2>
              <span class="text-[10px] font-mono text-base-content/40 uppercase font-bold tracking-wider">
                {drive.selectedDrive!.size} · {drive.selectedDrive!.type}
              </span>
            </div>
          </div>
          <div class="px-3.5 py-1.5 rounded-lg bg-base-100/80 border border-base-300 font-mono text-xs text-base-content/60 select-all">
            {drive.selectedDrive!.path}
          </div>
        </div>

        <section class="rounded-2xl bg-base-100/40 border border-base-200/80 p-5 sm:p-6 space-y-3" aria-label="Album folder">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div class="min-w-0">
              <h3 class="text-sm font-bold text-base-content flex items-center gap-2"><FolderOpen class="w-4 h-4 text-primary" /> Album folder</h3>
              <p class="text-xs text-base-content/70 mt-1">Albums, thumbnails, and the catalog for this drive are stored here.</p>
            </div>
            <div class="flex flex-wrap gap-2">
            <button type="button" onClick={startAlbumRescan} disabled={albumRescanStatus()?.scanning || albumLocationBusy() || scanStatus()?.scanning || scaffolding()} class="btn btn-outline btn-sm shrink-0">
              <Show when={albumRescanStatus()?.scanning && !albumRescanStatus()?.paused} fallback={<RefreshCw class="w-4 h-4" />}><Loader2 class="w-4 h-4 animate-spin" /></Show>
              {albumRescanStatus()?.paused ? "Rescan paused" : albumRescanStatus()?.scanning ? "Rescanning…" : "Rescan album folder"}
            </button>
            <Show when={albumRescanStatus()?.scanning}>
              <button type="button" onClick={toggleAlbumRescanPause} disabled={albumRescanControlBusy()} class="btn btn-outline btn-sm shrink-0" aria-label={albumRescanStatus()?.paused ? "Resume album rescan" : "Pause album rescan"}>
                <Show when={albumRescanStatus()?.paused} fallback={<Pause class="w-4 h-4" />}><Play class="w-4 h-4" /></Show>
                {albumRescanStatus()?.paused ? "Resume" : "Pause"}
              </button>
              <button type="button" onClick={stopAlbumRescan} disabled={albumRescanControlBusy()} class="btn btn-outline btn-sm shrink-0" aria-label="Stop album rescan"><Square class="w-4 h-4" /> Stop</button>
            </Show>
            <button type="button" onClick={chooseAlbumFolder} disabled={albumLocationBusy() || albumRescanStatus()?.scanning || scanStatus()?.scanning || scaffolding()} class="btn btn-outline btn-sm shrink-0">
              <Show when={albumLocationBusy()} fallback={<FolderOpen class="w-4 h-4" />}><Loader2 class="w-4 h-4 animate-spin" /></Show>
              Choose folder
            </button>
            </div>
          </div>
          <p class="font-mono text-xs text-base-content/80 break-all select-all">{albumLocation() || `${drive.selectedDrive!.path}/albums`}</p>
          <p class="text-xs text-base-content/60">Rescan repairs the catalog in the selected folder. Choose folder switches the active catalog without moving files or merging databases.</p>
          <Show when={albumRescanStatus()?.scanning}><p role="status" class="text-xs text-primary">{albumRescanStatus()?.paused ? "Paused after" : "Checking files:"} {albumRescanStatus()?.checked || 0}{albumRescanStatus()?.paused ? " files checked" : ""}</p></Show>
          <Show when={albumRescanStatus()?.stopped && !albumRescanStatus()?.scanning}><p role="status" class="text-xs text-warning">Rescan stopped. Some checked files may be saved; missing-record cleanup was skipped.</p></Show>
          <Show when={albumRescanStarted() && albumRescanStatus() && !albumRescanStatus()?.scanning && !albumRescanStatus()?.stopped && !albumRescanError()}>
            <p role="status" class="text-xs text-success">Rescan complete: {albumRescanStatus()?.added} added, {albumRescanStatus()?.updated} updated, {albumRescanStatus()?.missing} missing records removed, {albumRescanStatus()?.albums} album folders checked{albumRescanStatus()?.recoveredDatabase ? ". Database recovered." : "."}</p>
          </Show>
          <Show when={albumRescanError()}><p role="alert" class="text-xs text-error">{albumRescanError()}</p></Show>
          <Show when={albumLocationError()}><p role="alert" class="text-xs text-error">{albumLocationError()}</p></Show>
          <Show when={albumLocationMessage()}><p role="status" class="text-xs text-success">{albumLocationMessage()}</p></Show>
        </section>

        {/* Health checks/Scaffolding state */}
        <Show
          when={!scaffolding()}
          fallback={
            <div class="p-6 rounded-2xl bg-base-100/20 border border-base-200/80 flex items-center gap-4">
              <Loader2 class="w-5 h-5 text-primary animate-spin" />
              <div>
                <h4 class="font-bold text-base-content text-sm">
                  Verifying Directory Structure
                </h4>
                <p class="text-base-content/40 text-xs mt-0.5">
                  Scaffolding library database and album folders on drive...
                </p>
              </div>
            </div>
          }
        >
          <Show
            when={scaffoldResult()?.success}
            fallback={
              <div class="p-6 rounded-2xl bg-base-100/20 border border-base-200/80 space-y-4">
                <div class="flex items-start gap-4 p-5 rounded-xl bg-error/10 border border-error/20 text-error">
                  <AlertCircle class="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 class="font-bold text-base-content text-sm">
                      Failed to Scaffold Library
                    </h4>
                    <p class="text-base-content/60 text-xs mt-0.5 leading-relaxed">
                      {scaffoldResult()?.error || "Unknown filesystem error"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => runScaffolding(drive.selectedDrive!.path)}
                  class="btn btn-outline btn-error btn-sm font-bold"
                >
                  Retry Scaffolding
                </button>
              </div>
            }
          >
            {/* Empty database Discover CTA */}
            <Show
              when={
                totalItems() > 0 || scanStatus()?.scanning || scanInitiated()
              }
              fallback={
                <div class="p-8 sm:p-12 rounded-3xl bg-base-100/30 border border-base-200 flex flex-col items-center text-center space-y-6 shadow-2xl relative overflow-hidden">
                  <div class="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

                  <div class="w-20 h-20 rounded-2xl bg-gradient-to-tr from-primary/10 to-secondary/10 border border-primary/20 flex items-center justify-center shadow-xl shadow-primary/5 group">
                    <Compass class="w-10 h-10 text-primary animate-pulse group-hover:scale-110 transition-transform duration-300" />
                  </div>

                  <div class="space-y-2 max-w-md">
                    <h3 class="text-2xl font-black text-base-content tracking-tight">
                      Discover Media Catalog
                    </h3>
                    <p class="text-base-content/60 text-sm leading-relaxed">
                      Scan this storage device to build a catalog of photos and
                      videos. Your media will be indexed locally on the drive.
                    </p>
                  </div>

                  <div class="w-full max-w-md p-4 rounded-xl bg-base-300/60 border border-base-200 space-y-4 text-left">
                    <div class="form-control w-full">
                      <label class="label py-1">
                        <span class="label-text text-[10px] text-base-content/40 font-bold uppercase">
                          Folder Path to Discover
                        </span>
                      </label>
                      <div class="flex gap-2">
                        <input
                          type="text"
                          placeholder={drive.selectedDrive!.path}
                          value={scanPath()}
                          onInput={(e) => setScanPath(e.currentTarget.value)}
                          class="input input-bordered input-sm flex-grow bg-base-100 border-base-300 text-xs focus:border-primary text-base-content"
                        />
                        <button
                          type="button"
                          onClick={handlePickScanFolder}
                          class="btn btn-outline btn-sm px-3 border-base-300 text-base-content/80 hover:bg-base-200 flex items-center gap-1.5 font-bold"
                          title="Select folder using native file picker"
                        >
                          <FolderOpen class="w-4 h-4 text-primary" />
                          <span>Browse</span>
                        </button>
                      </div>
                    </div>

                    {renderIgnoreListSection()}
                  </div>

                  <button
                    onClick={() => {
                      setScanInitiated(true);
                      startScanning();
                    }}
                    disabled={albumRescanStatus()?.scanning}
                    class="btn btn-primary px-8 font-bold text-sm tracking-wide shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    Discover Drive
                  </button>
                </div>
              }
            >
              {/* Full Scanner view */}
              <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Path Selection and Start */}
                <div class="md:col-span-2 p-6 rounded-2xl bg-base-100/40 border border-base-200/80 space-y-4">
                  <h3 class="text-sm font-black tracking-wider text-base-content/60 uppercase flex items-center gap-2">
                    <Search class="w-4 h-4 text-primary" /> Scan Folder for
                    Media
                  </h3>

                  <div class="space-y-4">
                    <div class="form-control w-full">
                      <label class="label py-1">
                        <span class="label-text text-[10px] text-base-content/40 font-bold uppercase">
                          Folder Path to Traverse
                        </span>
                      </label>
                      <div class="flex gap-2">
                        <input
                          type="text"
                          placeholder={drive.selectedDrive!.path}
                          value={scanPath()}
                          onInput={(e) => setScanPath(e.currentTarget.value)}
                          disabled={scanStatus()?.scanning}
                          class="input input-bordered input-sm flex-grow bg-base-200 border-base-300 text-xs focus:border-primary text-base-content"
                        />
                        <button
                          type="button"
                          onClick={handlePickScanFolder}
                          disabled={scanStatus()?.scanning}
                          class="btn btn-outline btn-sm px-3 border-base-300 text-base-content/80 hover:bg-base-200 flex items-center gap-1.5 font-bold"
                          title="Select folder using native file picker"
                        >
                          <FolderOpen class="w-4 h-4 text-primary" />
                          <span class="hidden sm:inline">Browse</span>
                        </button>
                        <button
                          onClick={startScanning}
                          disabled={scanStatus()?.scanning || albumRescanStatus()?.scanning}
                          class="btn btn-primary btn-sm px-5 font-bold flex items-center gap-1.5"
                        >
                          <Show
                            when={scanStatus()?.scanning}
                            fallback="Start Scan"
                          >
                            <Loader2 class="w-3.5 h-3.5 animate-spin" />{" "}
                            Scanning
                          </Show>
                        </button>
                      </div>
                      <span class="text-[10px] text-base-content/40 mt-1.5 leading-normal">
                        The scanner runs recursively in the background, indexing
                        files straight into SQLite. Subfolders in the ignorelist
                        below will be automatically skipped.
                      </span>
                    </div>

                    {renderIgnoreListSection()}

                    <Show when={scanningError()}>
                      <div class="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-xs flex items-center gap-2">
                        <AlertCircle class="w-4 h-4" /> {scanningError()}
                      </div>
                    </Show>
                  </div>
                </div>

                {/* Scanning Status widget */}
                <div class="p-6 rounded-2xl bg-base-100/40 border border-base-200/80 flex flex-col justify-between gap-4">
                  <div>
                    <h3 class="text-sm font-black tracking-wider text-base-content/60 uppercase">
                      Scanner Status
                    </h3>
                    <div class="mt-4 space-y-3">
                      <div class="flex justify-between text-xs border-b border-base-200 pb-2">
                        <span class="text-base-content/40">State:</span>
                        <span
                          class={`font-bold uppercase ${scanStatus()?.scanning ? "text-primary animate-pulse" : "text-base-content/60"}`}
                        >
                          {scanStatus()?.scanning ? "Scanning" : "Idle"}
                        </span>
                      </div>
                      <div class="flex justify-between text-xs border-b border-base-200 pb-2">
                        <span class="text-base-content/40">Checked Files:</span>
                        <span class="font-mono text-base-content">
                          {scanStatus()?.scannedCount || 0}
                        </span>
                      </div>
                      <div class="flex justify-between text-xs border-b border-base-200 pb-2">
                        <span class="text-base-content/40">
                          Active Ignore Rules:
                        </span>
                        <span class="font-mono text-warning font-bold">
                          {settings.ignore_list.length} rules
                        </span>
                      </div>
                      <div class="flex justify-between text-xs">
                        <span class="text-base-content/40">
                          SQLite Cataloged:
                        </span>
                        <span class="font-mono text-success font-bold">
                          {scanStatus()?.foundCount || 0}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Show when={scanStatus()?.scanning}>
                    <div class="w-full space-y-3">
                      <div class="w-full space-y-1">
                        <div class="h-1.5 w-full bg-base-300 rounded-full overflow-hidden">
                          <div class="h-full bg-primary animate-progress w-2/3 rounded-full" />
                        </div>
                        <span class="text-[8px] text-base-content/30 block text-right font-mono truncate">
                          Traversing subdirectories...
                        </span>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            await rpc.request.stopScan({
                              drivePath: drive.selectedDrive!.path,
                            });
                            setScanStatus((prev) =>
                              prev ? { ...prev, scanning: false } : null,
                            );
                          } catch (err) {
                            console.error("Failed to stop scan:", err);
                          }
                        }}
                        class="btn btn-outline btn-error btn-xs w-full font-bold flex items-center justify-center gap-1.5"
                      >
                        🛑 Stop Scan
                      </button>
                    </div>
                  </Show>
                </div>
              </div>

              {/* Catalog Grid View */}
              <div class="space-y-4">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <h3 class="text-sm font-black tracking-wider text-base-content/60 uppercase flex items-center gap-1.5">
                      <Database class="w-4 h-4 text-success" /> Cataloged Media
                      Library
                    </h3>
                    <span class="badge badge-sm badge-outline border-base-300 text-base-content/60 font-bold px-2 py-0.5">
                      {totalItems()} items
                    </span>
                  </div>

                  <button
                    onClick={() =>
                      fetchMediaItems(drive.selectedDrive!.path, page())
                    }
                    class="btn btn-ghost btn-xs text-base-content/40 hover:text-base-content flex items-center gap-1"
                    title="Force refresh database view"
                  >
                    <RefreshCw class="w-3 h-3" /> Refresh View
                  </button>
                </div>

                <Show
                  when={mediaItems().length > 0}
                  fallback={
                    <div class="p-12 text-center rounded-2xl bg-base-100/10 border border-base-200 border-dashed text-base-content/40">
                      <Folder class="w-12 h-12 text-base-content/20 mx-auto mb-3" />
                      <h4 class="font-bold text-base-content/60 text-sm">
                        SQLite Database Empty
                      </h4>
                      <p class="text-xs text-base-content/30 max-w-xs mx-auto mt-1 leading-normal">
                        No media files found in the database. Specify a folder
                        and run a scan to register items.
                      </p>
                    </div>
                  }
                >
                  <div class="space-y-4">
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <For each={mediaItems()}>
                        {(item) => {
                          const isVideo = item.mime_type.startsWith("video");
                          const name = item.original_relative_path
                            .split("/")
                            .pop();
                          return (
                            <div class="p-3.5 rounded-xl bg-base-300/40 border border-base-200 hover:border-base-300/80 transition-all duration-150 flex items-start gap-3.5">
                              <div
                                class={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 shadow ${
                                  isVideo
                                    ? "bg-info/10 text-info"
                                    : "bg-secondary/10 text-secondary"
                                }`}
                              >
                                <Show
                                  when={isVideo}
                                  fallback={<ImageIcon class="w-5 h-5" />}
                                >
                                  <FilmIcon class="w-5 h-5" />
                                </Show>
                              </div>
                              <div class="min-w-0 flex-grow">
                                <h4
                                  class="font-bold text-base-content text-xs truncate leading-snug"
                                  title={name}
                                >
                                  {name}
                                </h4>
                                <p
                                  class="text-[9px] text-base-content/40 truncate mt-0.5"
                                  title={item.original_relative_path}
                                >
                                  {item.original_relative_path}
                                </p>
                                <div class="flex items-center gap-2 mt-2">
                                  <span class="text-[8px] font-mono bg-base-100 border border-base-200 px-1 rounded text-base-content/60 leading-none py-0.5">
                                    {formatBytes(item.file_size)}
                                  </span>
                                  <span class="text-[8px] font-semibold uppercase text-base-content/40 leading-none">
                                    {item.mime_type.split("/")[1]}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        }}
                      </For>
                    </div>

                    {/* Pagination */}
                    <Show when={totalItems() > itemsPerPage}>
                      <div class="flex items-center justify-between border-t border-base-200 pt-4">
                        <span class="text-[10px] text-base-content/40 font-medium">
                          Showing {page() * itemsPerPage + 1} -{" "}
                          {Math.min((page() + 1) * itemsPerPage, totalItems())}{" "}
                          of {totalItems()} items
                        </span>
                        <div class="flex items-center gap-1">
                          <button
                            disabled={page() === 0}
                            onClick={() => setPage(Math.max(0, page() - 1))}
                            class="btn btn-square btn-outline btn-xs border-base-300 hover:bg-base-100 text-base-content/60 hover:text-base-content"
                          >
                            <ChevronLeft class="w-3.5 h-3.5" />
                          </button>
                          <span class="text-[10px] font-bold text-base-content px-2">
                            Page {page() + 1}
                          </span>
                          <button
                            disabled={
                              (page() + 1) * itemsPerPage >= totalItems()
                            }
                            onClick={() => setPage(page() + 1)}
                            class="btn btn-square btn-outline btn-xs border-base-300 hover:bg-base-100 text-base-content/60 hover:text-base-content"
                          >
                            <ChevronRight class="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </Show>
                  </div>
                </Show>
              </div>
            </Show>
          </Show>
        </Show>
      </Show>
    </div>
  );
}
