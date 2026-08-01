// import { scan } from "react-scan/all-environments";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  RouterProvider,
  createRouter,
  createHashHistory,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

// Enable when loaded from the Vite HMR dev server (not the built views:// bundle)
// Attempt to dynamically import react-scan if available; ignore failures.
void (async () => {
  try {
    const mod = await import("react-scan/all-environments");
    if (mod?.scan) mod.scan({ enabled: true });
  } catch {
    // react-scan not available in built views bundle — ignore silently
  }
})();

// Silence two known-benign console errors that are just noise here:
// 1. "ResizeObserver loop completed with undelivered notifications" — fired by
//    layout/animation churn (virtualized grids, hover transitions). It's a
//    warning that the browser deferred a resize callback, not a real failure.
// 2. AbortError — the <video> load/play is aborted when you navigate between
//    items faster than a clip can start; the aborted request is expected.
window.addEventListener("error", (e) => {
  if (e.message?.includes("ResizeObserver loop")) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});
window.addEventListener("unhandledrejection", (e) => {
  if (e.reason?.name === "AbortError") {
    e.preventDefault();
  }
});

// Create QueryClient
const queryClient = new QueryClient();

// Use hash history so routing is independent of the page's base URL. In the
// built app the window loads `views://mainview/index.html`, so a browser-history
// router would read the pathname as `/mainview/index.html`, match no route, and
// render notFound. Keeping the route in the `#` fragment resolves to `/` on load
// in both dev (http://localhost:5173) and production.
const router = createRouter({
  routeTree,
  history: createHashHistory(),
  context: {
    queryClient,
  },
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root")!;
if (!rootElement.innerHTML) {
  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider
          router={router}
          scrollRestoration
          scrollRestorationBehavior="smooth"
        />
      </QueryClientProvider>
    </StrictMode>,
  );
}
