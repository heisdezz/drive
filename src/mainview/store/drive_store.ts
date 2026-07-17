import { create } from "zustand";
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

interface DriveStoreState {
	selectedDrive: Device | null;
	devices: Device[];
	loading: boolean;
	selectDrive: (drive: Device | null) => void;
	fetchDrives: () => Promise<void>;
}

export const useDriveStore = create<DriveStoreState>((set, get) => ({
	selectedDrive: null,
	devices: [],
	loading: false,
	selectDrive: (drive) => set({ selectedDrive: drive }),
	fetchDrives: async () => {
		set({ loading: true });
		try {
			const drives = await rpc.request.getDrives();
			set({ devices: drives });
			
			// If a drive is currently selected, update its path and status from the fresh data
			const current = get().selectedDrive;
			if (current) {
				const updated = drives.find(d => d.id === current.id);
				if (updated) {
					set({ selectedDrive: updated });
				}
			}
		} catch (err) {
			console.error("Failed to load drives via RPC in store:", err);
		} finally {
			set({ loading: false });
		}
	}
}));
