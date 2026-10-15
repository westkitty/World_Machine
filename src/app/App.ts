import { AudioEngine, type Cue } from '../audio/AudioEngine';
import { BUILDINGS } from '../sim/constants';
import { applyCommand, foundingCost, foundingSource, modeBlocker, previewCommand, type Command, type CommandResult } from '../sim/commands';
import { planRoad } from '../sim/construction';
import { createReferenceWorld } from '../sim/create';
import { formatCost } from '../sim/economy';
import { assertStateValid, step } from '../sim/engine';
import { roadIndex } from '../sim/pathfinding';
import { deserialize, serialize } from '../sim/save';
import { createScenarioWorld } from '../sim/scenarios';
import { foundingBlocker, getSettlement } from '../sim/settlements';
import { planRoute } from '../sim/systems/trade';
import { validateBranchAdoption, type BranchResult } from '../sim/compare';
import { ForecastService } from '../sim/forecast_service';
import { invalidateForecast } from '../ui/panels';
import type { BuildingType, GameMode, GenParams, WorldState } from '../sim/types';
import { PlanetView } from '../render/PlanetView';
import { Hud } from '../ui/Hud';
import { SimClock } from './clock';
import { deleteSlot, getBackup, loadFromSlot, loadSettings, restoreBackup, saveSettings, saveToSlot, slotName, type Settings, type Slot } from './storage';
import { getPlaytestTracker, type PlaytestTracker } from './playtest';

export type Tool =
  | { kind: 'inspect' }
  | { kind: 'found' }
  | { kind: 'build'; building: BuildingType }
  | { kind: 'road'; from: number }
  | { kind: 'route'; from: number }
  | { kind: 'conserve' };

/** The region a command visibly affects, for in-world feedback. */
function commandCell(state: WorldState, cmd: Command, fallback: number): number {
  switch (cmd.type) {
    case 'found': case 'build': case 'conserve': return cmd.cellId;
    case 'road': return cmd.toCell;
    case 'route': return state.settlements.find((s) => s.id === cmd.b)?.cellId ?? fallback;
    case 'respond': return state.crises.find((c) => c.id === cmd.crisisId)?.cellId ?? fallback;
    case 'research': return state.settlements.find((s) => s.id === cmd.fundingId)?.cellId ?? fallback;
    default: return -1;
  }
}

export interface NewGameOptions {
  mode: GameMode;
  seed?: string;
  params?: Partial<GenParams>;
  scenario?: string;
}

/**
 * Application controller and the single owner of the frame loop. It holds the
 * authoritative WorldState, advances it with a fixed-step clock, routes input
 * into commands and tells the view and HUD when to refresh. Rendering never
 * mutates simulation state.
 */
export class App {
  state!: WorldState;
  readonly view: PlanetView;
  readonly hud: Hud;
  readonly clock = new SimClock();
  readonly audio = new AudioEngine();
  readonly forecast = new ForecastService();
  readonly playtest: PlaytestTracker = getPlaytestTracker();
  settings: Settings = loadSettings();
  tool: Tool = { kind: 'inspect' };
  selectedCell = -1;
  hoverCell = -1;
  private lastFrame = performance.now();
  private paintTimer = 0;
  private pendingPaint = false;
  private pointers = new Map<number, { x: number; y: number; t: number; moved: boolean }>();
  private gesture = false;
  private lastHint = '';
  readonly perf = { frameMs: [] as number[], tickMs: [] as number[] };

  constructor(readonly root: HTMLElement) {
    const stage = root.querySelector<HTMLElement>('#stage')!;
    this.view = new PlanetView(stage, this.viewOptions());
    this.view.onAdaptiveQuality = (msg) => this.hud?.toast(msg, 'warn');
    this.view.showBorders = this.settings.showBorders;
    this.view.onContextChange = (lost) => {
      this.hud.toast(lost ? 'Graphics context lost — the simulation continues; restoring…' : 'Graphics restored.', lost ? 'warn' : 'good');
      if (!lost) this.view.syncWorld(this.state, true);
    };
    this.hud = new Hud(this);
    this.forecast.subscribe(() => {
      this.hud?.refresh(true);
    });
    this.bindInput(stage);
    this.newGame({ mode: 'sandbox' }, false);
    this.clock.setSpeed(0);
    this.hud.refresh(true);
    requestAnimationFrame(this.loop);
  }

  // ---------------------------------------------------------------- game lifecycle

  newGame(opts: NewGameOptions, announce = true): void {
    let state: WorldState;
    if ((opts.mode === 'scenario' || opts.mode === 'challenge') && opts.scenario) {
      state = createScenarioWorld(opts.scenario, opts.mode === 'challenge');
    } else {
      state = createReferenceWorld(opts.seed || 'TERRA-1', opts.params ?? {}, opts.mode === 'observer' ? 'observer' : 'sandbox');
    }
    this.load(state);
    if (announce) {
      this.hud.toast(state.scenario ? `Scenario begun: ${state.scenario.id.replace(/_/g, ' ')}` : `New ${state.mode} world “${state.seed}”.`, 'info');
      this.clock.setSpeed(1);
    }
  }

  load(state: WorldState): void {
    assertStateValid(state);
    invalidateForecast();
    this.forecast.invalidate();
    this.state = state;
    this.playtest.logEvent('load_game', 'save', `Tick ${state.tick}`, state.tick);
    this.clock.reset();
    this.selectedCell = -1;
    this.tool = { kind: 'inspect' };
    this.view.setSelection(-1);
    this.view.syncWorld(state);
    this.hud.onWorld();
    const first = state.settlements.find((s) => s.alive);
    if (first) this.view.focusCell(first.cellId, 3.0);
  }

  restart(): void {
    const s = this.state;
    if (s.scenario) this.newGame({ mode: s.mode, scenario: s.scenario.id });
    else this.newGame({ mode: s.mode, seed: s.seed, params: s.params });
  }

  saveSlot(slot: Slot): void {
    const r = saveToSlot(this.state, slot, '');
    this.hud.toast(r.message, r.ok ? 'good' : 'bad');
    this.hud.refresh(true);
  }

  loadSlot(slot: Slot): void {
    try {
      this.load(loadFromSlot(slot));
      this.clock.setSpeed(0);
      this.hud.toast('Game loaded. Paused — press Space to continue.', 'good');
    } catch (e) {
      this.hud.toast((e as Error).message, 'bad');
    }
  }

  deleteSlot(slot: Slot): void {
    if (deleteSlot(slot)) {
      this.hud.toast(`Deleted ${slotName(slot)}. A recovery backup was retained.`, 'info');
      this.hud.refresh(true);
    } else {
      this.hud.toast(`Could not delete ${slotName(slot)}.`, 'bad');
    }
  }

  restoreSlotBackup(slot: Slot): void {
    const r = restoreBackup(slot);
    this.hud.toast(r.message, r.ok ? 'good' : 'bad');
    this.hud.refresh(true);
  }

  exportSlotBackup(slot: Slot): void {
    const backup = getBackup(slot);
    if (!backup) {
      this.hud.toast(`No backup found for ${slotName(slot)}.`, 'bad');
      return;
    }
    const blob = new Blob([backup.json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `world-machine-${slot}-backup-${backup.reason}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    this.hud.toast(`Backup for ${slotName(slot)} exported as a JSON file.`, 'good');
  }

  exportSave(): void {
    const blob = new Blob([serialize(this.state, 'export')], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `world-machine-${this.state.seed}-t${this.state.tick}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    this.hud.toast('Save exported as a JSON file.', 'good');
  }

  importSave(file: File): void {
    file.text().then((text) => {
      try {
        this.load(deserialize(text));
        this.clock.setSpeed(0);
        this.hud.toast(`Imported “${file.name}”. Paused.`, 'good');
      } catch (e) {
        this.hud.toast(`Import failed: ${(e as Error).message}`, 'bad');
      }
    }, () => this.hud.toast('Could not read that file.', 'bad'));
  }

  adoptBranch(branch: BranchResult): boolean {
    const val = validateBranchAdoption(this.state, branch);
    if (!val.canAdopt) {
      this.hud.toast(val.reason || 'Cannot adopt strategy.', 'bad');
      this.audio.play('invalid');
      return false;
    }
    try {
      this.playtest.logEvent('adopt_branch', 'forecast', branch.label, this.state.tick);
      this.load(branch.state);
      this.hud.toast(`${branch.label} adopted: the world jumps to its future.`, 'good');
      return true;
    } catch (e) {
      this.hud.toast(`Cannot adopt branch: ${(e as Error).message}`, 'bad');
      this.audio.play('invalid');
      return false;
    }
  }

  private viewOptions() {
    return { quality: this.settings.quality, reducedMotion: this.settings.reducedMotion, reducedEffects: this.settings.reducedEffects, lighting: this.settings.lighting };
  }

  updateSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    saveSettings(this.settings);
    this.view.showBorders = this.settings.showBorders;
    this.view.setOptions(this.viewOptions(), this.state);
    this.view.syncTick(this.state);
    document.documentElement.classList.toggle('reduced-motion', this.settings.reducedMotion);
  }

  // ---------------------------------------------------------------- simulation

  /** Advance exactly one month (used by the Step control). */
  stepOnce(): void {
    if (!this.clock.paused) this.clock.setSpeed(0);
    this.runTicks(1);
  }

  private runTicks(n: number): void {
    if (this.state.scenario && this.state.scenario.status !== 'active') {
      this.clock.setSpeed(0);
      return;
    }
    for (let i = 0; i < n; i++) {
      const before = this.state.scenario?.status;
      const t0 = performance.now();
      step(this.state);
      this.perf.tickMs.push(performance.now() - t0);
      if (this.perf.tickMs.length > 240) this.perf.tickMs.shift();
      if (import.meta.env.DEV) assertStateValid(this.state);
      this.hud.onEvents(this.state.events);
      if (this.settings.autosave && this.state.tick % 12 === 0) saveToSlot(this.state, 'auto', 'autosave');
      if (before === 'active' && this.state.scenario && this.state.scenario.status !== 'active') {
        this.clock.setSpeed(0);
        this.audio.play(this.state.scenario.status === 'success' ? 'success' : 'failure');
        this.hud.scenarioEnded();
        break;
      }
    }
    this.pendingPaint = true;
    this.forecast.checkStaleness(this.state);
    this.hud.refresh();
  }

  // ---------------------------------------------------------------- commands & tools

  run(cmd: Command, cue: Cue = 'construct'): CommandResult {
    const r = applyCommand(this.state, cmd);
    this.audio.play(r.ok ? cue : 'invalid');
    const cell = commandCell(this.state, cmd, this.hoverCell);
    if (cell >= 0) this.view.fx(!r.ok ? 'invalid' : cmd.type === 'found' ? 'founded' : cmd.type === 'conserve' ? 'reserve' : cmd.type === 'route' ? 'agreement' : 'construction', cell);
    this.hud.toast(r.message, r.ok ? 'good' : 'bad');
    if (r.ok) {
      this.forecast.checkStaleness(this.state);
      this.playtest.logEvent(`cmd:${cmd.type}`, 'stewardship', r.message, this.state.tick);
      this.view.syncTick(this.state);
      this.hud.refresh(true);
    }
    return r;
  }

  setTool(tool: Tool): void {
    const blocked = tool.kind !== 'inspect' ? modeBlocker(this.state) : null;
    if (blocked) { this.hud.toast(blocked, 'warn'); this.audio.play('invalid'); return; }
    this.tool = tool;
    this.lastHint = '';
    this.hud.onTool();
    this.updateHover(this.hoverCell);
  }

  select(cell: number, focus = false): void {
    this.selectedCell = cell;
    if (cell >= 0) this.playtest.logEvent('select_cell', 'navigation', `Cell ${cell}`, this.state.tick);
    this.view.setSelection(cell);
    if (focus && cell >= 0) this.view.focusCell(cell);
    this.hud.onSelect();
  }

  /** Describe what the active tool would do at a cell: valid/invalid plus cost or reason. */
  toolHint(cell: number): { valid: boolean; text: string } | null {
    const s = this.state;
    const t = this.tool;
    if (cell < 0 || t.kind === 'inspect') return null;
    switch (t.kind) {
      case 'found': {
        const b = foundingBlocker(s, cell);
        if (b) return { valid: false, text: b };
        const src = foundingSource(s, cell);
        if (!src) return { valid: false, text: 'No settlement can spare settlers.' };
        if (src === 'expedition') return { valid: true, text: `Land the expedition here (${s.expedition!.population} settlers).` };
        const r = previewCommand(s, { type: 'found', cellId: cell });
        return { valid: r.ok, text: r.ok ? `Found from ${src.name}: 400 settlers, ${formatCost(foundingCost(s))}.` : r.message };
      }
      case 'build': {
        const r = previewCommand(s, { type: 'build', building: t.building, cellId: cell });
        const def = BUILDINGS[t.building];
        return { valid: r.ok, text: r.ok ? `${def.label}: ${formatCost(r.cost ?? {})}, ${def.months} months.` : r.message };
      }
      case 'road': {
        if (t.from < 0) return { valid: s.cells[cell].land, text: s.cells[cell].land ? 'Choose the road’s first region.' : 'Roads need land.' };
        const plan = planRoad(s, t.from, cell);
        if (typeof plan === 'string') return { valid: false, text: plan };
        return { valid: true, text: `${Math.round(plan.newKm)} km of road paid by ${plan.payer.name}: ${formatCost(plan.cost)}.` };
      }
      case 'route': {
        const owner = s.cells[cell].owner;
        const target = getSettlement(s, owner);
        if (!target || target.cellId !== cell) return { valid: false, text: 'Choose a settlement centre.' };
        if (t.from < 0) return { valid: true, text: `Start a route at ${target.name}.` };
        const from = getSettlement(s, t.from);
        if (!from) return { valid: false, text: 'Origin settlement is gone.' };
        const plan = planRoute(s, from, target, roadIndex(s.roads));
        if (typeof plan === 'string') return { valid: false, text: plan };
        return { valid: true, text: `${plan.mode === 'sea' ? 'Sea' : 'Land'} route ${Math.round(plan.distanceKm)} km · ${plan.travelMonths} mo · loss ${Math.round(plan.lossRate * 100)}% · ${Math.round(plan.capacity)}/mo` };
      }
      case 'conserve': {
        const c = s.cells[cell];
        if (!c.land) return { valid: false, text: 'Only land can be a reserve.' };
        const st = getSettlement(s, c.owner);
        if (st && st.cellId === cell) return { valid: false, text: 'A settlement centre cannot be a reserve.' };
        return { valid: true, text: c.conserved ? 'Lift this reserve.' : 'Designate a reserve: no extraction; faster recovery.' };
      }
    }
  }

  private applyTool(cell: number): void {
    const t = this.tool;
    const s = this.state;
    if (t.kind === 'inspect' || cell < 0) { this.select(cell); this.audio.play('click'); return; }
    switch (t.kind) {
      case 'found': if (this.run({ type: 'found', cellId: cell }, 'found').ok) { this.select(cell); this.setTool({ kind: 'inspect' }); } break;
      case 'build': this.run({ type: 'build', building: t.building, cellId: cell }); break;
      case 'road':
        if (t.from < 0) { if (s.cells[cell].land) { this.tool = { kind: 'road', from: cell }; this.hud.onTool(); this.audio.play('click'); } }
        else if (this.run({ type: 'road', fromCell: t.from, toCell: cell }).ok) { this.tool = { kind: 'road', from: -1 }; this.hud.onTool(); }
        break;
      case 'route': {
        const owner = getSettlement(s, s.cells[cell].owner);
        if (!owner || owner.cellId !== cell) { this.hud.toast('Choose a settlement centre (the glowing marker).', 'warn'); this.audio.play('invalid'); break; }
        if (t.from < 0) { this.tool = { kind: 'route', from: owner.id }; this.hud.onTool(); this.audio.play('click'); }
        else if (this.run({ type: 'route', a: t.from, b: owner.id }, 'trade').ok) { this.tool = { kind: 'route', from: -1 }; this.hud.onTool(); }
        break;
      }
      case 'conserve': this.run({ type: 'conserve', cellId: cell, on: !s.cells[cell].conserved }, 'complete'); break;
    }
    this.updateHover(cell, true);
  }

  private updateHover(cell: number, force = false): void {
    if (cell === this.hoverCell && !force) return;
    this.hoverCell = cell;
    const hint = this.toolHint(cell);
    this.view.setHover(cell, hint ? hint.valid : null);
    const text = hint?.text ?? '';
    if (text !== this.lastHint || force) { this.lastHint = text; this.hud.setHint(hint); }
  }

  // ---------------------------------------------------------------- input

  private bindInput(stage: HTMLElement): void {
    const canvas = this.view.renderer.domElement;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', (e) => {
      this.audio.unlock();
      this.view.noteInput();
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), moved: false });
      if (this.pointers.size > 1) this.gesture = true;
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6) p.moved = true;
      if (e.pointerType === 'mouse') {
        this.updateHover(this.view.pick(e.clientX, e.clientY));
        this.hud.moveHint(e.clientX, e.clientY);
      }
    });
    const end = (e: PointerEvent) => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      const wasGesture = this.gesture;
      if (this.pointers.size === 0) this.gesture = false;
      // A tap is short and still; drags and pinches never select.
      if (!p || p.moved || wasGesture || performance.now() - p.t > 650 || e.type === 'pointercancel') return;
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const cell = this.view.pick(e.clientX, e.clientY);
      if (e.pointerType !== 'mouse') { this.updateHover(cell); this.hud.moveHint(e.clientX, e.clientY); }
      this.applyTool(cell);
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', () => { this.updateHover(-1); });
    canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); this.setTool({ kind: 'inspect' }); });
    window.addEventListener('keydown', (e) => this.onKey(e));
    stage.addEventListener('dblclick', (e) => {
      const cell = this.view.pick(e.clientX, e.clientY);
      if (cell >= 0) this.view.focusCell(cell, Math.max(1.5, this.view.cameraDistance * 0.7));
    });
  }

  onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (this.hud.modalOpen) {
      if (k === 'Escape') {
        e.preventDefault();
        this.hud.closeModal();
      }
      return;
    }
    // Focused buttons, links, or role=button/tab receive Space and Enter natively without triggering world pause or world tools
    if (target && (target.tagName === 'BUTTON' || target.tagName === 'A' || target.getAttribute('role') === 'button' || target.getAttribute('role') === 'tab')) {
      if (k === ' ' || k === 'Enter') return;
    }
    this.audio.unlock();
    this.view.noteInput();
    const handled = () => e.preventDefault();
    if (k === ' ') { this.clock.togglePause(); this.hud.refresh(true); handled(); }
    else if (k === '.' || k === '>') { this.stepOnce(); handled(); }
    else if (k >= '1' && k <= '4') { this.clock.setSpeed(Number(k)); this.hud.refresh(true); }
    else if (k === 'Escape') {
      if (this.tool.kind !== 'inspect') this.setTool({ kind: 'inspect' });
      else if (this.selectedCell >= 0) this.select(-1);
      handled();
    }
    else if (k === 'q' || k === 'Q') this.setTool({ kind: 'inspect' });
    else if (k === 'n' || k === 'N') this.setTool({ kind: 'found' });
    else if (k === 'r' || k === 'R') this.setTool({ kind: 'road', from: -1 });
    else if (k === 't' || k === 'T') this.setTool({ kind: 'route', from: -1 });
    else if (k === 'c' || k === 'C') this.setTool({ kind: 'conserve' });
    else if (k === 'h' || k === 'H' || k === '?') this.hud.openHelp();
    else if (k === '[' || k === ']') this.hud.cycleOverlay(k === ']' ? 1 : -1);
    else if (k === '+' || k === '=') this.view.zoomBy(0.85);
    else if (k === '-' || k === '_') this.view.zoomBy(1.18);
    else if (k === 'Home') this.view.resetCamera();
    else if (k.startsWith('Arrow')) {
      const az = k === 'ArrowLeft' ? 0.12 : k === 'ArrowRight' ? -0.12 : 0;
      const el = k === 'ArrowUp' ? 0.1 : k === 'ArrowDown' ? -0.1 : 0;
      this.rotateCamera(az, el);
      handled();
    }
  }

  rotateCamera(az: number, el: number): void {
    const p = this.view.camera.position;
    const r = p.length();
    const theta = Math.atan2(p.x, p.z) + az;
    let phi = Math.acos(p.y / r) - el;
    phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi));
    p.set(r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.cos(theta));
  }

  // ---------------------------------------------------------------- frame loop

  private loop = (now: number): void => {
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.perf.frameMs.push(dt * 1000);
    if (this.perf.frameMs.length > 240) this.perf.frameMs.shift();
    const ticks = this.clock.advance(dt);
    if (ticks > 0 && !this.hud.modalOpen) this.runTicks(ticks);
    // Repaint planet colours at most ~5 times a second regardless of speed.
    this.paintTimer -= dt;
    if (this.pendingPaint && this.paintTimer <= 0) {
      this.view.syncTick(this.state);
      this.pendingPaint = false;
      this.paintTimer = 0.2;
    }
    this.view.frame(dt, this.state, this.clock.paused ? 0 : this.clock.phase);
    this.hud.frame();
    this.audio.update(dt, !this.clock.paused);
    requestAnimationFrame(this.loop);
  };

  destroy(): void {
    this.forecast.destroy();
  }
}
