/**
 * One consistent line-icon set (24×24, 1.6px stroke, round joins) drawn for
 * The World Machine. Inline SVG: no font or network dependency, inherits colour.
 */
const P: Record<string, string> = {
  inspect: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/><path d="M10.5 7.5v6M7.5 10.5h6"/>',
  found: '<path d="M12 3l2.2 5.4L20 9l-4.4 3.8L17 19l-5-3.1L7 19l1.4-6.2L4 9l5.8-.6z"/>',
  farm: '<path d="M12 21V9"/><path d="M12 13c-3.5 0-5.5-2-6-5 3.5 0 5.5 2 6 5zM12 11c3.5 0 5.5-2 6-5-3.5 0-5.5 2-6 5z"/><path d="M5 21h14"/>',
  mine: '<path d="M4 20l7-7"/><path d="M9.5 6.5c3-2.5 7-2.8 10-1-2.2.4-4.2 1.4-6 3l2 2c1.6-1.8 2.6-3.8 3-6"/><path d="M3 21h8"/>',
  storage: '<path d="M4 9l8-5 8 5v11H4z"/><path d="M4 9h16M9 20v-6h6v6"/>',
  energy: '<path d="M13 2L5 13h6l-1 9 8-11h-6z"/>',
  port: '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M8 10h8"/><path d="M4 14c0 4 3.6 7 8 7s8-3 8-7"/>',
  road: '<path d="M8 3L5 21M16 3l3 18"/><path d="M12 4v3M12 10.5v3M12 17v3"/>',
  route: '<circle cx="5" cy="17" r="2.2"/><circle cx="19" cy="7" r="2.2"/><path d="M7 16c5-1 4-8 10-8.5" stroke-dasharray="2.4 2.2"/>',
  reserve: '<path d="M12 21c-5-3-7-7-7-11 3 0 5 1 7 3 2-2 4-3 7-3 0 4-2 8-7 11z"/><path d="M12 21V12"/>',
  region: '<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/>',
  settlement: '<path d="M3 21h18"/><path d="M5 21V11l4-3 4 3v10"/><path d="M13 21V7l3-2 3 2v14"/>',
  ledger: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  trade: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  policy: '<path d="M12 4v16M6 20h12"/><path d="M5 8h14"/><path d="M5 8l-2.5 6a2.8 2.8 0 0 0 5 0zM19 8l-2.5 6a2.8 2.8 0 0 0 5 0z"/>',
  crises: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4.5M12 17.3v.2"/>',
  objectives: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  history: '<path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v4h4"/><path d="M12 8v4l3 2"/>',
  compare: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="12" r="2"/><path d="M6 7v10M6 12c0-3 3-5 10-5M6 12c0 3 3 5 10 5"/>',
  play: '<path d="M8 5l11 7-11 7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  step: '<path d="M6 5l9 7-9 7z"/><path d="M18 5v14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  reset: '<circle cx="12" cy="12" r="8"/><path d="M12 4a14 14 0 0 1 0 16M12 4a14 14 0 0 0 0 16M4.5 9h15M4.5 15h15"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-6h8v6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><path d="M12 17.3v.2"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.5a3 3 0 0 1 0 6M18 14c2 .8 3 2.8 3 6"/>',
  food: '<path d="M12 21V9"/><path d="M12 13c-3.5 0-5.5-2-6-5 3.5 0 5.5 2 6 5zM12 11c3.5 0 5.5-2 6-5-3.5 0-5.5 2-6 5z"/>',
  land: '<circle cx="12" cy="12" r="8.5"/><path d="M5 9c3 1 4 4 7 4s3 3 2 6M14 4c-1 2 0 4 3 4"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.3v.2"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.3v.2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z"/>',
};

export function icon(name: keyof typeof P | string, size = 18): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ico');
  svg.innerHTML = P[name] ?? P.info;
  return svg;
}
