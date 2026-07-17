import { createFileRoute } from "@tanstack/react-router";
import { SystemLogs } from "@/components/SystemLogs";

export const Route = createFileRoute("/about")({
  component: About,
});

function About() {
  return (
    <div className="max-w-4xl mx-auto space-y-10">
      {/* Header */}
      <div className="space-y-3">
        <h2 className="text-3xl font-extrabold text-white">
          System Architecture & Specifications
        </h2>
        <p className="text-slate-400 text-sm max-w-xl">
          Explore how the Electrobun Native Bridge coordinates with React, Vite,
          and TanStack Router to build cross-platform desktop shells.
        </p>
      </div>

      <SystemLogs />

      {/* Info Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Main Process Info */}
        <div className="p-6 rounded-2xl bg-base-100/40 border border-slate-850 hover:border-slate-800 transition-colors">
          <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <span className="text-indigo-400 font-extrabold font-mono">BUN</span>
            Main Native Process
          </h3>
          <p className="text-slate-400 text-sm leading-relaxed mb-4">
            The main process is executed inside the Bun runtime. It controls
            system-level window creation, system tray interactions, updater
            tools, file system access, and native modules using Zig.
          </p>
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-900 font-mono text-xs text-indigo-300">
            Path: src/bun/index.ts
          </div>
        </div>

        {/* Renderer Process Info */}
        <div className="p-6 rounded-2xl bg-base-100/40 border border-slate-850 hover:border-slate-800 transition-colors">
          <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <span className="text-purple-400 font-extrabold font-mono">WEB</span>
            Renderer View Process
          </h3>
          <p className="text-slate-400 text-sm leading-relaxed mb-4">
            The renderer runs inside a WebKit window. It handles the user
            interface, frontend state management, CSS styling, client-side
            routing, and RPC bridge communication.
          </p>
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-900 font-mono text-xs text-purple-300">
            Path: src/mainview/routes/
          </div>
        </div>
      </div>

      {/* How Routing Works Section */}
      <section className="p-8 rounded-3xl bg-base-100/20 border border-slate-900/80 space-y-6">
        <h3 className="text-xl font-bold text-white">
          How Router Integration Works
        </h3>
        <p className="text-slate-400 text-sm leading-relaxed">
          TanStack Router employs high-performance, type-safe, file-based
          routing. The Vite configuration leverages `@tanstack/router-plugin`
          which monitors the{" "}
          <code className="bg-slate-950 px-2 py-0.5 rounded text-slate-300 font-mono">
            src/mainview/routes/
          </code>{" "}
          directory.
        </p>
        <div className="p-5 rounded-2xl bg-slate-950/70 border border-slate-900/60 space-y-3">
          <h4 className="text-xs font-bold text-slate-500 tracking-wider">
            ROUTING WORKFLOW
          </h4>
          <ol className="list-decimal list-inside space-y-2 text-xs text-slate-400 font-mono">
            <li>
              Add files like{" "}
              <code className="text-indigo-400">my-route.tsx</code> to{" "}
              <code className="text-indigo-400">src/mainview/routes/</code>.
            </li>
            <li>
              The Vite compiler generates the complete route tree at{" "}
              <code className="text-indigo-400">src/mainview/routeTree.gen.ts</code>.
            </li>
            <li>
              <code className="text-indigo-400">src/mainview/main.tsx</code>{" "}
              loads this route tree into the RouterProvider.
            </li>
            <li>
              All routes are resolved statically, providing absolute compiler
              type safety.
            </li>
          </ol>
        </div>
      </section>

      {/* Developer Command Reference */}
      <section className="space-y-4">
        <h3 className="text-lg font-bold text-white">Verification & Tools</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-base-100/30 border border-slate-900">
            <span className="text-xs text-slate-500 font-mono block mb-1">TYPECHECKING</span>
            <p className="text-xs text-slate-300 font-mono mb-2">bun run typecheck</p>
            <span className="text-slate-400 text-xs">
              Uses Go-based native compiler (tsgo) for instant type checking.
            </span>
          </div>
          <div className="p-4 rounded-xl bg-base-100/30 border border-slate-900">
            <span className="text-xs text-slate-500 font-mono block mb-1">PRODUCTION COMPILE</span>
            <p className="text-xs text-slate-300 font-mono mb-2">bun run build:canary</p>
            <span className="text-slate-400 text-xs">
              Bundles assets and builds the Electrobun binary for canary release.
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
