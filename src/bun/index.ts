import { BrowserWindow, BrowserView, Updater } from "electrobun/bun";
import type { MainRPC } from "../shared/rpc";
import { addLog } from "./logger";
import { startMediaServer } from "./media-server";
import { requestHandlers } from "./handlers";
// if (process.platform === "linux") {
//   process.env.WEBKIT_GST_DISABLE_HW_DECODERS = "1";
// }
const DEV_SERVER_URL = "http://localhost:5173";

// Check if Vite dev server is running for HMR, retrying while it warms up.
async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel();
  if (channel === "dev") {
    for (let i = 0; i < 15; i++) {
      try {
        await fetch(DEV_SERVER_URL, { method: "HEAD" });
        console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
        return DEV_SERVER_URL;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    console.log(
      "Vite dev server not running. Run 'bun run dev:hmr' for HMR support.",
    );
  }
  return "views://mainview/index.html";
}

// Define the RPC handlers
const rpc = BrowserView.defineRPC<MainRPC>({
  handlers: {
    requests: requestHandlers,
  },
});

// Local HTTP server that serves media files (with range support) and thumbnails
// to the webview, bypassing CORS/file-scheme security policies.
startMediaServer();

// Create the main application window
const url = await getMainViewUrl();

new BrowserWindow({
  title: "React + Tailwind + Vite",
  url,
  contextIsolation: true,
  rpc,
  frame: {
    width: 900,
    height: 700,
    x: 200,
    y: 200,
  },
  // Windows only: disable the GPU process to avoid WebView2 media pipeline
  // crashes. --disable-gpu alone lets SwiftShader (software rasterizer) take
  // over; the other flags that were here broke that fallback:
  //   --disable-software-rasterizer  → killed SwiftShader → no frame surface
  //   --disable-direct-composition   → killed fullscreen video presentation
  //   --disable-gpu-compositing      → fought against the software compositor
  // Net effect was audio-only black screen in fullscreen and stuck seeking.
  ...(process.platform === "win32"
    ? ({
        webview: {
          backgroundThrottling: false,
          additionalArguments: ["--disable-gpu"],
        },
      } as any)
    : {}),
} as any);

addLog("info", "React Tailwind Vite app started!");
