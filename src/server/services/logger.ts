type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  data?: Record<string, unknown>;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) ?? "info";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLevel];
}

function formatEntry(entry: LogEntry): string {
  const base = `[${entry.timestamp}] ${entry.level.toUpperCase()} [${entry.component}] ${entry.message}`;
  if (entry.data && Object.keys(entry.data).length > 0) {
    return `${base} ${JSON.stringify(entry.data)}`;
  }
  return base;
}

function log(level: LogLevel, component: string, message: string, data?: Record<string, unknown>) {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
    data,
  };

  const formatted = formatEntry(entry);

  switch (level) {
    case "error":
      console.error(formatted);
      break;
    case "warn":
      console.warn(formatted);
      break;
    default:
      console.log(formatted);
  }
}

export const logger = {
  debug: (component: string, message: string, data?: Record<string, unknown>) =>
    log("debug", component, message, data),
  info: (component: string, message: string, data?: Record<string, unknown>) =>
    log("info", component, message, data),
  warn: (component: string, message: string, data?: Record<string, unknown>) =>
    log("warn", component, message, data),
  error: (component: string, message: string, data?: Record<string, unknown>) =>
    log("error", component, message, data),
};
