import type { App, Tool } from '../app/App';
import { SPEEDS } from '../app/clock';
import { BUILDINGS, GOOD_LABEL } from '../sim/constants';
import { computeMetrics } from '../sim/engine';
import { getScenario } from '../sim/scenarios';
import { getSettlement } from '../sim/settlements';
import { formatDate, type BuildingType, type HistoryEvent } from '../sim/types';
import { OVERLAYS, buildOverlayContext, getOverlay, type Legend, type RGB } from '../render/overlays';
import { button, clear, compact, h, pct } from './dom';
import { helpScreen, savesScreen, settingsScreen, titleScreen } from './menus';
import { PANELS, TABS, statusGlyph, type TabId } from './panels';

const css = (c: RGB) => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;

const TOOLS: { tool: Tool; label: string; icon: string; key: string; hint: string }[] = [
  { tool: { kind: 'inspect' }, label: 'Inspect', icon: '⌕', key: 'Q', hint: 'Select regions and settlements.' },
  { tool: { kind: 'found' }, label: 'Found', icon: '✦', key: 'N', hint: 'Send settlers to found a new community.' },
  ...(Object.keys(BUILDINGS) as BuildingType[]).map((b) => ({ tool: { kind: 'build', building: b } as Tool, label: BUILDINGS[b].label, icon: { farm: '❦', mine: '⛏', storage: '▣', energy: 'ϟ', port: '⚓' }[b], key: '', hint: BUILDINGS[b].description })),
  { tool: { kind: 'road', from: -1 }, label: 'Road', icon: '═', key: 'R', hint: 'Pave land links: cheaper, faster, larger trade.' },
  { tool: { kind: 'route', from: -1 }, label: 'Trade route', icon: '⇄', key: 'T', hint: 'Connect two settlements to exchange goods.' },
  { tool: { kind: 'conserve' }, label: 'Reserve', icon: '❀', key: 'C', hint: 'Protect a region: no extraction, faster recovery.' },
];

const toolKey = (t: Tool) => (t.kind === 'build' ? `build:${t.building}` : t.kind);

/**
 * DOM user interface. Reads simulation state; changes it only through
 * App.run (commands) or App lifecycle methods.
 */
export class Hud {
  private root: HTMLElement;
  private top!: HTMLElement;
  private clockEl!: HTMLElement;
  private stats!: HTMLElement;
  private rail!: HTMLElement;
  private drawer!: HTMLElement;
  private drawerBody!: HTMLElement;
  private tabBar!: HTMLElement;
  private overlayBar!: HTMLElement;
  private legend!: HTMLElement;
  private toasts!: HTMLElement;
  private hint!: HTMLElement;
  private hintBar!: HTMLElement;
  private labels!: HTMLElement;
  private banner!: HTMLElement;
  private modal!: HTMLElement;
  private modalBody!: HTMLElement;
  private labelEls = new Map<number, HTMLElement>();
  private seen = new WeakSet<HistoryEvent>();
  private tab: TabId = 'region';
  private drawerOpen = true;
  private dirty = false;
  private lastRefresh = 0;
  modalOpen = false;
  private resumeSpeed = 0;

  constructor(private app: App) {
    this.root = document.querySelector<HTMLElement>('#ui')!;
    this.build();
    if (matchMedia('(max-width: 760px)').matches) this.setDrawer(false);
  }

  // ---------------------------------------------------------------- layout

  private build(): void {
    const app = this.app;
    this.clockEl = h('div.clock');
    this.stats = h('div.stats', { 'aria-live': 'polite' });
    this.top = h('header.topbar',
      h('div.brand', h('button.brand-btn', { type: 'button', title: 'New game / main menu', on: { click: () => this.openTitle() } }, h('span.logo', '◉'), h('span.word', 'The World Machine')), h('div.world', { id: 'world-name' })),
      this.clockEl,
      h('div.top-right', this.stats,
        h('div.menu', button('Save', () => this.openSaves(), { kind: 'ghost', title: 'Save, load, export or import' }), button('⚙', () => this.openSettings(), { kind: 'ghost', title: 'Settings' }), button('?', () => this.openHelp(), { kind: 'ghost', title: 'Help & controls (H)' }))));
    this.banner = h('div.banner', { role: 'status' });
    this.rail = h('nav.rail', { 'aria-label': 'Tools' });
    this.tabBar = h('div.tabs', { role: 'tablist' });
    this.drawerBody = h('div.drawer-body', { role: 'tabpanel', tabindex: '-1' });
    this.drawer = h('aside.drawer', { 'aria-label': 'Inspector' },
      h('button.drawer-toggle', { type: 'button', 'aria-label': 'Toggle inspector', on: { click: () => this.setDrawer(!this.drawerOpen) } }, h('span', '⟩')),
      this.tabBar, this.drawerBody);
    this.overlayBar = h('div.overlays', { role: 'toolbar', 'aria-label': 'Map overlays' });
    this.legend = h('div.legend');
    this.toasts = h('div.toasts', { 'aria-live': 'polite' });
    this.hint = h('div.hint', { role: 'tooltip' });
    this.hintBar = h('div.hintbar');
    this.labels = h('div.labels');
    this.modalBody = h('div.modal-body');
    this.modal = h('div.modal', { role: 'dialog', 'aria-modal': 'true', on: { click: (e: Event) => { if (e.target === this.modal) this.closeModal(); } } },
      h('div.modal-card', h('button.modal-close', { type: 'button', 'aria-label': 'Close', on: { click: () => this.closeModal() } }, '✕'), this.modalBody));
    const camera = h('div.camera', { 'aria-label': 'Camera' },
      button('＋', () => app.view.zoomBy(0.8), { kind: 'ghost', title: 'Zoom in (+)' }),
      button('－', () => app.view.zoomBy(1.25), { kind: 'ghost', title: 'Zoom out (−)' }),
      button('⟲', () => app.view.resetCamera(), { kind: 'ghost', title: 'Reset view (Home)' }),
      h('div.bookmarks', ...[0, 1, 2, 3].map((i) => button(`${i + 1}`, () => this.bookmark(i), { kind: 'ghost', title: `Bookmark ${i + 1}: click to fly there; Shift-click to store current view` }))));
    this.root.append(this.labels, this.top, this.banner, this.rail, this.drawer, h('div.bottom', this.hintBar, this.overlayBar, this.legend), camera, this.toasts, this.hint, this.modal);
    this.buildRail();
    this.buildTabs();
    this.buildOverlayBar();
    document.addEventListener('keydown', (e) => {
      if (e.shiftKey && /^[!@#$]$/.test(e.key)) this.bookmark('!@#$'.indexOf(e.key), true);
    });
  }

  private bookmark(i: number, store = false): void {
    const app = this.app;
    const marks = [...app.settings.bookmarks];
    const ev = window.event as MouseEvent | undefined;
    if (store || ev?.shiftKey || !marks[i]) {
      marks[i] = app.view.getCameraState();
      app.updateSettings({ bookmarks: marks });
      this.toast(`View stored in bookmark ${i + 1}.`, 'info');
    } else app.view.setCameraState(marks[i]!);
  }

  private buildRail(): void {
    clear(this.rail);
    const blocked = this.app.state?.mode === 'observer';
    for (const t of TOOLS) {
      const active = toolKey(t.tool) === toolKey(this.app.tool);
      const disabled = blocked && t.tool.kind !== 'inspect';
      this.rail.append(h(`button.tool${active ? '.active' : ''}${disabled ? '.disabled' : ''}`, {
        type: 'button', 'aria-pressed': String(active), 'aria-disabled': disabled ? 'true' : undefined,
        title: disabled ? 'Observer mode: interventions are disabled' : `${t.label}${t.key ? ` (${t.key})` : ''} — ${t.hint}`,
        on: { click: () => { this.app.audio.unlock(); this.app.setTool(t.tool); } },
      }, h('span.icon', t.icon), h('span.lbl', t.label)));
    }
  }

  private buildTabs(): void {
    clear(this.tabBar);
    for (const t of TABS) {
      const crisis = t.id === 'crises' && this.app.state?.crises.some((c) => !c.resolved);
      this.tabBar.append(h(`button.tab${t.id === this.tab ? '.on' : ''}`, {
        type: 'button', role: 'tab', 'aria-selected': String(t.id === this.tab), title: t.label,
        on: { click: () => this.showTab(t.id) },
      }, h('span.icon', t.icon), h('span.lbl', t.label), crisis ? h('i.dot') : null));
    }
  }

  private buildOverlayBar(): void {
    clear(this.overlayBar);
    for (const o of OVERLAYS) {
      const on = o.id === this.app.view.overlay;
      this.overlayBar.append(h(`button.ov${on ? '.on' : ''}`, { type: 'button', 'aria-pressed': String(on), on: { click: () => this.setOverlay(o.id) } }, o.label));
    }
    this.renderLegend();
  }

  setOverlay(id: string): void {
    this.app.view.setOverlay(id, this.app.state);
    this.app.view.setCloudsVisible(id === 'terrain');
    this.buildOverlayBar();
    if (this.tab === 'region') this.renderPanel();
  }

  cycleOverlay(d: number): void {
    const i = OVERLAYS.findIndex((o) => o.id === this.app.view.overlay);
    this.setOverlay(OVERLAYS[(i + d + OVERLAYS.length) % OVERLAYS.length].id);
  }

  private renderLegend(): void {
    if (!this.app.state) return;
    const def = getOverlay(this.app.view.overlay);
    const ctx = buildOverlayContext(this.app.state);
    const lg: Legend = def.legend(ctx);
    clear(this.legend);
    this.legend.append(h('b', def.label));
    if (lg.kind === 'gradient') {
      this.legend.append(h('div.ramp', { style: { background: `linear-gradient(90deg, ${lg.stops.map(css).join(',')})` } }),
        h('div.ramp-labels', h('span', lg.min), lg.mid ? h('span', lg.mid) : null, h('span', lg.max)), h('small', lg.unit));
    } else {
      this.legend.append(h('div.swatches', ...lg.items.map((it) => h('span', h('i', { style: { background: css(it.color) } }), it.label))));
    }
    const sel = this.app.selectedCell;
    if (sel >= 0) this.legend.append(h('div.legend-sel', `Region ${sel}: ${def.value(this.app.state.cells[sel], sel, ctx)}`));
  }

  private setDrawer(open: boolean): void {
    this.drawerOpen = open;
    this.drawer.classList.toggle('closed', !open);
    document.body.classList.toggle('drawer-closed', !open);
  }

  showTab(id: TabId): void {
    this.tab = id;
    this.setDrawer(true);
    this.buildTabs();
    this.renderPanel();
    this.drawerBody.scrollTop = 0;
  }

  private renderPanel(): void {
    const active = document.activeElement;
    if (active && this.drawerBody.contains(active) && (active.tagName === 'SELECT' || active.tagName === 'INPUT')) return;
    const scroll = this.drawerBody.scrollTop;
    clear(this.drawerBody).append(PANELS[this.tab](this.app));
    this.drawerBody.scrollTop = scroll;
  }

  // ---------------------------------------------------------------- lifecycle hooks

  onWorld(): void {
    for (const e of this.app.state.events) this.seen.add(e);
    for (const el of this.labelEls.values()) el.remove();
    this.labelEls.clear();
    const s = this.app.state;
    this.tab = s.scenario ? 'scenario' : 'region';
    document.getElementById('world-name')!.textContent = `${s.mode[0].toUpperCase()}${s.mode.slice(1)} · “${s.seed}”`;
    document.body.dataset.mode = s.mode;
    this.buildRail();
    this.buildTabs();
    this.buildOverlayBar();
    this.refresh(true);
  }

  onTool(): void {
    this.buildRail();
    const t = this.app.tool;
    const msg: Record<Tool['kind'], string> = {
      inspect: 'Inspect: click a region or settlement. Drag to rotate, scroll or pinch to zoom.',
      found: this.app.state.expedition ? 'Found: choose a site for the expedition (green outline = valid).' : 'Found: choose an unclaimed land region. Settlers and supplies come from the nearest large settlement.',
      build: t.kind === 'build' ? `Build ${BUILDINGS[t.building].label}: choose a region inside a territory. ${BUILDINGS[t.building].description}` : '',
      road: t.kind === 'road' && t.from >= 0 ? 'Road: now choose the destination region.' : 'Road: choose the first land region.',
      route: t.kind === 'route' && t.from >= 0 ? `Trade route from ${getSettlement(this.app.state, t.from)?.name}: choose the partner settlement.` : 'Trade route: choose the first settlement centre.',
      conserve: 'Reserve: click a land region to protect it or lift protection.',
    };
    this.hintBar.textContent = `${msg[t.kind]}${t.kind !== 'inspect' ? '  ·  Esc / right-click to cancel' : ''}`;
  }

  onSelect(): void {
    const s = this.app.state;
    const cell = this.app.selectedCell;
    if (cell >= 0) {
      const st = getSettlement(s, s.cells[cell].owner);
      if (st && st.cellId === cell && this.tab !== 'settlement') this.tab = 'settlement';
      else if ((!st || st.cellId !== cell) && this.tab === 'settlement' && !st) this.tab = 'region';
      else if (this.tab !== 'settlement' && this.tab !== 'region') this.tab = 'region';
      this.setDrawer(true);
    }
    this.buildTabs();
    this.renderPanel();
    this.renderLegend();
  }

  /** Raise toasts and audio cues for events the player has not yet seen. */
  onEvents(events: HistoryEvent[]): void {
    for (const e of events) {
      if (this.seen.has(e)) continue;
      this.seen.add(e);
      const kind = e.kind;
      const loud = e.severity !== 'info' || kind === 'founded' || kind === 'tech' || kind.startsWith('scenario');
      if (!loud || kind === 'construction' || kind === 'crisis:end') continue;
      if (kind === 'built') this.app.audio.play('complete');
      else if (kind.startsWith('crisis:')) this.app.audio.play('crisis');
      else if (kind === 'founded') this.app.audio.play('found');
      else if (kind === 'agreement' || kind === 'relief') this.app.audio.play('trade');
      else if (kind === 'tech') this.app.audio.play('notify');
      this.toast(e.text, e.severity === 'bad' ? 'bad' : e.severity === 'warn' ? 'warn' : e.severity === 'good' ? 'good' : 'info', e.cellId);
    }
  }

  scenarioEnded(): void {
    const sc = this.app.state.scenario!;
    const def = getScenario(sc.id)!;
    this.openModal(h('div.sheet.result',
      h('div.eyebrow', `${sc.challenge ? 'Challenge' : 'Scenario'} ${def.index} · ${def.title}`),
      h('h2', sc.status === 'success' ? 'Objective achieved' : 'The world did not hold'),
      h('p', sc.message),
      h('ul.objectives', ...def.objectives(this.app.state).map((o) => h(`li${o.met ? '.met' : ''}`, `${o.met ? '✓' : '○'} ${o.label}: ${o.current} (target ${o.target})`))),
      h('div.actions', button('Restart', () => { this.closeModal(); this.app.restart(); }, { kind: 'primary' }), button('Keep inspecting', () => this.closeModal(), { kind: 'ghost' }), button('Main menu', () => this.openTitle(), { kind: 'ghost' }))));
    this.refresh(true);
  }

  // ---------------------------------------------------------------- refresh

  refresh(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastRefresh < 300) { this.dirty = true; return; }
    this.dirty = false;
    this.lastRefresh = now;
    const s = this.app.state;
    const clock = this.app.clock;
    clear(this.clockEl).append(
      h('div.date', h('span.when', formatDate(s.tick)), h('span.tickno', `month ${s.tick}`)),
      h('div.controls',
        button(clock.paused ? '▶' : '❚❚', () => { this.app.audio.unlock(); clock.togglePause(); this.refresh(true); }, { kind: 'ghost', title: clock.paused ? 'Resume (Space)' : 'Pause (Space)', ariaPressed: clock.paused }),
        button('⏭', () => { this.app.audio.unlock(); this.app.stepOnce(); }, { kind: 'ghost', title: 'Advance exactly one month (.)' }),
        ...SPEEDS.slice(1).map((sp, i) => button(sp.label, () => { this.app.audio.unlock(); clock.setSpeed(i + 1); this.refresh(true); }, { kind: clock.speed === i + 1 ? 'on' : 'ghost', title: `${sp.ticksPerSecond} months/second (${i + 1})`, ariaPressed: clock.speed === i + 1 }))),
      ...(clock.paused ? [h('div.paused', 'PAUSED')] : []));
    const m = computeMetrics(s);
    const shortages = s.settlements.filter((x) => x.alive && x.last.shortage.some((g) => g === 'food' || g === 'water')).length;
    const crises = s.crises.filter((c) => !c.resolved).length;
    clear(this.stats).append(
      h('span.stat', { title: 'Planetary population' }, h('i', '☉'), compact(m.population)),
      h('span.stat', { title: 'Living settlements' }, h('i', '⌂'), String(m.settlements)),
      h('span.stat', { title: 'Food stored planet-wide' }, h('i', '❦'), compact(m.food)),
      h('span.stat', { title: 'Mean land degradation' }, h('i', '◒'), pct(m.degradation)),
      h(`span.stat${shortages ? '.bad' : ''}`, { title: 'Settlements short of food or water' }, h('i', '!'), `${shortages} short`),
      ...(crises ? [h('span.stat.bad', { title: 'Active crises', on: { click: () => this.showTab('crises') } }, h('i', '⚠'), `${crises}`)] : []));
    this.app.audio.setMood(m.wellbeing);
    this.renderBanner();
    this.buildTabs();
    this.renderPanel();
    this.renderLegend();
  }

  private renderBanner(): void {
    const s = this.app.state;
    clear(this.banner);
    this.banner.classList.toggle('show', !!s.scenario || s.mode === 'observer' || s.rules.unrestricted);
    if (s.scenario) {
      const def = getScenario(s.scenario.id)!;
      const objs = def.objectives(s);
      const met = objs.filter((o) => o.met).length;
      this.banner.append(h('button.banner-btn', { type: 'button', on: { click: () => this.showTab('scenario') } },
        h('b', `${s.scenario.challenge ? 'Challenge' : 'Scenario'}: ${def.title}`),
        h('span', s.scenario.status === 'active' ? ` ${met}/${objs.length} objectives · ${Math.max(0, s.scenario.deadline - s.tick)} months left${def.holdMonths && s.scenario.streak ? ` · held ${s.scenario.streak}/${def.holdMonths}` : ''}` : ` — ${s.scenario.status.toUpperCase()}`)));
    } else if (s.mode === 'observer') {
      this.banner.append(h('span', h('b', 'Observer mode'), ' — the planet evolves without intervention.'));
    } else if (s.rules.unrestricted) {
      this.banner.append(h('span.warnline', h('b', 'UNRESTRICTED SANDBOX'), ' — costs are waived.'));
    }
  }

  frame(): void {
    if (this.dirty) this.refresh();
    this.positionLabels();
  }

  private positionLabels(): void {
    const s = this.app.state;
    const show = this.app.settings.showLabels;
    const view = this.app.view;
    const live = s.settlements.filter((x) => x.alive);
    const ranked = [...live].sort((a, b) => b.population - a.population);
    const far = view.cameraDistance > 3.3;
    const keep = new Set<number>();
    ranked.forEach((st, rank) => {
      let el = this.labelEls.get(st.id);
      if (!el) {
        el = h('button.label', { type: 'button', on: { click: () => { this.app.select(st.cellId, true); this.showTab('settlement'); } } });
        this.labelEls.set(st.id, el);
        this.labels.append(el);
      }
      keep.add(st.id);
      const p = view.project(st.cellId);
      const visible = show && p.visible && (!far || rank < 10);
      el.style.display = visible ? '' : 'none';
      if (!visible) return;
      el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      const text = `${st.name} · ${compact(st.population)} ${statusGlyph(st).split(' ')[0]}`;
      if (el.textContent !== text) {
        el.textContent = text;
        el.title = `${st.name}: ${Math.round(st.population).toLocaleString()} people, ${statusGlyph(st)}, ${st.specialization}${st.last.shortage.length ? `, short of ${st.last.shortage.map((g) => GOOD_LABEL[g]).join(', ')}` : ''}`;
      }
      el.classList.toggle('sel', s.cells[this.app.selectedCell]?.owner === st.id);
    });
    for (const [id, el] of this.labelEls) if (!keep.has(id)) { el.remove(); this.labelEls.delete(id); }
  }

  // ---------------------------------------------------------------- feedback

  toast(text: string, kind: 'info' | 'good' | 'warn' | 'bad' = 'info', cellId = -1): void {
    const el = h(`div.toast.${kind}`, { role: kind === 'bad' ? 'alert' : 'status' }, h('span.ic', { good: '✓', bad: '✕', warn: '!', info: '·' }[kind]), h('span', text));
    if (cellId >= 0) { el.classList.add('link'); el.addEventListener('click', () => this.app.select(cellId, true)); }
    this.toasts.prepend(el);
    while (this.toasts.children.length > 5) this.toasts.lastElementChild?.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, kind === 'bad' ? 8000 : 5000);
  }

  setHint(hint: { valid: boolean; text: string } | null): void {
    this.hint.textContent = hint?.text ?? '';
    this.hint.className = `hint${hint ? ' show' : ''}${hint ? (hint.valid ? ' ok' : ' no') : ''}`;
  }

  moveHint(x: number, y: number): void {
    this.hint.style.transform = `translate(${Math.min(window.innerWidth - 280, x + 16)}px, ${y + 18}px)`;
  }

  // ---------------------------------------------------------------- modals

  openModal(content: HTMLElement): void {
    if (!this.modalOpen) this.resumeSpeed = this.app.clock.speed;
    this.modalOpen = true;
    clear(this.modalBody).append(content);
    this.modal.classList.add('open');
    (this.modal.querySelector('.modal-close') as HTMLElement)?.focus();
  }

  closeModal(): void {
    if (!this.modalOpen) return;
    this.modalOpen = false;
    this.modal.classList.remove('open');
    clear(this.modalBody);
    this.refresh(true);
    void this.resumeSpeed;
  }

  openTitle(): void { this.openModal(titleScreen(this.app, () => this.closeModal())); }
  openHelp(): void { this.openModal(helpScreen()); }
  openSettings(): void { this.openModal(settingsScreen(this.app)); }
  openSaves(): void { this.openModal(savesScreen(this.app)); }
}
