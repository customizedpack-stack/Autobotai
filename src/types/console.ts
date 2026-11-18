export type LogLevel = 'info' | 'success' | 'warning' | 'error' | 'debug';

export type LogSource =
  | 'system'
  | 'project'
  | 'scene'
  | 'viewport'
  | 'inspector'
  | 'library'
  | 'storage'
  | 'simulation'
  | 'control';

export interface LogEntry {
  id: number;
  level: LogLevel;
  source: LogSource;
  message: string;
  timestamp: number;
}

export type LogInput = Omit<LogEntry, 'id' | 'timestamp'>;
