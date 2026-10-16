import { createSignal, createEffect, onCleanup, Show } from "solid-js";
import { Link } from "@tanstack/solid-router";
import { ChevronLeft, ChevronRight, ExternalLink, Loader2 } from "lucide-solid";
import { rpc } from "@/lib/rpc";
import type { MediaItem } from "@/components/MediaCard";

interface MediaPlayerProps {
  item: MediaItem;
  drivePath: string;
  mediaUrl: string;
  fileName: string;
  isVideo: boolean;
  prevId: number | null;
  nextId: number | null;
  albumId?: number;
  loading: boolean;
}

export function MediaPlayer(props: MediaPlayerProps) {
  const [launching, setLaunching] = createSignal(false);
  const [launchError, setLaunchError] = createSignal<string | null>(null);
  const [videoError, setVideoError] = createSignal<string | null>(null);
  const [retryCount, setRetryCount] = createSignal(0);
  let videoRef: HTMLVideoElement | undefined;

  const setThumbnailsPaused = (paused: boolean) => {
    rpc.request.setThumbnailGenerationPaused({ paused }).catch(() => {});
  };

  onCleanup(() => {
    setThumbnailsPaused(false);
  });

  createEffect(() => {
    if (props.mediaUrl) {
      setRetryCount(0);
      setVideoError(null);
    }
  });

  const openInExternalPlayer = async () => {
    setLaunching(true);
    setLaunchError(null);
    try {
      const res = await rpc.request.openExternal({
        drivePath: props.drivePath,
        relativePath: props.item.current_relative_path,
      });
      if (!res.success) {
        setLaunchError(res.error || "Failed to launch external player");
      }
    } catch (err: any) {
      setLaunchError(err.message || "Failed to launch external player");
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div class="lg:col-span-2 rounded-2xl border border-base-200 bg-base-300 overflow-hidden shadow-2xl flex flex-col items-center justify-center h-[50vh] md:h-[60vh] lg:h-[65vh] p-4 relative group isolate">
      {/* Previous item button overlay */}
      <Show when={props.prevId}>
        <Link
          to="/item/$id"
          params={{ id: String(props.prevId) }}
          search={props.albumId ? { albumId: props.albumId } : undefined}
          
          class="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-2.5 sm:p-3.5 rounded-full bg-base-300/90 hover:bg-base-100 border border-base-300/80 hover:border-base-content/20 text-base-content/60 hover:text-base-content shadow-xl transition-all md:opacity-0 md:group-hover:opacity-100 opacity-90 duration-200 cursor-pointer flex items-center justify-center hover:scale-105 active:scale-95"
          title="Previous item (Left Arrow)"
        >
          <ChevronLeft class="w-5 h-5" />
        </Link>
      </Show>

      {/* Next item button overlay */}
      <Show when={props.nextId}>
        <Link
          to="/item/$id"
          params={{ id: String(props.nextId) }}
          search={props.albumId ? { albumId: props.albumId } : undefined}
          
          class="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-2.5 sm:p-3.5 rounded-full bg-base-300/90 hover:bg-base-100 border border-base-300/80 hover:border-base-content/20 text-base-content/60 hover:text-base-content shadow-lg transition-all md:opacity-0 md:group-hover:opacity-100 opacity-90 duration-200 cursor-pointer flex items-center justify-center hover:scale-105 active:scale-95"
          title="Next item (Right Arrow)"
        >
          <ChevronRight class="w-5 h-5" />
        </Link>
      </Show>

      <Show
        when={props.isVideo}
        fallback={
          <img
            src={props.mediaUrl}
            alt={props.fileName}
            class="w-full h-full max-h-[70vh] object-contain rounded-lg shadow-lg"
          />
        }
      >
        <video
          ref={videoRef}
          controls
          autoplay
          src={props.mediaUrl}
          onPlay={() => setThumbnailsPaused(true)}
          onPause={() => setThumbnailsPaused(false)}
          onEnded={() => setThumbnailsPaused(false)}
          onError={(e) => {
            const video = e.currentTarget;
            const error = video.error;
            const errorMsg = `Video error: Code ${error?.code} (${error?.message || "Unknown error"})`;

            const MAX_RETRIES = 3;
            if (error?.code === 3 && retryCount() < MAX_RETRIES) {
              const nextRetry = retryCount() + 1;
              setRetryCount(nextRetry);
              setVideoError(
                `Retrying playback (${nextRetry}/${MAX_RETRIES})...`,
              );
              const currentTime = video.currentTime;
              video.pause();
              video.src = "";
              video.load();
              setTimeout(() => {
                if (videoRef) {
                  videoRef.src = `${props.mediaUrl}&retry=${nextRetry}&t=${Date.now()}`;
                  videoRef.currentTime = currentTime;
                  videoRef.play().catch(() => {});
                }
              }, 100 * nextRetry);
            } else if (error?.code === 3) {
              setVideoError(`${errorMsg} - Max retries exceeded`);
            } else {
              setVideoError(errorMsg);
            }
            setThumbnailsPaused(false);
          }}
          style={{
            transform: "translateZ(0)",
            "backface-visibility": "hidden",
          }}
          class="w-full h-full max-h-[70vh] object-contain rounded-lg bg-black"
        />
        <button
          onClick={openInExternalPlayer}
          disabled={launching()}
          style={{ transform: "translateZ(0)" }}
          class="absolute top-3 right-3 z-10 btn btn-xs btn-ghost bg-base-300/90 border border-base-300 text-base-content/80 hover:text-base-content font-bold flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Open in external player (Haruna, VLC, or system player)"
        >
          <Show
            when={launching()}
            fallback={<ExternalLink class="w-3.5 h-3.5" />}
          >
            <Loader2 class="w-3.5 h-3.5 animate-spin" />
          </Show>
          <span class="hidden sm:inline">Open in Haruna / VLC</span>
        </button>
        <Show when={launchError()}>
          <p class="absolute bottom-3 left-1/2 -translate-x-1/2 text-error text-[11px] bg-base-300/80 px-2 py-1 rounded-md border border-error/20">
            {launchError()}
          </p>
        </Show>
        <Show when={videoError()}>
          <p class="absolute bottom-3 left-1/2 -translate-x-1/2 text-error text-[11px] bg-base-300/80 px-2 py-1 rounded-md border border-error/20 max-w-xs">
            {videoError()}
          </p>
        </Show>
      </Show>

      {/* Transition Loading Overlay inside player */}
      <Show when={props.loading}>
        <div
          style={{ transform: "translateZ(0)" }}
          class="absolute inset-0 bg-base-300/85 flex flex-col items-center justify-center z-20 transition-all duration-300"
        >
          <Loader2 class="w-8 h-8 text-primary animate-spin mb-2" />
          <p class="text-base-content/60 text-xs font-bold">
            Loading media details...
          </p>
        </div>
      </Show>
    </div>
  );
}
