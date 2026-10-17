import { changeMobileSyncWriteToken, mobileSyncStatus, startMobileSync, stopMobileSync } from "../mobile-sync";
import type { RpcHandlers } from "./types";

export const mobileSyncHandlers: Pick<RpcHandlers, "startMobileSync" | "stopMobileSync" | "getMobileSyncStatus" | "setMobileSyncWriteToken"> = {
	startMobileSync: async ({ drivePath, port }) => {
		try { return { success: true, ...startMobileSync(drivePath, port) }; }
		catch (err: any) { return { success: false, ...mobileSyncStatus(), error: err.message }; }
	},
	stopMobileSync: async () => stopMobileSync(),
	getMobileSyncStatus: async () => mobileSyncStatus(),
	setMobileSyncWriteToken: async ({ token }) => {
		try { return { success: true as const, ...changeMobileSyncWriteToken(token) }; }
		catch (err: any) { return { success: false as const, error: err.message }; }
	},
};
