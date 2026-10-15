/**
 * Restrained procedural audio (Web Audio API, no asset files). Nothing sounds
 * until `unlock()` is called from a user gesture, satisfying browser autoplay
 * rules. Preferences persist in localStorage (guarded for private mode).
 */
export type Cue = 'construct' | 'complete' | 'found' | 'notify' | 'crisis' | 'success' | 'failure' | 'click' | 'trade' | 'invalid';

export interface AudioPrefs {
  master: number;
  music: number;
  effects: number;
  muted: boolean;
}

const KEY = 'wm:audio';
const DEFAULT: AudioPrefs = { master: 0.7, music: 0.45, effects: 0.7, muted: false };
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16];

export class AudioEngine {
  prefs: AudioPrefs;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private fxBus!: GainNode;
  private droneNodes: AudioScheduledSourceNode[] = [];
  private noteTimer = 0;
  private mood = 0.5; // 0 tense … 1 serene

  constructor() {
    this.prefs = { ...DEFAULT };
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.prefs = { ...DEFAULT, ...JSON.parse(raw) };
    } catch { /* storage unavailable: defaults */ }
  }

  get unlocked(): boolean {
    return this.ctx !== null;
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  unlock(): void {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.musicBus = this.ctx.createGain();
    this.fxBus = this.ctx.createGain();
    this.musicBus.connect(this.master);
    this.fxBus.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.applyVolumes();
    this.startAmbience();
  }

  setPrefs(p: Partial<AudioPrefs>): void {
    this.prefs = { ...this.prefs, ...p };
    try { localStorage.setItem(KEY, JSON.stringify(this.prefs)); } catch { /* ignore */ }
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.prefs.muted ? 0 : this.prefs.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.prefs.music * 0.5, t, 0.2);
    this.fxBus.gain.setTargetAtTime(this.prefs.effects, t, 0.05);
  }

  /** Planetary wellbeing (0..1) gently shifts the ambient harmony. */
  setMood(v: number): void {
    this.mood = Math.max(0, Math.min(1, v));
  }

  private startAmbience(): void {
    const ctx = this.ctx!;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    filter.Q.value = 0.6;
    filter.connect(this.musicBus);
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.04;
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    this.droneNodes.push(lfo);
    for (const [freq, type, gain] of [[55, 'sine', 0.18], [82.4, 'triangle', 0.07], [110.3, 'sine', 0.06], [164.8, 'sine', 0.025]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = (Math.random() - 0.5) * 8;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g).connect(filter);
      o.start();
      this.droneNodes.push(o);
    }
    // Wind: filtered noise.
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 400;
    nf.Q.value = 0.4;
    const ng = ctx.createGain();
    ng.gain.value = 0.035;
    noise.connect(nf).connect(ng).connect(this.musicBus);
    noise.start();
    this.droneNodes.push(noise);
  }

  /** Call each frame; schedules sparse tonal notes. */
  update(dt: number, running: boolean): void {
    if (!this.ctx || this.prefs.muted) return;
    this.noteTimer -= dt;
    if (this.noteTimer > 0) return;
    this.noteTimer = (running ? 5 : 9) + Math.random() * 6;
    const minor = this.mood < 0.45;
    const steps = minor ? [0, 3, 5, 7, 10, 12, 15] : PENTATONIC;
    const step = steps[Math.floor(Math.random() * steps.length)];
    this.tone(220 * 2 ** (step / 12), 3.5, 0.05, 'sine', this.musicBus);
    if (Math.random() < 0.4) this.tone(220 * 2 ** ((step + 7) / 12), 4, 0.03, 'sine', this.musicBus, 0.6);
  }

  private tone(freq: number, dur: number, gain: number, type: OscillatorType, bus: GainNode, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.4, dur * 0.15));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noiseBurst(dur: number, freq: number, gain: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.fxBus);
    src.start(t);
  }

  play(cue: Cue): void {
    if (!this.ctx || this.prefs.muted) return;
    switch (cue) {
      case 'click': this.tone(880, 0.08, 0.04, 'triangle', this.fxBus); break;
      case 'invalid': this.tone(196, 0.18, 0.08, 'square', this.fxBus); this.tone(185, 0.2, 0.05, 'square', this.fxBus, 0.06); break;
      case 'construct': this.noiseBurst(0.18, 900, 0.25); this.tone(130.8, 0.35, 0.12, 'triangle', this.fxBus); break;
      case 'complete': this.tone(523.3, 0.6, 0.07, 'sine', this.fxBus); this.tone(784, 0.8, 0.05, 'sine', this.fxBus, 0.09); break;
      case 'found': [392, 523.3, 659.3, 784].forEach((f, i) => this.tone(f, 1.6, 0.06, 'sine', this.fxBus, i * 0.11)); break;
      case 'trade': this.tone(659.3, 0.3, 0.05, 'triangle', this.fxBus); this.tone(987.8, 0.4, 0.04, 'triangle', this.fxBus, 0.07); break;
      case 'notify': this.tone(740, 0.5, 0.05, 'sine', this.fxBus); this.tone(1108.7, 0.6, 0.035, 'sine', this.fxBus, 0.12); break;
      case 'crisis': this.tone(73.4, 2.4, 0.16, 'sawtooth', this.fxBus); this.tone(77.8, 2.4, 0.1, 'sine', this.fxBus, 0.05); this.noiseBurst(1.2, 300, 0.12); break;
      case 'success': [523.3, 659.3, 784, 1046.5].forEach((f, i) => this.tone(f, 2.2, 0.07, 'sine', this.fxBus, i * 0.18)); break;
      case 'failure': [392, 349.2, 311.1, 261.6].forEach((f, i) => this.tone(f, 2, 0.07, 'triangle', this.fxBus, i * 0.22)); break;
    }
  }
}
