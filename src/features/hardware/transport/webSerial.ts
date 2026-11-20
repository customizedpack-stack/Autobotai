import { HOST_MAX_LINE, LineSplitter } from '../protocol/protocol';
import { TransportError, type HardwareTransport, type TransportHandlers } from './types';

/**
 * Web Serial transport (real hardware over USB).
 *
 * Browser support: Chromium-based desktop browsers (Chrome, Edge, Opera) on
 * Windows, macOS, Linux and ChromeOS, in a secure context (https or localhost).
 * Not available in Firefox, Safari, iOS or Android Chrome. The page must not be
 * inside an iframe that blocks the "serial" permissions policy.
 * The browser shows its own port chooser; nothing connects without a user click.
 */

const BAUD_RATE = 115200;

/** Minimal shapes of the Web Serial API (not in the TypeScript DOM library). */
interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  getInfo?(): { usbVendorId?: number; usbProductId?: number };
}
interface SerialLike {
  requestPort(options?: object): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
  addEventListener(type: 'disconnect', listener: (event: { target?: unknown }) => void): void;
  removeEventListener(type: 'disconnect', listener: (event: { target?: unknown }) => void): void;
}

export type WebSerialSupport = { ok: true } | { ok: false; code: 'unsupported' | 'insecure-context' | 'blocked-by-frame'; message: string };

function serialApi(): SerialLike | undefined {
  return typeof navigator !== 'undefined' ? (navigator as unknown as { serial?: SerialLike }).serial : undefined;
}

export function webSerialSupport(): WebSerialSupport {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return { ok: false, code: 'insecure-context', message: 'Web Serial needs a secure page (https or localhost).' };
  }
  if (!serialApi()) {
    return { ok: false, code: 'unsupported', message: 'This browser has no Web Serial. Use desktop Chrome or Edge (not Firefox, Safari or mobile browsers).' };
  }
  const policy = (document as unknown as { permissionsPolicy?: { allowsFeature(f: string): boolean } }).permissionsPolicy;
  if (policy && !policy.allowsFeature('serial')) {
    return { ok: false, code: 'blocked-by-frame', message: 'This page is embedded in a frame that blocks serial access. Open AutoBotAI in its own browser tab.' };
  }
  return { ok: true };
}

export class WebSerialTransport implements HardwareTransport {
  readonly kind = 'web-serial' as const;
  label = 'USB serial device';
  private port: SerialPortLike | null = null;
  private reader: ReadableStreamDefaultReader<string> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private handlers: TransportHandlers | null = null;
  private closing = false;
  private readonly encoder = new TextEncoder();
  private readonly onDisconnect = (event: { target?: unknown }) => {
    if (event.target === this.port) void this.shutdown('The USB device was unplugged or reset.');
  };

  private readonly serial: SerialLike | undefined;

  constructor(serial: SerialLike | undefined = serialApi()) {
    this.serial = serial;
  }

  async open(handlers: TransportHandlers, options: { reuseGrantedPort?: boolean } = {}): Promise<void> {
    if (!this.serial) throw new TransportError('unsupported', 'Web Serial is not available in this browser.');
    this.handlers = handlers;
    let port: SerialPortLike | undefined;
    if (options.reuseGrantedPort) {
      // Reconnect: only a port the user already chose for this site; never a new one without asking.
      port = (await this.serial.getPorts())[0];
      if (!port) throw new TransportError('no-port', 'No previously chosen port is available. Use Connect and choose the port again.');
    } else {
      try {
        port = await this.serial.requestPort({});
      } catch (error) {
        const name = (error as { name?: string })?.name;
        if (name === 'NotFoundError') throw new TransportError('permission-denied', 'No port was chosen.');
        if (name === 'SecurityError') throw new TransportError('permission-denied', 'The browser blocked access to serial ports on this page.');
        throw new TransportError('no-port', `No serial port: ${String((error as Error)?.message ?? error)}`);
      }
    }
    try {
      await port.open({ baudRate: BAUD_RATE });
    } catch (error) {
      throw new TransportError('open-failed', `The port could not be opened (is another program using it?): ${String((error as Error)?.message ?? error)}`);
    }
    if (!port.readable || !port.writable) throw new TransportError('open-failed', 'The port has no data streams.');
    this.port = port;
    this.closing = false;
    const info = port.getInfo?.();
    if (info?.usbVendorId !== undefined) this.label = `USB ${info.usbVendorId.toString(16).padStart(4, '0')}:${(info.usbProductId ?? 0).toString(16).padStart(4, '0')}`;
    this.writer = port.writable.getWriter();
    const text = port.readable.pipeThrough(new TextDecoderStream() as unknown as ReadableWritablePair<string, Uint8Array>);
    this.reader = text.getReader();
    this.serial.addEventListener('disconnect', this.onDisconnect);
    void this.readLoop();
  }

  private async readLoop(): Promise<void> {
    const splitter = new LineSplitter(
      (line) => this.handlers?.onLine(line),
      () => this.handlers?.onGarbage('an overlong line'),
    );
    try {
      for (;;) {
        const { value, done } = await this.reader!.read();
        if (done) break;
        if (value) splitter.push(value);
      }
    } catch (error) {
      if (!this.closing) void this.shutdown(`The serial link failed: ${String((error as Error)?.message ?? error)}`);
      return;
    }
    if (!this.closing) void this.shutdown('The serial link closed.');
  }

  async write(line: string): Promise<void> {
    if (!this.writer) throw new TransportError('closed', 'Not connected.');
    if (line.length > HOST_MAX_LINE || /[\r\n]/.test(line)) throw new TransportError('write-failed', 'Invalid command line.');
    try {
      await this.writer.write(this.encoder.encode(`${line}\n`));
    } catch (error) {
      void this.shutdown('Writing to the device failed.');
      throw new TransportError('write-failed', String((error as Error)?.message ?? error));
    }
  }

  async close(): Promise<void> {
    await this.shutdown(null);
  }

  private async shutdown(reason: string | null): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    this.serial?.removeEventListener('disconnect', this.onDisconnect);
    try {
      await this.reader?.cancel();
    } catch {
      /* already closed */
    }
    try {
      this.reader?.releaseLock();
      this.writer?.releaseLock();
    } catch {
      /* already released */
    }
    try {
      await this.port?.close();
    } catch {
      /* already closed */
    }
    this.reader = null;
    this.writer = null;
    this.port = null;
    if (reason) this.handlers?.onClose(reason);
  }
}
