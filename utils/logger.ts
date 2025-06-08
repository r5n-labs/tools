import { colors } from "./colors";

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

type Logger = {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  child: (childPrefix: string) => ReturnType<typeof createLogger>;
};

const LOG_CONFIGS = [
  {
    color: colors.dim,
    console: console.log,
    label: "DEBUG",
    level: LogLevel.DEBUG,
    method: "debug",
  },
  {
    color: colors.cyan,
    console: console.info,
    label: "INFO ",
    level: LogLevel.INFO,
    method: "info",
  },
  {
    color: colors.yellow,
    console: console.warn,
    label: "WARN ",
    level: LogLevel.WARN,
    method: "warn",
  },
  {
    color: colors.red,
    console: console.error,
    label: "ERROR",
    level: LogLevel.ERROR,
    method: "error",
  },
] as const;

export const createLogger = ({
  prefix = "",
  level = process.env.DEBUG ? LogLevel.DEBUG : LogLevel.INFO,
}: {
  prefix?: string;
  level?: LogLevel;
} = {}) => {
  const logger = {} as Logger;

  // Generate methods at creation time - zero runtime overhead
  for (const config of LOG_CONFIGS) {
    logger[config.method] =
      level <= config.level
        ? (...args: unknown[]) => {
            const message = args.map((arg) => String(arg ?? "")).join(" ");
            config.console(format({ level: config.color(config.label), message, prefix }));
          }
        : () => {}; // No-op function for disabled levels
  }

  logger.child = (childPrefix: string) =>
    createLogger({ level, prefix: `${prefix}:${childPrefix}` });

  return logger as Logger;
};

export const logger = createLogger();

function format({ prefix, level, message }: { prefix: string; level: string; message: string }) {
  let timestamp = "";
  try {
    const isoString = new Date().toISOString();
    const timePart = isoString.split("T")[1];
    if (timePart) {
      timestamp = timePart.split(".")[0] || "";
    }
  } catch {
    timestamp = "00:00:00";
  }
  const formatPrefix = prefix ? `[${prefix}] ` : "";
  return `${colors.dim(timestamp)} ${level} ${formatPrefix}${message}`;
}
