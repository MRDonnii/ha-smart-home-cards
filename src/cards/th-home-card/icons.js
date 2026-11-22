// Number/escape helpers and the card's line icons (kept from the original card).
export const hnum = (v, d = 1) => (Number.isFinite(v) ? v : 0).toLocaleString('da-DK', { minimumFractionDigits: d, maximumFractionDigits: d });
export const hesc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const HI = {
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V6Z"/><path d="m9 12 2 2 4-4"/>',
  shieldOff: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V6Z"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>', unlock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.7"/>',
  door: '<path d="M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21"/><path d="M4 21h16M14.5 12.5h.01"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z"/>',
  temp: '<path d="M10 4.5a2 2 0 0 1 4 0v9.3a4 4 0 1 1-4 0Z"/><path d="M12 10v6"/>', drop: '<path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5Z"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
  tv: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8"/>', snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/>',
  sofa: '<path d="M4 11V8.5A2.5 2.5 0 0 1 6.5 6h11A2.5 2.5 0 0 1 20 8.5V11"/><path d="M3 12.5a1.5 1.5 0 0 1 3 0V14h12v-1.5a1.5 1.5 0 0 1 3 0V18H3Z"/><path d="M5 18v2M19 18v2"/>',
  kitchen: '<path d="M4 10h16v10H4zM4 10V6h16v4"/><path d="M8 14h3"/>', mug: '<path d="M5 6h11v11a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3Z"/><path d="M16 9h2a2 2 0 0 1 0 4h-2"/>',
  bed: '<path d="M3 18V6M3 13h18v5M21 18v-3a4 4 0 0 0-4-4h-6v2"/><circle cx="7" cy="10" r="1.6"/>', desk: '<path d="M3 9h18M5 9v11M19 9v11M14 9v6h5"/>',
  stairs: '<path d="M4 20h4v-4h4v-4h4V8h4"/>', tree: '<path d="M12 21v-5"/><path d="M12 3 6 11h3l-3.5 5h13L15 11h3Z"/>', road: '<path d="M8 3 5 21M16 3l3 18M12 5v2M12 11v2M12 17v2"/>',
  tools: '<path d="M14.5 6.5a3.5 3.5 0 0 0 4.3 4.3L21 13l-8 8-2.2-2.2a3.5 3.5 0 0 0-4.3-4.3L4 12l8-8Z"/>', home: '<path d="M3.5 11 12 4l8.5 7"/><path d="M6 9.6V20h12V9.6"/>',
  garage: '<path d="M3 20V9l9-5 9 5v11"/><path d="M7 20v-7h10v7M7 16h10"/>', chev: '<path d="m9 6 6 6-6 6"/>', close: '<path d="M6 6l12 12M18 6 6 18"/>',
  bolt: '<path d="M13 2.5 5.5 13.5H11L9.8 21.5 18.5 9.5H13l1-7Z"/>',
  chartL: '<path d="M3 17l5-6 4 3 6-8 3 3"/>', chartB: '<path d="M5 20v-7M10 20V8M15 20v-5M20 20V5"/>', power: '<path d="M12 3v8"/><path d="M6.4 6.6a8 8 0 1 0 11.2 0"/>', back: '<path d="M10 7 5 12l5 5M5 12h14"/>',
};
export const hi = (k, s = 18, sw = 1.6) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="display:block;flex:none" aria-hidden="true">${HI[k] || ''}</svg>`;
