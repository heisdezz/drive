import { createFileRoute } from "@tanstack/solid-router";
import { createSignal, Show, For } from "solid-js";
import { useSettingsStore } from "@/store/settings_store";
import { useDriveStore } from "@/store/drive_store";
import { rpc } from "@/lib/rpc";
import {
  Settings,
  Cloud,
  Database,
  Check,
  AlertCircle,
  RefreshCw,
  Sliders,
  LayoutGrid,
} from "lucide-solid";

export const Route = createFileRoute("/settings/")({
  component: SettingsComponent,
});

function SettingsComponent() {
  const settings = useSettingsStore();
  const drive = useDriveStore();

  // Local UI States
  const [activeTab, setActiveTab] = createSignal<"general" | "gdrive">(
    "general",
  );
  const [localJson, setLocalJson] = createSignal(
    settings.gdrive_service_account_json,
  );
  const [localFolderId, setLocalFolderId] = createSignal(
    settings.gdrive_folder_id,
  );

  // Testing & Backing Up states
  const [testingConnection, setTestingConnection] = createSignal(false);
  const [testResult, setTestResult] = createSignal<{
    success?: boolean;
    error?: string;
  } | null>(null);

  const [backingUp, setBackingUp] = createSignal(false);
  const [backupResult, setBackupResult] = createSignal<{
    success?: boolean;
    error?: string;
    uploadResults?: {
      filename: string;
      fileId: string;
      success: boolean;
      error?: string;
    }[];
  } | null>(null);

  const handleSaveGDriveSettings = () => {
    settings.setGDriveServiceAccountJson(localJson());
    settings.setGDriveFolderId(localFolderId());
    alert("Google Drive settings saved successfully.");
  };

  const handleTestConnection = async () => {
    const json = localJson();
    if (!json) {
      alert("Please paste your Google Cloud Service Account JSON first.");
      return;
    }
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await rpc.request.testGoogleDriveConnection({
        serviceAccountJson: json,
        folderId: localFolderId() || undefined,
      });
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleBackupNow = async () => {
    const selectedDrive = drive.selectedDrive;
    if (!selectedDrive?.path) {
      alert(
        "Please select a drive first (from the sidebar) to back up its database.",
      );
      return;
    }
    const json = localJson();
    if (!json) {
      alert("Please configure your Google Cloud Service Account JSON first.");
      return;
    }

    setBackingUp(true);
    setBackupResult(null);
    try {
      settings.setGDriveServiceAccountJson(json);
      settings.setGDriveFolderId(localFolderId());

      const res = await rpc.request.backupToGoogleDrive({
        drivePath: selectedDrive.path,
        serviceAccountJson: json,
        folderId: localFolderId() || undefined,
      });
      setBackupResult(res);
    } catch (err: any) {
      setBackupResult({ success: false, error: err.message });
    } finally {
      setBackingUp(false);
    }
  };

  return (
    <div class="space-y-6 max-w-4xl mx-auto">
      {/* Title */}
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/10">
          <Settings class="w-5 h-5 text-primary-content" />
        </div>
        <div>
          <h2 class="text-2xl font-black text-base-content leading-none">
            Settings
          </h2>
          <span class="text-[10px] text-base-content/40 font-bold uppercase tracking-wider block mt-1">
            Configure layout preferences & backups
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div class="tabs tabs-box bg-base-200/50 p-1 rounded-xl w-full sm:w-fit flex">
        <button
          onClick={() => setActiveTab("general")}
          class={`tab flex-grow sm:flex-initial gap-2 px-6 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab() === "general"
              ? "bg-base-100 text-base-content shadow-sm"
              : "text-base-content/60 hover:text-base-content"
          }`}
        >
          <Sliders class="w-4 h-4" /> General Preferences
        </button>
        <button
          onClick={() => setActiveTab("gdrive")}
          class={`tab flex-grow sm:flex-initial gap-2 px-6 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab() === "gdrive"
              ? "bg-base-100 text-base-content shadow-sm"
              : "text-base-content/60 hover:text-base-content"
          }`}
        >
          <Cloud class="w-4 h-4" /> Google Drive Backup
        </button>
      </div>

      {/* Settings Sections */}
      <Show
        when={activeTab() === "general"}
        fallback={
          <div class="space-y-6">
            {/* Main Credentials Card */}
            <div class="card bg-base-200/40 border border-base-200 shadow-xl rounded-2xl p-6 space-y-5">
              <h3 class="text-sm font-bold text-base-content flex items-center gap-2 border-b border-base-300 pb-3">
                <Cloud class="w-4 h-4 text-primary" /> Google Drive Cloud Backup
                (DB Backups Only)
              </h3>

              <div class="alert bg-base-100 border border-base-300 text-xs leading-relaxed text-base-content/75 p-4 rounded-xl flex items-start gap-3">
                <Database class="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <span class="font-bold text-base-content block mb-1">
                    Google Drive Backups Information
                  </span>
                  This integration backs up your SQLite catalog database
                  (`.media_library.db`) and its timestamped historical backup
                  databases to Google Drive. It is restricted strictly to
                  database structures to avoid heavy media data payloads.
                </div>
              </div>

              {/* Service Account JSON */}
              <div class="form-control w-full space-y-2">
                <label class="label">
                  <span class="label-text font-bold text-xs text-base-content/85">
                    Google Cloud Service Account JSON Key
                  </span>
                </label>
                <textarea
                  value={localJson()}
                  onInput={(e) => setLocalJson(e.currentTarget.value)}
                  placeholder='Paste your {"type": "service_account", ...} JSON credential key here'
                  class="textarea textarea-bordered h-44 w-full bg-base-100/60 font-mono text-[10px] text-base-content placeholder-base-content/25 leading-relaxed focus:outline-none"
                />
                <span class="text-[10px] text-base-content/45 leading-relaxed block mt-1">
                  To connect, go to the Google Cloud Console, create a Service
                  Account, generate a JSON Key, and share your Google Drive
                  Folder with the service account's client email address.
                </span>
              </div>

              {/* Folder ID */}
              <div class="form-control w-full space-y-2">
                <label class="label">
                  <span class="label-text font-bold text-xs text-base-content/85">
                    Google Drive Backup Folder ID (Optional)
                  </span>
                </label>
                <input
                  type="text"
                  value={localFolderId()}
                  onInput={(e) => setLocalFolderId(e.currentTarget.value)}
                  placeholder="1aBcDeFgHiJkLmNoPqRsTuVwXyZ"
                  class="input input-bordered w-full bg-base-100/60 text-xs text-base-content placeholder-base-content/25 focus:outline-none"
                />
                <span class="text-[10px] text-base-content/45 leading-relaxed block mt-1">
                  The folder ID of the shared directory on your Drive. Leave
                  empty to upload files directly to the root of the Google
                  Drive.
                </span>
              </div>

              {/* Action Buttons */}
              <div class="flex flex-wrap gap-2.5 pt-3 border-t border-base-300">
                <button
                  onClick={handleSaveGDriveSettings}
                  class="btn btn-sm btn-outline border-base-300 hover:bg-base-100 text-xs font-bold cursor-pointer"
                >
                  Save Credentials
                </button>

                <button
                  onClick={handleTestConnection}
                  disabled={testingConnection() || !localJson()}
                  class="btn btn-sm btn-secondary text-xs font-bold gap-1.5 cursor-pointer"
                >
                  <Show when={testingConnection()}>
                    <RefreshCw class="w-3.5 h-3.5 animate-spin" />
                  </Show>
                  Test Connection
                </button>

                <button
                  onClick={handleBackupNow}
                  disabled={backingUp() || !localJson() || !drive.selectedDrive}
                  class="btn btn-sm btn-primary text-xs font-bold gap-1.5 cursor-pointer ml-auto"
                >
                  <Show when={backingUp()}>
                    <RefreshCw class="w-3.5 h-3.5 animate-spin" />
                  </Show>
                  Backup Library Now
                </button>
              </div>

              {/* Test Connection Results */}
              <Show when={testResult()}>
                {(res) => (
                  <div
                    class={`p-4 rounded-xl border flex items-start gap-3 mt-4 ${
                      res().success
                        ? "bg-success/10 border-success/30 text-success-content"
                        : "bg-error/10 border-error/30 text-error-content"
                    }`}
                  >
                    <Show
                      when={res().success}
                      fallback={
                        <AlertCircle class="w-5 h-5 flex-shrink-0 mt-0.5 text-error" />
                      }
                    >
                      <Check class="w-5 h-5 flex-shrink-0 mt-0.5 text-success" />
                    </Show>
                    <div class="text-xs leading-relaxed">
                      <span class="font-bold block mb-1">
                        {res().success
                          ? "Connection Test Successful"
                          : "Connection Test Failed"}
                      </span>
                      {res().success
                        ? "Successfully authenticated and reached Google Drive files client endpoint."
                        : res().error}
                    </div>
                  </div>
                )}
              </Show>
            </div>

            {/* Backup Action Results */}
            <Show when={backupResult()}>
              {(res) => (
                <div
                  class={`card border shadow-xl rounded-2xl p-6 space-y-4 ${
                    res().success
                      ? "bg-base-200/40 border-success/30"
                      : "bg-base-200/40 border-error/30"
                  }`}
                >
                  <h4 class="text-xs font-bold text-base-content flex items-center gap-2">
                    <Show
                      when={res().success}
                      fallback={<AlertCircle class="w-4 h-4 text-error" />}
                    >
                      <Check class="w-4 h-4 text-success" />
                    </Show>
                    Upload Backups Report
                  </h4>

                  <Show
                    when={res().success}
                    fallback={
                      <div class="p-3 bg-error/15 border border-error/20 text-xs rounded-xl text-error-content">
                        <span class="font-bold block mb-1">
                          Backup Execution Failed
                        </span>
                        {res().error}
                      </div>
                    }
                  >
                    <div class="space-y-3">
                      <p class="text-[11px] text-base-content/70">
                        The database backup operation completed. Below is the
                        Google Drive upload log:
                      </p>

                      <div class="overflow-x-auto">
                        <table class="table table-xs w-full bg-base-100 border border-base-200 rounded-lg">
                          <thead>
                            <tr class="bg-base-200/60 font-mono text-[9px]">
                              <th>File Name</th>
                              <th>Status</th>
                              <th>GDrive File ID</th>
                            </tr>
                          </thead>
                          <tbody>
                            <For each={res().uploadResults}>
                              {(uploadRes) => (
                                <tr class="hover:bg-base-200/30 text-[10px]">
                                  <td class="font-mono text-base-content/80">
                                    {uploadRes.filename}
                                  </td>
                                  <td>
                                    <Show
                                      when={uploadRes.success}
                                      fallback={
                                        <span class="badge badge-error badge-xs font-bold p-1 px-1.5 text-[9px]">
                                          Failed
                                        </span>
                                      }
                                    >
                                      <span class="badge badge-success badge-xs font-bold p-1 px-1.5 text-[9px]">
                                        Uploaded
                                      </span>
                                    </Show>
                                  </td>
                                  <td class="font-mono text-base-content/40 text-[9px]">
                                    {uploadRes.success
                                      ? uploadRes.fileId
                                      : uploadRes.error || "Unknown error"}
                                  </td>
                                </tr>
                              )}
                            </For>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </Show>
                </div>
              )}
            </Show>
          </div>
        }
      >
        <div class="card bg-base-200/40 border border-base-200 shadow-xl rounded-2xl p-6 space-y-6">
          <h3 class="text-sm font-bold text-base-content flex items-center gap-2 border-b border-base-300 pb-3">
            <LayoutGrid class="w-4 h-4 text-primary" /> Appearance & Catalog
            Layout
          </h3>

          {/* Grid Columns */}
          <div class="form-control w-full space-y-2">
            <label class="label flex justify-between">
              <span class="label-text font-bold text-xs text-base-content/85">
                Grid Columns ({settings.columns})
              </span>
              <span class="text-[10px] font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
                {settings.columns} Columns
              </span>
            </label>
            <input
              type="range"
              min="4"
              max="9"
              value={settings.columns}
              onInput={(e) =>
                settings.setColumns(Number(e.currentTarget.value))
              }
              class="range range-primary range-sm"
              step="1"
            />
            <div class="w-full flex justify-between text-[10px] px-1 text-base-content/40 font-mono">
              <span>4</span>
              <span>5</span>
              <span>6</span>
              <span>7</span>
              <span>8</span>
              <span>9</span>
            </div>
            <span class="text-[10px] text-base-content/45 leading-relaxed block mt-1">
              Select the number of columns rendered in album grid view.
              Constraints range from 4 (largest cards) to 9 (smallest, compact
              cards).
            </span>
          </div>

          {/* Items Per Page */}
          <div class="form-control w-full space-y-2">
            <label class="label">
              <span class="label-text font-bold text-xs text-base-content/85">
                Default Items Per Page
              </span>
            </label>
            <div class="flex gap-2">
              <input
                type="number"
                min="10"
                max="1000"
                value={settings.items_per_page}
                onInput={(e) =>
                  settings.setItemsPerPage(Number(e.currentTarget.value))
                }
                class="input input-bordered w-full max-w-[200px] bg-base-100/60 text-xs text-base-content"
              />
              <select
                value={settings.items_per_page}
                onChange={(e) =>
                  settings.setItemsPerPage(Number(e.currentTarget.value))
                }
                class="select select-bordered bg-base-100/60 text-xs text-base-content focus:outline-none"
              >
                <For each={[24, 48, 96, 120, 240, 480]}>
                  {(opt) => <option value={opt}>Quick Select: {opt}</option>}
                </For>
              </select>
            </div>
            <span class="text-[10px] text-base-content/45 leading-relaxed block mt-1">
              Sets the quantity of media items returned per page before
              pagination controls trigger. Higher limits require more image
              resources.
            </span>
          </div>

          {/* Show Thumbnails */}
          <div class="form-control flex flex-row items-center justify-between p-4 rounded-xl bg-base-100/40 border border-base-300">
            <div class="space-y-0.5 max-w-[80%]">
              <span class="text-xs font-bold text-base-content flex items-center gap-1.5">
                Load Media Thumbnails
              </span>
              <span class="text-[10px] text-base-content/45 leading-relaxed block">
                Whether to render image and video preview thumbnails inside
                layout grids. Turn off if files are hosted on extremely slow or
                limited data storage links.
              </span>
            </div>
            <input
              type="checkbox"
              checked={settings.show_thumbnails}
              onChange={(e) =>
                settings.setShowThumbnails(e.currentTarget.checked)
              }
              class="toggle toggle-primary toggle-sm"
            />
          </div>
        </div>
      </Show>
    </div>
  );
}
