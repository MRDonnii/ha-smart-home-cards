// th-weather-page-card: the weather page. The hero is the package's th-weather-card; below it a radar/satellite tile,
// a 7-day forecast and the current measurements. Measurements come from configured sensors (or the DMI Vejr
// integration via `prefix`), falling back to the weather entity's own attributes.
import { VBase } from './base.js';
import { vn, vesc, vh2, vi, cond } from './util.js';
import { normalizeWeatherConfig } from './config.js';

const NO_WEATHER = '<div class="t"><div class="hd">Vejr</div><div style="font-size:13px;color:var(--mut)">Vælg en vejr-entitet (<b>weather</b>) i kortets konfiguration.</div></div>';
const NO_CELLS = '<div style="font-size:12px;color:var(--mut)">Ingen målinger – sæt <b>prefix</b> eller <b>entities</b> op i kortets konfiguration.</div>';

/** Wind speed in m/s from a weather attribute in the entity's own unit. */
export function toMs(v, unit) {
  const u = String(unit || 'km/h').toLowerCase();
  return u === 'm/s' ? v : u === 'mph' ? v * 0.44704 : u === 'kn' || u === 'kt' ? v * 0.514444 : u === 'ft/s' ? v * 0.3048 : v / 3.6;
}

export class ThWeatherPageCard extends VBase {
  static normalize(c) { return normalizeWeatherConfig(c); }
  static getStubConfig() { return { weather: 'weather.home' }; }
  get W() { return this._c.weather; }
  build() {
    const c = this._c;
    if (!c.weather) { this.$('g').innerHTML = NO_WEATHER; return; }
    const both = c.radar && c.satellite, src = c.source ? ` · ${vesc(c.source)}` : '';
    this.$('g').innerHTML = `
      <div style="grid-column:span 12;min-width:0"><th-weather-card id="hero"></th-weather-card></div>${c.radar || c.satellite ? `
      <div class="t s5 radar" style="animation-delay:80ms"><div class="hd"><span class="ic">${vi('rain', 15)}</span>Radar${both ? '<div class="tabs r" id="rtabs"><button data-r="radar" class="on">Radar</button><button data-r="sat">Satellit</button></div>' : ''}</div>
        <div class="img"><img id="rimg" alt=""><span class="pin"></span></div><div style="font-size:10.5px;color:var(--faint);margin-top:8px" id="rts"></div></div>` : ''}
      <div class="t${c.radar || c.satellite ? ' s7' : ''}" style="animation-delay:140ms;--acc:var(--gold)"><div class="hd"><span class="ic">${vi('sun', 15)}</span>7 dage</div><div class="days" id="days"></div></div>
      <div class="t" style="animation-delay:200ms;--acc:var(--emer)"><div class="hd"><span class="ic">${vi('gauge', 15)}</span>Målinger lige nu${src}</div><div class="cells" id="cells"></div></div>`;
    this._rad = c.radar ? 'radar' : 'sat'; this._rd = 0; this._dk = null; this._heroSet = false;
    this._r.querySelectorAll('#rtabs button').forEach(b => b.onclick = () => { this._rad = b.dataset.r; this._r.querySelectorAll('#rtabs button').forEach(x => x.classList.toggle('on', x === b)); this.radar(true); });
    this.subscribe();
    if (c.radar || c.satellite) this._rt = setInterval(() => this.radar(true), 5 * 60e3);
  }
  teardown() { clearInterval(this._rt); this._rt = null; this._unsub?.forEach(u => u.then ? u.then(f => f && f()) : u && u()); this._unsub = null; }
  connectedCallback() { if (this._r && this.W && !this._unsub) this.subscribe(); }
  subscribe() {
    if (!this._h?.connection || !this.W) return; this._unsub = [];
    this._unsub.push(this._h.connection.subscribeMessage(m => { this._daily = m.forecast || []; this._dk = null; this.daily(); },
      { type: 'weather/subscribe_forecast', forecast_type: 'daily', entity_id: this.W }));
  }
  update() {
    const c = this._c; if (!c.weather) return;
    const hero = this.$('hero'); if (hero) { if (!this._heroSet) { this._heroSet = true; hero.setConfig({ weather: this.W, ...(c.prefix ? { prefix: c.prefix } : {}), ...c.hero }); } hero.hass = this._h; }
    const w = this.s(this.W); if (!w) return; const a = w.attributes, E = c.ent;
    // measurements: a configured sensor wins; otherwise the weather entity's attribute; otherwise the cell is left out
    const cell = (k, ic2, v, u, sub) => `<div class="cell"><div class="k">${vi(ic2, 14)}${k}</div><b>${v}<small>${u}</small></b>${sub ? `<em>${sub}</em>` : ''}</div>`;
    const val = (key, d, attr, conv = x => x) => { if (E[key]) return vn(this.n(E[key]), d); const x = attr ? parseFloat(a[attr]) : NaN; return Number.isFinite(x) ? vn(conv(x), d) : null; };
    const sub = (key, d, fmt, attr) => { const v = val(key, d, attr); return v === null ? '' : fmt(v); };
    const cells = [
      ['Solindstråling', 'sun', val('solar_radiation', 0), 'W/m²', sub('solar_radiation_hour', 0, v => `snit sidste time ${v}`)],
      ['Solskin i dag', 'sun', val('sunshine_today', 1), 't', sub('sunshine_month', 0, v => `${v} t denne måned`)],
      ['Nedbør i dag', 'drop', val('precipitation_today', 1), 'mm', sub('precipitation_now', 1, v => `nu ${v} mm/t`)],
      ['Vindstød', 'wind', val('wind_gust', 1, 'wind_gust_speed', x => toMs(x, a.wind_speed_unit)), 'm/s', sub('wind_gust_max', 1, v => `kraftigste i dag ${v}`)],
      ['Luftfugtighed', 'drop', val('humidity', 0, 'humidity'), '%', sub('dew_point', 1, v => `dugpunkt ${v}°`, 'dew_point')],
      ['Lufttryk', 'gauge', val('pressure', 0, 'pressure'), 'hPa', ''],
      ['Skydække', 'cloud', val('cloud_cover', 0, 'cloud_coverage'), '%', sub('visibility', 0, v => `sigtbarhed ${v} km`, 'visibility')],
      ['UV‑indeks', 'uv', a.uv_index != null || E.ground_temperature || E.water_temperature ? vn(a.uv_index ?? 0, 1) : null, '',
        [sub('ground_temperature', 1, v => `jord ${v}°`), sub('water_temperature', 1, v => `hav ${v}°`)].filter(Boolean).join(' · ')],
    ].filter(x => x[2] !== null);
    this.set('cells', cells.length ? cells.map(x => cell(...x)).join('') : NO_CELLS);
    if (!this._rd) { this._rd = 1; this.radar(); }
    if (!this._unsub && this._h.connection) this.subscribe();
  }
  radar(force) {
    const c = this._c, e = this._rad === 'sat' ? c.satellite : c.radar, s = this.s(e); if (!s?.attributes?.entity_picture) return;
    const img = this.$('rimg'), n = new Image(); n.onload = () => { img.style.opacity = 0; setTimeout(() => { img.src = n.src; img.style.opacity = 1; }, force ? 250 : 0); };
    n.src = s.attributes.entity_picture + (force ? '&t=' + Date.now() : ''); this.set('rts', `${this._rad === 'sat' ? 'Satellit' : 'Radar'} · opdateret ${vh2(new Date(s.state))}${c.source ? ` · ${vesc(c.source)}` : ''}`);
    img.onclick = () => this.full(img.src, this._rad === 'sat' ? 'Satellit' : 'Radar');
  }
  daily() {
    if (!this.$('days')) return;
    const fc = (this._daily || []).slice(0, 7); if (!fc.length) return; const k = fc.map(f => f.temperature + '' + f.templow).join(); if (k === this._dk) return; this._dk = k;
    const E = this._c.ent, w = this.s(this.W);
    const lo = Math.min(...fc.map(f => f.templow ?? f.temperature)), hi = Math.max(...fc.map(f => f.temperature)), now = E.temperature ? this.n(E.temperature) : parseFloat(w?.attributes?.temperature);
    const col = t => t < 3 ? '#8ed1ff' : t < 10 ? '#9fd8c4' : t < 18 ? '#e8c37e' : '#ff9e7a';
    this.$('days').innerHTML = fc.map((f, i) => { const d = new Date(f.datetime), l = f.templow ?? f.temperature, h = f.temperature, L = (l - lo) / (hi - lo || 1) * 100, R = (h - lo) / (hi - lo || 1) * 100;
      return `<div class="day" style="animation-delay:${i * 60}ms"><span class="nm">${i === 0 ? 'I dag' : d.toLocaleDateString('da-DK', { weekday: 'short' })}</span>${vi(cond(f.condition)[1], 18)}
        <span class="pp">${(f.precipitation_probability || 0) >= 20 ? Math.round(f.precipitation_probability) + '%' : ''}</span><span class="lo">${Math.round(l)}°</span>
        <span class="rng"><i style="left:${L}%;width:${Math.max(4, R - L)}%;background:linear-gradient(90deg,${col(l)},${col(h)})"></i>${i === 0 && Number.isFinite(now) ? `<em style="left:${Math.max(0, Math.min(100, (now - lo) / (hi - lo || 1) * 100))}%"></em>` : ''}</span><span class="hi">${Math.round(h)}°</span></div>`; }).join('');
  }
}
