/**
 * Seeded pseudorandom generator (sfc32). The full 4-word state is plain data so
 * it can be saved and restored, which keeps a loaded game deterministic.
 */
export type RngState = [number, number, number, number];

export function hashString(str: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function seedRng(seed: string | number): RngState {
  const base = typeof seed === 'number' ? seed >>> 0 : hashString(seed);
  const s: RngState = [base ^ 0x9e3779b9, base ^ 0x243f6a88, base ^ 0xb7e15162, base ^ 0x7f4a7c15];
  const r = new Rng(s);
  for (let i = 0; i < 16; i++) r.next();
  return r.state;
}

export class Rng {
  state: RngState;
  constructor(state: RngState) {
    this.state = [state[0] >>> 0, state[1] >>> 0, state[2] >>> 0, state[3] >>> 0];
  }
  /** Uniform in [0, 1). */
  next(): number {
    let [a, b, c, d] = this.state;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    this.state = [a >>> 0, b >>> 0, c >>> 0, d >>> 0];
    return (t >>> 0) / 4294967296;
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }
}
