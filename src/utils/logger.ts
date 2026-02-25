import pino from "pino";

let _logger: pino.Logger | null = null;

export function getLogger(): pino.Logger {
  if (_logger) return _logger;
  _logger = pino({
    level: process.env.LOG_LEVEL ?? "info",
    transport:
      process.env.NODE_ENV === "development"
        ? { target: "pino/file", options: { destination: 1 } }
        : undefined,
  });
  return _logger;
}

export function createChildLogger(
  bindings: Record<string, unknown>
): pino.Logger {
  return getLogger().child(bindings);
}
