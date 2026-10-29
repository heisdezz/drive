import { createSignal } from "solid-js";

const DEFAULT_IGNORE_LIST = [
  "temp",
  "tmp",
  "thumbs",
  "Archive",
  "System Volume Information",
  "$RECYCLE.BIN",
];

const STORAGE_KEY = "media-organizer-settings";

function normalizeColumns(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 4;
  return Math.min(9, Math.max(4, Math.trunc(value)));
}

function loadInitialSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const state = parsed.state || parsed;
      return {
        items_per_page: state.items_per_page ?? 24,
        columns: normalizeColumns(state.columns),
        show_thumbnails: state.show_thumbnails ?? true,
        gdrive_service_account_json: state.gdrive_service_account_json ?? "",
        gdrive_folder_id: state.gdrive_folder_id ?? "",
        ignore_list: state.ignore_list ?? DEFAULT_IGNORE_LIST,
      };
    }
  } catch (err) {
    console.warn("Failed to load settings from localStorage:", err);
  }
  return {
    items_per_page: 24,
    columns: 4,
    show_thumbnails: true,
    gdrive_service_account_json: "",
    gdrive_folder_id: "",
    ignore_list: DEFAULT_IGNORE_LIST,
  };
}

const initial = loadInitialSettings();
const [itemsPerPage, setItemsPerPageSignal] = createSignal(
  initial.items_per_page,
);
const [columns, setColumnsSignal] = createSignal(initial.columns);
const [showThumbnails, setShowThumbnailsSignal] = createSignal(
  initial.show_thumbnails,
);
const [gdriveJson, setGDriveJsonSignal] = createSignal(
  initial.gdrive_service_account_json,
);
const [gdriveFolderId, setGDriveFolderIdSignal] = createSignal(
  initial.gdrive_folder_id,
);
const [ignoreList, setIgnoreListSignal] = createSignal<string[]>(
  initial.ignore_list,
);

function saveSettings() {
  try {
    const data = {
      state: {
        items_per_page: itemsPerPage(),
        columns: columns(),
        show_thumbnails: showThumbnails(),
        gdrive_service_account_json: gdriveJson(),
        gdrive_folder_id: gdriveFolderId(),
        ignore_list: ignoreList(),
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn("Failed to save settings to localStorage:", err);
  }
}

function setItemsPerPage(items: number) {
  setItemsPerPageSignal(Math.max(1, items));
  saveSettings();
}

function setColumns(cols: number) {
  setColumnsSignal(normalizeColumns(cols));
  saveSettings();
}

function setShowThumbnails(show: boolean) {
  setShowThumbnailsSignal(show);
  saveSettings();
}

function setGDriveServiceAccountJson(json: string) {
  setGDriveJsonSignal(json);
  saveSettings();
}

function setGDriveFolderId(folderId: string) {
  setGDriveFolderIdSignal(folderId);
  saveSettings();
}

function addIgnorePath(pathToAdd: string) {
  const trimmed = pathToAdd.trim();
  if (
    !trimmed ||
    ignoreList().some((item) => item.toLowerCase() === trimmed.toLowerCase())
  ) {
    return;
  }
  setIgnoreListSignal([...ignoreList(), trimmed]);
  saveSettings();
}

function removeIgnorePath(pathToRemove: string) {
  setIgnoreListSignal(
    ignoreList().filter(
      (item) => item.toLowerCase() !== pathToRemove.toLowerCase(),
    ),
  );
  saveSettings();
}

function resetIgnoreList() {
  setIgnoreListSignal(DEFAULT_IGNORE_LIST);
  saveSettings();
}

const state = {
  get items_per_page() {
    return itemsPerPage();
  },
  get columns() {
    return columns();
  },
  get show_thumbnails() {
    return showThumbnails();
  },
  get gdrive_service_account_json() {
    return gdriveJson();
  },
  get gdrive_folder_id() {
    return gdriveFolderId();
  },
  get ignore_list() {
    return ignoreList();
  },
  setItemsPerPage,
  setColumns,
  setShowThumbnails,
  setGDriveServiceAccountJson,
  setGDriveFolderId,
  addIgnorePath,
  removeIgnorePath,
  resetIgnoreList,
};

export function useSettingsStore<T = any>(
  selector?: (s: typeof state) => T,
): any {
  if (selector) return selector(state);
  return state;
}

useSettingsStore.getState = () => state;
