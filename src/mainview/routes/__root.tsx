import { createRootRoute, Outlet, useLocation } from "@tanstack/react-router";
import Sidebar from "@/components/Sidebar";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const location = useLocation();

  const getPageTitle = () => {
    switch (location.pathname) {
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
    <div className="h-screen w-screen overflow-hidden flex text-slate-100 font-sans select-none">
      {/* Left Sidebar */}
      <Sidebar />

      {/* Right Content Area */}
      <div className="flex-grow flex flex-col h-full bg-base-100 overflow-hidden">
        {/* Top Window/App Header Toolbar */}
        <header className="h-12 flex-shrink-0 flex items-center justify-between px-6 border-b border-slate-900/60 bg-slate-950/20">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white">
              {getPageTitle()}
            </span>
            <span className="text-[10px] text-slate-500">/</span>
            <span className="text-[10px] text-slate-500 font-mono">
              {location.pathname}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-success"></span>
              <span className="text-[9px] font-mono text-slate-400">
                WebKit HMR
              </span>
            </div>
          </div>
        </header>

        {/* Independent Scrollable Content Viewport */}
        <main className="flex-grow overflow-y-auto p-6 sm:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
