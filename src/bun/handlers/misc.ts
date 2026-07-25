import fs from "node:fs";
import path from "node:path";
import { addLog, appLogs } from "../logger";
import { setThumbnailsPaused } from "../thumbnails";
import type { RpcHandlers } from "./types";

export const miscHandlers: Pick<
	RpcHandlers,
	"openExternal" | "setThumbnailGenerationPaused" | "getLogs"
> = {
	openExternal: async ({ drivePath, relativePath }) => {
		addLog("info", `RPC Request: openExternal invoked`, `relativePath: ${relativePath}`);
		try {
			// Resolve and confine the target to the drive root to avoid
			// launching arbitrary paths passed from the renderer.
			const fullPath = path.resolve(drivePath, relativePath);
			if (fullPath !== drivePath && !fullPath.startsWith(drivePath + path.sep)) {
				throw new Error("Refusing to open path outside the drive root");
			}
			if (!fs.existsSync(fullPath)) {
				throw new Error(`File not found: ${fullPath}`);
			}

			// mpv bundles its own ffmpeg-based decoder, so it plays media
			// without relying on the system GStreamer stack that WebKit uses.
			// Fall back to the desktop default handler if mpv is unavailable.
			const player = Bun.which("mpv") ? "mpv" : "xdg-open";
			const proc = Bun.spawn([player, fullPath], {
				stdout: "ignore",
				stderr: "ignore",
				stdin: "ignore",
			});
			// Detach so the player keeps running independently of the app.
			proc.unref();

			addLog("info", `Launched external player`, `${player} -> ${fullPath}`);
			return { success: true };
		} catch (err: any) {
			addLog("error", `Failed to open external player: ${err.message}`, err.stack);
			return { success: false, error: err.message };
		}
	},
	setThumbnailGenerationPaused: async ({ paused }) => {
		setThumbnailsPaused(paused);
		return { success: true };
	},
	getLogs: async () => {
		return { logs: appLogs };
	},
};
