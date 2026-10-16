import { createRootRoute, Outlet, useLocation } from "@tanstack/solid-router";
import Sidebar from "@/components/Sidebar";

export const Route = createRootRoute({
  component: RootComponent,
});

function AppHeader() {
  const location = useLocation();

  const getPageTitle = () => {
    const path = location().pathname;
    switch (path) {
      case "/":
        return "Dashboard";
      case "/counter":
        return "State Counter";
      case "/medias":
      case "/medias/":
        return "Media Library";
      case "/about":
        return "System Architecture";
      default:
        return "Drive Manager";
    }
  };

  return (
    <header class="h-16 flex-shrink-0 flex items-center justify-between px-6 border-b border-base-300 bg-base-100">
      <div class="flex items-center gap-2">
        <span class="text-xs font-bold text-white">{getPageTitle()}</span>
        <span class="text-[10px] text-slate-500">/</span>
        <span class="text-[10px] text-slate-500 font-mono">
          {location().pathname}
        </span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="inline-block h-1.5 w-1.5 rounded-full bg-success" />
        <span class="text-[9px] font-mono text-slate-400">WebKit HMR</span>
      </div>
    </header>
  );
}

function RootComponent() {
  return (
    <div class="h-screen w-screen overflow-hidden flex text-slate-100 font-sans select-none">
      <Sidebar />
      <div class="flex-grow flex flex-col h-full bg-base-100 overflow-hidden">
        <AppHeader />
        <main class="flex-grow overflow-y-auto p-6 sm:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
