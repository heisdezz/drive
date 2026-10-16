import { createSignal } from "solid-js";
import { rpc } from "@/lib/rpc";

export interface Device {
  id: string;
  name: string;
  type: "internal" | "external" | "network";
  size: string;
  usedPercentage: number;
  status: "mounted" | "unmounted" | "syncing" | "unmounting";
  path: string;
}

const [selectedDrive, setSelectedDrive] = createSignal<Device | null>(null);
const [devices, setDevices] = createSignal<Device[]>([]);
const [loading, setLoading] = createSignal<boolean>(false);

async function fetchDrives() {
  setLoading(true);
  try {
    const drives = await rpc.request.getDrives();
    setDevices(drives || []);

    const current = selectedDrive();
    if (current) {
      const updated = (drives || []).find((d) => d.id === current.id);
      if (
        updated &&
        (updated.path !== current.path ||
          updated.status !== current.status ||
          updated.usedPercentage !== current.usedPercentage ||
          updated.size !== current.size ||
          updated.name !== current.name)
      ) {
        setSelectedDrive(updated);
      }
    }
  } catch (err) {
    console.error("Failed to load drives via RPC in store:", err);
  } finally {
    setLoading(false);
  }
}

const state = {
  get selectedDrive() {
    return selectedDrive();
  },
  get devices() {
    return devices();
  },
  get loading() {
    return loading();
  },
  selectDrive: setSelectedDrive,
  fetchDrives,
};

export function useDriveStore<T = any>(selector?: (s: typeof state) => T): any {
  if (selector) {
    return selector(state);
  }
  return state;
}

useDriveStore.getState = () => state;

export {
  selectedDrive,
  setSelectedDrive,
  devices,
  setDevices,
  loading as drivesLoading,
  fetchDrives,
};
