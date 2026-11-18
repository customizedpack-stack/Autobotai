import { parseFrameMessage } from '../runtime/messageProtocol';
import type { SandboxFactory, SandboxHandle } from '../runtime/sandboxTypes';

/**
 * The real sandbox: a hidden <iframe sandbox="allow-scripts"> (no
 * allow-same-origin, so it gets a unique OPAQUE origin) that starts a Web
 * Worker from a blob URL and relays messages.
 *
 * - Opaque origin: the frame and its worker cannot read the app's
 *   localStorage, cookies or IndexedDB, and cannot touch the app's window,
 *   DOM or stores.
 * - Content Security Policy (inherited by the blob worker): no network
 *   (fetch, XHR, WebSocket), no script loading (importScripts, import()),
 *   no eval / new Function.
 * - The worker keeps endless loops off the UI thread. Removing the iframe
 *   terminates the worker immediately.
 *
 * Messages travel over a private MessageChannel created by the host.
 */

export const SANDBOX_CSP =
  "default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; connect-src 'none'; img-src 'none'; style-src 'none'; font-src 'none'; media-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";

/** The frame's relay script. It only forwards messages; it never runs user code itself. */
function frameRelay(): void {
  let port: MessagePort | null = null;
  let worker: Worker | null = null;
  const toHost = (message: unknown) => port?.postMessage(message);
  window.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as { t?: string } | null;
    if (port || !data || data.t !== 'init' || !event.ports[0]) return;
    port = event.ports[0];
    port.onmessage = (inner: MessageEvent) => {
      const msg = inner.data as { t?: string; source?: string; msg?: unknown } | null;
      if (!msg) return;
      if (msg.t === 'start' && typeof msg.source === 'string' && !worker) {
        try {
          let url: string | null = URL.createObjectURL(new Blob([msg.source], { type: 'text/javascript' }));
          worker = new Worker(url);
          worker.onmessage = (w: MessageEvent) => {
            // The script has loaded once the worker talks: the blob URL is no longer needed.
            if (url) URL.revokeObjectURL(url);
            url = null;
            toHost({ t: 'fromWorker', msg: w.data });
          };
          worker.onmessageerror = () => toHost({ t: 'workerError', message: 'The program sent a message that could not be read.' });
          worker.onerror = (e: ErrorEvent) => {
            e.preventDefault();
            toHost({ t: 'workerError', message: e.message || 'The program crashed.', line: e.lineno });
          };
        } catch (error) {
          toHost({ t: 'startFailed', message: String(error instanceof Error ? error.message : error) });
        }
      } else if (msg.t === 'toWorker' && worker) {
        worker.postMessage(msg.msg);
      }
    };
  });
}

export function frameDocument(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}"></head><body><script>(${frameRelay.toString()})();</script></body></html>`;
}

/** Map a worker error line (whole worker script) to a line in the user's program. */
function userLine(line: number | undefined, lineOffset: number): number | undefined {
  if (!line) return undefined;
  const mapped = line - lineOffset;
  return mapped >= 1 ? mapped : undefined;
}

export function createFrameSandbox(lineOffset: number): SandboxFactory {
  return ({ workerSource, onWorkerMessage, onWorkerError, onStartFailed }): SandboxHandle => {
    let destroyed = false;
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('tabindex', '-1');
    iframe.title = 'Code Studio sandbox';
    iframe.dataset.codeSandbox = 'true';
    iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden;';
    iframe.srcdoc = frameDocument();

    const channel = new MessageChannel();
    channel.port1.onmessage = (event: MessageEvent) => {
      if (destroyed) return;
      const parsed = parseFrameMessage(event.data);
      if (!parsed.ok) return;
      const message = parsed.value;
      if (message.t === 'fromWorker') onWorkerMessage(message.msg);
      else if (message.t === 'workerError') onWorkerError(message.message, userLine(message.line, lineOffset));
      else onStartFailed(message.message);
    };

    iframe.addEventListener('load', () => {
      if (destroyed || !iframe.contentWindow) return;
      // An opaque-origin frame can only be addressed with "*"; the private port is transferred to it alone.
      iframe.contentWindow.postMessage({ t: 'init' }, '*', [channel.port2]);
      channel.port1.postMessage({ t: 'start', source: workerSource });
    });
    document.body.appendChild(iframe);

    return {
      send(message) {
        if (!destroyed) channel.port1.postMessage({ t: 'toWorker', msg: message });
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        channel.port1.onmessage = null;
        channel.port1.close();
        // Removing the frame terminates its worker, even in the middle of an endless loop.
        iframe.remove();
      },
    };
  };
}
