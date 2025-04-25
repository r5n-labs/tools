import { colors } from "./colors";

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export const createLogger = ({
  prefix = "",
  level = process.env.DEBUG ? LogLevel.DEBUG : LogLevel.INFO,
}: {
  prefix?: string;
  level?: LogLevel;
} = {}) => {
  function debug(...args: unknown[]) {
    if (level <= LogLevel.DEBUG) {
      const message = args.join(" ");
      console.log(format({ level: colors.dim("DEBUG"), message, prefix }));
    }
  }

  function info(...args: unknown[]) {
    if (level <= LogLevel.INFO) {
      const message = args.join(" ");
      console.info(format({ level: colors.cyan("INFO "), message, prefix }));
    }
  }

  function warn(...args: unknown[]) {
    if (level <= LogLevel.WARN) {
      const message = args.join(" ");
      console.warn(format({ level: colors.yellow("WARN "), message, prefix }));
    }
  }

  function error(...args: unknown[]) {
    if (level <= LogLevel.ERROR) {
      const message = args.join(" ");
      console.error(format({ level: colors.red("ERROR"), message, prefix }));
    }
  }

  function child(childPrefix: string) {
    return createLogger({ level, prefix: `${prefix}:${childPrefix}` });
  }

  return { child, debug, error, info, warn };
};

export const logger = createLogger();

function format({ prefix, level, message }: { prefix: string; level: string; message: string }) {
  const timestamp = new Date().toISOString().split("T")[1]?.split(".")[0] || "";
  const formatPrefix = prefix ? `[${prefix}] ` : "";
  return `${colors.dim(timestamp || "")} ${level} ${formatPrefix}${message}`;
}
