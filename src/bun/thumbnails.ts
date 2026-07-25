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

// All ffmpeg procs currently running thumbnail generation, keyed by thumbPath.
// On pause we SIGSTOP them (suspend at OS level, preserving progress) and
// SIGCONT on resume — faster and cheaper than killing and restarting.
const activeProcs = new Map<string, ReturnType<typeof Bun.spawn>>();

function waitWhilePaused(): Promise<void> {
	if (!thumbnailsPaused) return Promise.resolve();
	return new Promise((resolve) => pausedWaiters.push(resolve));
}

export function setThumbnailsPaused(paused: boolean) {
	if (paused === thumbnailsPaused) return;
	thumbnailsPaused = paused;
	addLog("info", `Thumbnail generation ${paused ? "paused" : "resumed"}`);

	// Suspend/resume in-flight ffmpeg processes immediately so they stop
	// consuming CPU within milliseconds of the video starting to play,
	// rather than waiting for the current frame to finish.
	const signal = paused ? "SIGSTOP" : "SIGCONT";
	for (const proc of activeProcs.values()) {
		try { proc.kill(signal as any); } catch {}
	}

	if (!paused) {
		const waiters = pausedWaiters;
		pausedWaiters = [];
		for (const resolve of waiters) resolve();
	}
}

async function spawnAndTrack(
	key: string,
	args: string[],
): Promise<ReturnType<typeof Bun.spawn>> {
	const proc = Bun.spawn(args, { stdout: "ignore", stderr: "ignore" });
	activeProcs.set(key, proc);
	// If we're already paused, stop it immediately after spawning.
	if (thumbnailsPaused) {
		try { proc.kill("SIGSTOP" as any); } catch {}
	}
	try {
		await proc.exited;
	} finally {
		activeProcs.delete(key);
	}
	return proc;
}

async function generateThumbnailFile(fullMediaPath: string, thumbPath: string): Promise<boolean> {
	// Hold here (without occupying a concurrency slot) until playback releases
	// the gate. If we're already inside the limiter when a video starts, the
	// SIGSTOP above suspends the ffmpeg proc immediately.
	await waitWhilePaused();
	try {
		const thumbsDir = path.dirname(thumbPath);
		if (!fs.existsSync(thumbsDir)) {
			fs.mkdirSync(thumbsDir, { recursive: true });
		}

		const ext = path.extname(fullMediaPath).toLowerCase();
		const isVideo = [".mp4", ".mov", ".avi", ".mkv", ".webm"].includes(ext);

		if (isVideo) {
			// Try VAAPI hardware decode first — offloads HEVC decode to the GPU,
			// freeing CPU cores for WebKit video playback. Falls back to software
			// if VAAPI is unavailable or the file can't be decoded in hardware.
			await spawnAndTrack(`${thumbPath}:hw`, [
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

			if (!fs.existsSync(thumbPath)) {
				addLog("info", `VAAPI thumbnail failed, falling back to software for: ${fullMediaPath}`);
				await spawnAndTrack(`${thumbPath}:sw`, [
					"nice", "-n", "19",
					"ffmpeg", "-y",
					"-ss", "00:00:01",
					"-i", fullMediaPath,
					"-vframes", "1",
					"-vf", "scale=320:-1,format=yuvj420p",
					thumbPath,
				]);
			}
		} else {
			try {
				const sharp = require("sharp");
				await sharp(fullMediaPath).resize(320).toFile(thumbPath);
			} catch (e: any) {
				addLog("warn", `Sharp failed, falling back to ffmpeg: ${e.message}`);
				await spawnAndTrack(`${thumbPath}:img`, [
					"nice", "-n", "19",
					"ffmpeg", "-y",
					"-i", fullMediaPath,
					"-vf", "scale=320:-1",
					"-vframes", "1",
					thumbPath,
				]);
			}
		}

		return fs.existsSync(thumbPath);
	} catch (err: any) {
		addLog("error", `Failed in generateThumbnailFile for ${fullMediaPath}: ${err.message}`, err.stack);
		return false;
	}
}

// Single concurrency limiter shared by both on-demand and background paths.
// Limit 2 keeps total ffmpeg usage low enough to leave headroom for playback,
// while still making progress on large libraries. Previously there were two
// separate limiters (3 + 2) that could run 5 concurrent ffmpeg processes.
class ConcurrencyLimiter {
	private active = 0;
	private readonly limit: number;
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
			this.queue.shift()?.();
		}
	}
}

const limiter = new ConcurrencyLimiter(2);

// Dedup: if the same thumb is already being generated, return the same promise.
const activeGenerations = new Map<string, Promise<boolean>>();

export async function getOrGenerateThumbnail(fullMediaPath: string, thumbPath: string): Promise<boolean> {
	// Async stat to avoid blocking the event loop on 24+ simultaneous thumbnail
	// requests when an album page loads.
	try {
		await fs.promises.access(thumbPath, fs.constants.F_OK);
		return true;
	} catch {}

	let promise = activeGenerations.get(thumbPath);
	if (!promise) {
		promise = limiter.run(() => generateThumbnailFile(fullMediaPath, thumbPath));
		activeGenerations.set(thumbPath, promise);
		promise.finally(() => activeGenerations.delete(thumbPath));
	}
	return promise;
}

// Background queue for scanner-triggered generation. Shares the same limiter
// so background and on-demand work compete for the same 2 slots total.
interface ThumbnailQueueItem {
	fullMediaPath: string;
	thumbPath: string;
}

class ThumbnailQueue {
	private queue: ThumbnailQueueItem[] = [];

	public add(fullMediaPath: string, thumbPath: string) {
		// Skip if already queued or already on disk.
		if (this.queue.some((item) => item.thumbPath === thumbPath)) return;
		// Sync check here is fine — called once per file during scan, not on
		// every request. The on-demand path uses async access instead.
		if (fs.existsSync(thumbPath)) return;
		this.queue.push({ fullMediaPath, thumbPath });
		this.processNext();
	}

	private async processNext() {
		const item = this.queue.shift();
		if (!item) return;

		try {
			await limiter.run(() => generateThumbnailFile(item.fullMediaPath, item.thumbPath));
		} catch (err: any) {
			addLog("error", `Background thumbnail generation failed: ${err.message}`);
		} finally {
			setImmediate(() => this.processNext());
		}
	}
}

export const backgroundThumbnailQueue = new ThumbnailQueue();
