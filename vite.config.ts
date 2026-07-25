import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig(({ mode }) => {
  // `import.meta.env` isn't available in the config file (it runs in Node
  // before Vite injects env vars), so load .env explicitly. The empty prefix
  // loads all vars, not just VITE_-prefixed ones.
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      TanStackRouterVite({
        routesDirectory: "./routes",
        generatedRouteTree: "./routeTree.gen.ts",
      }),
      react(),
      tailwindcss(),
    ],
    root: "src/mainview",
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src/mainview"),
      },
    },
    build: {
      outDir: "../../dist",
      emptyOutDir: true,
    },
    server: {
      port: Number(env.VITE_DEV_PORT ?? 5173),
      strictPort: true,
    },
  };
});
