import { render } from "solid-js/web";
import {
  RouterProvider,
  createRouter,
  createHashHistory,
} from "@tanstack/solid-router";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import "./index.css";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

// Silence two known-benign console errors:
// 1. "ResizeObserver loop completed with undelivered notifications"
// 2. AbortError on rapid video navigation
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

// Use hash history so routing is independent of the page's base URL in Electrobun.
const router = createRouter({
  routeTree,
  history: createHashHistory(),
  context: {
    queryClient,
  },
});

// Register the router instance for type safety
declare module "@tanstack/solid-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root")!;
render(
  () => (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  ),
  rootElement,
);
