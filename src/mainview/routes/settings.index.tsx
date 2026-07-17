import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
} from "lucide-react";

export const Route = createFileRoute("/settings/")({
  component: SettingsComponent,
});

function SettingsComponent() {
  const {
    items_per_page,
    columns,
    show_thumbnails,
    gdrive_service_account_json,
    gdrive_folder_id,
    setItemsPerPage,
    setColumns,
    setShowThumbnails,
    setGDriveServiceAccountJson,
    setGDriveFolderId,
  } = useSettingsStore();

  const { selectedDrive } = useDriveStore();

  // Local UI States
  const [activeTab, setActiveTab] = useState<"general" | "gdrive">("general");
  const [localJson, setLocalJson] = useState(gdrive_service_account_json);
  const [localFolderId, setLocalFolderId] = useState(gdrive_folder_id);

  // Testing & Backing Up states
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success?: boolean; error?: string } | null>(null);
  
  const [backingUp, setBackingUp] = useState(false);
  const [backupResult, setBackupResult] = useState<{
    success?: boolean;
    error?: string;
    uploadResults?: { filename: string; fileId: string; success: boolean; error?: string }[];
  } | null>(null);

  const handleSaveGDriveSettings = () => {
    setGDriveServiceAccountJson(localJson);
    setGDriveFolderId(localFolderId);
    alert("Google Drive settings saved successfully.");
  };

  const handleTestConnection = async () => {
    if (!localJson) {
      alert("Please paste your Google Cloud Service Account JSON first.");
      return;
    }
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await rpc.request.testGoogleDriveConnection({
        serviceAccountJson: localJson,
        folderId: localFolderId || undefined,
      });
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleBackupNow = async () => {
    if (!selectedDrive?.path) {
      alert("Please select a drive first (from the sidebar) to back up its database.");
      return;
    }
    if (!localJson) {
      alert("Please configure your Google Cloud Service Account JSON first.");
      return;
    }

    setBackingUp(true);
    setBackupResult(null);
    try {
      // Save current credentials first to make sure they are in sync
      setGDriveServiceAccountJson(localJson);
      setGDriveFolderId(localFolderId);

      const res = await rpc.request.backupToGoogleDrive({
        drivePath: selectedDrive.path,
        serviceAccountJson: localJson,
        folderId: localFolderId || undefined,
      });
      setBackupResult(res);
    } catch (err: any) {
      setBackupResult({ success: false, error: err.message });
    } finally {
      setBackingUp(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Title */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/10">
          <Settings className="w-5 h-5 text-primary-content" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-base-content leading-none">Settings</h2>
          <span className="text-[10px] text-base-content/40 font-bold uppercase tracking-wider block mt-1">
            Configure layout preferences & backups
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs tabs-box bg-base-200/50 p-1 rounded-xl w-full sm:w-fit flex">
        <button
          onClick={() => setActiveTab("general")}
          className={`tab flex-grow sm:flex-initial gap-2 px-6 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === "general" ? "bg-base-100 text-base-content shadow-sm" : "text-base-content/60 hover:text-base-content"
          }`}
        >
          <Sliders className="w-4 h-4" /> General Preferences
        </button>
        <button
          onClick={() => setActiveTab("gdrive")}
          className={`tab flex-grow sm:flex-initial gap-2 px-6 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === "gdrive" ? "bg-base-100 text-base-content shadow-sm" : "text-base-content/60 hover:text-base-content"
          }`}
        >
          <Cloud className="w-4 h-4" /> Google Drive Backup
        </button>
      </div>

      {/* Settings Sections */}
      {activeTab === "general" ? (
        <div className="card bg-base-200/40 border border-base-200 shadow-xl rounded-2xl p-6 space-y-6">
          <h3 className="text-sm font-bold text-base-content flex items-center gap-2 border-b border-base-300 pb-3">
            <LayoutGrid className="w-4 h-4 text-primary" /> Appearance & Catalog Layout
          </h3>

          {/* Grid Columns */}
          <div className="form-control w-full space-y-2">
            <label className="label flex justify-between">
              <span className="label-text font-bold text-xs text-base-content/85">Grid Columns ({columns})</span>
              <span className="text-[10px] font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">{columns} Columns</span>
            </label>
            <input
              type="range"
              min="4"
              max="9"
              value={columns}
              onChange={(e) => setColumns(Number(e.target.value))}
              className="range range-primary range-sm"
              step="1"
            />
            <div className="w-full flex justify-between text-[10px] px-1 text-base-content/40 font-mono">
              <span>4</span>
              <span>5</span>
              <span>6</span>
              <span>7</span>
              <span>8</span>
              <span>9</span>
            </div>
            <span className="text-[10px] text-base-content/45 leading-relaxed block mt-1">
              Select the number of columns rendered in album grid view. Constraints range from 4 (largest cards) to 9 (smallest, compact cards).
            </span>
          </div>

          {/* Items Per Page */}
          <div className="form-control w-full space-y-2">
            <label className="label">
              <span className="label-text font-bold text-xs text-base-content/85">Default Items Per Page</span>
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min="10"
                max="1000"
                value={items_per_page}
                onChange={(e) => setItemsPerPage(Number(e.target.value))}
                className="input input-bordered w-full max-w-[200px] bg-base-100/60 text-xs text-base-content"
              />
              <select
                value={items_per_page}
                onChange={(e) => setItemsPerPage(Number(e.target.value))}
                className="select select-bordered bg-base-100/60 text-xs text-base-content focus:outline-none"
              >
                {[24, 48, 96, 120, 240, 480].map((opt) => (
                  <option key={opt} value={opt}>
                    Quick Select: {opt}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-[10px] text-base-content/45 leading-relaxed block mt-1">
              Sets the quantity of media items returned per page before pagination controls trigger. Higher limits require more image resources.
            </span>
          </div>

          {/* Show Thumbnails */}
          <div className="form-control flex flex-row items-center justify-between p-4 rounded-xl bg-base-100/40 border border-base-300">
            <div className="space-y-0.5 max-w-[80%]">
              <span className="text-xs font-bold text-base-content flex items-center gap-1.5">
                Load Media Thumbnails
              </span>
              <span className="text-[10px] text-base-content/45 leading-relaxed block">
                Whether to render image and video preview thumbnails inside layout grids. Turn off if files are hosted on extremely slow or limited data storage links.
              </span>
            </div>
            <input
              type="checkbox"
              checked={show_thumbnails}
              onChange={(e) => setShowThumbnails(e.target.checked)}
              className="toggle toggle-primary toggle-sm"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Main Credentials Card */}
          <div className="card bg-base-200/40 border border-base-200 shadow-xl rounded-2xl p-6 space-y-5">
            <h3 className="text-sm font-bold text-base-content flex items-center gap-2 border-b border-base-300 pb-3">
              <Cloud className="w-4 h-4 text-primary" /> Google Drive Cloud Backup (DB Backups Only)
            </h3>
            
            <div className="alert bg-base-100 border border-base-300 text-xs leading-relaxed text-base-content/75 p-4 rounded-xl flex items-start gap-3">
              <Database className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-base-content block mb-1">Google Drive Backups Information</span>
                This integration backs up your SQLite catalog database (`.media_library.db`) and its timestamped historical backup databases to Google Drive. It is restricted strictly to database structures to avoid heavy media data payloads.
              </div>
            </div>

            {/* Service Account JSON */}
            <div className="form-control w-full space-y-2">
              <label className="label">
                <span className="label-text font-bold text-xs text-base-content/85">Google Cloud Service Account JSON Key</span>
              </label>
              <textarea
                value={localJson}
                onChange={(e) => setLocalJson(e.target.value)}
                placeholder='Paste your {"type": "service_account", ...} JSON credential key here'
                className="textarea textarea-bordered h-44 w-full bg-base-100/60 font-mono text-[10px] text-base-content placeholder-base-content/25 leading-relaxed focus:outline-none"
              />
              <span className="text-[10px] text-base-content/45 leading-relaxed block mt-1">
                To connect, go to the Google Cloud Console, create a Service Account, generate a JSON Key, and share your Google Drive Folder with the service account's client email address.
              </span>
            </div>

            {/* Folder ID */}
            <div className="form-control w-full space-y-2">
              <label className="label">
                <span className="label-text font-bold text-xs text-base-content/85">Google Drive Backup Folder ID (Optional)</span>
              </label>
              <input
                type="text"
                value={localFolderId}
                onChange={(e) => setLocalFolderId(e.target.value)}
                placeholder="1aBcDeFgHiJkLmNoPqRsTuVwXyZ"
                className="input input-bordered w-full bg-base-100/60 text-xs text-base-content placeholder-base-content/25 focus:outline-none"
              />
              <span className="text-[10px] text-base-content/45 leading-relaxed block mt-1">
                The folder ID of the shared directory on your Drive. Leave empty to upload files directly to the root of the Google Drive.
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2.5 pt-3 border-t border-base-300">
              <button
                onClick={handleSaveGDriveSettings}
                className="btn btn-sm btn-outline border-base-300 hover:bg-base-100 text-xs font-bold cursor-pointer"
              >
                Save Credentials
              </button>

              <button
                onClick={handleTestConnection}
                disabled={testingConnection || !localJson}
                className="btn btn-sm btn-secondary text-xs font-bold gap-1.5 cursor-pointer"
              >
                {testingConnection && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Test Connection
              </button>

              <button
                onClick={handleBackupNow}
                disabled={backingUp || !localJson || !selectedDrive}
                className="btn btn-sm btn-primary text-xs font-bold gap-1.5 cursor-pointer ml-auto"
              >
                {backingUp && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Backup Library Now
              </button>
            </div>

            {/* Test Connection Results */}
            {testResult && (
              <div className={`p-4 rounded-xl border flex items-start gap-3 mt-4 ${
                testResult.success 
                  ? "bg-success/10 border-success/30 text-success-content" 
                  : "bg-error/10 border-error/30 text-error-content"
              }`}>
                {testResult.success ? (
                  <Check className="w-5 h-5 flex-shrink-0 mt-0.5 text-success" />
                ) : (
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-error" />
                )}
                <div className="text-xs leading-relaxed">
                  <span className="font-bold block mb-1">
                    {testResult.success ? "Connection Test Successful" : "Connection Test Failed"}
                  </span>
                  {testResult.success 
                    ? "Successfully authenticated and reached Google Drive files client endpoint."
                    : testResult.error
                  }
                </div>
              </div>
            )}
          </div>

          {/* Backup Action Results */}
          {backupResult && (
            <div className={`card border shadow-xl rounded-2xl p-6 space-y-4 ${
              backupResult.success 
                ? "bg-base-200/40 border-success/30" 
                : "bg-base-200/40 border-error/30"
            }`}>
              <h4 className="text-xs font-bold text-base-content flex items-center gap-2">
                {backupResult.success ? (
                  <Check className="w-4 h-4 text-success" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-error" />
                )}
                Upload Backups Report
              </h4>

              {backupResult.success ? (
                <div className="space-y-3">
                  <p className="text-[11px] text-base-content/70">
                    The database backup operation completed. Below is the Google Drive upload log:
                  </p>
                  
                  <div className="overflow-x-auto">
                    <table className="table table-xs w-full bg-base-100 border border-base-200 rounded-lg">
                      <thead>
                        <tr className="bg-base-200/60 font-mono text-[9px]">
                          <th>File Name</th>
                          <th>Status</th>
                          <th>GDrive File ID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {backupResult.uploadResults?.map((res, index) => (
                          <tr key={index} className="hover:bg-base-200/30 text-[10px]">
                            <td className="font-mono text-base-content/80">{res.filename}</td>
                            <td>
                              {res.success ? (
                                <span className="badge badge-success badge-xs font-bold p-1 px-1.5 text-[9px]">Uploaded</span>
                              ) : (
                                <span className="badge badge-error badge-xs font-bold p-1 px-1.5 text-[9px]">Failed</span>
                              )}
                            </td>
                            <td className="font-mono text-base-content/40 text-[9px]">
                              {res.success ? res.fileId : (res.error || "Unknown error")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-error/15 border border-error/20 text-xs rounded-xl text-error-content">
                  <span className="font-bold block mb-1">Backup Execution Failed</span>
                  {backupResult.error}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
