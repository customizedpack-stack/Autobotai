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
  | 'control'
  | 'code';

export interface LogEntry {
  id: number;
  level: LogLevel;
  source: LogSource;
  message: string;
  timestamp: number;
  /** Code Studio execution session that produced this entry (Phase 4). */
  sessionId?: string;
  /** C2 command id, when the entry is about one command. */
  commandId?: string;
}

export type LogInput = Omit<LogEntry, 'id' | 'timestamp'>;
