import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "react-tailwind-vite",
    identifier: "reacttailwindvite.electrobun.dev",
    version: "0.0.1",
  },
  build: {
    // Vite builds to dist/, we copy from there
    copy: {
      "dist/index.html": "views/mainview/index.html",
      "dist/assets": "views/mainview/assets",
    },
    // Ignore Vite output in watch mode — HMR handles view rebuilds separately
    watchIgnore: ["dist/**"],
    mac: {
      bundleCEF: false,
    },
    linux: {
      bundleCEF: true,
      chromiumFlags: {
        "ozone-platform-hint": "auto", // pick Wayland when available, else X11 — kills the GLX errors
        // if "auto" still lands on X11, make it explicit instead:
        // "ozone-platform": "wayland",
        "disable-gpu-compositing": true, // no GPU adapter here → keep compositing off the dead GPU path
      },
    },

    win: {
      bundleCEF: false,
    },
  },
} satisfies ElectrobunConfig;
