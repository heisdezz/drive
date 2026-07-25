import si from "systeminformation";
import { addLog } from "./logger";

export interface DriveInfo {
	id: string;
	name: string;
	type: "internal" | "external" | "network";
	size: string;
	usedPercentage: number;
	status: "mounted" | "unmounted" | "syncing" | "unmounting";
	path: string;
}

// Custom folders the user mounted as pseudo-drives; kept in memory and merged
// into every drive listing alongside the real block devices.
export const userMountedDrives: DriveInfo[] = [];

// Backend function to list all block devices using systeminformation
export async function getConnectedDrives(): Promise<DriveInfo[]> {
	addLog("info", "Listing drives via systeminformation");
	try {
		const devices = await si.blockDevices();

		// We only want top-level disks, not individual partitions —
		// each disk entry aggregates all its partition mount info via si
		const SKIP_FSTYPES = new Set(["swap", "squashfs", "tmpfs", "devtmpfs"]);
		const SKIP_MOUNTS = new Set(["/boot", "/boot/efi", "[SWAP]"]);
		const isSystemMount = (mp: string) =>
			!mp ||
			SKIP_MOUNTS.has(mp) ||
			mp.startsWith("/sys") ||
			mp.startsWith("/dev") ||
			mp.startsWith("/proc") ||
			(mp.startsWith("/run") && !mp.startsWith("/run/media/"));

		// Group partitions by their parent disk device path
		const diskMap = new Map<string, typeof devices[number]>();
		for (const dev of devices) {
			if (dev.type === "disk" && dev.name !== "zram0" && !dev.name.startsWith("loop")) {
				diskMap.set(`/dev/${dev.name}`, dev);
			}
		}

		const drives: DriveInfo[] = [];

		for (const [devicePath, disk] of diskMap) {
			// Find the best partition to represent this disk:
			// prefer the one with a meaningful user-accessible mount
			const partitions = devices.filter(
				(d) => d.device === devicePath && d.type === "part" && !SKIP_FSTYPES.has(d.fsType)
			);

			// Find the primary user mount (/ or /run/media/* or any non-system mount)
			const userPartition = partitions.find((p) => !isSystemMount(p.mount));
			const systemPartition = partitions.find((p) => p.mount === "/");
			const rep = userPartition || systemPartition || (partitions.length ? partitions[0] : null);

			// If this disk is entirely system-only partitions, skip it
			const hasOnlySystemMounts = partitions.length > 0 &&
				partitions.every((p) => p.mount && isSystemMount(p.mount) && p.mount !== "/");
			if (hasOnlySystemMounts) continue;

			const mountPath = rep && !isSystemMount(rep.mount) ? rep.mount : (systemPartition?.mount || "");
			const isMounted = !!mountPath;

			// Human-readable size
			const gb = (disk.size ?? 0) / 1_073_741_824;
			const size = gb >= 1000
				? `${(gb / 1024).toFixed(1)} TB`
				: `${Math.round(gb)} GB`;

			// Name: prefer model, fallback to label or device
			const name = disk.model?.trim() ||
				(rep?.label?.trim() || "") ||
				disk.name;
			const label = mountPath === "/" ? "System Root" : (name || devicePath);

			// Drive type: use protocol field
			const driveType: "internal" | "external" | "network" =
				disk.protocol === "usb" ? "external" : "internal";

			addLog("info", `Drive: ${label} (${size})`,
				`device=${devicePath}, mounted=${isMounted}, mount=${mountPath || "none"}, protocol=${disk.protocol}, physical=${disk.physical}`);

			drives.push({
				id: devicePath,
				name: label,
				type: driveType,
				size,
				usedPercentage: 0,
				status: isMounted ? "mounted" : "unmounted",
				path: mountPath,
			});
		}

		addLog("info", `Drive scan complete. Found ${drives.length} drives. Combined with ${userMountedDrives.length} custom mounts.`);
		return [...drives, ...userMountedDrives];
	} catch (error: any) {
		addLog("error", `Failed to list drives: ${error.message}`, error.stack);
		return [
			{ id: "fallback-1", name: "System (Fallback)", type: "internal" as const, size: "128 GB", usedPercentage: 0, status: "mounted" as const, path: "/" }
		];
	}
}
