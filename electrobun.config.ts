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
    useAsar: true,
    bun: {
      entrypoint: "src/bun/index.ts",
      external: [],
    },
    // Ignore Vite output in watch mode — HMR handles view rebuilds separately
    watchIgnore: ["dist/**"],
    mac: {
      bundleCEF: false,
    },
    linux: {
      bundleCEF: false,
      chromiumFlags: {
        "ozone-platform-hint": "auto",
        "disable-gpu": false,
        // "ignore-gpu-blocklist": true,
        // "enable-gpu-rasterization": true,
        // "enable-zero-copy": true,
        // "enable-features":
        //   "VaapiVideoDecoder,VaapiVideoEncoder,CanvasOopRasterization",
        "disable-web-security": true,
        "disable-site-isolation-trials": true,
      },
    },
    win: {
      bundleCEF: false,
    },
  },
} satisfies ElectrobunConfig;
