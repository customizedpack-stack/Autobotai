import { describe, expect, it } from 'vitest';
import { intentFromKeys, isTypingTarget, RobotKeyboard, type KeyLike } from './keyboardControls';

function setup(control = true) {
  const calls: string[] = [];
  let mode = control;
  const keyboard = new RobotKeyboard(
    {
      drive: (s) => calls.push(`drive ${s}`),
      turn: (r) => calls.push(`turn ${r}`),
      stop: () => calls.push('stop'),
      reset: () => calls.push('reset'),
    },
    () => mode,
  );
  return { keyboard, calls, setControl: (v: boolean) => (mode = v) };
}

const key = (k: string, extra: Partial<KeyLike> = {}): KeyLike & { prevented: boolean } => {
  const e = { key: k, prevented: false, ...extra } as KeyLike & { prevented: boolean };
  e.preventDefault = () => {
    e.prevented = true;
  };
  return e;
};

describe('robot keyboard controls', () => {
  it('pressing W or ArrowUp drives forward and prevents page scrolling', () => {
    const { keyboard, calls } = setup();
    const e = key('w');
    expect(keyboard.handleKeyDown(e)).toBe(true);
    expect(e.prevented).toBe(true);
    expect(calls).toEqual(['drive 1']);
    const up = key('ArrowUp');
    keyboard.handleKeyDown(up);
    expect(up.prevented).toBe(true);
    expect(calls).toEqual(['drive 1']); // same intent, nothing new sent
  });

  it('releasing the key stops that motion; held keys repeat nothing', () => {
    const { keyboard, calls } = setup();
    keyboard.handleKeyDown(key('s'));
    keyboard.handleKeyDown(key('s', { repeat: true }));
    keyboard.handleKeyUp(key('s'));
    expect(calls).toEqual(['drive -1', 'drive 0']);
  });

  it('combines keys: W + A is a left arc; opposite keys cancel', () => {
    const { keyboard, calls } = setup();
    keyboard.handleKeyDown(key('w'));
    keyboard.handleKeyDown(key('a'));
    expect(calls).toEqual(['drive 1', 'turn 1']);
    keyboard.handleKeyDown(key('d'));
    expect(calls.at(-1)).toBe('turn 0');
    expect(intentFromKeys(new Set(['forward', 'backward', 'right']))).toEqual({ linear: 0, angular: -1 });
  });

  it('Space stops and R resets', () => {
    const { keyboard, calls } = setup();
    keyboard.handleKeyDown(key('w'));
    const space = key(' ');
    keyboard.handleKeyDown(space);
    expect(space.prevented).toBe(true);
    keyboard.handleKeyDown(key('r'));
    expect(calls).toEqual(['drive 1', 'stop', 'reset']);
    expect(keyboard.heldKeys()).toEqual([]);
  });

  it('ignores keys while typing in an input, textarea, select or code editor', () => {
    const { keyboard, calls } = setup();
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
      const e = key('w', { target: { tagName } });
      expect(keyboard.handleKeyDown(e)).toBe(false);
      expect(e.prevented).toBe(false);
    }
    expect(keyboard.handleKeyDown(key('w', { target: { tagName: 'DIV', isContentEditable: true } }))).toBe(false);
    expect(keyboard.handleKeyDown(key('w', { target: { tagName: 'DIV', closest: () => ({}) } }))).toBe(false);
    expect(isTypingTarget({ tagName: 'BUTTON', closest: () => null })).toBe(false);
    expect(calls).toEqual([]);
  });

  it('does nothing in Build Mode, so W/E/R stay editor tools', () => {
    const { keyboard, calls } = setup(false);
    const e = key('w');
    expect(keyboard.handleKeyDown(e)).toBe(false);
    expect(e.prevented).toBe(false);
    expect(keyboard.handleKeyDown(key('r'))).toBe(false);
    expect(calls).toEqual([]);
  });

  it('ignores shortcuts with Ctrl / Cmd / Alt (e.g. Ctrl+S save)', () => {
    const { keyboard, calls } = setup();
    expect(keyboard.handleKeyDown(key('s', { ctrlKey: true }))).toBe(false);
    expect(keyboard.handleKeyDown(key('w', { metaKey: true }))).toBe(false);
    expect(calls).toEqual([]);
  });

  it('releases every held key when the window loses focus or the mode changes', () => {
    const { keyboard, calls, setControl } = setup();
    keyboard.handleKeyDown(key('w'));
    keyboard.handleKeyDown(key('d'));
    setControl(false);
    keyboard.releaseAll();
    expect(calls).toEqual(['drive 1', 'turn -1', 'drive 0', 'turn 0']);
  });
});
