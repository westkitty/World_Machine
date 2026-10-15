import type { App } from '../app/App';
import { SLOTS, deleteSlot, listSlots, slotName, storageAvailable } from '../app/storage';
import { createReferenceWorld } from '../sim/create';
import { SCENARIOS } from '../sim/scenarios';
import { getTopology } from '../sim/topology';
import type { GameMode, GenParams } from '../sim/types';
import { DEFAULT_PARAMS } from '../sim/worldgen';
import { BIOME_LABEL } from '../render/overlays';
import { button, clear, h, n0, pct } from './dom';

const MODES: { id: GameMode; title: string; text: string }[] = [
  { id: 'sandbox', title: 'Sandbox', text: 'Generate any world and steward it freely. Optional unrestricted tools.' },
  { id: 'scenario', title: 'Scenario', text: 'Five planetary problems with objectives, constraints and deadlines.' },
  { id: 'observer', title: 'Observer', text: 'Watch civilisations emerge on their own. Inspect, compare, follow history.' },
  { id: 'challenge', title: 'Challenge', text: 'The scenarios under scarcer supplies, costlier building and frequent crises.' },
];

function randomSeed(): string {
  const words = ['AZURE', 'BASALT', 'CINDER', 'DELTA', 'EMBER', 'FJORD', 'GLACIER', 'HALCYON', 'IRIS', 'JUNIPER', 'KESTREL', 'LUMEN', 'MERIDIAN', 'NIMBUS', 'OCHRE', 'PELAGIC', 'QUARTZ', 'RIFT', 'SOLACE', 'TUNDRA', 'UMBRA', 'VERDANT', 'WILLOW', 'ZEPHYR'];
  return `${words[Math.floor(Math.random() * words.length)]}-${Math.floor(Math.random() * 900 + 100)}`;
}

export function titleScreen(app: App, close: () => void): HTMLElement {
  let mode: GameMode = 'sandbox';
  let seed = app.state?.scenario ? 'TERRA-1' : app.state?.seed ?? 'TERRA-1';
  const params: GenParams = { ...DEFAULT_PARAMS };
  const body = h('div.title-body');
  const summary = h('div.summary');
  const hasAuto = listSlots()[0] !== null;

  const renderSummary = () => {
    clear(summary);
    const preview = createReferenceWorld(seed, params, mode === 'observer' ? 'observer' : 'sandbox');
    const topo = getTopology();
    const landFrac = preview.cells.reduce((a, c, i) => a + (c.land ? topo.areaFrac[i] : 0), 0);
    const biomeArea = new Map<string, number>();
    preview.cells.forEach((c, i) => { if (c.land) biomeArea.set(c.biome, (biomeArea.get(c.biome) ?? 0) + topo.areaFrac[i]); });
    const top = [...biomeArea.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const pop = preview.settlements.reduce((a, s) => a + s.population, 0);
    const ore = preview.cells.filter((c) => c.ore > 0).length;
    summary.append(
      h('h4', `World “${seed}”`),
      h('div.chips', h('span.chip', `${pct(landFrac)} land`), h('span.chip', `${preview.settlements.length} communities`), h('span.chip', `${n0(pop)} people`), h('span.chip', `${ore} ore regions`)),
      h('p.muted', `Dominant land: ${top.map(([b, a]) => `${BIOME_LABEL[b as keyof typeof BIOME_LABEL]} ${pct(a / Math.max(1e-9, landFrac))}`).join(' · ')}`),
      h('p.muted', `Communities: ${preview.settlements.map((s) => s.name).join(', ')}`),
    );
  };

  const slider = (key: keyof GenParams, label: string, min: number, max: number, stepV: number, fmt: (v: number) => string) => {
    const out = h('output', fmt(params[key]));
    const input = h('input', { type: 'range', min, max, step: stepV, value: params[key], 'aria-label': label, on: {
      input: (e: Event) => { params[key] = Number((e.target as HTMLInputElement).value); out.textContent = fmt(params[key]); },
      change: () => renderSummary(),
    } });
    return h('label.field', h('span', label, ' ', out), input);
  };

  const renderBody = () => {
    clear(body);
    if (mode === 'sandbox' || mode === 'observer') {
      const seedInput = h('input', { type: 'text', value: seed, maxlength: 40, 'aria-label': 'World seed', on: { change: (e: Event) => { seed = (e.target as HTMLInputElement).value.trim() || 'TERRA-1'; renderSummary(); } } }) as HTMLInputElement;
      body.append(
        h('div.gen',
          h('div.gen-controls',
            h('label.field', 'Seed', h('div.inline', seedInput, button('🎲 Random', () => { seed = randomSeed(); seedInput.value = seed; renderSummary(); }, { kind: 'ghost' }))),
            slider('oceanCoverage', 'Ocean coverage', 0.3, 0.85, 0.01, pct),
            slider('ruggedness', 'Terrain ruggedness', 0.2, 1.6, 0.05, (v) => `${v.toFixed(2)}×`),
            slider('temperatureOffset', 'Climate (temperature)', -10, 10, 0.5, (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} °C`),
            slider('moisture', 'Rainfall', 0.4, 1.6, 0.05, (v) => `${v.toFixed(2)}×`)),
          summary),
        h('div.actions.end', button(mode === 'observer' ? 'Begin observing' : 'Generate & begin', () => { app.newGame({ mode, seed, params }); close(); }, { kind: 'primary' })),
      );
      renderSummary();
    } else {
      body.append(h('div.scenario-grid', ...SCENARIOS.map((d) => h('article.scard',
        h('div.eyebrow', `${mode === 'challenge' ? 'Challenge' : 'Scenario'} ${d.index}`),
        h('h4', d.title), h('p', d.brief),
        h('ul', ...d.constraints.map((c) => h('li', c))),
        h('p.muted', `Deadline: ${Math.round(d.deadline * (mode === 'challenge' && d.id !== 'long_drought' ? 0.9 : 1))} months`),
        button('Start', () => { app.newGame({ mode, scenario: d.id }); close(); }, { kind: 'primary' })))));
    }
  };

  const tabs = h('div.mode-tabs', { role: 'tablist' }, ...MODES.map((m) => {
    const b = h('button.mode', { type: 'button', role: 'tab', 'aria-selected': String(m.id === mode), on: { click: () => {
      mode = m.id;
      tabs.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      renderBody();
    } } }, h('b', m.title), h('span', m.text));
    return b;
  }));
  renderBody();
  return h('div.title',
    h('div.title-hero', h('div.eyebrow', 'Planetary civilisation simulator'), h('h1', 'The World Machine'),
      h('p', 'Shape the conditions in which communities rise, trade, prosper and fail on a living spherical world. You are a steward, not a ruler: every intervention has a cost and a consequence.')),
    tabs, body,
    h('div.title-foot',
      hasAuto ? button('Continue autosave', () => { app.loadSlot('auto'); close(); }, { kind: 'ghost' }) : null,
      button('Load / import…', () => app.hud.openSaves(), { kind: 'ghost' }),
      button('How to play', () => app.hud.openHelp(), { kind: 'ghost' }),
      app.state ? button('Back to current world', close, { kind: 'ghost' }) : null),
  );
}

export function settingsScreen(app: App): HTMLElement {
  const st = app.settings;
  const a = app.audio.prefs;
  const seg = (value: string, opts: [string, string][], onPick: (v: string) => void) =>
    h('div.seg', ...opts.map(([v, label]) => button(label, () => onPick(v), { kind: value === v ? 'on' : 'ghost', ariaPressed: value === v })));
  const check = (label: string, value: boolean, onChange: (v: boolean) => void, hint = '') => h('label.check', { title: hint }, h('input', { type: 'checkbox', checked: value, on: { change: (e: Event) => onChange((e.target as HTMLInputElement).checked) } }), ` ${label}`);
  const vol = (label: string, key: 'master' | 'music' | 'effects') => h('label.field', `${label} ${Math.round(a[key] * 100)}%`,
    h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: a[key], 'aria-label': `${label} volume`, on: { input: (e: Event) => { app.audio.unlock(); app.audio.setPrefs({ [key]: Number((e.target as HTMLInputElement).value) }); }, change: () => app.hud.openSettings() } }));
  const s = app.view.stats();
  return h('div.sheet',
    h('h2', 'Settings'),
    h('section.block', h('h3', 'Graphics'),
      seg(st.quality, [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], (v) => { app.updateSettings({ quality: v as never }); app.hud.openSettings(); }),
      h('p.muted', 'Low: coarse mesh, no clouds, 1× pixels. Medium: clouds, 1.5×. High: fine mesh, 2×.'),
      check('Reduced motion (no camera flights, still clouds and sea)', st.reducedMotion, (v) => app.updateSettings({ reducedMotion: v })),
      check('Reduced effects (no clouds, faint atmosphere)', st.reducedEffects, (v) => app.updateSettings({ reducedEffects: v })),
      check('Show region borders in overlays', st.showBorders, (v) => app.updateSettings({ showBorders: v })),
      check('Show settlement labels', st.showLabels, (v) => app.updateSettings({ showLabels: v })),
      h('p.muted', `Renderer: ${s.calls} draw calls, ${n0(s.triangles)} triangles, ${s.geometries} geometries, ${s.textures} textures.`),
      button(document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen', () => {
        const el = document.documentElement;
        if (document.fullscreenElement) void document.exitFullscreen();
        else if (el.requestFullscreen) el.requestFullscreen().catch(() => app.hud.toast('Fullscreen is not available in this browser.', 'warn'));
        else app.hud.toast('Fullscreen is not supported here; add the page to your home screen instead.', 'warn');
      }, { kind: 'ghost' })),
    h('section.block', h('h3', 'Audio'),
      check('Mute all sound', a.muted, (v) => { app.audio.unlock(); app.audio.setPrefs({ muted: v }); }),
      vol('Master', 'master'), vol('Music & ambience', 'music'), vol('Effects', 'effects'),
      h('p.muted', app.audio.unlocked ? 'Audio is active.' : 'Audio starts after your first click or key press.')),
    h('section.block', h('h3', 'Simulation & saves'),
      check('Autosave every year', st.autosave, (v) => app.updateSettings({ autosave: v })),
      button('Manage saves…', () => app.hud.openSaves(), { kind: 'ghost' })),
  );
}

export function savesScreen(app: App): HTMLElement {
  const infos = listSlots();
  const file = h('input', { type: 'file', accept: 'application/json,.json', 'aria-label': 'Import save file', on: { change: (e: Event) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) { app.importSave(f); app.hud.closeModal(); } } } }) as HTMLInputElement;
  return h('div.sheet',
    h('h2', 'Saves'),
    storageAvailable() ? null : h('p.warnline', 'Browser storage is unavailable in this session; use Export and Import instead.'),
    h('ul.slots', ...SLOTS.map((slot, i) => {
      const info = infos[i];
      return h('li',
        h('div', h('b', slotName(slot)), h('p.muted', info ? `${info.summary} · ${new Date(info.savedAt).toLocaleString()}` : 'Empty')),
        h('div.inline',
          slot !== 'auto' ? button('Save here', () => { app.saveSlot(slot); app.hud.openSaves(); }, { kind: 'ghost' }) : null,
          button('Load', () => { app.loadSlot(slot); app.hud.closeModal(); }, { kind: 'ghost', disabled: info ? false : 'Empty slot' }),
          button('Delete', () => { deleteSlot(slot); app.hud.openSaves(); }, { kind: 'ghost', disabled: info ? false : 'Empty slot' })));
    })),
    h('section.block', h('h3', 'Files'),
      h('div.inline', button('Export current world (.json)', () => app.exportSave()), h('label.btn.ghost', 'Import .json', file)),
      h('p.muted', 'Saves contain the full simulation: seed, random-generator state, every region, settlement, route, shipment, policy, technology, scenario progress and history.')),
  );
}

export function helpScreen(): HTMLElement {
  const k = (keys: string, what: string) => h('tr', h('th', h('kbd', keys)), h('td', what));
  return h('div.sheet.help',
    h('h2', 'How to play'),
    h('p', 'The World Machine simulates a planet of 642 regions month by month. Communities produce, consume, trade, migrate and found new settlements according to the land, the climate and your policies. Your job is to shape conditions — infrastructure, reserves, trade and policy — not to command individuals.'),
    h('section.block', h('h3', 'The loop'),
      h('ol',
        h('li', 'Inspect a region or settlement (click/tap). Read its reserves, shortages and why.'),
        h('li', 'Pick a tool on the left: found a settlement, build farms, mines, storehouses, power works or ports, lay roads, open trade routes, or designate reserves. Hover to preview cost and validity.'),
        h('li', 'Set policy: extraction intensity, rationing, growth, local autonomy, trade priority and technology.'),
        h('li', 'Advance time. Watch the ledger, crises and objectives; respond before problems cascade.'),
        h('li', 'Use Compare to fork the world and test two strategies with the real engine.'))),
    h('section.block', h('h3', 'Key causes'),
      h('ul',
        h('li', 'Food needs farms (fertile, moist, warm land) or foraging; farms use water and slowly exhaust soil.'),
        h('li', 'Water renews with rainfall and rivers; droughts cut it.'),
        h('li', 'Harvesting a forest below half its capacity degrades land; reserves heal it, intensive extraction speeds damage.'),
        h('li', 'Mines draw down finite ore and pollute. Tools need ore; shortage lowers productivity.'),
        h('li', 'Structures need maintenance; neglected ones decay and collapse.'),
        h('li', 'Trade moves real goods with transit time and loss; roads and ports make it faster and larger.'),
        h('li', 'Neighbours who compete for scarce goods and do not trade grow hostile and may embargo each other.'))),
    h('section.block', h('h3', 'Controls'),
      h('table.keys', h('tbody',
        k('Drag / one finger', 'Rotate the planet'), k('Wheel / pinch', 'Zoom'), k('Click / tap', 'Select region or use tool'), k('Double-click', 'Fly to region'),
        k('Right-click / Esc', 'Back to Inspect'), k('Space', 'Pause / resume'), k('.', 'Advance one month'), k('1–4', 'Speed'),
        k('Q N R T C', 'Inspect, Found, Road, Trade route, Reserve'), k('[ ]', 'Previous / next overlay'), k('Arrows', 'Rotate camera'), k('+ / −', 'Zoom'), k('Home', 'Reset view'), k('H', 'This help')))),
  );
}
