/**
 * Fixed-step simulation clock. The render loop feeds it real elapsed time; it
 * decides how many whole simulation ticks to run. Frame rate therefore never
 * changes simulation results — only how quickly they arrive. Catch-up work is
 * capped so a backgrounded tab cannot trigger a burst of hundreds of ticks.
 */
export const SPEEDS = [
  { label: 'Paused', ticksPerSecond: 0 },
  { label: '1×', ticksPerSecond: 0.5 },
  { label: '2×', ticksPerSecond: 1 },
  { label: '4×', ticksPerSecond: 3 },
  { label: '8×', ticksPerSecond: 8 },
] as const;

export const MAX_TICKS_PER_FRAME = 4;

export class SimClock {
  speed = 1;
  private accumulator = 0;
  private lastSpeed = 1;

  get paused(): boolean {
    return this.speed === 0;
  }

  setSpeed(index: number, resetAccumulator = false): void {
    const s = Math.max(0, Math.min(SPEEDS.length - 1, Math.round(index)));
    if (s > 0) this.lastSpeed = s;
    this.speed = s;
    if (resetAccumulator) this.accumulator = 0;
  }

  pause(): void {
    if (this.speed > 0) {
      this.lastSpeed = this.speed;
      this.speed = 0;
    }
  }

  resume(): void {
    if (this.speed === 0) {
      this.speed = this.lastSpeed > 0 ? this.lastSpeed : 1;
    }
  }

  togglePause(): void {
    if (this.paused) this.resume();
    else this.pause();
  }

  reset(): void {
    this.accumulator = 0;
  }

  get accumulated(): number {
    return this.accumulator;
  }

  /** Returns the number of ticks to run for `dtSeconds` of real time. */
  advance(dtSeconds: number): number {
    if (this.paused || !(dtSeconds > 0)) return 0;
    const dt = Math.min(dtSeconds, 0.25);
    this.accumulator += dt * SPEEDS[this.speed].ticksPerSecond;
    const ticks = Math.min(MAX_TICKS_PER_FRAME, Math.floor(this.accumulator + 1e-9));
    this.accumulator = Math.max(0, this.accumulator - ticks);
    if (this.accumulator > MAX_TICKS_PER_FRAME) this.accumulator = 0;
    return ticks;
  }

  /** Fraction of the way to the next tick (for interpolated animation). */
  get phase(): number {
    return this.accumulator;
  }
}
