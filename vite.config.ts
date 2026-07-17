import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
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
		port: 5173,
		strictPort: true,
	},
});
