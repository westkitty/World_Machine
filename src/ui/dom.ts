/** Tiny DOM builder: h('div.cls#id', {attrs}, ...children). No framework needed. */
type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown> & { on?: Record<string, (e: Event) => void> };

export function h<K extends keyof HTMLElementTagNameMap>(spec: K | string, attrs?: Attrs | Child, ...children: Child[]): HTMLElement {
  const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(spec as string);
  const tag = (m?.[1] || 'div') as K;
  const el = document.createElement(tag);
  for (const part of (m?.[2] ?? '').match(/[.#][\w-]+/g) ?? []) {
    if (part[0] === '.') el.classList.add(part.slice(1));
    else el.id = part.slice(1);
  }
  let kids = children;
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node)) kids = [attrs as Child, ...children];
  else if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'on') for (const [ev, fn] of Object.entries(v as Record<string, (e: Event) => void>)) el.addEventListener(ev, fn);
      else if (k === 'class') el.className = String(v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (typeof v === 'boolean') { if (v) el.setAttribute(k, ''); }
      else if (v !== undefined && v !== null) {
        if (k in el && k !== 'list' && k !== 'form') (el as unknown as Record<string, unknown>)[k] = v;
        else el.setAttribute(k, String(v));
      }
    }
  }
  for (const c of kids) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el: HTMLElement): HTMLElement {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export const n0 = (v: number) => (Number.isFinite(v) ? Math.round(v).toLocaleString() : '—');
export const n1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '—');
export const pct = (v: number) => (Number.isFinite(v) ? `${Math.round(v * 100)}%` : '—');
export const signed = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v)).toLocaleString()}`;

export function compact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `${(v / 1e3).toFixed(0)}k`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return Math.round(v).toString();
}

/** Labelled meter with numeric text (never colour alone). */
export function meter(value: number, label: string, tone: 'good' | 'warn' | 'bad' | 'neutral' = 'neutral'): HTMLElement {
  const v = Math.max(0, Math.min(1, value));
  return h('div.meter', { role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(v * 100), 'aria-label': label },
    h(`div.meter-fill.${tone}`, { style: { width: `${v * 100}%` } }));
}

export function toneFor(v: number, good = 0.7, bad = 0.4): 'good' | 'warn' | 'bad' {
  return v >= good ? 'good' : v >= bad ? 'warn' : 'bad';
}

export function row(label: string, value: Child, hint?: string): HTMLElement {
  return h('div.row', h('span.k', label), h('span.v', { title: hint ?? '' }, value));
}

export function section(title: string, ...children: Child[]): HTMLElement {
  return h('section.block', h('h3', title), ...children);
}

export function button(label: string, onClick: () => void, opts: { kind?: string; disabled?: string | false; title?: string; ariaPressed?: boolean } = {}): HTMLElement {
  const b = h(`button.btn${opts.kind ? `.${opts.kind}` : ''}`, {
    type: 'button',
    title: opts.disabled || opts.title || '',
    'aria-disabled': opts.disabled ? 'true' : undefined,
    'aria-pressed': opts.ariaPressed === undefined ? undefined : String(opts.ariaPressed),
    on: { click: () => { if (!opts.disabled) onClick(); } },
  }, label);
  if (opts.disabled) b.classList.add('disabled');
  return b;
}
