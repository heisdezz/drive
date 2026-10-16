import {
  createSignal,
  createMemo,
  onMount,
  onCleanup,
  For,
  Show,
  Component,
} from "solid-js";
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
} from "lucide-solid";

interface Log {
  timestamp: string;
  level: "info" | "warn" | "error" | "failure" | string;
  message: string;
  context?: string;
}

const LEVELS = ["all", "info", "warn", "error", "failure"] as const;

const LEVEL_META: Record<
  string,
  { badgeClass: string; Icon: Component<{ class?: string }> }
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

function LogRow(props: { log: Log }) {
  const [copied, setCopied] = createSignal(false);
  const [expanded, setExpanded] = createSignal(false);

  const meta = () =>
    LEVEL_META[props.log.level] ?? {
      badgeClass: "badge-ghost text-base-content/60",
      Icon: Info,
    };

  const handleCopy = () => {
    const payload = `[${props.log.timestamp}] [${props.log.level.toUpperCase()}] ${props.log.message}${
      props.log.context ? `\nContext: ${props.log.context}` : ""
    }`;
    navigator.clipboard.writeText(payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div class="p-3.5 bg-base-200/30 hover:bg-base-200/80 transition-colors duration-150 flex flex-col gap-2 font-mono text-xs group">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <span class="badge badge-ghost badge-xs text-[10px] font-mono text-base-content/50 px-2 py-1">
            {new Date(props.log.timestamp).toLocaleTimeString()}
          </span>
          <span
            class={`badge badge-sm font-bold uppercase tracking-wider gap-1.5 px-2.5 py-1 ${meta().badgeClass}`}
          >
            {(() => {
              const IconComp = meta().Icon;
              return <IconComp class="w-3 h-3" />;
            })()}
            {props.log.level}
          </span>
        </div>

        <div class="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
          <Show when={props.log.context}>
            <button
              onClick={() => setExpanded(!expanded())}
              class="btn btn-ghost btn-xs text-[10px] font-sans text-base-content/60 hover:text-base-content"
            >
              {expanded() ? "Hide Details" : "Show Context"}
            </button>
          </Show>
          <button
            onClick={handleCopy}
            class="btn btn-ghost btn-square btn-xs text-base-content/50 hover:text-base-content"
            title="Copy log entry to clipboard"
          >
            <Show when={copied()} fallback={<Copy class="w-3 h-3" />}>
              <Check class="w-3 h-3 text-success" />
            </Show>
          </button>
        </div>
      </div>

      <div class="min-w-0">
        <p class="text-base-content/90 break-words leading-relaxed font-sans text-xs">
          {props.log.message}
        </p>
        <Show when={props.log.context && expanded()}>
          <div class="mt-2.5 p-3 rounded-lg bg-base-300/80 border border-base-300 text-[11px] font-mono text-base-content/70 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed shadow-inner">
            {props.log.context}
          </div>
        </Show>
      </div>
    </div>
  );
}

export function SystemLogs() {
  const [logs, setLogs] = createSignal<Log[]>([]);
  const [filterLevel, setFilterLevel] = createSignal("all");
  const [searchQuery, setSearchQuery] = createSignal("");
  const [autoRefresh, setAutoRefresh] = createSignal(true);

  const fetchLogs = async () => {
    try {
      const res = await rpc.request.getLogs();
      if (res.logs) setLogs(res.logs);
    } catch (err) {
      console.error("Failed to fetch logs:", err);
    }
  };

  onMount(() => {
    fetchLogs();
    const interval = setInterval(() => {
      if (autoRefresh()) {
        fetchLogs();
      }
    }, 1500);
    onCleanup(() => clearInterval(interval));
  });

  const filteredLogs = createMemo(() => {
    const level = filterLevel();
    const query = searchQuery().trim().toLowerCase();
    return logs()
      .filter((l) => {
        const matchesLevel = level === "all" || l.level === level;
        const matchesQuery =
          !query ||
          l.message.toLowerCase().includes(query) ||
          l.context?.toLowerCase().includes(query) ||
          l.level.toLowerCase().includes(query);
        return matchesLevel && matchesQuery;
      })
      .slice()
      .reverse();
  });

  return (
    <div class="card bg-base-100/40 border border-base-200/80 shadow-xl overflow-hidden">
      <div class="card-body p-6 space-y-4">
        {/* Header Section */}
        <div class="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-inner">
              <Terminal class="w-5 h-5" />
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="card-title text-base font-black text-base-content tracking-tight">
                  Application System Logs
                </h3>
                <span class="badge badge-sm badge-outline border-base-300 font-mono font-bold text-base-content/60">
                  {filteredLogs().length} / {logs().length}
                </span>
              </div>
              <p class="text-base-content/50 text-xs">
                Real-time console traces and runtime diagnostic logs.
              </p>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            {/* Filter Level Join Buttons */}
            <div class="join border border-base-300 rounded-lg p-0.5 bg-base-200/50">
              <For each={LEVELS}>
                {(lvl) => (
                  <button
                    onClick={() => setFilterLevel(lvl)}
                    class={`btn btn-xs join-item capitalize font-bold ${
                      filterLevel() === lvl
                        ? "btn-primary text-primary-content shadow-xs"
                        : "btn-ghost text-base-content/60 hover:text-base-content"
                    }`}
                  >
                    {lvl}
                  </button>
                )}
              </For>
            </div>

            {/* Auto Refresh Toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh())}
              class={`btn btn-sm font-bold flex items-center gap-1.5 ${
                autoRefresh()
                  ? "btn-primary shadow-md shadow-primary/20"
                  : "btn-outline border-base-300 text-base-content/60"
              }`}
              title={
                autoRefresh()
                  ? "Pause Live Log Stream"
                  : "Resume Live Log Stream"
              }
            >
              <Show
                when={autoRefresh()}
                fallback={
                  <>
                    <Play class="w-3.5 h-3.5" />
                    <span class="text-xs">Paused</span>
                  </>
                }
              >
                <Pause class="w-3.5 h-3.5" />
                <span class="text-xs">Live</span>
              </Show>
            </button>

            {/* Manual Refresh */}
            <button
              onClick={fetchLogs}
              class="btn btn-ghost btn-square btn-sm text-base-content/60 hover:text-base-content border border-base-300"
              title="Force Refresh Log Entries"
            >
              <RefreshCw class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Filter / Search Bar */}
        <div class="relative">
          <Search class="w-4 h-4 text-base-content/40 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search log messages, paths, or contexts..."
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            class="input input-sm input-bordered w-full pl-9 bg-base-200/60 border-base-300 text-xs focus:border-primary text-base-content"
          />
          <Show when={searchQuery()}>
            <button
              onClick={() => setSearchQuery("")}
              class="btn btn-ghost btn-xs btn-square absolute right-2 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content"
            >
              ✕
            </button>
          </Show>
        </div>

        {/* Log Viewer Window */}
        <div class="rounded-xl border border-base-300 bg-base-300/40 overflow-hidden max-h-96 overflow-y-auto divide-y divide-base-300/60 shadow-inner">
          <Show
            when={filteredLogs().length > 0}
            fallback={
              <div class="p-12 text-center text-base-content/40 space-y-2">
                <Terminal class="w-8 h-8 mx-auto opacity-30" />
                <p class="text-xs font-semibold">
                  No matching system log events found.
                </p>
                <p class="text-[10px] text-base-content/30">
                  Try clearing search filter or switching level tabs.
                </p>
              </div>
            }
          >
            <For each={filteredLogs()}>{(log) => <LogRow log={log} />}</For>
          </Show>
        </div>
      </div>
    </div>
  );
}
