import { Utils } from "electrobun/bun";
import path from "node:path";
import si from "systeminformation";
import { addLog } from "../logger";
import { getConnectedDrives, userMountedDrives } from "../drives";
import type { RpcHandlers } from "./types";

export const driveHandlers: Pick<
	RpcHandlers,
	"getDrives" | "mountDrive" | "mountBlockDevice"
> = {
	getDrives: async () => {
		addLog("info", "RPC Request: getDrives invoked");
		return getConnectedDrives();
	},
	mountDrive: async () => {
		addLog("info", "RPC Request: mountDrive invoked");
		try {
			const paths = await Utils.openFileDialog({
				canChooseFiles: false,
				canChooseDirectory: true,
				allowsMultipleSelection: false,
				startingFolder: "/"
			});

			if (!paths || paths.length === 0 || !paths[0]) {
				addLog("info", "mountDrive cancelled by user");
				return { success: false, error: "Cancelled by user" };
			}

			const selectedPath = paths[0].trim();
			addLog("info", `mountDrive selected path: ${selectedPath}`);

			// Check if already mounted
			const existing = userMountedDrives.find(d => d.path === selectedPath);
			if (existing) {
				addLog("info", `Drive already mounted: ${selectedPath}`);
				return { success: true, drive: existing };
			}

			const name = path.basename(selectedPath) || selectedPath;
			const newDrive = {
				id: `user-${Date.now()}`,
				name: `${name} (Mounted)`,
				type: "external" as const,
				size: "Custom Folder",
				usedPercentage: 0,
				status: "mounted" as const,
				path: selectedPath
			};

			userMountedDrives.push(newDrive);
			addLog("info", `Successfully mounted custom folder as drive: ${newDrive.name} at ${newDrive.path}`);
			return { success: true, drive: newDrive };
		} catch (err: any) {
			addLog("error", `Failed to mount drive folder: ${err.message}`, err.stack);
			return { success: false, error: err.message };
		}
	},
	mountBlockDevice: async ({ deviceId }) => {
		addLog("info", `RPC Request: mountBlockDevice invoked`, `deviceId: ${deviceId}`);
		try {
			const devices = await si.blockDevices();

			// 1. Find the target partition to mount
			const SKIP_FSTYPES = new Set(["swap", "squashfs", "tmpfs", "devtmpfs"]);
			let targetPart = devices.find(d => `/dev/${d.name}` === deviceId && d.type === "part");

			if (!targetPart) {
				// If the deviceId represents the parent disk (e.g. /dev/sdb),
				// find the partitions belonging to it.
				const parts = devices.filter(
					(d) => d.device === deviceId && d.type === "part" && !SKIP_FSTYPES.has(d.fsType)
				);
				if (parts.length > 0) {
					// Sort by size descending to pick the largest partition
					parts.sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
					targetPart = parts[0];
				}
			}

			if (!targetPart) {
				throw new Error(`No mountable partition found for device ${deviceId}`);
			}

			const partPath = `/dev/${targetPart.name}`;
			addLog("info", `Attempting to mount partition ${partPath} via udisksctl`);

			const proc = Bun.spawn(["udisksctl", "mount", "-b", partPath]);
			const stdout = await new Response(proc.stdout).text();
			const stderr = await new Response(proc.stderr).text();
			await proc.exited;

			addLog("info", `udisksctl output`, `stdout: ${stdout.trim()}, stderr: ${stderr.trim()}`);

			// Query block devices again to get the new mountpoint
			const updatedDevices = await si.blockDevices();
			const freshPart = updatedDevices.find(d => `/dev/${d.name}` === partPath);

			if (freshPart && freshPart.mount) {
				addLog("info", `Successfully mounted device ${deviceId} at ${freshPart.mount}`);
				return { success: true, mountPath: freshPart.mount };
			} else {
				throw new Error(stderr.trim() || `udisksctl completed but mountpoint was not found`);
			}
		} catch (err: any) {
			addLog("error", `Failed to mount block device ${deviceId}: ${err.message}`, err.stack);
			return { success: false, error: err.message };
		}
	},
};
