import fs from "node:fs";
import path from "node:path";
import { addLog } from "./logger";

// --- Thumbnail generation pause gate ---------------------------------------
// Thumbnailing HEVC/H.264 files means spawning ffmpeg to software-decode them,
// which pins CPU cores. When a video is playing (also software-decoded by
// WebKit), that contention causes playback stutter. The renderer flips this
// flag on <video> play/pause so generation yields the CPU during playback.
let thumbnailsPaused = false;
let pausedWaiters: (() => void)[] = [];

function waitWhilePaused(): Promise<void> {
	if (!thumbnailsPaused) return Promise.resolve();
	return new Promise((resolve) => pausedWaiters.push(resolve));
}

export function setThumbnailsPaused(paused: boolean) {
	if (paused === thumbnailsPaused) return;
	thumbnailsPaused = paused;
	addLog("info", `Thumbnail generation ${paused ? "paused" : "resumed"}`);
	if (!paused) {
		// Release everyone waiting; they re-check the (now false) flag and proceed.
		const waiters = pausedWaiters;
		pausedWaiters = [];
		for (const resolve of waiters) resolve();
	}
}

async function generateThumbnailFile(fullMediaPath: string, thumbPath: string): Promise<boolean> {
	// Hold here (without occupying ffmpeg) until playback releases the gate.
	await waitWhilePaused();
	try {
		const thumbsDir = path.dirname(thumbPath);
		if (!fs.existsSync(thumbsDir)) {
			fs.mkdirSync(thumbsDir, { recursive: true });
		}

		const ext = path.extname(fullMediaPath).toLowerCase();
		const isVideo = [".mp4", ".mov", ".avi", ".mkv", ".webm"].includes(ext);

		if (isVideo) {
			addLog("info", `Generating video thumbnail for: ${fullMediaPath}`);
			// Try VAAPI hardware decode first — offloads HEVC decode to the GPU,
			// freeing CPU cores for WebKit video playback and making generation
			// faster. Falls back to software decode if VAAPI is unavailable or
			// the file can't be decoded in hardware.
			const hwProc = Bun.spawn([
				"nice", "-n", "19",
				"ffmpeg", "-y",
				"-hwaccel", "vaapi",
				"-hwaccel_output_format", "vaapi",
				"-hwaccel_device", "/dev/dri/renderD128",
				"-ss", "00:00:01",
				"-i", fullMediaPath,
				"-vframes", "1",
				"-vf", "scale_vaapi=320:-1,hwdownload,format=nv12",
				"-frames:v", "1",
				thumbPath,
			]);
			await hwProc.exited;

			if (!fs.existsSync(thumbPath)) {
				addLog("info", `VAAPI thumbnail failed, falling back to software for: ${fullMediaPath}`);
				const swProc = Bun.spawn([
					"nice", "-n", "19",
					"ffmpeg", "-y",
					"-ss", "00:00:01",
					"-i", fullMediaPath,
					"-vframes", "1",
					"-vf", "scale=320:-1,format=yuvj420p",
					thumbPath,
				]);
				await swProc.exited;
			}
		} else {
			addLog("info", `Generating image thumbnail for: ${fullMediaPath}`);
			try {
				const sharp = require("sharp");
				await sharp(fullMediaPath)
					.resize(320)
					.toFile(thumbPath);
			} catch (e: any) {
				addLog("warn", `Sharp failed or not available, falling back to ffmpeg: ${e.message}`);
				const proc = Bun.spawn([
					"ffmpeg",
					"-y",
					"-i", fullMediaPath,
					"-vf", "scale=320:-1",
					"-vframes", "1",
					thumbPath
				]);
				await proc.exited;
			}
		}

		return fs.existsSync(thumbPath);
	} catch (err: any) {
		addLog("error", `Failed in generateThumbnailFile for ${fullMediaPath}: ${err.message}`, err.stack);
		return false;
	}
}

class ConcurrencyLimiter {
	private active = 0;
	private limit: number;
	private queue: (() => void)[] = [];

	constructor(limit: number) {
		this.limit = limit;
	}

	async run<T>(fn: () => Promise<T>): Promise<T> {
		if (this.active >= this.limit) {
			await new Promise<void>((resolve) => this.queue.push(resolve));
		}
		this.active++;
		try {
			return await fn();
		} finally {
			this.active--;
			const next = this.queue.shift();
			if (next) {
				next();
			}
		}
	}
}

const generatorLimiter = new ConcurrencyLimiter(3);
const activeGenerations = new Map<string, Promise<boolean>>();

export async function getOrGenerateThumbnail(fullMediaPath: string, thumbPath: string): Promise<boolean> {
	if (fs.existsSync(thumbPath)) {
		return true;
	}

	let activePromise = activeGenerations.get(thumbPath);
	if (!activePromise) {
		activePromise = generatorLimiter.run(() => generateThumbnailFile(fullMediaPath, thumbPath));
		activeGenerations.set(thumbPath, activePromise);
		activePromise.finally(() => {
			activeGenerations.delete(thumbPath);
		});
	}

	return activePromise;
}

interface ThumbnailQueueItem {
	fullMediaPath: string;
	thumbPath: string;
}

class ThumbnailQueue {
	private queue: ThumbnailQueueItem[] = [];
	private activeCount = 0;
	private maxConcurrency = 2;

	public add(fullMediaPath: string, thumbPath: string) {
		if (this.queue.some(item => item.thumbPath === thumbPath)) {
			return;
		}
		if (fs.existsSync(thumbPath)) {
			return;
		}
		this.queue.push({ fullMediaPath, thumbPath });
		this.processNext();
	}

	private async processNext() {
		if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) {
			return;
		}

		const item = this.queue.shift();
		if (!item) return;

		this.activeCount++;
		try {
			if (!fs.existsSync(item.thumbPath)) {
				await generateThumbnailFile(item.fullMediaPath, item.thumbPath);
			}
		} catch (err: any) {
			addLog("error", `Background thumbnail generation failed: ${err.message}`);
		} finally {
			this.activeCount--;
			setImmediate(() => this.processNext());
		}
	}
}

export const backgroundThumbnailQueue = new ThumbnailQueue();
