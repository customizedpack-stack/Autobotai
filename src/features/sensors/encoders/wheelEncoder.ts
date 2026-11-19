/**
 * Wheel encoder state. Joint angles from the engine wrap at ±π; the encoder adds up
 * the wrapped change every simulation tick, so the count is continuous over many
 * revolutions. A tick at the 60 Hz rate covers far less than half a turn at any
 * realistic wheel speed (π rad per tick would be 188 rad/s), so no turn is missed.
 */

/** Smallest signed difference between two angles (rad), in (−π, π]. */
export function angleDelta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

export class EncoderState {
  /** Raw accumulated joint angle since the last reset (rad, joint direction, not inverted). */
  raw = 0;
  /** Raw angle at the previous reading (for angleDelta). */
  rawAtLastReading = 0;
  private lastWrapped: number | null = null;

  /** Feed the current (possibly wrapped) joint angle once per tick. */
  update(wrapped: number): void {
    if (this.lastWrapped !== null) this.raw += angleDelta(this.lastWrapped, wrapped);
    this.lastWrapped = wrapped;
  }

  /** Start counting from `current` (the angle now), without losing the count. Null: from the next update. */
  rebase(current: number | null = null): void {
    this.lastWrapped = current;
  }

  /** Counter back to zero at the current angle. */
  reset(): void {
    this.raw = 0;
    this.rawAtLastReading = 0;
  }
}
