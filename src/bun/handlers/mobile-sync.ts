import { mobileSyncStatus, startMobileSync, stopMobileSync } from "../mobile-sync";
import type { RpcHandlers } from "./types";

export const mobileSyncHandlers: Pick<RpcHandlers, "startMobileSync" | "stopMobileSync" | "getMobileSyncStatus"> = {
	startMobileSync: async ({ drivePath, port }) => {
		try { return { success: true, ...startMobileSync(drivePath, port) }; }
		catch (err: any) { return { success: false, ...mobileSyncStatus(), error: err.message }; }
	},
	stopMobileSync: async () => stopMobileSync(),
	getMobileSyncStatus: async () => mobileSyncStatus(),
};
