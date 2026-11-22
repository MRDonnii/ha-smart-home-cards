// Helpers, line icons and weather condition names shared by the TH page cards (kept from the original file).
export const vn = (v, d = 1) => (Number.isFinite(v) ? v : 0).toLocaleString('da-DK', { minimumFractionDigits: d, maximumFractionDigits: d });
export const vesc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const vh2 = d => `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
export const VI = {
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  cloud: '<path d="M7 18.5h10.5a4 4 0 0 0 .6-8A6 6 0 0 0 6.5 11.6 3.5 3.5 0 0 0 7 18.5Z"/>',
  pcloud: '<path d="M9 4.5v1.3M4.2 6.6l1 1M2.8 11.5h1.4M13.8 6.6l-1 1"/><path d="M6.4 10.4A3.6 3.6 0 0 1 12.6 9"/><path d="M8.5 19.5h9a3.5 3.5 0 0 0 .5-7 5 5 0 0 0-9.4 1.6A2.8 2.8 0 0 0 8.5 19.5Z"/>',
  rain: '<path d="M7 15h10.5a4 4 0 0 0 .6-8A6 6 0 0 0 6.5 8.1 3.5 3.5 0 0 0 7 15Z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
  snow: '<path d="M7 14h10.5a4 4 0 0 0 .6-8A6 6 0 0 0 6.5 7.1 3.5 3.5 0 0 0 7 14Z"/><path d="M8 18h.01M12 20h.01M16 18h.01M10 22h.01M14 22h.01"/>',
  bolt: '<path d="M7 14h10.5a4 4 0 0 0 .6-8A6 6 0 0 0 6.5 7.1 3.5 3.5 0 0 0 7 14Z"/><path d="m12.5 14-2 4h3l-2 4"/>',
  fog: '<path d="M4 9h16M3 13h18M5 17h14"/>', wind: '<path d="M3 9h11a3 3 0 1 0-3-3M3 13h15a3 3 0 1 1-3 3M3 17h7"/>',
  drop: '<path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5Z"/>', gauge: '<path d="M4 16a8 8 0 1 1 16 0"/><path d="m12 16 4-5"/>',
  temp: '<path d="M10 4.5a2 2 0 0 1 4 0v9.3a4 4 0 1 1-4 0Z"/><path d="M12 10v6"/>', uv: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V6Z"/><path d="m9 12 2 2 4-4"/>', shieldOff: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V6Z"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>', unlock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.7"/>',
  door: '<path d="M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21"/><path d="M4 21h16M14.5 12.5h.01"/>', alert: '<path d="M12 3 2.5 20h19Z"/><path d="M12 10v4M12 17h.01"/>',
  cam: '<rect x="3" y="7" width="13" height="10" rx="2"/><path d="m16 11 5-3v8l-5-3"/>', check: '<path d="m5 12 4 4 10-10"/>',
  router: '<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 16.5h.01M11 16.5h.01M8 13l-2-6M16 13l2-6"/>', box: '<rect x="3" y="7" width="18" height="11" rx="2"/><path d="M7 21h10M7 12h4"/>',
  fire: '<path d="M12 21a6 6 0 0 0 6-6c0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-3-2 2-3 4-3 7a6 6 0 0 0 6 6Z"/>', tv: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8"/>',
  plug: '<path d="M8 3v5M16 3v5M6 8h12v3a6 6 0 0 1-12 0Z"/><path d="M12 17v4"/>', cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  printer: '<path d="M7 8V3h10v5"/><rect x="3" y="8" width="18" height="9" rx="2"/><path d="M7 14h10v7H7z"/>', backup: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>', back: '<path d="M10 7 5 12l5 5M5 12h14"/>', update: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
};
export const vi = (k, s = 18, sw = 1.6) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="display:block;flex:none" aria-hidden="true">${VI[k] || ''}</svg>`;
export const COND = { 'clear-night': ['Klart', 'moon'], sunny: ['Sol', 'sun'], partlycloudy: ['Let skyet', 'pcloud'], cloudy: ['Overskyet', 'cloud'], rainy: ['Regn', 'rain'], pouring: ['Kraftig regn', 'rain'],
  snowy: ['Sne', 'snow'], 'snowy-rainy': ['Slud', 'snow'], fog: ['Tåge', 'fog'], lightning: ['Torden', 'bolt'], 'lightning-rainy': ['Torden og regn', 'bolt'], windy: ['Blæsende', 'wind'], 'windy-variant': ['Blæsende', 'wind'], hail: ['Hagl', 'snow'], exceptional: ['Usædvanligt', 'alert'] };
export const cond = (c, night) => { const r = COND[c] || [c || '–', 'cloud']; return c === 'partlycloudy' && night ? ['Let skyet', 'cloud'] : r; };
export const DIRS = ['N', 'NØ', 'Ø', 'SØ', 'S', 'SV', 'V', 'NV'];
