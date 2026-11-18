import { useEffect } from 'react';
import { RobotKeyboard } from '../features/controls/keyboardControls';
import { robotControl } from '../features/controls/robotControlApi';
import { useRobotStateStore } from '../stores/robotStateStore';

/** Attach the robot keyboard controls while the workspace is open. Listeners are removed on unmount. */
export function useRobotKeyboard(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const keyboard = new RobotKeyboard(
      {
        drive: (speed) => robotControl.drive.set(speed, 'keyboard'),
        turn: (rate) => robotControl.turn.set(rate, 'keyboard'),
        stop: () => robotControl.stop('keyboard'),
        reset: () => robotControl.reset('keyboard'),
      },
      () => useRobotStateStore.getState().mode === 'control' && !document.querySelector('[role="dialog"]'),
    );
    // Capture phase, so robot keys win over the editor shortcuts in Control Mode.
    const down = (e: KeyboardEvent) => {
      if (keyboard.handleKeyDown(e)) e.stopImmediatePropagation();
    };
    const up = (e: KeyboardEvent) => keyboard.handleKeyUp(e);
    const release = () => keyboard.releaseAll();
    const unsubscribe = useRobotStateStore.subscribe((s, prev) => {
      if (s.mode !== prev.mode) release();
    });
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', release);
      unsubscribe();
      keyboard.releaseAll();
    };
  }, [enabled]);
}
