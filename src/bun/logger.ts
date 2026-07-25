export interface LogEntry {
	timestamp: string;
	level: "info" | "warn" | "error" | "failure";
	message: string;
	context?: string;
}

export const appLogs: LogEntry[] = [];

export function addLog(level: LogEntry["level"], message: string, context?: string) {
	const entry: LogEntry = {
		timestamp: new Date().toISOString(),
		level,
		message,
		context
	};
	appLogs.push(entry);
	if (appLogs.length > 1000) {
		appLogs.shift();
	}
	console.log(`[${level.toUpperCase()}] ${message} ${context ? `(${context})` : ""}`);
}
