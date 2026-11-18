import { bus } from '../core/bus/connectorBus';
import type { LogLevel, LogSource } from '../types/console';

/** Optional context attached to a log entry (Code Studio sessions and commands). */
export interface LogContext {
  sessionId?: string;
  commandId?: string;
}

function emit(level: LogLevel, source: LogSource, message: string, context?: LogContext): void {
  bus.publish('console.log', { level, source, message, ...context });
}

/** All console output goes through the Connector Bus (C7 Telemetry and Log). */
export const log = {
  info: (source: LogSource, message: string, context?: LogContext) => emit('info', source, message, context),
  success: (source: LogSource, message: string, context?: LogContext) => emit('success', source, message, context),
  warning: (source: LogSource, message: string, context?: LogContext) => emit('warning', source, message, context),
  error: (source: LogSource, message: string, context?: LogContext) => emit('error', source, message, context),
  debug: (source: LogSource, message: string, context?: LogContext) => emit('debug', source, message, context),
};
