/**
 * Robot keyboard controls (Control Mode only). Pure logic, no React.
 *
 *   W / ↑ forward   S / ↓ backward   A / ← turn left   D / → turn right
 *   Space stop      R reset
 *
 * Held keys keep the robot moving; releasing them stops that motion.
 * Combinations work (W + A drives a left arc). Opposite keys cancel out.
 * Keys are ignored while typing in an input, textarea, select or code editor,
 * with Ctrl / Cmd / Alt held, and in Build Mode (where W/E/R are editor tools).
 */

export type Direction = 'forward' | 'backward' | 'left' | 'right';

export const DRIVE_KEYS: Readonly<Record<string, Direction>> = {
  w: 'forward',
  arrowup: 'forward',
  s: 'backward',
  arrowdown: 'backward',
  a: 'left',
  arrowleft: 'left',
  d: 'right',
  arrowright: 'right',
};

export interface KeyLike {
  key: string;
  repeat?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  target?: unknown;
  preventDefault?: () => void;
}

export interface KeyboardSink {
  drive: (speed: number) => void;
  turn: (rate: number) => void;
  stop: () => void;
  reset: () => void;
}

export function intentFromKeys(held: ReadonlySet<Direction>): { linear: number; angular: number } {
  const linear = (held.has('forward') ? 1 : 0) - (held.has('backward') ? 1 : 0);
  const angular = (held.has('left') ? 1 : 0) - (held.has('right') ? 1 : 0);
  return { linear, angular };
}

/** True when the event target is somewhere the user types text. */
export function isTypingTarget(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as { tagName?: string; isContentEditable?: boolean; closest?: (s: string) => unknown };
  if (el.isContentEditable) return true;
  if (el.tagName && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return true;
  // Code editors (Monaco in Phase 4) render inside elements marked with this attribute or class.
  return Boolean(el.closest?.('[data-code-editor], .monaco-editor'));
}

export class RobotKeyboard {
  private held = new Set<Direction>();
  private last = { linear: 0, angular: 0 };

  private readonly sink: KeyboardSink;
  private readonly isControlMode: () => boolean;

  constructor(sink: KeyboardSink, isControlMode: () => boolean) {
    this.sink = sink;
    this.isControlMode = isControlMode;
  }

  private applies(e: KeyLike): boolean {
    return this.isControlMode() && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target);
  }

  private emit(): void {
    const next = intentFromKeys(this.held);
    if (next.linear !== this.last.linear) this.sink.drive(next.linear);
    if (next.angular !== this.last.angular) this.sink.turn(next.angular);
    this.last = next;
  }

  /** Returns true when the key was used for robot control. */
  handleKeyDown(e: KeyLike): boolean {
    if (!this.applies(e)) return false;
    const key = e.key.toLowerCase();
    const direction = DRIVE_KEYS[key];
    if (direction) {
      e.preventDefault?.();
      if (e.repeat) return true;
      this.held.add(direction);
      this.emit();
      return true;
    }
    if (key === ' ' || key === 'spacebar') {
      e.preventDefault?.();
      this.held.clear();
      this.last = { linear: 0, angular: 0 };
      this.sink.stop();
      return true;
    }
    if (key === 'r') {
      e.preventDefault?.();
      this.held.clear();
      this.last = { linear: 0, angular: 0 };
      this.sink.reset();
      return true;
    }
    return false;
  }

  handleKeyUp(e: KeyLike): boolean {
    const direction = DRIVE_KEYS[e.key.toLowerCase()];
    if (!direction || !this.held.has(direction)) return false;
    this.held.delete(direction);
    this.emit();
    return true;
  }

  /** Window lost focus or mode changed: release every held key. */
  releaseAll(): void {
    if (this.held.size === 0) return;
    this.held.clear();
    this.emit();
  }

  heldKeys(): Direction[] {
    return [...this.held];
  }
}
