import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { rpc } from "@/lib/rpc";
import {
	Terminal,
	ShieldAlert,
	AlertTriangle,
	AlertCircle,
	Info,
	RefreshCw
} from "lucide-react";

export const Route = createFileRoute("/about")({
	component: About,
});

function About() {
	const [logs, setLogs] = useState<any[]>([]);
	const [filterLevel, setFilterLevel] = useState<string>("all");
	const [autoRefresh, setAutoRefresh] = useState(true);

	const fetchLogs = async () => {
		try {
			const res = await rpc.request.getLogs();
			if (res.logs) {
				setLogs(res.logs);
			}
		} catch (err) {
			console.error("Failed to fetch logs:", err);
		}
	};

	useEffect(() => {
		fetchLogs();
		if (!autoRefresh) return;
		const interval = setInterval(fetchLogs, 1500);
		return () => clearInterval(interval);
	}, [autoRefresh]);

	const filteredLogs = logs.filter(log => {
		if (filterLevel === "all") return true;
		return log.level === filterLevel;
	});

	return (
		<div className="max-w-4xl mx-auto space-y-10">
			{/* Header */}
			<div className="space-y-3">
				<h2 className="text-3xl font-extrabold text-white">System Architecture & Specifications</h2>
				<p className="text-slate-400 text-sm max-w-xl">
					Explore how the Electrobun Native Bridge coordinates with React, Vite, and TanStack Router to build cross-platform desktop shells.
				</p>
			</div>

			{/* Real-time System Logs */}
			<section className="p-6 rounded-3xl bg-slate-900/30 border border-slate-900 space-y-4">
				<div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
					<div>
						<h3 className="text-lg font-bold text-white flex items-center gap-2">
							<Terminal className="w-5 h-5 text-primary" /> Application System Logs
						</h3>
						<p className="text-slate-400 text-xs mt-1">
							Real-time console traces. Monitored up to 1000 rolling events.
						</p>
					</div>

					<div className="flex items-center gap-2">
						{/* Level Filters */}
						<div className="join">
							{["all", "info", "warn", "error", "failure"].map((lvl) => (
								<button
									key={lvl}
									onClick={() => setFilterLevel(lvl)}
									className={`btn btn-xs join-item capitalize ${
										filterLevel === lvl 
											? "btn-primary font-bold" 
											: "btn-outline border-slate-800 text-slate-400"
									}`}
								>
									{lvl}
								</button>
							))}
						</div>

						{/* Auto Refresh Toggle */}
						<button 
							onClick={() => setAutoRefresh(!autoRefresh)}
							className={`btn btn-square btn-xs border-slate-800 ${autoRefresh ? "btn-primary" : "btn-outline text-slate-500"}`}
							title="Toggle auto-refresh logs"
						>
							<RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? "animate-spin" : ""}`} />
						</button>
					</div>
				</div>

				<div className="bg-slate-950 border border-slate-900 rounded-xl overflow-hidden font-mono text-xs max-h-96 overflow-y-auto flex flex-col divide-y divide-slate-900/50">
					{filteredLogs.length === 0 ? (
						<div className="p-8 text-center text-slate-650 italic">
							No matching log events found.
						</div>
					) : (
						filteredLogs.slice().reverse().map((log, index) => {
							let levelColor = "text-slate-400";
							let Icon = Info;
							switch (log.level) {
								case "info":
									levelColor = "text-sky-400 bg-sky-950/20";
									Icon = Info;
									break;
								case "warn":
									levelColor = "text-amber-400 bg-amber-950/20";
									Icon = AlertTriangle;
									break;
								case "error":
									levelColor = "text-rose-400 bg-rose-950/20";
									Icon = AlertCircle;
									break;
								case "failure":
									levelColor = "text-purple-400 bg-purple-950/20 border border-purple-900/40";
									Icon = ShieldAlert;
									break;
							}
							return (
								<div key={index} className="p-3 hover:bg-slate-900/10 flex flex-col sm:flex-row sm:items-start gap-2.5 transition-colors duration-150">
									<div className="flex items-center gap-1.5 flex-shrink-0">
										<span className="text-[10px] text-slate-600">
											{new Date(log.timestamp).toLocaleTimeString()}
										</span>
										<span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold flex items-center gap-1 leading-none ${levelColor}`}>
											<Icon className="w-3 h-3" />
											{log.level}
										</span>
									</div>
									<div className="flex-grow min-w-0">
										<p className="text-slate-300 break-words leading-normal font-sans">{log.message}</p>
										{log.context && (
											<pre className="text-[10px] text-slate-500 bg-slate-950/50 p-2 rounded mt-2 border border-slate-900 overflow-x-auto whitespace-pre-wrap break-all leading-normal">
												{log.context}
											</pre>
										)}
									</div>
								</div>
							);
						})
					)}
				</div>
			</section>

			{/* Info Grid */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
				{/* Main Process Info */}
				<div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-850 hover:border-slate-800 transition-colors">
					<h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
						<span className="text-indigo-400 font-extrabold font-mono">BUN</span>
						Main Native Process
					</h3>
					<p className="text-slate-400 text-sm leading-relaxed mb-4">
						The main process is executed inside the Bun runtime. It controls system-level window creation, system tray interactions, updater tools, file system access, and native modules using Zig.
					</p>
					<div className="bg-slate-950 p-3 rounded-xl border border-slate-900 font-mono text-xs text-indigo-300">
						Path: src/bun/index.ts
					</div>
				</div>

				{/* Renderer Process Info */}
				<div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-850 hover:border-slate-800 transition-colors">
					<h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
						<span className="text-purple-400 font-extrabold font-mono">WEB</span>
						Renderer View Process
					</h3>
					<p className="text-slate-400 text-sm leading-relaxed mb-4">
						The renderer runs inside a WebKit window. It handles the user interface, frontend state management, CSS styling, client-side routing, and RPC bridge communication.
					</p>
					<div className="bg-slate-950 p-3 rounded-xl border border-slate-900 font-mono text-xs text-purple-300">
						Path: src/mainview/routes/
					</div>
				</div>
			</div>

			{/* How Routing Works Section */}
			<section className="p-8 rounded-3xl bg-slate-900/20 border border-slate-900/80 space-y-6">
				<h3 className="text-xl font-bold text-white">How Router Integration Works</h3>
				<p className="text-slate-400 text-sm leading-relaxed">
					TanStack Router employs high-performance, type-safe, file-based routing. The Vite configuration leverages `@tanstack/router-plugin` which monitors the <code className="bg-slate-950 px-2 py-0.5 rounded text-slate-300 font-mono">src/mainview/routes/</code> directory.
				</p>
				<div className="p-5 rounded-2xl bg-slate-950/70 border border-slate-900/60 space-y-3">
					<h4 className="text-xs font-bold text-slate-500 tracking-wider">ROUTING WORKFLOW</h4>
					<ol className="list-decimal list-inside space-y-2 text-xs text-slate-400 font-mono">
						<li>Add files like <code className="text-indigo-400">my-route.tsx</code> to <code className="text-indigo-400">src/mainview/routes/</code>.</li>
						<li>The Vite compiler generates the complete route tree at <code className="text-indigo-400">src/mainview/routeTree.gen.ts</code>.</li>
						<li><code className="text-indigo-400">src/mainview/main.tsx</code> loads this route tree into the RouterProvider.</li>
						<li>All routes are resolved statically, providing absolute compiler type safety.</li>
					</ol>
				</div>
			</section>

			{/* Developer Command Reference */}
			<section className="space-y-4">
				<h3 className="text-lg font-bold text-white">Verification & Tools</h3>
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<div className="p-4 rounded-xl bg-slate-900/30 border border-slate-900">
						<span className="text-xs text-slate-500 font-mono block mb-1">TYPECHECKING</span>
						<p className="text-xs text-slate-300 font-mono mb-2">bun run typecheck</p>
						<span className="text-slate-400 text-xs">Uses Go-based native compiler (tsgo) for instant type checking.</span>
					</div>
					<div className="p-4 rounded-xl bg-slate-900/30 border border-slate-900">
						<span className="text-xs text-slate-500 font-mono block mb-1">PRODUCTION COMPILE</span>
						<p className="text-xs text-slate-300 font-mono mb-2">bun run build:canary</p>
						<span className="text-slate-400 text-xs">Bundles assets and builds the Electrobun binary for canary release.</span>
					</div>
				</div>
			</section>
		</div>
	);
}
