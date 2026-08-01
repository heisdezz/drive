import fs from "node:fs";
import path from "node:path";
import { addLog, appLogs } from "../logger";
import { setThumbnailsPaused } from "../thumbnails";
import type { RpcHandlers } from "./types";

export const miscHandlers: Pick<
	RpcHandlers,
	"openExternal" | "selectFolder" | "setThumbnailGenerationPaused" | "getLogs"
> = {
	selectFolder: async ({ defaultPath, title = "Select Directory" }) => {
		addLog("info", `RPC Request: selectFolder invoked`, `defaultPath: ${defaultPath || "none"}`);
		try {
			let folderPath: string | null = null;

			if (process.platform === "linux") {
				if (Bun.which("zenity")) {
					const args = ["zenity", "--file-selection", "--directory", `--title=${title}`];
					if (defaultPath) args.push(`--filename=${defaultPath}/`);
					const proc = Bun.spawn(args, { stdout: "pipe", stderr: "ignore" });
					const output = await new Response(proc.stdout).text();
					const code = await proc.exited;
					if (code === 0 && output.trim()) {
						folderPath = output.trim();
					}
				} else if (Bun.which("kdialog")) {
					const args = ["kdialog", "--getexistingdirectory", defaultPath || "."];
					const proc = Bun.spawn(args, { stdout: "pipe", stderr: "ignore" });
					const output = await new Response(proc.stdout).text();
					const code = await proc.exited;
					if (code === 0 && output.trim()) {
						folderPath = output.trim();
					}
				}
			} else if (process.platform === "darwin") {
				const script = `POSIX path of (choose folder with prompt "${title}" ${
					defaultPath ? `default location "${defaultPath}"` : ""
				})`;
				const proc = Bun.spawn(["osascript", "-e", script], { stdout: "pipe", stderr: "ignore" });
				const output = await new Response(proc.stdout).text();
				const code = await proc.exited;
				if (code === 0 && output.trim()) {
					folderPath = output.trim();
				}
			} else if (process.platform === "win32") {
				const script = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; ${
					defaultPath ? `$f.SelectedPath = '${defaultPath.replace(/'/g, "''")}';` : ""
				} $f.Description = '${title.replace(/'/g, "''")}'; if ($f.ShowDialog() -eq 'OK') { Write-Output $f.SelectedPath }`;
				const proc = Bun.spawn(["powershell", "-Command", script], { stdout: "pipe", stderr: "ignore" });
				const output = await new Response(proc.stdout).text();
				const code = await proc.exited;
				if (code === 0 && output.trim()) {
					folderPath = output.trim();
				}
			}

			if (folderPath) {
				addLog("info", `Folder selected via native picker`, folderPath);
				return { success: true, folderPath };
			}
			return { success: false, error: "Folder selection was cancelled or unavailable" };
		} catch (err: any) {
			addLog("error", `Failed to trigger native folder picker dialog: ${err.message}`, err.stack);
			return { success: false, error: err.message };
		}
	},
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

			// Prefer Haruna or VLC media players, then mpv, then desktop default.
			const player = Bun.which("haruna")
				? "haruna"
				: Bun.which("vlc")
				? "vlc"
				: Bun.which("mpv")
				? "mpv"
				: "xdg-open";
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
