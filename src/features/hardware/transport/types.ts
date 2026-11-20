/**
 * A transport carries protocol lines between the browser and one device.
 * Two exist:
 *  - 'web-serial': a real ESP32 over USB, through the browser's Web Serial API;
 *  - 'simulated':  a simulated device running the firmware logic in this page (NO hardware).
 * The program sandbox never gets a transport: only the Hardware Connection Manager does.
 */

export type TransportKind = 'web-serial' | 'simulated';

export type TransportErrorCode = 'unsupported' | 'insecure-context' | 'permission-denied' | 'no-port' | 'open-failed' | 'write-failed' | 'closed';

export class TransportError extends Error {
  readonly code: TransportErrorCode;
  constructor(code: TransportErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'TransportError';
  }
}

export interface TransportHandlers {
  onLine: (line: string) => void;
  /** The link closed (unplugged, reset, closed by the user). */
  onClose: (reason: string) => void;
  /** Lines that were too long or not text. */
  onGarbage: (what: string) => void;
}

export interface HardwareTransport {
  readonly kind: TransportKind;
  /** Human-readable name of the device or port, when known. */
  readonly label: string;
  /** Open the link. For Web Serial this asks the browser for permission (must run from a click). */
  open(handlers: TransportHandlers, options?: { reuseGrantedPort?: boolean }): Promise<void>;
  write(line: string): Promise<void>;
  close(): Promise<void>;
}
