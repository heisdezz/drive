import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
	items_per_page: number;
	columns: number; // 4-9
	show_thumbnails: boolean;
	gdrive_service_account_json: string;
	gdrive_folder_id: string;
	setItemsPerPage: (items: number) => void;
	setColumns: (columns: number) => void;
	setShowThumbnails: (show: boolean) => void;
	setGDriveServiceAccountJson: (json: string) => void;
	setGDriveFolderId: (folderId: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
	persist(
		(set) => ({
			items_per_page: 24,
			columns: 4,
			show_thumbnails: true,
			gdrive_service_account_json: "",
			gdrive_folder_id: "",
			setItemsPerPage: (items) => set({ items_per_page: Math.max(1, items) }),
			setColumns: (cols) => set({ columns: Math.min(9, Math.max(4, cols)) }),
			setShowThumbnails: (show) => set({ show_thumbnails: show }),
			setGDriveServiceAccountJson: (json) => set({ gdrive_service_account_json: json }),
			setGDriveFolderId: (folderId) => set({ gdrive_folder_id: folderId }),
		}),
		{
			name: "media-organizer-settings",
		}
	)
);
