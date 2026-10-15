import type { App } from '../app/App';
import { BUILDINGS, GOOD_LABEL, TECHS } from '../sim/constants';
import { compareStrategies, type BranchResult } from '../sim/compare';
import { formatCost, scaledCost, storageCap, totalInventory, inTransit } from '../sim/economy';
import { settlementSuitability } from '../sim/formulas';
import { monthlyNeeds, reserveTarget } from '../sim/needs';
import { SCENARIOS, getScenario } from '../sim/scenarios';
import { getSettlement, liveSettlements, territoryOf } from '../sim/settlements';
import { CRISIS_INFO } from '../sim/systems/crises';
import { relationKey } from '../sim/systems/trade';
import { getTopology } from '../sim/topology';
import { GOODS, TRADE_GOODS, formatDate, type BuildingType, type Good, type LaborFocus, type Policy, type Settlement, type TechId } from '../sim/types';
import { classifyCellGeography, formatAreaKm2 } from '../sim/scale';
import { BIOME_LABEL, buildOverlayContext, getOverlay } from '../render/overlays';
import { lineChart, sparkline } from './charts';
import { button, compact, h, meter, n0, n1, pct, row, section, signed, toneFor } from './dom';

export type TabId = 'region' | 'settlement' | 'ledger' | 'trade' | 'policy' | 'scenario' | 'history' | 'compare' | 'crises';

export const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'region', label: 'Region', icon: 'region' },
  { id: 'settlement', label: 'Settlement', icon: 'settlement' },
  { id: 'ledger', label: 'Ledger', icon: 'ledger' },
  { id: 'trade', label: 'Trade', icon: 'trade' },
  { id: 'policy', label: 'Policy', icon: 'policy' },
  { id: 'crises', label: 'Crises', icon: 'crises' },
  { id: 'scenario', label: 'Objectives', icon: 'objectives' },
  { id: 'history', label: 'History', icon: 'history' },
  { id: 'compare', label: 'Compare', icon: 'compare' },
];

export function statusGlyph(s: Settlement): string {
  return s.wellbeing > 0.7 ? '▲ thriving' : s.wellbeing > 0.45 ? '● strained' : '▼ in distress';
}

const blocked = (app: App) => (app.state.mode === 'observer' ? 'Observer mode: interventions are disabled.' : app.state.scenario && app.state.scenario.status !== 'active' ? 'Scenario finished.' : false);

// ------------------------------------------------------------------ Region

export function regionPanel(app: App): HTMLElement {
  const s = app.state;
  const id = app.selectedCell;
  if (id < 0) return regionPicker(app);
  const topo = getTopology();
  const c = s.cells[id];
  const owner = getSettlement(s, c.owner);
  const ctx = buildOverlayContext(s);
  const ov = getOverlay(app.view.overlay);
  const buildings = s.buildings.filter((b) => b.cellId === id);
  const events = s.events.filter((e) => e.cellId === id).slice(-8).reverse();
  const suit = settlementSuitability(c);
  const biomassFrac = c.biomassCap > 0 ? c.biomass / c.biomassCap : 0;
  const geo = classifyCellGeography(id, s.cells, topo);
  return h('div.panel-body',
    h('header.panel-head',
      h('div.eyebrow', `Region ${id} · ${topo.lat[id].toFixed(1)}°, ${topo.lon[id].toFixed(1)}°`),
      h('h2', BIOME_LABEL[c.biome]),
      h('p.sub', owner ? h('a', { href: '#', on: { click: (e: Event) => { e.preventDefault(); app.select(owner.cellId, true); app.hud.showTab('settlement'); } } }, `Territory of ${owner.name}`) : c.land ? 'Unclaimed land' : 'Open ocean',
        c.conserved ? h('span.tag.good', ' Reserve') : null)),
    app.view.overlay !== 'terrain' ? h('div.callout', h('b', `${ov.label}: `), ov.value(c, id, ctx)) : null,
    section('Geography',
      row('Classification', geo.categoryLabel, geo.description),
      row('Elevation', `${n0(c.elevation)} m`),
      row('Area', formatAreaKm2(topo.area[id]), 'Spherical-polygon area on the 642-region globe'),
      row('Coast / river', `${geo.category}${c.river ? ' · river' : ''}`),
      c.land ? row('Settlement suitability', pct(suit), 'Fertility, water, temperature and coast, reduced by altitude and damage') : null),
    section('Climate',
      row('Temperature', `${n1(c.temperature)} °C now · ${n1(c.baseTemp)} °C mean`),
      row('Precipitation', `${n0(c.precip)} mm this month · ${n0(c.basePrecip)} mm/yr`),
      c.land ? row('Soil moisture', pct(c.moisture)) : null,
      c.land && c.drought > 0.05 ? row('Drought', h('span.tag.bad', pct(c.drought))) : null),
    c.land ? section('Ecology',
      row('Vegetation', `${n0(c.biomass)} / ${n0(c.biomassCap)}`), meter(biomassFrac, 'vegetation', toneFor(biomassFrac, 0.6, 0.35)),
      row('Degradation', pct(c.degradation)), meter(c.degradation, 'degradation', c.degradation < 0.3 ? 'good' : c.degradation < 0.6 ? 'warn' : 'bad'),
      row('Soil health', pct(c.soil)),
      row('Pollution', pct(c.pollution)),
      row('Fertility', `${pct(c.fertilityBase)} base`),
      conservationControl(app, id)) : section('Sea', row('Fish stock', `${n0(c.fish)} / ${n0(c.fishCap)}`), row('Pollution', pct(c.pollution))),
    c.land ? section('Resources',
      row('Ore deposit', c.oreInitial ? `${n0(c.ore)} of ${n0(c.oreInitial)}` : 'none'),
      row('Water stock', `${n0(c.waterStock)} / ${n0(c.waterCap)}`)) : null,
    section('Infrastructure',
      buildings.length ? h('ul.list', ...buildings.map((b) => h('li',
        h('span', `${BUILDINGS[b.type].label} — ${b.status === 'construction' ? `building ${b.progress}/${BUILDINGS[b.type].months} mo` : `condition ${pct(b.condition)}`}${b.neglect > 2 ? ' · neglected' : ''}`),
        button('Demolish', () => app.run({ type: 'demolish', buildingId: b.id }, 'click'), { kind: 'ghost', disabled: blocked(app) })))) : h('p.muted', 'No structures.'),
      row('Regional complexes', `${buildings.length} / 2`, 'Each region can host up to two landscape-scale infrastructure complexes'),
      row('Road links', String(s.roads.filter((r) => r.a === id || r.b === id).length))),
    events.length ? section('Regional history', h('ul.events', ...events.map((e) => h(`li.${e.severity}`, h('time', formatDate(e.tick)), ' ', e.text)))) : null,
  );
}

function conservationControl(app: App, id: number): HTMLElement {
  const c = app.state.cells[id];
  const st = getSettlement(app.state, c.owner);
  const centre = st && st.cellId === id;
  return h('div.actions', button(c.conserved ? 'Lift reserve' : 'Designate reserve', () => app.run({ type: 'conserve', cellId: id, on: !c.conserved }, 'complete'), {
    disabled: blocked(app) || (centre ? 'A settlement centre cannot be a reserve.' : false),
    title: 'Reserves forbid foraging, forestry, farming and mining but recover degradation and vegetation faster.',
  }));
}

function regionPicker(app: App): HTMLElement {
  const input = h('input', { type: 'number', min: 0, max: getTopology().count - 1, placeholder: 'Region number', 'aria-label': 'Region number' }) as HTMLInputElement;
  return h('div.panel-body',
    h('header.panel-head', h('div.eyebrow', 'Inspector'), h('h2', 'Choose a region'), h('p.sub', 'Click or tap any region of the globe, or pick from the list below.')),
    section('Settlements', h('ul.list.pick', ...liveSettlements(app.state).map((s) => h('li', button(`${s.name} · ${compact(s.population)} · ${statusGlyph(s)}`, () => { app.select(s.cellId, true); app.hud.showTab('settlement'); }, { kind: 'link' }))))),
    section('Go to region', h('div.inline', input, button('Go', () => {
      const v = Number(input.value);
      if (Number.isInteger(v) && v >= 0 && v < getTopology().count) app.select(v, true);
    }))),
  );
}

// ------------------------------------------------------------------ Settlement

export function settlementPanel(app: App): HTMLElement {
  const s = app.state;
  const cell = app.selectedCell >= 0 ? s.cells[app.selectedCell] : null;
  const st = cell ? getSettlement(s, cell.owner) : undefined;
  if (!st) {
    return h('div.panel-body', h('header.panel-head', h('div.eyebrow', 'Settlement dashboard'), h('h2', 'No settlement selected')),
      h('p.muted', 'Select a settlement marker or a region inside a territory.'),
      section('Settlements', h('ul.list.pick', ...liveSettlements(s).map((x) => h('li', button(`${x.name} · ${compact(x.population)} · ${statusGlyph(x)}`, () => app.select(x.cellId, true), { kind: 'link' }))))));
  }
  const f = st.last;
  const needs = monthlyNeeds(s, st);
  const crowd = st.population / Math.max(1, st.housing);
  const rels = Object.entries(s.relations)
    .filter(([k]) => k.split(':').map(Number).includes(st.id))
    .map(([k, r]) => ({ other: getSettlement(s, Number(k.split(':').find((x) => Number(x) !== st.id))), r }))
    .filter((x) => x.other)
    .sort((a, b) => b.r.cooperation - a.r.cooperation)
    .slice(0, 6);
  const focusSel = h('select', { 'aria-label': 'Labour focus', disabled: !!blocked(app), on: { change: (e: Event) => app.run({ type: 'laborFocus', settlementId: st.id, focus: (e.target as HTMLSelectElement).value as LaborFocus }, 'click') } },
    ...(['balanced', 'food', 'water', 'timber', 'ore', 'energy'] as LaborFocus[]).map((v) => h('option', { value: v, selected: st.laborFocus === v }, v === 'balanced' ? 'Balanced (comparative advantage)' : `Focus: ${GOOD_LABEL[v as Good]}`)));
  const terrBuildings = s.buildings.filter((b) => b.settlementId === st.id);
  const counts = (Object.keys(BUILDINGS) as BuildingType[]).map((t) => [t, terrBuildings.filter((b) => b.type === t).length] as const).filter(([, n]) => n > 0);
  return h('div.panel-body',
    h('header.panel-head',
      h('div.eyebrow', `${st.specialization} · founded ${formatDate(st.founded)}`),
      h('h2', st.name),
      h('p.sub', h('span', { class: `status ${toneFor(st.wellbeing, 0.7, 0.45)}` }, statusGlyph(st)), ' · ', `${territoryOf(s, st.id).length} regions`),
      h('div.actions', button('Centre view', () => app.view.focusCell(st.cellId, 2), { kind: 'ghost' }))),
    section('Population',
      h('div.bigstat', h('span.num', n0(st.population)), sparkline(st.popHistory, '#ffd98a', 140, 30)),
      row('This month', `+${n0(f.births)} births · −${n0(f.deaths)} deaths · ${signed(f.migrantsIn - f.migrantsOut)} migration`),
      row('Housing', `${n0(st.housing)} (${pct(crowd)} occupied)`),
      row('Wellbeing', pct(st.wellbeing)), meter(st.wellbeing, 'wellbeing', toneFor(st.wellbeing)),
      row('Health', pct(st.health)), meter(st.health, 'health', toneFor(st.health)),
      row('Migration pressure', st.migrationPressure > 0.02 ? n1(st.migrationPressure) : 'none'),
      f.shortage.length ? h('p.warnline', `Shortages: ${f.shortage.map((g) => GOOD_LABEL[g]).join(', ')}`) : h('p.goodline', 'All needs met this month.')),
    section('Reserves & flows (this month)',
      h('table.data',
        h('thead', h('tr', h('th', 'Good'), h('th', 'Stock'), h('th', 'Need'), h('th', 'Made'), h('th', 'Used'), h('th', 'In'), h('th', 'Out'))),
        h('tbody', ...GOODS.map((g) => h('tr',
          h('th', GOOD_LABEL[g]),
          h('td', g === 'energy' ? 'grid' : `${compact(st.inventory[g])}/${compact(storageCap(s, st, g))}`),
          h('td', compact(needs[g])), h('td', compact(f.produced[g])), h('td', compact(f.consumed[g])),
          h('td', compact(f.imported[g])), h('td', compact(f.exported[g])))))),
      h('p.muted', `Reserve target before exporting: ${TRADE_GOODS.map((g) => `${GOOD_LABEL[g]} ${compact(reserveTarget(s, st, g))}`).join(' · ')}.`)),
    section('Labour',
      row('Workers', `${n0(f.labor)} (${pct((Object.values(f.laborUsed).reduce((a, b) => a + b, 0)) / Math.max(1, f.labor))} employed)`),
      h('div.chips', ...GOODS.map((g) => h('span.chip', `${GOOD_LABEL[g]} ${compact(f.laborUsed[g])}`))),
      h('label.field', 'Labour policy', focusSel),
      f.specialty ? h('p.muted', `Spare labour is producing ${GOOD_LABEL[f.specialty]} for export.`) : null,
      h('p.muted', `Output by source: ${Object.entries(f.bySource).map(([k, v]) => `${k} ${compact(v)}`).join(' · ') || 'none'}`)),
    section('Society',
      row('Values', `growth ${pct(st.values.growth)} · conservation ${pct(st.values.conservation)} · openness ${pct(st.values.trade)}`),
      rels.length ? h('ul.list', ...rels.map(({ other, r }) => h('li',
        h('span', h('b', other!.name), ` ${r.cooperation >= 0.15 ? '🤝 cooperative' : r.cooperation <= -0.3 ? '⚔ hostile' : '· neutral'} (${signed(r.cooperation * 100)})`),
        h('small.muted', r.reasons.join('; ') || 'No significant contact')))) : h('p.muted', 'No neighbours or partners yet.')),
    section('Structures', counts.length ? h('div.chips', ...counts.map(([t, n]) => h('span.chip', `${BUILDINGS[t].label} ×${n}`))) : h('p.muted', 'None.'),
      h('div.actions', ...(Object.keys(BUILDINGS) as BuildingType[]).map((t) => button(`+ ${BUILDINGS[t].label}`, () => app.setTool({ kind: 'build', building: t }), { kind: 'ghost', disabled: blocked(app), title: `${BUILDINGS[t].description} Cost ${formatCost(scaledCost(s, BUILDINGS[t].cost))}.` })))),
  );
}

// ------------------------------------------------------------------ Ledger

export function ledgerPanel(app: App): HTMLElement {
  const s = app.state;
  const inv = totalInventory(s), tr = inTransit(s), L = s.ledger;
  const live = liveSettlements(s);
  const sinks = (g: Good) => L.consumed[g] + L.spoiled[g] + L.transportLoss[g] + L.construction[g] + L.maintenance[g] + L.overflow[g] + L.abandoned[g] + L.dissipated[g] + L.intervention[g];
  return h('div.panel-body',
    h('header.panel-head', h('div.eyebrow', `Resource ledger · ${formatDate(Math.max(0, s.tick - 1))}`), h('h2', 'Planetary accounts'),
      h('p.sub', 'Every unit has a source and a sink. Figures are for the last completed month.')),
    section('Stockpiles',
      h('table.data', h('thead', h('tr', h('th', 'Good'), h('th', 'Stored'), h('th', 'In transit'), h('th', 'Produced'), h('th', 'Removed'), h('th', 'Net'))),
        h('tbody', ...GOODS.map((g) => h('tr', h('th', GOOD_LABEL[g]), h('td', compact(inv[g])), h('td', compact(tr[g])), h('td', compact(L.produced[g] + L.seeded[g])), h('td', compact(sinks(g))), h('td', { class: L.produced[g] + L.seeded[g] - sinks(g) >= 0 ? 'pos' : 'neg' }, signed(L.produced[g] + L.seeded[g] - sinks(g)))))))),
    section('Where resources went',
      h('table.data', h('thead', h('tr', h('th', 'Sink'), ...GOODS.map((g) => h('th', GOOD_LABEL[g].slice(0, 5))))),
        h('tbody', ...([['consumed', 'Consumed'], ['spoiled', 'Spoiled/evaporated'], ['transportLoss', 'Transport loss'], ['construction', 'Construction'], ['maintenance', 'Maintenance & upkeep'], ['intervention', 'Research & response'], ['overflow', 'Storage overflow'], ['dissipated', 'Unused energy'], ['abandoned', 'Abandoned']] as const)
          .map(([k, label]) => h('tr', h('th', label), ...GOODS.map((g) => h('td', compact(L[k][g])))))))),
    section('Shortages by settlement',
      live.some((x) => x.last.shortage.length)
        ? h('ul.list', ...live.filter((x) => x.last.shortage.length).map((x) => h('li', button(x.name, () => { app.select(x.cellId, true); app.hud.showTab('settlement'); }, { kind: 'link' }), h('span.warnline', x.last.shortage.map((g) => GOOD_LABEL[g]).join(', ')))))
        : h('p.goodline', 'No settlement is short of anything.')),
    section('Settlement reserves (months of need)',
      h('table.data', h('thead', h('tr', h('th', 'Settlement'), h('th', 'Food'), h('th', 'Water'), h('th', 'Timber'), h('th', 'Ore'))),
        h('tbody', ...live.map((x) => {
          const n = monthlyNeeds(s, x);
          const m = (g: Good) => (n[g] > 0 ? x.inventory[g] / n[g] : Infinity);
          const cell = (g: Good) => h('td', { class: m(g) < 1 ? 'neg' : m(g) < 2 ? 'warn' : '' }, Number.isFinite(m(g)) ? n1(m(g)) : '∞');
          return h('tr', h('th', x.name), cell('food'), cell('water'), cell('timber'), cell('ore'));
        })))),
  );
}

// ------------------------------------------------------------------ Trade

export function tradePanel(app: App): HTMLElement {
  const s = app.state;
  const name = (id: number) => s.settlements.find((x) => x.id === id)?.name ?? `#${id}`;
  const prio = s.policy.tradePriority;
  const move = (i: number, d: number) => {
    const p = [...prio];
    const j = i + d;
    if (j < 0 || j >= p.length) return;
    [p[i], p[j]] = [p[j], p[i]];
    app.run({ type: 'policy', patch: { tradePriority: p } }, 'click');
  };
  const busy = s.routes.filter((r) => r.active && r.movedLastTick > r.capacity * 0.9);
  const tr = inTransit(s);
  return h('div.panel-body',
    h('header.panel-head', h('div.eyebrow', 'Trade inspector'), h('h2', 'Network'),
      h('p.sub', `${s.routes.filter((r) => r.active).length} active of ${s.routes.length} routes · ${s.shipments.length} shipments under way`),
      h('div.actions', button('New route (T)', () => app.setTool({ kind: 'route', from: -1 }), { disabled: blocked(app) }))),
    section('Goods in transit', h('div.chips', ...TRADE_GOODS.map((g) => h('span.chip', `${GOOD_LABEL[g]} ${compact(tr[g])}`)))),
    section('Routes', s.routes.length ? h('div.routes', ...s.routes.map((r) => {
      const util = r.capacity > 0 ? r.movedLastTick / r.capacity : 0;
      const total24 = r.deliveredHistory.reduce((a, b) => a + b, 0);
      return h(`div.route${r.active ? '' : '.blocked'}`,
        h('div.route-head', h('b', `${name(r.a)} ⇄ ${name(r.b)}`), h('span.tag', r.mode === 'sea' ? '⚓ sea' : '⛰ land'), r.autonomous ? h('span.tag', 'agreement') : null),
        h('div.muted', `${n0(r.distanceKm)} km · ${r.travelMonths} mo transit · loss ${pct(r.lossRate)} · capacity ${n0(r.capacity)}/mo/direction${r.mode === 'land' ? ` · ${pct(r.roadFraction)} paved` : ''}`),
        row('Delivered last month', `${n0(r.movedLastTick)} (${pct(util)} of capacity)`), meter(util, 'utilisation', util > 0.9 ? 'warn' : 'good'),
        row('Delivered (24 mo / total)', `${n0(total24)} / ${n0(r.deliveredTotal)}`),
        r.blockedReason ? h('p.warnline', r.blockedReason) : null,
        h('div.chips', ...TRADE_GOODS.map((g) => {
          const on = r.goods.includes(g);
          return h('label.chip.toggle', h('input', { type: 'checkbox', checked: on, disabled: !!blocked(app), on: { change: () => app.run({ type: 'routeGoods', routeId: r.id, goods: on ? r.goods.filter((x) => x !== g) : [...r.goods, g] }, 'click') } }), GOOD_LABEL[g]);
        })),
        h('div.actions', button('Close route', () => app.run({ type: 'removeRoute', routeId: r.id }, 'click'), { kind: 'ghost', disabled: blocked(app) })));
    })) : h('p.muted', 'No routes yet. Use the Trade Route tool: click one settlement, then another.')),
    section('Trade priority', h('p.muted', 'Goods are shipped in this order when capacity is limited.'),
      h('ol.prio', ...prio.map((g, i) => h('li', h('span', GOOD_LABEL[g]), button('↑', () => move(i, -1), { kind: 'ghost', disabled: blocked(app) || (i === 0 ? 'Already first' : false), title: 'Raise priority' }), button('↓', () => move(i, 1), { kind: 'ghost', disabled: blocked(app) || (i === prio.length - 1 ? 'Already last' : false), title: 'Lower priority' }))))),
    section('Bottlenecks', busy.length ? h('ul.list', ...busy.map((r) => h('li', `${name(r.a)} ⇄ ${name(r.b)} is at capacity — pave it with roads or add a sea lane.`))) : h('p.muted', 'No route is saturated.'),
      ...liveSettlements(s).filter((x) => x.last.shortage.some((g) => g !== 'energy') && !s.routes.some((r) => r.active && (r.a === x.id || r.b === x.id))).map((x) => h('p.warnline', `${x.name} is short and has no active trade route.`))),
  );
}

// ------------------------------------------------------------------ Policy & technology

export function policyPanel(app: App): HTMLElement {
  const s = app.state;
  const p = s.policy;
  const dis = blocked(app);
  const set = (patch: Partial<Policy>) => app.run({ type: 'policy', patch }, 'click');
  const radio = <K extends keyof Policy>(key: K, options: [Policy[K], string, string][]) => h('div.seg', { role: 'radiogroup' }, ...options.map(([v, label, hint]) =>
    button(label, () => set({ [key]: v } as Partial<Policy>), { kind: p[key] === v ? 'on' : 'ghost', disabled: dis, title: hint, ariaPressed: p[key] === v })));
  const funders = liveSettlements(s).sort((a, b) => b.population - a.population);
  return h('div.panel-body',
    h('header.panel-head', h('div.eyebrow', 'Stewardship'), h('h2', 'Policy'), h('p.sub', dis || 'Policies apply planet-wide and take effect next month.')),
    section('Extraction intensity', radio('extraction', [
      ['restrained', 'Restrained', 'Harvest ×0.6, farms ×0.77, slower soil exhaustion; unprotected land recovers twice as fast.'],
      ['normal', 'Normal', 'Sustainable default.'],
      ['intensive', 'Intensive', 'Harvest ×2, farms ×1.41, soil exhaustion ×2, more mine collapses; land barely recovers and forests are driven past their sustainable yield.'],
    ]), h('p.muted', 'Applies to forestry, foraging, fishing, mining and farming intensity.')),
    section('Consumption', radio('rationing', [[false, 'Normal rations', 'Full needs.'], [true, 'Rationing', 'Needs −20%, wellbeing −8%.']])),
    section('Growth', radio('growth', [['restrain', 'Restrain', 'Births ×0.6; no new colonies.'], ['neutral', 'Neutral', 'Default.'], ['encourage', 'Encourage', 'Births ×1.3.']])),
    section('Local autonomy', radio('autonomy', [
      ['none', 'Directed', 'Settlements build nothing on their own and never found colonies.'],
      ['limited', 'Limited', 'Settlements only build farms when hungry.'],
      ['full', 'Full', 'Settlements build, sign trade agreements and found colonies.'],
    ])),
    section('Reserves', h('label.field', `Hold ${p.reserveMonths} months of food before exporting`,
      h('input', { type: 'range', min: 1, max: 12, step: 1, value: p.reserveMonths, disabled: !!dis, 'aria-label': 'Reserve months', on: { change: (e: Event) => set({ reserveMonths: Number((e.target as HTMLInputElement).value) }) } }))),
    s.mode === 'sandbox' ? section('Sandbox tools',
      h('label.check', h('input', { type: 'checkbox', checked: s.rules.unrestricted, on: { change: (e: Event) => { s.rules.unrestricted = (e.target as HTMLInputElement).checked; app.hud.toast(s.rules.unrestricted ? 'UNRESTRICTED: construction, founding, research and responses are free.' : 'Costs restored.', 'warn'); app.hud.refresh(true); } } }),
        ' Unrestricted construction (costs waived — sandbox only)')) : null,
    section('Technology', h('p.muted', 'Research is paid up front by one settlement and completes after the stated months.'),
      h('div.techs', ...(Object.keys(TECHS) as TechId[]).map((id) => {
        const def = TECHS[id], t = s.tech[id];
        const sel = h('select', { 'aria-label': `Fund ${def.label} from`, disabled: t.started || !!dis }, ...funders.map((f) => h('option', { value: f.id }, `${f.name} (${compact(f.population)})`))) as HTMLSelectElement;
        return h(`div.tech${t.done ? '.done' : ''}`,
          h('div.tech-head', h('b', def.label), h('span.tag', t.done ? '✓ known' : t.started ? `${t.progress}/${def.months} mo` : `${def.months} mo`)),
          h('p', def.effect),
          t.done || t.started ? (t.started && !t.done ? meter(t.progress / def.months, 'research progress') : null)
            : h('div.inline', h('span.muted', formatCost(scaledCost(s, def.cost))), sel, button('Research', () => app.run({ type: 'research', tech: id, fundingId: Number(sel.value) }, 'complete'), { disabled: dis || (!funders.length ? 'No settlement can fund research.' : false) })));
      }))),
  );
}

// ------------------------------------------------------------------ Crises

export function crisesPanel(app: App): HTMLElement {
  const s = app.state;
  const active = s.crises.filter((c) => !c.resolved);
  const past = s.crises.filter((c) => c.resolved).slice(-8).reverse();
  const funders = liveSettlements(s);
  return h('div.panel-body',
    h('header.panel-head', h('div.eyebrow', 'Crisis response'), h('h2', active.length ? `${active.length} active` : 'All quiet'), h('p.sub', 'Crises arise from conditions: heat and drought, crowding, exhausted soil, neglected mines, sustained hunger.')),
    ...active.map((c) => {
      const info = CRISIS_INFO[c.type];
      const st = getSettlement(s, c.settlementId);
      const sel = h('select', { 'aria-label': 'Funding settlement' }, ...funders.map((f) => h('option', { value: f.id, selected: f.id === c.settlementId }, f.name))) as HTMLSelectElement;
      return h('div.crisis',
        h('div.route-head', h('b', info.label), h('span.tag.bad', `severity ${pct(c.severity)}`), h('span.tag', `${Math.max(0, c.endTick - s.tick)} mo left`)),
        h('p', info.description),
        h('p.muted', st ? `At ${st.name}.` : c.radiusKm ? `Region of ${n0(c.radiusKm)} km radius around region ${c.cellId}.` : `Region ${c.cellId}.`),
        h('div.actions', button('Show', () => app.select(c.cellId, true), { kind: 'ghost' })),
        c.responded ? h('p.goodline', `Response: ${info.responses.find((r) => r.id === c.responded)?.label}`) :
          h('div.responses', ...info.responses.map((r) => h('div.response',
            h('b', r.label), h('p', r.effect), h('p.muted', `Cost: ${formatCost(scaledCost(s, r.cost))}`),
            button('Respond', () => app.run({ type: 'respond', crisisId: c.id, response: r.id, fundingId: Number(sel.value) }, 'complete'), { disabled: blocked(app) }))),
            funders.length ? h('label.field', 'Paid by', sel) : null));
    }),
    past.length ? section('Recent', h('ul.list', ...past.map((c) => h('li', `${CRISIS_INFO[c.type].label} · ${formatDate(c.startTick)}–${formatDate(c.endTick)}${c.responded ? ` · ${c.responded}` : ''}`)))) : null,
  );
}

// ------------------------------------------------------------------ Scenario

export function scenarioPanel(app: App): HTMLElement {
  const s = app.state;
  const sc = s.scenario;
  if (!sc) {
    return h('div.panel-body', h('header.panel-head', h('div.eyebrow', s.mode === 'observer' ? 'Observer' : 'Sandbox'), h('h2', 'Open-ended world'),
      h('p.sub', s.mode === 'observer' ? 'The planet evolves on its own. Inspect, compare and follow its history.' : 'No objectives: experiment freely. Start a scenario for goals.')),
      section('Scenarios', h('ul.list.pick', ...SCENARIOS.map((d) => h('li', h('div', h('b', `${d.index}. ${d.title}`), h('p.muted', d.tagline)),
        h('div.inline', button('Play', () => app.newGame({ mode: 'scenario', scenario: d.id })), button('Challenge', () => app.newGame({ mode: 'challenge', scenario: d.id }), { kind: 'ghost' })))))));
  }
  const def = getScenario(sc.id)!;
  const objs = def.objectives(s);
  const risks = def.risks(s);
  return h('div.panel-body',
    h('header.panel-head', h('div.eyebrow', `${sc.challenge ? 'Challenge' : 'Scenario'} ${def.index}`), h('h2', def.title), h('p.sub', def.tagline)),
    sc.status !== 'active' ? h(`div.callout.${sc.status === 'success' ? 'good' : 'bad'}`, h('b', sc.status === 'success' ? 'Success. ' : 'Failure. '), sc.message) : null,
    h('p', def.brief),
    section('Objectives', h('ul.objectives', ...objs.map((o) => h(`li${o.met ? '.met' : ''}`,
      h('div.obj-head', h('span', `${o.met ? '✓' : '○'} ${o.label}`), h('span.muted', `${o.current} / ${o.target}`)), meter(o.progress, o.label, o.met ? 'good' : 'warn')))),
      def.holdMonths ? row('Held together', `${sc.streak} of ${def.holdMonths} months`) : null,
      row('Deadline', `${Math.max(0, sc.deadline - s.tick)} months left (month ${sc.deadline})`)),
    section('Constraints', h('ul.list', ...def.constraints.map((c) => h('li', c)), sc.challenge ? h('li', 'Challenge: needs +15%, construction +30%, crises ×2, starting food & water −30%, shorter deadline.') : null)),
    section('Failure risks', risks.length ? h('ul.list', ...risks.map((r) => h('li.warnline', r))) : h('p.goodline', 'No immediate risks detected.')),
    h('div.actions', button('Restart scenario', () => app.restart(), { kind: 'ghost' })),
  );
}

// ------------------------------------------------------------------ History

let historyMetric = 'population';

export function historyPanel(app: App): HTMLElement {
  const s = app.state;
  const m = s.metrics;
  const metrics: Record<string, { label: string; get: (x: (typeof m)[number]) => number; fmt: (v: number) => string; color: string }> = {
    population: { label: 'Population', get: (x) => x.population, fmt: compact, color: '#ffd98a' },
    settlements: { label: 'Settlements', get: (x) => x.settlements, fmt: (v) => n0(v), color: '#d9b56a' },
    food: { label: 'Food stored', get: (x) => x.food, fmt: compact, color: '#b7e36b' },
    water: { label: 'Water stored', get: (x) => x.water, fmt: compact, color: '#6fc8ff' },
    degradation: { label: 'Land degradation', get: (x) => x.degradation * 100, fmt: (v) => `${v.toFixed(1)}%`, color: '#e3a03c' },
    biomass: { label: 'Vegetation', get: (x) => x.biomassFrac * 100, fmt: (v) => `${v.toFixed(0)}%`, color: '#6fd18a' },
    wellbeing: { label: 'Wellbeing', get: (x) => x.wellbeing * 100, fmt: (v) => `${v.toFixed(0)}%`, color: '#e8a0ff' },
    trade: { label: 'Goods delivered/mo', get: (x) => x.tradeDelivered, fmt: compact, color: '#7fd8c0' },
  };
  const def = metrics[historyMetric] ?? metrics.population;
  const select = h('select', { 'aria-label': 'Metric', on: { change: (e: Event) => { historyMetric = (e.target as HTMLSelectElement).value; app.hud.refresh(true); } } },
    ...Object.entries(metrics).map(([k, v]) => h('option', { value: k, selected: k === historyMetric }, v.label)));
  const events = s.events.slice(-60).reverse();
  return h('div.panel-body',
    h('header.panel-head', h('div.eyebrow', 'History'), h('h2', formatDate(s.tick)), h('p.sub', `${m.length} monthly samples kept (older history is thinned)`)),
    section('Planetary record', h('label.field', 'Metric', select),
      lineChart([{ values: m.map(def.get), color: def.color, label: def.label }], { format: def.fmt, xLabel: m.length ? `${formatDate(m[0].tick)} → ${formatDate(m[m.length - 1].tick)}` : '' })),
    section('Timeline', h('ul.events', ...events.map((e) => h(`li.${e.severity}`,
      h('time', formatDate(e.tick)), ' ',
      e.cellId >= 0 ? h('a', { href: '#', on: { click: (ev: Event) => { ev.preventDefault(); app.select(e.cellId, true); } } }, e.text) : e.text)))),
  );
}

// ------------------------------------------------------------------ Compare

let compareResult: [BranchResult, BranchResult] | null = null;
let compareTick = -1;

export function comparePanel(app: App): HTMLElement {
  const s = app.state;
  const form = (prefix: string, defaults: Partial<Policy>) => {
    const ext = h('select', { name: `${prefix}-ext`, 'aria-label': `${prefix} extraction` }, ...['restrained', 'normal', 'intensive'].map((v) => h('option', { value: v, selected: defaults.extraction === v }, v)));
    const growth = h('select', { name: `${prefix}-growth`, 'aria-label': `${prefix} growth` }, ...['restrain', 'neutral', 'encourage'].map((v) => h('option', { value: v, selected: defaults.growth === v }, v)));
    const auto = h('select', { name: `${prefix}-auto`, 'aria-label': `${prefix} autonomy` }, ...['none', 'limited', 'full'].map((v) => h('option', { value: v, selected: defaults.autonomy === v }, v)));
    const ration = h('input', { type: 'checkbox', name: `${prefix}-ration`, checked: !!defaults.rationing }) as HTMLInputElement;
    return {
      el: h('fieldset.branch', h('legend', `Strategy ${prefix}`), h('label.field', 'Extraction', ext), h('label.field', 'Growth', growth), h('label.field', 'Autonomy', auto), h('label.check', ration, ' Rationing')),
      read: (): Partial<Policy> => ({ extraction: (ext as HTMLSelectElement).value as Policy['extraction'], growth: (growth as HTMLSelectElement).value as Policy['growth'], autonomy: (auto as HTMLSelectElement).value as Policy['autonomy'], rationing: ration.checked }),
    };
  };
  const a = form('A', { ...s.policy, extraction: 'restrained' });
  const b = form('B', { ...s.policy, extraction: 'intensive', growth: 'encourage' });
  const years = h('select', { 'aria-label': 'Years to simulate' }, ...[1, 3, 5, 10].map((y) => h('option', { value: y, selected: y === 3 }, `${y} year${y > 1 ? 's' : ''}`))) as HTMLSelectElement;
  const status = h('p.muted', compareResult && compareTick === s.tick ? 'Results are for the current month.' : compareResult ? `Results were computed from ${formatDate(compareTick)}.` : 'Both futures run with the real engine from an exact copy of this world.');
  const run = () => {
    status.textContent = 'Simulating both futures…';
    setTimeout(() => {
      compareResult = compareStrategies(s, a.read(), b.read(), Number(years.value) * 12);
      compareTick = s.tick;
      app.hud.refresh(true);
    }, 30);
  };
  return h('div.panel-body',
    h('header.panel-head', h('div.eyebrow', 'Strategy comparison'), h('h2', 'Fork the future'), h('p.sub', 'Same world, same random seed, different policies. Differences come from the policies alone.')),
    h('div.branches', a.el, b.el),
    h('div.inline', years, button('Run comparison', run)),
    status,
    compareResult ? compareTable(app, compareResult) : null,
  );
}

function compareTable(app: App, [A, B]: [BranchResult, BranchResult]): HTMLElement {
  const rows: [string, (r: BranchResult) => number, (v: number) => string, boolean][] = [
    ['Population', (r) => r.metrics.population, n0, true],
    ['Settlements', (r) => r.metrics.settlements, n0, true],
    ['Food stored', (r) => r.metrics.foodStock, compact, true],
    ['Wellbeing', (r) => r.metrics.wellbeing, pct, true],
    ['Territorial degradation', (r) => r.metrics.territoryDegradation, pct, false],
    ['Planetary vegetation', (r) => r.metrics.biomassFrac, pct, true],
    ['Goods traded', (r) => r.metrics.tradeDelivered, compact, true],
    ['Crises', (r) => r.metrics.crises, n0, false],
  ];
  const better = (a: number, b: number, up: boolean) => (Math.abs(a - b) < 1e-9 ? '' : (a > b) === up ? 'pos' : 'neg');
  const adopt = (r: BranchResult) => {
    if (app.state.mode === 'observer') { app.hud.toast('Observer mode cannot adopt a strategy.', 'warn'); return; }
    app.load(r.state);
    compareResult = null;
    app.hud.toast(`${r.label} adopted: the world jumps to its future.`, 'good');
  };
  return h('div',
    h('table.data', h('thead', h('tr', h('th', 'Metric'), h('th', 'A'), h('th', 'B'))),
      h('tbody', ...rows.map(([label, get, fmt, up]) => h('tr', h('th', label), h('td', { class: better(get(A), get(B), up) }, fmt(get(A))), h('td', { class: better(get(B), get(A), up) }, fmt(get(B))))))),
    lineChart([{ values: A.series, color: '#7fd8c0', label: 'A population' }, { values: B.series, color: '#f0a63e', label: 'B population' }], { format: compact, height: 100 }),
    h('div.actions', button('Adopt A', () => adopt(A), { kind: 'ghost' }), button('Adopt B', () => adopt(B), { kind: 'ghost' })));
}

export const PANELS: Record<TabId, (app: App) => HTMLElement> = {
  region: regionPanel, settlement: settlementPanel, ledger: ledgerPanel, trade: tradePanel, policy: policyPanel,
  scenario: scenarioPanel, history: historyPanel, compare: comparePanel, crises: crisesPanel,
};

export { relationKey };
