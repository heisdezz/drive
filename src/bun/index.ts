import { BrowserWindow, BrowserView, Updater } from "electrobun/bun";
import type { MainRPC } from "../shared/rpc";
import { addLog } from "./logger";
import { startMediaServer } from "./media-server";
import { requestHandlers } from "./handlers";
if (process.platform === "linux") {
  process.env.WEBKIT_GST_DISABLE_HW_DECODERS = "1";
}

const DEV_SERVER_PORT = import.meta.env.VITE_DEV_PORT;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

// Check if Vite dev server is running for HMR
async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel();
  if (channel === "dev") {
    try {
      await fetch(DEV_SERVER_URL, { method: "HEAD" });
      console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
      return DEV_SERVER_URL;
    } catch {
      console.log(
        "Vite dev server not running. Run 'bun run dev:hmr' for HMR support.",
      );
    }
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
  rpc,
  frame: {
    width: 900,
    height: 700,
    x: 200,
    y: 200,
  },
});

addLog("info", "React Tailwind Vite app started!");
