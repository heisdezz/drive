import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { rpc } from "@/lib/rpc";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Copy,
  Info,
  Pause,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  Terminal,
} from "lucide-react";

interface Log {
  timestamp: string;
  level: "info" | "warn" | "error" | "failure" | string;
  message: string;
  context?: string;
}

const LEVELS = ["all", "info", "warn", "error", "failure"] as const;

const LEVEL_META: Record<
  string,
  { badgeClass: string; Icon: React.FC<{ className?: string }> }
> = {
  info: {
    badgeClass: "badge-info text-info-content",
    Icon: Info,
  },
  warn: {
    badgeClass: "badge-warning text-warning-content",
    Icon: AlertTriangle,
  },
  error: {
    badgeClass: "badge-error text-error-content",
    Icon: AlertCircle,
  },
  failure: {
    badgeClass: "badge-error badge-outline font-extrabold animate-pulse",
    Icon: ShieldAlert,
  },
};

const LogRow = memo(
  function LogRow({ log }: { log: Log }) {
    const [copied, setCopied] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const { badgeClass, Icon } = LEVEL_META[log.level] ?? {
      badgeClass: "badge-ghost text-base-content/60",
      Icon: Info,
    };

    const handleCopy = () => {
      const payload = `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}${
        log.context ? `\nContext: ${log.context}` : ""
      }`;
      navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    return (
      <div className="p-3.5 bg-base-200/30 hover:bg-base-200/80 transition-colors duration-150 flex flex-col gap-2 font-mono text-xs group">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="badge badge-ghost badge-xs text-[10px] font-mono text-base-content/50 px-2 py-1">
              {new Date(log.timestamp).toLocaleTimeString()}
            </span>
            <span
              className={`badge badge-sm font-bold uppercase tracking-wider gap-1.5 px-2.5 py-1 ${badgeClass}`}
            >
              <Icon className="w-3 h-3" />
              {log.level}
            </span>
          </div>

          <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
            {log.context && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="btn btn-ghost btn-xs text-[10px] font-sans text-base-content/60 hover:text-base-content"
              >
                {expanded ? "Hide Details" : "Show Context"}
              </button>
            )}
            <button
              onClick={handleCopy}
              className="btn btn-ghost btn-square btn-xs text-base-content/50 hover:text-base-content"
              title="Copy log entry to clipboard"
            >
              {copied ? (
                <Check className="w-3 h-3 text-success" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </div>
        </div>

        <div className="min-w-0">
          <p className="text-base-content/90 break-words leading-relaxed font-sans text-xs">
            {log.message}
          </p>
          {log.context && expanded && (
            <div className="mt-2.5 p-3 rounded-lg bg-base-300/80 border border-base-300 text-[11px] font-mono text-base-content/70 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed shadow-inner">
              {log.context}
            </div>
          )}
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.log.timestamp === next.log.timestamp &&
    prev.log.level === next.log.level &&
    prev.log.message === next.log.message &&
    prev.log.context === next.log.context,
);

export function SystemLogs() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [filterLevel, setFilterLevel] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await rpc.request.getLogs();
      if (res.logs) setLogs(res.logs);
    } catch (err) {
      console.error("Failed to fetch logs:", err);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 1500);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  const filteredLogs = useMemo(() => {
    return logs
      .filter((l) => {
        const matchesLevel = filterLevel === "all" || l.level === filterLevel;
        const query = searchQuery.trim().toLowerCase();
        const matchesQuery =
          !query ||
          l.message.toLowerCase().includes(query) ||
          l.context?.toLowerCase().includes(query) ||
          l.level.toLowerCase().includes(query);
        return matchesLevel && matchesQuery;
      })
      .slice()
      .reverse();
  }, [logs, filterLevel, searchQuery]);

  return (
    <div className="card bg-base-100/40 border border-base-200/80 shadow-xl overflow-hidden">
      <div className="card-body p-6 space-y-4">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-inner">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="card-title text-base font-black text-base-content tracking-tight">
                  Application System Logs
                </h3>
                <span className="badge badge-sm badge-outline border-base-300 font-mono font-bold text-base-content/60">
                  {filteredLogs.length} / {logs.length}
                </span>
              </div>
              <p className="text-base-content/50 text-xs">
                Real-time console traces and runtime diagnostic logs.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter Level Join Buttons */}
            <div className="join border border-base-300 rounded-lg p-0.5 bg-base-200/50">
              {LEVELS.map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setFilterLevel(lvl)}
                  className={`btn btn-xs join-item capitalize font-bold ${
                    filterLevel === lvl
                      ? "btn-primary text-primary-content shadow-xs"
                      : "btn-ghost text-base-content/60 hover:text-base-content"
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>

            {/* Auto Refresh Toggle */}
            <button
              onClick={() => setAutoRefresh((v) => !v)}
              className={`btn btn-sm font-bold flex items-center gap-1.5 ${
                autoRefresh
                  ? "btn-primary shadow-md shadow-primary/20"
                  : "btn-outline border-base-300 text-base-content/60"
              }`}
              title={autoRefresh ? "Pause Live Log Stream" : "Resume Live Log Stream"}
            >
              {autoRefresh ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span className="text-xs">Live</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span className="text-xs">Paused</span>
                </>
              )}
            </button>

            {/* Manual Refresh */}
            <button
              onClick={fetchLogs}
              className="btn btn-ghost btn-square btn-sm text-base-content/60 hover:text-base-content border border-base-300"
              title="Force Refresh Log Entries"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Filter / Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-base-content/40 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search log messages, paths, or contexts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input input-sm input-bordered w-full pl-9 bg-base-200/60 border-base-300 text-xs focus:border-primary text-base-content"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="btn btn-ghost btn-xs btn-square absolute right-2 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content"
            >
              ✕
            </button>
          )}
        </div>

        {/* Log Viewer Window */}
        <div className="rounded-xl border border-base-300 bg-base-300/40 overflow-hidden max-h-96 overflow-y-auto divide-y divide-base-300/60 shadow-inner">
          {filteredLogs.length === 0 ? (
            <div className="p-12 text-center text-base-content/40 space-y-2">
              <Terminal className="w-8 h-8 mx-auto opacity-30" />
              <p className="text-xs font-semibold">
                No matching system log events found.
              </p>
              <p className="text-[10px] text-base-content/30">
                Try clearing search filter or switching level tabs.
              </p>
            </div>
          ) : (
            filteredLogs.map((log, index) => (
              <LogRow
                key={`${log.timestamp}-${log.level}-${index}`}
                log={log}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
