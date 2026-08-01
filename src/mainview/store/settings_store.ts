import { create } from "zustand";
import { persist } from "zustand/middleware";

const DEFAULT_IGNORE_LIST = [
	"temp",
	"tmp",
	"Archive",
	"System Volume Information",
	"$RECYCLE.BIN",
];

interface SettingsState {
	items_per_page: number;
	columns: number; // 4-9
	show_thumbnails: boolean;
	gdrive_service_account_json: string;
	gdrive_folder_id: string;
	ignore_list: string[];
	setItemsPerPage: (items: number) => void;
	setColumns: (columns: number) => void;
	setShowThumbnails: (show: boolean) => void;
	setGDriveServiceAccountJson: (json: string) => void;
	setGDriveFolderId: (folderId: string) => void;
	addIgnorePath: (path: string) => void;
	removeIgnorePath: (path: string) => void;
	resetIgnoreList: () => void;
}

export const useSettingsStore = create<SettingsState>()(
	persist(
		(set) => ({
			items_per_page: 24,
			columns: 4,
			show_thumbnails: true,
			gdrive_service_account_json: "",
			gdrive_folder_id: "",
			ignore_list: DEFAULT_IGNORE_LIST,
			setItemsPerPage: (items) => set({ items_per_page: Math.max(1, items) }),
			setColumns: (cols) => set({ columns: Math.min(9, Math.max(4, cols)) }),
			setShowThumbnails: (show) => set({ show_thumbnails: show }),
			setGDriveServiceAccountJson: (json) => set({ gdrive_service_account_json: json }),
			setGDriveFolderId: (folderId) => set({ gdrive_folder_id: folderId }),
			addIgnorePath: (pathToAdd) =>
				set((state) => {
					const trimmed = pathToAdd.trim();
					if (!trimmed || state.ignore_list.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
						return state;
					}
					return { ignore_list: [...state.ignore_list, trimmed] };
				}),
			removeIgnorePath: (pathToRemove) =>
				set((state) => ({
					ignore_list: state.ignore_list.filter((item) => item.toLowerCase() !== pathToRemove.toLowerCase()),
				})),
			resetIgnoreList: () => set({ ignore_list: DEFAULT_IGNORE_LIST }),
		}),
		{
			name: "media-organizer-settings",
		}
	)
);
