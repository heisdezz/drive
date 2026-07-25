import fs from "node:fs";
import { addLog } from "./logger";

// Move a file, falling back to copy+delete when rename can't cross a boundary
// (e.g. different filesystems, which throws EXDEV on removable drives).
export async function moveFile(src: string, dest: string) {
	try {
		await fs.promises.rename(src, dest);
	} catch (err: any) {
		addLog("info", `fs.rename failed (${err.message}), trying copy + delete fallback...`);
		await fs.promises.copyFile(src, dest);
		await fs.promises.unlink(src);
	}
}
