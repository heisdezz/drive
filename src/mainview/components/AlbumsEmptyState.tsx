import { Compass, HardDrive, Info } from "lucide-react";
import { rpc } from "@/lib/rpc";
import { useDriveStore, type Device } from "@/store/drive_store";

export function NoDriveSelected() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 sm:p-12">
      <div className="w-20 h-20 rounded-full bg-base-100 border border-base-300 flex items-center justify-center mb-6 shadow-xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <Compass className="w-10 h-10 text-base-content/40 group-hover:text-primary transition-colors duration-300" />
      </div>
      <h3 className="text-2xl font-black text-base-content mb-2">
        No Drive Selected
      </h3>
      <p className="text-base-content/60 text-sm max-w-sm leading-relaxed mb-6">
        Please select a connected drive or storage volume from the sidebar to
        inspect cataloged albums.
      </p>
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-base-100/60 border border-base-200 text-[10px] text-base-content/40 font-medium">
        <Info className="w-3.5 h-3.5" />
        Select a drive then scan it under the Discover tab.
      </div>
    </div>
  );
}

export function DriveUnmounted({ drive }: { drive: Device }) {
  const fetchDrives = useDriveStore((s) => s.fetchDrives);

  const handleMount = async () => {
    try {
      const res = await rpc.request.mountBlockDevice({ deviceId: drive.id });
      if (res.success && res.mountPath) {
        await fetchDrives();
      } else {
        alert(`Failed to mount: ${res.error}`);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 sm:p-12">
      <div className="w-20 h-20 rounded-full bg-base-100 border border-base-300 flex items-center justify-center mb-6 shadow-xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-tr from-warning/10 to-transparent opacity-100 transition-opacity duration-300" />
        <HardDrive className="w-10 h-10 text-base-content/40 group-hover:text-warning transition-colors duration-300 animate-pulse" />
      </div>
      <h3 className="text-2xl font-black text-base-content mb-2">
        {drive.name} is Unmounted
      </h3>
      <p className="text-base-content/60 text-sm max-w-sm leading-relaxed mb-6">
        This storage device needs to be mounted before you can view its albums.
      </p>
      <button
        onClick={handleMount}
        className="btn btn-primary px-8 font-bold text-sm tracking-wide shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
      >
        Mount Drive
      </button>
    </div>
  );
}
