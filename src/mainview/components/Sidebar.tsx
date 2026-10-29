import { onMount, For, Show, Component } from "solid-js";
import { Link } from "@tanstack/solid-router";
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
} from "lucide-solid";

const NAV_ITEMS: {
  to: string;
  label: string;
  icon: Component<{ class?: string }>;
}[] = [
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

function DriveCard(props: {
  device: Device;
  isSelected: boolean;
  onSelect: (device: Device) => void;
  onChanged: () => void;
}) {
  const isSystemRoot = () =>
    props.device.path === "/" || props.device.name.startsWith("System Drive (");

  const handleMountBlockDevice = async (e: MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await rpc.request.mountBlockDevice({
        deviceId: props.device.id,
      });
      if (res.success && res.mountPath) {
        props.onChanged();
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
        if (!isSystemRoot()) props.onSelect(props.device);
      }}
      class={`p-3 rounded-xl transition-all duration-150 flex flex-col gap-2 border ${
        isSystemRoot()
          ? "opacity-40 cursor-not-allowed border-base-200 bg-base-300/20"
          : props.isSelected
            ? "bg-base-300/85 border-primary shadow-lg shadow-primary/10 ring-1 ring-primary/30 cursor-pointer"
            : "bg-base-300/40 border-base-300 hover:bg-base-300/70 hover:border-base-200 cursor-pointer"
      }`}
    >
      <div class="flex items-start justify-between">
        <div class="flex items-center gap-2 text-xs">
          {props.device.type === "internal" ? (
            <HardDrive class="w-3.5 h-3.5 text-info flex-shrink-0" />
          ) : props.device.type === "external" ? (
            <Usb class="w-3.5 h-3.5 text-success flex-shrink-0" />
          ) : (
            <Globe class="w-3.5 h-3.5 text-secondary flex-shrink-0" />
          )}
          <div class="truncate max-w-[120px]" title={props.device.name}>
            <h4 class="font-bold text-base-content leading-tight truncate">
              {props.device.name}
            </h4>
            <span class="text-[9px] text-base-content/40 uppercase font-semibold">
              {props.device.size}
            </span>
          </div>
        </div>
        <Show
          when={!isSystemRoot()}
          fallback={
            <span class="badge badge-xs text-[8px] bg-neutral text-neutral-content border border-base-content/20 leading-none px-1.5 py-0.5 uppercase font-bold">
              System
            </span>
          }
        >
          <div
            class="flex items-center gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <Show
              when={props.device.status !== "unmounted"}
              fallback={
                <button
                  onClick={handleMountBlockDevice}
                  class="btn btn-primary btn-[9px] btn-xs h-5 min-h-0 font-bold px-1.5 cursor-pointer hover:scale-105"
                >
                  Mount
                </button>
              }
            >
              <span
                class={`badge badge-xs capitalize leading-none px-1.5 py-0.5 ${
                  props.device.status === "mounted"
                    ? "badge-success text-[8px]"
                    : "badge-info text-[8px] animate-pulse"
                }`}
              >
                {props.device.status}
              </span>
            </Show>
          </div>
        </Show>
      </div>

      <div class="space-y-1">
        <progress
          class={`progress progress-xs w-full h-1 ${
            props.device.usedPercentage > 80
              ? "progress-error"
              : props.device.usedPercentage > 50
                ? "progress-primary"
                : "progress-success"
          }`}
          value={props.device.usedPercentage}
          max="100"
        />
        <div class="flex justify-between text-[8px] font-mono text-base-content/40">
          <span>{props.device.usedPercentage}% used</span>
          <span>{props.device.size}</span>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const store = useDriveStore();

  const handleMountDrive = async () => {
    try {
      const res = await rpc.request.mountDrive();
      if (res.success && res.drive) {
        await store.fetchDrives();
        store.selectDrive(res.drive);
      } else if (res.error && res.error !== "Cancelled by user") {
        alert(`Failed to mount directory: ${res.error}`);
      }
    } catch (err: any) {
      console.error("Mount drive failed:", err);
    }
  };

  onMount(() => {
    store.fetchDrives();
  });

  return (
    <aside class="w-64 sm:w-72 flex-shrink-0 flex flex-col bg-base-100 border-r border-base-300">
      {/* App Brand Header */}
      <div class="p-4 flex items-center justify-between border-b border-base-300 bg-base-100/50 h-16">
        <div class="flex items-center gap-2.5 ">
          <div class="h-7 w-7 rounded-lg bg-gradient-to-tr from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20">
            <Zap class="w-3.5 h-3.5 text-primary-content fill-primary-content" />
          </div>
          <span class="font-extrabold text-sm tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary via-accent to-secondary">
            D-Stream
          </span>
        </div>
      </div>

      {/* Sidebar Scrollable Body */}
      <div class="flex-grow overflow-y-auto p-3 space-y-6">
        {/* Navigation Section */}
        <div class="space-y-2">
          <span class="px-3 text-[9px] font-black text-base-content/40 uppercase tracking-widest block">
            Application
          </span>
          <nav class="flex flex-col gap-1">
            <For each={NAV_ITEMS}>
              {({ to, label, icon: Icon }) => (
                <Link
                  to={to}
                  activeProps={{ class: NAV_LINK_ACTIVE }}
                  inactiveProps={{ class: NAV_LINK_INACTIVE }}
                  class={NAV_LINK_BASE}
                >
                  <Icon class="w-3.5 h-3.5" /> {label}
                </Link>
              )}
            </For>
          </nav>
        </div>

        {/* Drives Section */}
        <div class="space-y-3.5">
          <div class="px-3 flex items-center justify-between">
            <span class="text-[9px] font-black text-base-content/40 uppercase tracking-widest">
              Connected Drives
            </span>
            <div class="flex items-center gap-2">
              <button
                onClick={() => store.fetchDrives()}
                disabled={store.loading}
                class="hover:text-base-content text-base-content/40 transition-colors cursor-pointer"
                title="Refresh drive list"
              >
                <RefreshCw
                  class={`w-3 h-3 ${store.loading ? "animate-spin text-primary" : ""}`}
                />
              </button>
              <span class="badge badge-primary badge-xs text-[9px] font-bold p-1.5">
                {store.devices.length}
              </span>
            </div>
          </div>

          <div class="space-y-2">
            <Show
              when={!store.loading || store.devices.length > 0}
              fallback={
                <div class="px-3 py-4 text-center">
                  <span class="loading loading-spinner loading-xs text-base-content/40" />
                  <p class="text-[10px] text-base-content/30 mt-1.5">
                    Scanning filesystems...
                  </p>
                </div>
              }
            >
              <Show
                when={store.devices.length > 0}
                fallback={
                  <div class="px-3 py-4 text-center text-[10px] text-base-content/40 italic">
                    No drives detected.
                  </div>
                }
              >
                <For each={store.devices}>
                  {(device) => (
                    <DriveCard
                      device={device}
                      isSelected={store.selectedDrive?.id === device.id}
                      onSelect={(d) => store.selectDrive(d)}
                      onChanged={() => store.fetchDrives()}
                    />
                  )}
                </For>
              </Show>
            </Show>
          </div>
        </div>
      </div>

      {/* Sidebar Footer */}
      <div class="p-3 border-t border-base-300 bg-base-100/50 flex flex-col gap-2">
        <button
          onClick={handleMountDrive}
          class="btn btn-outline btn-secondary btn-xs w-full font-bold flex items-center justify-center gap-1.5"
        >
          <Plus class="w-3 h-3" /> Mount Drive
        </button>
      </div>
    </aside>
  );
}
