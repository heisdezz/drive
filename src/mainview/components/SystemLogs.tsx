import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { rpc } from "@/lib/rpc";
import {
  AlertCircle,
  AlertTriangle,
  Info,
  RefreshCw,
  ShieldAlert,
  Terminal,
} from "lucide-react";

interface Log {
  timestamp: string;
  level: string;
  message: string;
  context?: string;
}

const LEVELS = ["all", "info", "warn", "error", "failure"] as const;

const LEVEL_META: Record<string, { color: string; Icon: React.FC<{ className?: string }> }> = {
  info:    { color: "text-sky-400 bg-sky-950/20", Icon: Info },
  warn:    { color: "text-amber-400 bg-amber-950/20", Icon: AlertTriangle },
  error:   { color: "text-rose-400 bg-rose-950/20", Icon: AlertCircle },
  failure: { color: "text-purple-400 bg-purple-950/20 border border-purple-900/40", Icon: ShieldAlert },
};

const LogRow = memo(
  function LogRow({ log }: { log: Log }) {
    const { color, Icon } = LEVEL_META[log.level] ?? { color: "text-slate-400", Icon: Info };
    return (
      <div className="p-3 hover:bg-base-100/10 flex flex-col sm:flex-row sm:items-start gap-2.5 transition-colors duration-150">
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] text-slate-600">
            {new Date(log.timestamp).toLocaleTimeString()}
          </span>
          <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold flex items-center gap-1 leading-none ${color}`}>
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

  const filteredLogs = useMemo(
    () =>
      (filterLevel === "all" ? logs : logs.filter((l) => l.level === filterLevel))
        .slice()
        .reverse(),
    [logs, filterLevel],
  );

  return (
    <section className="p-6 rounded-3xl bg-base-100/30 border border-slate-900 space-y-4">
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
          <div className="join">
            {LEVELS.map((lvl) => (
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

          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`btn btn-square btn-xs border-slate-800 ${autoRefresh ? "btn-primary" : "btn-outline text-slate-500"}`}
            title="Toggle auto-refresh logs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="bg-slate-950 border border-slate-900 rounded-xl overflow-hidden font-mono text-xs max-h-96 overflow-y-auto flex flex-col divide-y divide-slate-900/50">
        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-slate-500 italic">
            No matching log events found.
          </div>
        ) : (
          filteredLogs.map((log) => (
            <LogRow key={`${log.timestamp}-${log.level}-${log.message.slice(0, 40)}`} log={log} />
          ))
        )}
      </div>
    </section>
  );
}
