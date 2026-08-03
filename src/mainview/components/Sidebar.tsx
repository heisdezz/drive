import { memo, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { rpc } from "@/lib/rpc";
import { useDriveStore, type Device } from "@/store/drive_store";
import {
  Zap,
  LayoutDashboard,
  Hash,
  Settings,
  RefreshCw,
  HardDrive,
  Usb,
  Globe,
  Plus,
  Compass,
  Image as ImageIcon,
  Library,
  Info,
  type LucideIcon,
} from "lucide-react";

// Nav items are data-driven so the shared link styling lives in one place
// instead of being copy-pasted per entry.
const NAV_ITEMS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/discover", label: "Discover", icon: Compass },
  { to: "/medias", label: "Media Library", icon: ImageIcon },
  { to: "/albums", label: "Albums", icon: Library },
  { to: "/counter", label: "State Counter", icon: Hash },
  { to: "/about", label: "System Info", icon: Info },
  { to: "/settings", label: "Settings", icon: Settings },
];

const NAV_LINK_BASE =
  "px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2.5 transition-all duration-155";
const NAV_LINK_ACTIVE =
  "bg-base-300 text-base-content font-bold border-l-2 border-primary pl-3.5";
const NAV_LINK_INACTIVE =
  "text-base-content/60 hover:text-base-content hover:bg-base-300/40 pl-4";

// Isolated + memoized so a selection change re-renders only the two affected
// cards (old + new) rather than the entire drive list.
const DriveCard = memo(function DriveCard({
  device,
  isSelected,
  onSelect,
  onChanged,
}: {
  device: Device;
  isSelected: boolean;
  onSelect: (device: Device) => void;
  onChanged: () => void;
}) {
  // Linux: path === "/"; Windows: name set to "System Drive (C:)" by getWindowsDrives
  const isSystemRoot =
    device.path === "/" || device.name.startsWith("System Drive (");

  const handleMountBlockDevice = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await rpc.request.mountBlockDevice({ deviceId: device.id });
      if (res.success && res.mountPath) {
        onChanged();
      } else {
        alert(`Failed to mount: ${res.error}`);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  return (
    <div
      onClick={() => {
        if (!isSystemRoot) onSelect(device);
      }}
      className={`p-3 rounded-xl transition-all duration-150 flex flex-col gap-2 border ${
        isSystemRoot
          ? "opacity-40 cursor-not-allowed border-base-200 bg-base-300/20"
          : isSelected
            ? "bg-base-300/85 border-primary shadow-lg shadow-primary/10 ring-1 ring-primary/30 cursor-pointer"
            : "bg-base-300/40 border-base-300 hover:bg-base-300/70 hover:border-base-200 cursor-pointer"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 text-xs">
          {device.type === "internal" ? (
            <HardDrive className="w-3.5 h-3.5 text-info flex-shrink-0" />
          ) : device.type === "external" ? (
            <Usb className="w-3.5 h-3.5 text-success flex-shrink-0" />
          ) : (
            <Globe className="w-3.5 h-3.5 text-secondary flex-shrink-0" />
          )}
          <div className="truncate max-w-[120px]" title={device.name}>
            <h4 className="font-bold text-base-content leading-tight truncate">
              {device.name}
            </h4>
            <span className="text-[9px] text-base-content/40 uppercase font-semibold">
              {device.size}
            </span>
          </div>
        </div>
        {isSystemRoot ? (
          <span className="badge badge-xs text-[8px] bg-neutral text-neutral-content border border-base-content/20 leading-none px-1.5 py-0.5 uppercase font-bold">
            System
          </span>
        ) : (
          <div
            className="flex items-center gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            {device.status === "unmounted" ? (
              <button
                onClick={handleMountBlockDevice}
                className="btn btn-primary btn-[9px] btn-xs h-5 min-h-0 font-bold px-1.5 cursor-pointer hover:scale-105"
              >
                Mount
              </button>
            ) : (
              <span
                className={`badge badge-xs capitalize leading-none px-1.5 py-0.5 ${
                  device.status === "mounted"
                    ? "badge-success text-[8px]"
                    : "badge-info text-[8px] animate-pulse"
                }`}
              >
                {device.status}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="space-y-1">
        <progress
          className={`progress progress-xs w-full h-1 ${
            device.usedPercentage > 80
              ? "progress-error"
              : device.usedPercentage > 50
                ? "progress-primary"
                : "progress-success"
          }`}
          value={device.usedPercentage}
          max="100"
        ></progress>
        <div className="flex justify-between text-[8px] font-mono text-base-content/40">
          <span>{device.usedPercentage}% used</span>
          <span>{device.size}</span>
        </div>
      </div>
    </div>
  );
});

export default function Sidebar() {
  // Narrow selectors: only re-render on the slice that actually changed.
  const selectedDriveId = useDriveStore((s) => s.selectedDrive?.id);
  const selectDrive = useDriveStore((s) => s.selectDrive);
  const devices = useDriveStore((s) => s.devices);
  const loading = useDriveStore((s) => s.loading);
  const fetchDrives = useDriveStore((s) => s.fetchDrives);

  const handleMountDrive = async () => {
    try {
      const res = await rpc.request.mountDrive();
      if (res.success && res.drive) {
        await fetchDrives();
        selectDrive(res.drive);
      } else if (res.error && res.error !== "Cancelled by user") {
        alert(`Failed to mount directory: ${res.error}`);
      }
    } catch (err: any) {
      console.error("Mount drive failed:", err);
    }
  };

  useEffect(() => {
    fetchDrives();
  }, [fetchDrives]);

  return (
    <aside className="w-64 sm:w-72 flex-shrink-0 flex flex-col bg-base-100 border-r border-base-300">
      {/* App Brand Header */}
      <div className="p-4 flex items-center justify-between border-b border-base-300 bg-base-100/50 h-16">
        <div className="flex items-center gap-2.5 ">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-tr from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20">
            <Zap className="w-3.5 h-3.5 text-primary-content fill-primary-content" />
          </div>
          <span className="font-extrabold text-sm tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary via-accent to-secondary">
            Antigravity Drive
          </span>
        </div>
      </div>

      {/* Sidebar Scrollable Body */}
      <div className="flex-grow overflow-y-auto p-3 space-y-6">
        {/* Navigation Section */}
        <div className="space-y-2">
          <span className="px-3 text-[9px] font-black text-base-content/40 uppercase tracking-widest block">
            Application
          </span>
          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                activeProps={{ className: NAV_LINK_ACTIVE }}
                inactiveProps={{ className: NAV_LINK_INACTIVE }}
                className={NAV_LINK_BASE}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Drives Section */}
        <div className="space-y-3.5">
          <div className="px-3 flex items-center justify-between">
            <span className="text-[9px] font-black text-base-content/40 uppercase tracking-widest">
              Connected Drives
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchDrives}
                disabled={loading}
                className="hover:text-base-content text-base-content/40 transition-colors cursor-pointer"
                title="Refresh drive list"
              >
                <RefreshCw
                  className={`w-3 h-3 ${loading ? "animate-spin text-primary" : ""}`}
                />
              </button>
              <span className="badge badge-primary badge-xs text-[9px] font-bold p-1.5">
                {devices.length}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            {loading && devices.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <span className="loading loading-spinner loading-xs text-base-content/40"></span>
                <p className="text-[10px] text-base-content/30 mt-1.5">
                  Scanning filesystems...
                </p>
              </div>
            ) : devices.length === 0 ? (
              <div className="px-3 py-4 text-center text-[10px] text-base-content/40 italic">
                No drives detected.
              </div>
            ) : (
              devices.map((device) => (
                <DriveCard
                  key={device.id}
                  device={device}
                  isSelected={selectedDriveId === device.id}
                  onSelect={selectDrive}
                  onChanged={fetchDrives}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Sidebar Footer */}
      <div className="p-3 border-t border-base-300 bg-base-100/50 flex flex-col gap-2">
        <button
          onClick={handleMountDrive}
          className="btn btn-outline btn-secondary btn-xs w-full font-bold flex items-center justify-center gap-1.5"
        >
          <Plus className="w-3 h-3" /> Mount Drive
        </button>
      </div>
    </aside>
  );
}
