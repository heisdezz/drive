import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
	items_per_page: number;
	columns: number; // 4-9
	show_thumbnails: boolean;
	setItemsPerPage: (items: number) => void;
	setColumns: (columns: number) => void;
	setShowThumbnails: (show: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
	persist(
		(set) => ({
			items_per_page: 24,
			columns: 4,
			show_thumbnails: true,
			setItemsPerPage: (items) => set({ items_per_page: Math.max(1, items) }),
			setColumns: (cols) => set({ columns: Math.min(9, Math.max(4, cols)) }),
			setShowThumbnails: (show) => set({ show_thumbnails: show }),
		}),
		{
			name: "media-organizer-settings",
		}
	)
);
