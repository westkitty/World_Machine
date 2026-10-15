import { h } from './dom';

/** Minimal canvas line chart: crisp at any DPR, labelled axes, optional second series. */
export interface Series {
  values: number[];
  color: string;
  label: string;
}

export function lineChart(series: Series[], opts: { height?: number; format?: (v: number) => string; xLabel?: string } = {}): HTMLElement {
  const height = opts.height ?? 120;
  const canvas = h('canvas', { role: 'img', 'aria-label': series.map((s) => `${s.label}: latest ${opts.format ? opts.format(s.values[s.values.length - 1] ?? 0) : s.values[s.values.length - 1]}`).join('; ') }) as HTMLCanvasElement;
  const wrap = h('div.chart', canvas, h('div.chart-legend', ...series.map((s) => h('span', h('i', { style: { background: s.color } }), s.label))));
  requestAnimationFrame(() => draw(canvas, series, height, opts.format ?? ((v) => Math.round(v).toLocaleString()), opts.xLabel ?? ''));
  return wrap;
}

function draw(canvas: HTMLCanvasElement, series: Series[], height: number, format: (v: number) => string, xLabel: string): void {
  const width = canvas.parentElement?.clientWidth || 300;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  const all = series.flatMap((s) => s.values).filter(Number.isFinite);
  if (!all.length) {
    ctx.fillStyle = 'rgba(230,220,200,0.5)';
    ctx.font = '12px system-ui';
    ctx.fillText('No history yet — advance time.', 8, height / 2);
    return;
  }
  let min = Math.min(...all), max = Math.max(...all);
  if (max - min < 1e-9) { max += 1; min -= 1; }
  const pad = { l: 46, r: 8, t: 8, b: 18 };
  const W = width - pad.l - pad.r, H = height - pad.t - pad.b;
  ctx.strokeStyle = 'rgba(217,181,106,0.14)';
  ctx.fillStyle = 'rgba(230,220,200,0.6)';
  ctx.font = '10px ui-monospace, Menlo, monospace';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = pad.t + (H * i) / 3;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(width - pad.r, y); ctx.stroke();
    ctx.fillText(format(max - ((max - min) * i) / 3), 2, y + 3);
  }
  if (xLabel) ctx.fillText(xLabel, pad.l, height - 4);
  for (const s of series) {
    const n = s.values.length;
    if (n < 2) continue;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    s.values.forEach((v, i) => {
      const x = pad.l + (W * i) / (n - 1);
      const y = pad.t + H * (1 - (v - min) / (max - min));
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}

export function sparkline(values: number[], color = '#d9b56a', width = 120, height = 28): HTMLElement {
  const canvas = h('canvas', { role: 'img', 'aria-label': `trend, latest ${Math.round(values[values.length - 1] ?? 0).toLocaleString()}` }) as HTMLCanvasElement;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = width * dpr; canvas.height = height * dpr;
  canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  if (ctx && values.length > 1) {
    ctx.scale(dpr, dpr);
    const min = Math.min(...values), max = Math.max(...values) + 1e-9;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = (width * i) / (values.length - 1);
      const y = height - 2 - (height - 4) * ((v - min) / (max - min || 1));
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  return canvas;
}
