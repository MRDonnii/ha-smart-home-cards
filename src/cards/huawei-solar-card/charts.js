// The 24-hour history chart, the price bar chart and the cheapest-window search.
import { fmtW, fmtN, hh } from './util.js';

/* ---------- charts ---------- */
export function histChart(host, series, opts = {}) {
  const W = 600, H = opts.h || 120, pb = opts.axis === false ? 4 : 16, pt = 6, B = series ? series.pv.length : 0;
  const svg = host.querySelector('svg'), tip = host.querySelector('.tip');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  if (!B) { svg.innerHTML = `<text x="300" y="${H / 2}" fill="currentColor" opacity=".4" text-anchor="middle" font-size="11">Henter historik…</text>`; return; }
  const vals = [...series.pv, ...series.load].filter(v => v != null);
  const max = Math.max(1000, ...vals) * 1.1;
  const X = i => i / (B - 1) * W, Y = v => pt + (H - pb - pt) * (1 - (v || 0) / max), Ys = v => pt + (H - pb - pt) * (1 - (v || 0) / 100);
  const line = (a, f) => { let s = '', pen = false; a.forEach((v, i) => { if (v == null) { pen = false; return; } s += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + f(v).toFixed(1); pen = true; }); return s; };
  const area = (a, f) => { let s = '', st = -1; const flush = e => { if (st < 0) return; s += 'M' + X(st) + ' ' + (H - pb); for (let j = st; j <= e; j++) s += 'L' + X(j).toFixed(1) + ' ' + f(a[j]).toFixed(1); s += 'L' + X(e) + ' ' + (H - pb) + 'Z'; st = -1; };
    a.forEach((v, i) => { if (v == null) flush(i - 1); else if (st < 0) st = i; }); flush(a.length - 1); return s; };
  const id = 'g' + Math.random().toString(36).slice(2, 7);
  let s = `<defs><linearGradient id="${id}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sun)" stop-opacity=".38"/><stop offset="1" style="stop-color:var(--sun)" stop-opacity="0"/></linearGradient>
    <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--home)" stop-opacity=".14"/><stop offset="1" style="stop-color:var(--home)" stop-opacity="0"/></linearGradient></defs>`;
  s += `<line x1="0" x2="${W}" y1="${H - pb}" y2="${H - pb}" stroke="currentColor" opacity=".08"/>`;
  if (opts.axis !== false) for (let i = 0; i < B; i++) { const d = new Date(series.t0 + i * series.step); if (d.getMinutes() < 10 && d.getHours() % 6 === 0) s += `<text x="${X(i)}" y="${H - 2}" fill="currentColor" opacity=".38" font-size="9" text-anchor="middle">${hh(d)}:00</text>`; }
  if (opts.grid) for (let k = 1; k <= 3; k++) { const y = pt + (H - pb - pt) * (k - 1) / 3; s += `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="currentColor" opacity=".05"/><text x="0" y="${y + 10}" fill="currentColor" opacity=".35" font-size="9">${fmtN(max * (1 - (k - 1) / 3) / 1000, 1)} kW</text>`; }
  s += `<g class="fadein"><path d="${area(series.load, Y)}" fill="url(#${id}b)"/><path d="${area(series.pv, Y)}" fill="url(#${id}a)"/></g>`;
  s += `<path class="draw" d="${line(series.load, Y)}" fill="none" stroke="var(--home)" stroke-width="1.2" opacity=".8"/>`;
  s += `<path class="draw" d="${line(series.pv, Y)}" fill="none" stroke="var(--sun)" stroke-width="1.6"/>`;
  s += `<path class="draw" d="${line(series.soc, Ys)}" fill="none" stroke="var(--bat)" stroke-width="1.1" stroke-dasharray="3 3" opacity=".8" style="animation-delay:.4s"/>`;
  s += `<line class="hx" y1="${pt}" y2="${H - pb}" stroke="currentColor" opacity="0"/><circle class="hd" r="3" fill="var(--sun)" opacity="0"/>`;
  svg.innerHTML = s;
  svg.onpointermove = e => {
    const b = svg.getBoundingClientRect(), i = Math.round((e.clientX - b.left) / b.width * (B - 1)); if (i < 0 || i >= B) return;
    const hx = svg.querySelector('.hx'), hd = svg.querySelector('.hd');
    hx.setAttribute('x1', X(i)); hx.setAttribute('x2', X(i)); hx.setAttribute('opacity', .25);
    hd.setAttribute('cx', X(i)); hd.setAttribute('cy', Y(series.pv[i])); hd.setAttribute('opacity', series.pv[i] == null ? 0 : 1);
    tip.innerHTML = `<b>${new Date(series.t0 + i * series.step).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })}</b><br><span style="color:var(--sun)">Sol ${series.pv[i] == null ? '–' : fmtW(series.pv[i])}</span><br><span style="color:var(--home)">Forbrug ${series.load[i] == null ? '–' : fmtW(series.load[i])}</span><br><span style="color:var(--bat)">Batteri ${series.soc[i] == null ? '–' : Math.round(series.soc[i]) + ' %'}</span>`;
    tip.style.left = Math.max(60, Math.min(b.width - 60, e.clientX - b.left)) + 'px'; tip.style.top = (e.clientY - b.top) + 'px'; tip.style.opacity = 1;
  };
  svg.onpointerleave = () => { tip.style.opacity = 0; svg.querySelector('.hx').setAttribute('opacity', 0); svg.querySelector('.hd').setAttribute('opacity', 0); };
}
export function priceChart(host, all, opts = {}) {
  const svg = host.querySelector('svg'), tip = host.querySelector('.tip');
  if (!all.length) { svg.innerHTML = ''; return; }
  const W = 600, H = opts.h || 60, pb = opts.axis === false ? 2 : 14, max = Math.max(...all.map(p => p.price)) * 1.08, min = Math.min(...all.map(p => p.price));
  const nowH = new Date(); nowH.setMinutes(0, 0, 0);
  const bw = W / all.length, gap = Math.min(3, bw * .28); let s = '';
  const col = p => { const r = (p - min) / ((max / 1.08 - min) || 1); return r < .33 ? 'var(--bat)' : r < .66 ? 'var(--sun)' : 'var(--exp)'; };
  all.forEach((p, i) => {
    const t = new Date(p.hour), h = Math.max(2, (p.price / max) * (H - pb - 3)), x = i * bw, isNow = t.getTime() === nowH.getTime(), past = t < nowH;
    s += `<rect class="grow" data-i="${i}" style="animation-delay:${i * 12}ms" x="${x + gap / 2}" y="${H - pb - h}" width="${Math.max(1, bw - gap)}" height="${h}" rx="${Math.min(2.5, (bw - gap) / 2)}" fill="${col(p.price)}" opacity="${isNow ? 1 : past ? .18 : .55}"/>`;
    if (isNow) s += `<rect x="${x + gap / 2}" y="${H - pb - h}" width="${Math.max(1, bw - gap)}" height="${h}" rx="2" fill="none" stroke="${col(p.price)}" stroke-width="1"><animate attributeName="opacity" values="1;.2;1" dur="2.4s" repeatCount="indefinite"/></rect>`;
    if (opts.axis !== false && t.getHours() % (opts.every || 6) === 0) s += `<text x="${x + bw / 2}" y="${H - 2}" text-anchor="middle" fill="currentColor" opacity=".38" font-size="9">${hh(t)}</text>`;
    if (opts.axis !== false && t.getHours() === 0 && i > 0) s += `<line x1="${x}" x2="${x}" y1="0" y2="${H - pb}" stroke="currentColor" opacity=".15" stroke-dasharray="2 3"/>`;
  });
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = s;
  svg.onpointermove = e => {
    const i = e.target.dataset && e.target.dataset.i; if (i === undefined) { tip.style.opacity = 0; return; }
    const p = all[i], b = svg.getBoundingClientRect();
    tip.innerHTML = `<b>${new Date(p.hour).toLocaleString('da-DK', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</b><br>${fmtN(p.price, 2)} kr/kWh`;
    tip.style.left = Math.max(50, Math.min(b.width - 50, e.clientX - b.left)) + 'px'; tip.style.top = (e.clientY - b.top) + 'px'; tip.style.opacity = 1;
  };
  svg.onpointerleave = () => tip.style.opacity = 0;
}
export function cheapestWindow(all, len = 3) {
  const nowH = new Date(); nowH.setMinutes(0, 0, 0);
  const fut = all.filter(p => new Date(p.hour) >= nowH); let best = null;
  for (let i = 0; i + len <= fut.length; i++) { const avg = fut.slice(i, i + len).reduce((a, b) => a + b.price, 0) / len; if (!best || avg < best.avg) best = { avg, start: new Date(fut[i].hour) }; }
  return best;
}
