import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { rpc } from "@/lib/rpc";
import { useDriveStore } from "@/store/drive_store";
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
} from "lucide-react";

export default function Sidebar() {
  const { selectedDrive, selectDrive, devices, loading, fetchDrives } =
    useDriveStore();

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
  }, []);

  return (
    <aside className="w-64 sm:w-72 flex-shrink-0 flex flex-col bg-base-100 border-r border-base-300">
      {/* App Brand Header */}
      <div className="p-4 flex items-center justify-between border-b border-base-300 bg-base-100/50">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-tr from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20">
            <Zap className="w-3.5 h-3.5 text-white fill-white" />
          </div>
          <span className="font-extrabold text-sm tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary via-indigo-400 to-secondary">
            Antigravity Drive
          </span>
        </div>
      </div>

      {/* Sidebar Scrollable Body */}
      <div className="flex-grow overflow-y-auto p-3 space-y-6">
        {/* Navigation Section */}
        <div className="space-y-2">
          <span className="px-3 text-[9px] font-black text-slate-500 uppercase tracking-widest block">
            Application
          </span>
          <nav className="flex flex-col gap-1">
            <Link
              to="/"
              activeProps={{
                className:
                  "bg-slate-800 text-white font-bold border-l-2 border-primary pl-3.5",
              }}
              inactiveProps={{
                className:
                  "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 pl-4",
              }}
              className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2.5 transition-all duration-155"
            >
              <LayoutDashboard className="w-3.5 h-3.5" /> Dashboard
            </Link>
            <Link
              to="/discover"
              activeProps={{
                className:
                  "bg-slate-800 text-white font-bold border-l-2 border-primary pl-3.5",
              }}
              inactiveProps={{
                className:
                  "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 pl-4",
              }}
              className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2.5 transition-all duration-155"
            >
              <Compass className="w-3.5 h-3.5" /> Discover
            </Link>
            <Link
              to="/medias"
              activeProps={{
                className:
                  "bg-slate-800 text-white font-bold border-l-2 border-primary pl-3.5",
              }}
              inactiveProps={{
                className:
                  "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 pl-4",
              }}
              className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2.5 transition-all duration-155"
            >
              <ImageIcon className="w-3.5 h-3.5" /> Media Library
            </Link>
            <Link
              to="/albums"
              activeProps={{
                className:
                  "bg-slate-800 text-white font-bold border-l-2 border-primary pl-3.5",
              }}
              inactiveProps={{
                className:
                  "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 pl-4",
              }}
              className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2.5 transition-all duration-155"
            >
              <Library className="w-3.5 h-3.5" /> Albums
            </Link>
            <Link
              to="/counter"
              activeProps={{
                className:
                  "bg-slate-800 text-white font-bold border-l-2 border-primary pl-3.5",
              }}
              inactiveProps={{
                className:
                  "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 pl-4",
              }}
              className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2.5 transition-all duration-155"
            >
              <Hash className="w-3.5 h-3.5" /> State Counter
            </Link>
            <Link
              to="/about"
              activeProps={{
                className:
                  "bg-slate-800 text-white font-bold border-l-2 border-primary pl-3.5",
              }}
              inactiveProps={{
                className:
                  "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 pl-4",
              }}
              className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2.5 transition-all duration-155"
            >
              <Settings className="w-3.5 h-3.5" /> System Info
            </Link>
          </nav>
        </div>

        {/* Drives Section */}
        <div className="space-y-3.5">
          <div className="px-3 flex items-center justify-between">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
              Connected Drives
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchDrives}
                disabled={loading}
                className="hover:text-white text-slate-500 transition-colors cursor-pointer"
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
                <span className="loading loading-spinner loading-xs text-slate-500"></span>
                <p className="text-[10px] text-slate-600 mt-1.5">
                  Scanning filesystems...
                </p>
              </div>
            ) : devices.length === 0 ? (
              <div className="px-3 py-4 text-center text-[10px] text-slate-500 italic">
                No drives detected.
              </div>
            ) : (
              devices.map((device) => {
                const isSystemRoot = device.path === "/";
                return (
                  <div
                    key={device.id}
                    onClick={() => {
                      if (isSystemRoot) return;
                      selectDrive(device);
                    }}
                    className={`p-3 rounded-xl transition-all duration-150 flex flex-col gap-2 border ${
                      isSystemRoot
                        ? "opacity-40 cursor-not-allowed border-slate-900 bg-slate-950/20"
                        : selectedDrive?.id === device.id
                          ? "bg-slate-950/85 border-primary shadow-lg shadow-primary/10 ring-1 ring-primary/30 cursor-pointer"
                          : "bg-slate-950/40 border-base-300 hover:bg-slate-950/70 hover:border-slate-900 cursor-pointer"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 text-xs">
                        {device.type === "internal" ? (
                          <HardDrive className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                        ) : device.type === "external" ? (
                          <Usb className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        ) : (
                          <Globe className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                        )}
                        <div
                          className="truncate max-w-[120px]"
                          title={device.name}
                        >
                          <h4 className="font-bold text-white leading-tight truncate">
                            {device.name}
                          </h4>
                          <span className="text-[9px] text-slate-500 uppercase font-semibold">
                            {device.size}
                          </span>
                        </div>
                      </div>
                      {isSystemRoot ? (
                        <span className="badge badge-xs text-[8px] bg-slate-800 text-slate-400 border border-slate-700 leading-none px-1.5 py-0.5 uppercase font-bold">
                          System
                        </span>
                      ) : (
                        <span
                          className={`badge badge-xs capitalize leading-none px-1.5 py-0.5 ${
                            device.status === "mounted"
                              ? "badge-success text-[8px]"
                              : device.status === "unmounted"
                                ? "text-[8px] bg-slate-700 text-slate-400 border border-slate-600"
                                : "badge-info text-[8px] animate-pulse"
                          }`}
                        >
                          {device.status}
                        </span>
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
                      <div className="flex justify-between text-[8px] font-mono text-slate-500">
                        <span>{device.usedPercentage}% used</span>
                        <span>{device.size}</span>
                      </div>
                    </div>
                  </div>
                );
              })
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
