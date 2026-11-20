import { bus } from '../core/bus/connectorBus';
import type { BusChannels } from '../core/bus/channels';
import type { LogLevel, LogSource } from '../types/console';

/** Optional context attached to a log entry (Code Studio sessions and commands). */
export interface LogContext {
  sessionId?: string;
  commandId?: string;
}

type LogInput = BusChannels['console.log'];

/**
 * Messages logged before the Console is connected (for example during store hydration and
 * migration, when the bundler evaluates a store module before bootstrap.ts runs). They are
 * handed to the Console once it connects, so start-up messages are never lost.
 */
let consoleAttached = false;
const early: LogInput[] = [];
const MAX_EARLY = 200;

function emit(level: LogLevel, source: LogSource, message: string, context?: LogContext): void {
  const input: LogInput = { level, source, message, ...context };
  if (!consoleAttached && early.length < MAX_EARLY) early.push(input);
  bus.publish('console.log', input);
}

/** Called once by the Console when it connects: returns the messages logged before that. */
export function attachConsole(): LogInput[] {
  consoleAttached = true;
  return early.splice(0);
}

/** All console output goes through the Connector Bus (C7 Telemetry and Log). */
export const log = {
  info: (source: LogSource, message: string, context?: LogContext) => emit('info', source, message, context),
  success: (source: LogSource, message: string, context?: LogContext) => emit('success', source, message, context),
  warning: (source: LogSource, message: string, context?: LogContext) => emit('warning', source, message, context),
  error: (source: LogSource, message: string, context?: LogContext) => emit('error', source, message, context),
  debug: (source: LogSource, message: string, context?: LogContext) => emit('debug', source, message, context),
};
