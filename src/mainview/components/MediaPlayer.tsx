import { memo, useCallback, useEffect, useState, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, ExternalLink, Loader2 } from "lucide-react";
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

export const MediaPlayer = memo(function MediaPlayer(props: MediaPlayerProps) {
  const {
    item,
    drivePath,
    mediaUrl,
    fileName,
    isVideo,
    prevId,
    nextId,
    albumId,
    loading,
  } = props;
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Pause backend ffmpeg thumbnail generation while a video is actually
  // playing so it doesn't steal CPU from the (software-decoded) playback.
  const setThumbnailsPaused = useCallback((paused: boolean) => {
    rpc.request.setThumbnailGenerationPaused({ paused }).catch(() => {});
  }, []);

  // Safety net: always resume when leaving the player so generation can never
  // get stuck paused if the video is unmounted mid-playback (e.g. navigation).
  useEffect(() => {
    return () => setThumbnailsPaused(false);
  }, [setThumbnailsPaused]);

  useEffect(() => {
    if (mediaUrl) {
      console.log("[MediaPlayer] Video URL changed:", mediaUrl);
      console.log("[MediaPlayer] File name:", fileName);
      const ext = fileName?.split(".").pop()?.toLowerCase();
      console.log("[MediaPlayer] File extension:", ext);
      setRetryCount(0); // Reset retry counter on new URL
    }
  }, [mediaUrl, fileName]);

  const openInExternalPlayer = async () => {
    setLaunching(true);
    setLaunchError(null);
    try {
      const res = await rpc.request.openExternal({
        drivePath,
        relativePath: item.current_relative_path,
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

  // return <></>;

  return (
    <div className="lg:col-span-2 rounded-2xl border border-base-200 bg-base-300 overflow-hidden shadow-2xl flex flex-col items-center justify-center h-[50vh] md:h-[60vh] lg:h-[65vh] p-4 relative group isolate">
      {/* Previous item button overlay */}
      {prevId && (
        <Link
          to="/item/$id"
          params={{ id: String(prevId) }}
          search={{ albumId }}
          /* will-change promotes this overlay to its own compositing layer so
             WebKit draws it above the video surface instead of blending into
             the holepunch region (the source of the ghosting/trails). */
          style={{ willChange: "transform" }}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-2.5 sm:p-3.5 rounded-full bg-base-300/90 hover:bg-base-100 border border-base-300/80 hover:border-base-content/20 text-base-content/60 hover:text-base-content shadow-xl transition-all md:opacity-0 md:group-hover:opacity-100 opacity-90 duration-200 cursor-pointer flex items-center justify-center hover:scale-105 active:scale-95"
          title="Previous item (Left Arrow)"
        >
          <ChevronLeft className="w-5 h-5" />
        </Link>
      )}

      {/* Next item button overlay */}
      {nextId && (
        <Link
          to="/item/$id"
          params={{ id: String(nextId) }}
          search={{ albumId }}
          style={{ willChange: "transform" }}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-2.5 sm:p-3.5 rounded-full bg-base-300/90 hover:bg-base-100 border border-base-300/80 hover:border-base-content/20 text-base-content/60 hover:text-base-content shadow-lg transition-all md:opacity-0 md:group-hover:opacity-100 opacity-90 duration-200 cursor-pointer flex items-center justify-center hover:scale-105 active:scale-95"
          title="Next item (Right Arrow)"
        >
          <ChevronRight className="w-5 h-5" />
        </Link>
      )}

      {isVideo ? (
        <>
          <video
            ref={videoRef}
            key={item.id}
            controls
            autoPlay
            src={mediaUrl}
            onPlay={() => {
              console.log("[MediaPlayer] Video playing");
              setThumbnailsPaused(true);
            }}
            onPause={() => {
              console.log("[MediaPlayer] Video paused");
              setThumbnailsPaused(false);
            }}
            onEnded={() => {
              console.log("[MediaPlayer] Video ended");
              setThumbnailsPaused(false);
            }}
            onError={(e) => {
              const video = e.target as HTMLVideoElement;
              const error = video.error;
              const errorMsg = `Video error: Code ${error?.code} (${error?.message || 'Unknown error'})`;
              console.error("[MediaPlayer]", errorMsg);
              console.error("[MediaPlayer] Video src:", mediaUrl);
               
              // Retry logic for MEDIA_ERR_DECODE (code 3)
              const MAX_RETRIES = 3;
              if (error?.code === 3 && retryCount < MAX_RETRIES) {
                const nextRetry = retryCount + 1;
                console.log(`[MediaPlayer] Decode error, retrying (${nextRetry}/${MAX_RETRIES})...`);
                setRetryCount(nextRetry);
                setVideoError(`Retrying playback (${nextRetry}/${MAX_RETRIES})...`);
                 
                const currentTime = video.currentTime;
                video.pause();
                video.src = ""; // Detach to reset pipeline
                video.load();
                 
                // Exponential backoff: 100ms, 200ms, 300ms
                const backoffDelay = 100 * nextRetry;
                setTimeout(() => {
                  if (videoRef.current) {
                    // Add cache-buster and retry param
                    const retryUrl = `${mediaUrl}&retry=${nextRetry}&t=${Date.now()}`;
                    console.log(`[MediaPlayer] Retrying with URL:`, retryUrl);
                    videoRef.current.src = retryUrl;
                    videoRef.current.currentTime = currentTime;
                    videoRef.current.play().catch(err => console.error("[MediaPlayer] Retry play failed:", err));
                  }
                }, backoffDelay);
              } else if (error?.code === 3) {
                setVideoError(`${errorMsg} - Max retries exceeded`);
              } else {
                setVideoError(errorMsg);
              }
              setThumbnailsPaused(false);
            }}
            onLoadedMetadata={(e) => {
              const video = e.target as HTMLVideoElement;
              console.log("[MediaPlayer] Metadata loaded, duration:", video.duration);
            }}
            onLoadStart={() => console.log("[MediaPlayer] Load started")}
            onLoadedData={() => console.log("[MediaPlayer] Data loaded")}
            onCanPlay={() => console.log("[MediaPlayer] Can play")}
            onCanPlayThrough={() => console.log("[MediaPlayer] Can play through")}
            onSeeking={() => console.log("[MediaPlayer] Seeking...")}
            onSeeked={() => console.log("[MediaPlayer] Seek completed")}
            onStalled={() => {
              console.warn("[MediaPlayer] Download stalled!");
            }}
            onSuspend={() => {
              console.warn("[MediaPlayer] Download suspended!");
            }}
            /* Promote the video to its own GPU compositing layer so overlaid
               controls composite cleanly above it (prevents WebKit ghosting). */
            style={{ transform: "translateZ(0)", backfaceVisibility: "hidden" }}
            className="w-full h-full max-h-[70vh] object-contain rounded-lg bg-black"
          />
          <button
            onClick={openInExternalPlayer}
            disabled={launching}
            /* No backdrop-blur here: backdrop-filter sampled over a playing
               video is what produced the random ghosting/trails in WebKit.
               translateZ(0) keeps this control on its own compositing layer. */
            style={{ transform: "translateZ(0)" }}
            className="absolute top-3 right-3 z-10 btn btn-xs btn-ghost bg-base-300/90 border border-base-300 text-base-content/80 hover:text-base-content font-bold flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Open in external player (Haruna, VLC, or system player)"
          >
            {launching ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ExternalLink className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">Open in Haruna / VLC</span>
          </button>
          {launchError && (
            <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-error text-[11px] bg-base-300/80 px-2 py-1 rounded-md border border-error/20">
              {launchError}
            </p>
          )}
          {videoError && (
            <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-error text-[11px] bg-base-300/80 px-2 py-1 rounded-md border border-error/20 max-w-xs">
              {videoError}
            </p>
          )}
        </>
      ) : (
        <img
          key={item.id}
          src={mediaUrl}
          alt={fileName}
          className="w-full h-full max-h-[70vh] object-contain rounded-lg shadow-lg"
        />
      )}

      {/* Transition Loading Overlay inside player */}
      {loading && (
        <div
          style={{ transform: "translateZ(0)" }}
          className="absolute inset-0 bg-base-300/85 flex flex-col items-center justify-center z-20 transition-all duration-300"
        >
          <Loader2 className="w-8 h-8 text-primary animate-spin mb-2" />
          <p className="text-base-content/60 text-xs font-bold">
            Loading media details...
          </p>
        </div>
      )}
    </div>
  );
});
