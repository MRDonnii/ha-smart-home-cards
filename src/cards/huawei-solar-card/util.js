// Labels, formatting and line icons shared by the card, the popup and the 3D scene.
export const LABEL = {
  maximise_self_consumption: 'Maks. egetforbrug', maximum_self_consumption: 'Maks. egetforbrug',
  time_of_use_luna2000: 'Tidsstyret', time_of_use: 'Tidsstyret', fully_fed_to_grid: 'Alt til elnettet',
  fixed_charge_discharge: 'Fast op-/afladning', adaptive: 'Adaptiv', third_party_dispatch: 'Ekstern styring',
  fed_to_grid: 'Sælg til elnettet', charge: 'Lad batteriet',
};
export const lbl = v => LABEL[v] || String(v ?? '–').replaceAll('_', ' ');
export const NS = 'http://www.w3.org/2000/svg';
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const fmtW = w => { w = Math.abs(w || 0); return w >= 1000 ? (w / 1000).toFixed(2).replace('.', ',') + ' kW' : Math.round(w) + ' W'; };
export const fmtN = (v, d = 1) => (v ?? 0).toLocaleString('da-DK', { minimumFractionDigits: d, maximumFractionDigits: d });
export const kwh = v => v >= 1000 ? Math.round(v).toLocaleString('da-DK') : fmtN(v, 1);
export const hh = d => String(d.getHours()).padStart(2, '0');

/* thin line icons, 24×24 centred on 0,0 */
export const ICON = {
  sun: '<circle r="4"/><path d="M0-9.5v2.2M0 7.3v2.2M-9.5 0h2.2M7.3 0h2.2M-6.7-6.7l1.6 1.6M5.1 5.1l1.6 1.6M-6.7 6.7l1.6-1.6M5.1-5.1l1.6-1.6"/>',
  panel: '<path d="M-9.5 3.5-6.5-6.5h13l3 10Z"/><path d="M-8-1.5h16M-2.2-6.5-3 3.5M2.2-6.5 3 3.5M0 3.5v4.5M-4 8h8"/>',
  home: '<path d="M-9 0 0-8l9 8"/><path d="M-6.5-2.2V8.5h13V-2.2"/><path d="M-2 8.5V3.5h4v5"/>',
  grid: '<path d="M0-9.5-5.5 9.5M0-9.5 5.5 9.5M-3.6-3h7.2M-4.8 2.5h9.6M-7.5-6.2h15"/>',
  battery: '<rect x="-5.5" y="-7.5" width="11" height="17" rx="2.4"/><path d="M-2.2-9.5h4.4"/>',
  ev: '<rect x="-7.5" y="-8.5" width="9.5" height="17" rx="2.2"/><path d="M2 -3h1.8a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h0"/><path class="bolt" d="M-2.2-4.8-4.6 0h3.4l-1.4 4.6"/>',
  inverter: '<rect x="-8.5" y="-8.5" width="17" height="17" rx="3.5"/><path d="M-5-1.2q2.5-4 5 0t5 0"/><path d="M-5 3.8h10" stroke-dasharray="2.2 1.6"/>',
  sliders: '<path d="M-8-5h16M-8 5h16"/><circle cx="-3" cy="-5" r="2.2"/><circle cx="3.5" cy="5" r="2.2"/>',
  tag: '<path d="M-8-1V-8h7L8-1 1 6Z"/><circle cx="-4.5" cy="-4.5" r="1.2"/>',
  cloud: '<path d="M-6 5h11a4 4 0 0 0 .5-8 6 6 0 0 0-11.5 1.5A3.4 3.4 0 0 0-6 5Z"/>',
  rain: '<path d="M-6 1h11a4 4 0 0 0 .5-8 6 6 0 0 0-11.5 1.5A3.4 3.4 0 0 0-6 1Z"/><path d="M-3 4l-1 4M1 4 0 8M5 4l-1 4"/>',
};
export const ic = (k, sz = 18) => `<svg class="i" width="${sz}" height="${sz}" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;
