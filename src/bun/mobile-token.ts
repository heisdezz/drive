import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";

const APP_ID = "io.github.heisdezz.dstream";
let cachedPath = "";
let cachedToken = "";

export function mobileTokenFile(): string {
	const override = process.env.DSTREAM_CONFIG_DIR;
	const base = override || (process.platform === "win32"
		? process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
		: process.platform === "darwin"
			? path.join(os.homedir(), "Library", "Application Support")
			: process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"));
	return path.join(base, APP_ID, "mobile-sync.json");
}

function persistToken(filePath: string, token: string): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
	const temporary = `${filePath}.${randomUUID()}.tmp`;
	try {
		fs.writeFileSync(temporary, JSON.stringify({ writeToken: token }), { mode: 0o600, flag: "wx" });
		fs.renameSync(temporary, filePath);
	} catch (error) {
		try { fs.unlinkSync(temporary); } catch {}
		throw error;
	}
}

export function getMobileWriteToken(): string {
	const filePath = mobileTokenFile();
	if (filePath === cachedPath && cachedToken) return cachedToken;
	let token: string;
	try {
		const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
		if (typeof parsed.writeToken !== "string" || !parsed.writeToken.trim() || /[^\x20-\x7e]/.test(parsed.writeToken)) {
			throw new Error("The saved mobile write token is empty or invalid.");
		}
		token = parsed.writeToken;
	} catch (error: any) {
		if (error.code !== "ENOENT") throw error;
		token = randomBytes(32).toString("hex");
		persistToken(filePath, token);
	}
	cachedPath = filePath;
	cachedToken = token;
	return token;
}

export function setMobileWriteToken(value: string): string {
	if (typeof value !== "string" || !value.trim() || /[^\x20-\x7e]/.test(value)) {
		throw new Error("Enter a nonempty token using printable ASCII characters.");
	}
	const token = value.trim();
	const filePath = mobileTokenFile();
	persistToken(filePath, token);
	cachedPath = filePath;
	cachedToken = token;
	return token;
}
