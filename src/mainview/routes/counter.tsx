import { createFileRoute } from "@tanstack/solid-router";
import { createSignal, createEffect, onCleanup, For, Show } from "solid-js";

export const Route = createFileRoute("/counter")({
  component: VideoTest,
});

const TEST_FILE =
  "/run/media/destiny/Ventoy/albums/_.mandylee._/_.mandylee.__3917513088294691661.mp4";
const MEDIA_SERVER = "http://localhost:51789";

type Source = "server" | "file";

function Stat(props: { label: string; value: string; class?: string }) {
  return (
    <div
      class={`rounded-xl bg-base-300 border border-base-200 p-3 ${props.class || ""}`}
    >
      <div class="text-[9px] uppercase font-bold text-base-content/40 tracking-wider">
        {props.label}
      </div>
      <div class="text-xs font-mono text-base-content mt-0.5 break-all">
        {props.value}
      </div>
    </div>
  );
}

function mediaErrorText(code?: number) {
  switch (code) {
    case 1:
      return "MEDIA_ERR_ABORTED (fetch aborted)";
    case 2:
      return "MEDIA_ERR_NETWORK (network error)";
    case 3:
      return "MEDIA_ERR_DECODE (decode failed — codec/hardware issue)";
    case 4:
      return "MEDIA_ERR_SRC_NOT_SUPPORTED (container/codec unsupported)";
    default:
      return "unknown";
  }
}

function readyStateText(s: number) {
  return (
    [
      "HAVE_NOTHING",
      "HAVE_METADATA",
      "HAVE_CURRENT",
      "HAVE_FUTURE",
      "HAVE_ENOUGH",
    ][s] ?? ""
  );
}

function networkStateText(s: number) {
  return ["EMPTY", "IDLE", "LOADING", "NO_SOURCE"][s] ?? "";
}

function VideoTest() {
  let videoRef: HTMLVideoElement | undefined;
  const [source, setSource] = createSignal<Source>("server");
  const [draftPath, setDraftPath] = createSignal(TEST_FILE);
  const [filePath, setFilePath] = createSignal(TEST_FILE);
  const [logs, setLogs] = createSignal<string[]>([]);
  const [info, setInfo] = createSignal({
    readyState: 0,
    networkState: 0,
    width: 0,
    height: 0,
    duration: 0,
    buffered: "",
  });

  const serverUrl = () =>
    `${MEDIA_SERVER}/media?path=${encodeURIComponent(filePath())}`;
  const fileUrl = () => `file://${filePath()}`;
  const src = () => (source() === "server" ? serverUrl() : fileUrl());

  const log = (msg: string) =>
    setLogs((prev) => [
      `${new Date().toLocaleTimeString()}.${String(Date.now() % 1000).padStart(3, "0")}  ${msg}`,
      ...prev.slice(0, 199),
    ]);

  createEffect(() => {
    const v = videoRef;
    const currentSrc = src();
    const currentSource = source();
    if (!v) return;

    const events = [
      "loadstart",
      "loadedmetadata",
      "loadeddata",
      "canplay",
      "canplaythrough",
      "play",
      "playing",
      "pause",
      "waiting",
      "stalled",
      "suspend",
      "seeking",
      "seeked",
      "ended",
      "error",
    ] as const;

    const snapshot = () =>
      setInfo({
        readyState: v.readyState,
        networkState: v.networkState,
        width: v.videoWidth,
        height: v.videoHeight,
        duration: Number.isFinite(v.duration) ? v.duration : 0,
        buffered:
          v.buffered.length > 0
            ? Array.from({ length: v.buffered.length })
                .map(
                  (_, i) =>
                    `${v.buffered.start(i).toFixed(1)}–${v.buffered.end(i).toFixed(1)}`,
                )
                .join(", ")
            : "none",
      });

    const handlers: Record<string, () => void> = {};
    for (const ev of events) {
      handlers[ev] = () => {
        if (ev === "error") {
          const err = v.error;
          log(
            `⚠️ error  code=${err?.code} ${err?.message || mediaErrorText(err?.code)}`,
          );
        } else {
          log(ev);
        }
        snapshot();
      };
      v.addEventListener(ev, handlers[ev]);
    }

    const onTime = () => snapshot();
    v.addEventListener("timeupdate", onTime);

    log(`── source switched to "${currentSource}" → ${currentSrc}`);

    onCleanup(() => {
      for (const ev of events) v.removeEventListener(ev, handlers[ev]);
      v.removeEventListener("timeupdate", onTime);
    });
  });

  return (
    <div class="max-w-4xl mx-auto space-y-6">
      <div class="space-y-1">
        <h2 class="text-2xl font-extrabold text-base-content">
          Video Playback Diagnostic
        </h2>
        <p class="text-base-content/60 text-sm">
          Plays the test file through the local media server (range-request
          path) so you can isolate implementation vs. WebKit/GStreamer decode
          issues.
        </p>
      </div>

      {/* File path input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setFilePath(draftPath().trim());
        }}
        class="flex items-center gap-2"
      >
        <input
          type="text"
          value={draftPath()}
          onInput={(e) => setDraftPath(e.currentTarget.value)}
          placeholder="/absolute/path/to/video.mp4"
          spellcheck={false}
          class="input input-sm input-bordered flex-1 font-mono text-xs"
        />
        <button
          type="submit"
          disabled={!draftPath().trim() || draftPath().trim() === filePath()}
          class="btn btn-sm btn-primary"
        >
          Load
        </button>
      </form>

      {/* Source toggle */}
      <div class="flex items-center gap-2">
        <span class="text-xs font-bold text-base-content/60">Source:</span>
        <div class="join">
          <button
            onClick={() => setSource("server")}
            class={`btn btn-sm join-item ${source() === "server" ? "btn-primary" : "btn-outline"}`}
          >
            Media Server (/media)
          </button>
          <button
            onClick={() => setSource("file")}
            class={`btn btn-sm join-item ${source() === "file" ? "btn-primary" : "btn-outline"}`}
          >
            Direct file://
          </button>
        </div>
        <button
          onClick={() => videoRef?.load()}
          class="btn btn-sm btn-outline ml-2"
        >
          Reload
        </button>
      </div>

      {/* The video */}
      <div class="rounded-2xl border border-base-200 bg-base-300 overflow-hidden shadow-2xl">
        <video
          ref={videoRef}
          src={src()}
          controls
          autoplay
          playsinline
          style={{
            transform: "translateZ(0)",
            "backface-visibility": "hidden",
          }}
          class="w-full max-h-[55vh] object-contain bg-black"
        />
      </div>

      {/* Live state */}
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat
          label="readyState"
          value={`${info().readyState} ${readyStateText(info().readyState)}`}
        />
        <Stat
          label="networkState"
          value={`${info().networkState} ${networkStateText(info().networkState)}`}
        />
        <Stat
          label="resolution"
          value={info().width ? `${info().width}×${info().height}` : "—"}
        />
        <Stat
          label="duration"
          value={info().duration ? `${info().duration.toFixed(1)}s` : "—"}
        />
        <Stat
          label="buffered"
          value={info().buffered || "—"}
          class="col-span-2"
        />
      </div>

      <div class="text-[11px] font-mono text-base-content/50 break-all bg-base-300/50 border border-base-200 rounded-lg p-3">
        {src()}
      </div>

      {/* Event log */}
      <div class="rounded-2xl bg-base-300 border border-base-200 overflow-hidden">
        <div class="flex items-center justify-between px-4 py-2 border-b border-base-200">
          <span class="text-xs font-bold text-base-content/70">Event Log</span>
          <button
            onClick={() => setLogs([])}
            class="btn btn-xs btn-ghost text-base-content/60"
          >
            Clear
          </button>
        </div>
        <div class="max-h-72 overflow-y-auto font-mono text-[11px] divide-y divide-base-200/40">
          <Show
            when={logs().length > 0}
            fallback={
              <div class="p-4 text-base-content/40 italic">No events yet…</div>
            }
          >
            <For each={logs()}>
              {(l) => (
                <div
                  class={`px-4 py-1.5 ${l.includes("⚠️") ? "text-error bg-error/5" : "text-base-content/70"}`}
                >
                  {l}
                </div>
              )}
            </For>
          </Show>
        </div>
      </div>
    </div>
  );
}
