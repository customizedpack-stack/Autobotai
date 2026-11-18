import { bus } from '../core/bus/connectorBus';
import type { LogLevel, LogSource } from '../types/console';

function emit(level: LogLevel, source: LogSource, message: string): void {
  bus.publish('console.log', { level, source, message });
}

/** All console output goes through the Connector Bus (C7 Telemetry and Log). */
export const log = {
  info: (source: LogSource, message: string) => emit('info', source, message),
  success: (source: LogSource, message: string) => emit('success', source, message),
  warning: (source: LogSource, message: string) => emit('warning', source, message),
  error: (source: LogSource, message: string) => emit('error', source, message),
  debug: (source: LogSource, message: string) => emit('debug', source, message),
};
