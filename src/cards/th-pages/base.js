// Base class of the three TH page cards: one shadow root with the shared styles and a 12-column grid, throttled
// updates, and the confirm/keypad/full-screen overlays (kept from the original file).
import { VP_CSS } from './styles.js';
import { vesc, VI, vi } from './util.js';

/** A line icon from the shared set, or an mdi icon (e.g. "mdi:router") through <ha-icon>. */
export const vico = (k, s = 18, sw = 1.6) => (!VI[k] && typeof k === 'string' && k.includes(':')
  ? `<ha-icon icon="${vesc(k)}" style="--mdc-icon-size:${s}px;width:${s}px;height:${s}px;display:block;flex:none"></ha-icon>` : vi(k, s, sw));

export class VBase extends HTMLElement {
  /** Subclasses return their normalised config (see config.js). */
  static normalize(c) { return c; }
  setConfig(c) {
    this.cfg = c || {}; this._c = this.constructor.normalize(this.cfg);
    if (this._r) { this.teardown(); this.build(); this.update(); }
  }
  getCardSize() { return 10; }
  set hass(h) { this._h = h; if (!this._c) this._c = this.constructor.normalize(this.cfg || {});
    if (!this._r) { this._r = this.attachShadow({ mode: 'open' }); this._r.innerHTML = `<style>${VP_CSS}</style><div class="g" id="g"></div>`; this.build(); }
    const t = Date.now(); if (!this._t || t - this._t > 700) { this._t = t; this.update(); } else if (!this._q) this._q = setTimeout(() => { this._q = null; this._t = Date.now(); this.update(); }, 700); }
  disconnectedCallback() { clearTimeout(this._q); this._q = null; this.teardown(); }
  /** Stops timers/subscriptions before a rebuild or when the card leaves the page. */
  teardown() {}
  s(e) { return e ? this._h && this._h.states[e] : undefined; }
  n(e) { const s = this.s(e), v = s ? parseFloat(s.state) : NaN; return Number.isFinite(v) ? v : NaN; }
  st(e) { return this.s(e)?.state; }
  /** Display name of a configured { entity, name }: the configured name, else the entity's friendly name. */
  nm(ref) { return ref.name || this.s(ref.entity)?.attributes?.friendly_name || ref.entity; }
  $(id) { return this._r.getElementById(id); }
  set(id, h) { const e = this.$(id); if (e && e._v !== h) { e.innerHTML = h; e._v = h; } }
  ago(iso) { const m = Math.round((Date.now() - new Date(iso)) / 6e4); return m < 1 ? 'lige nu' : m < 60 ? `${m} min siden` : m < 1440 ? `${Math.floor(m / 60)} t ${m % 60} m siden` : `${Math.floor(m / 1440)} d siden`; }
  confirm(title, text, ok, col = 'var(--gold)') { const m = document.createElement('div'); m.className = 'mod';
    m.innerHTML = `<div class="box" style="--c:${col}"><h3>${title}</h3><p>${text}</p><div class="row"><button class="btn" data-x>Fortryd</button><button class="btn" data-ok style="background:${col};color:#15110a">Fortsæt</button></div></div>`;
    m.onclick = e => { if (e.target === m || e.target.closest('[data-x]')) m.remove(); if (e.target.closest('[data-ok]')) { m.remove(); ok(); } }; this._r.appendChild(m); }
  keypad(title, col, run) { let code = ''; const m = document.createElement('div'); m.className = 'mod';
    const dots = () => `${Array.from({ length: Math.max(4, code.length) }, (_, i) => `<i class="${i < code.length ? 'f' : ''}"></i>`).join('')}`;
    m.innerHTML = `<div class="box" style="--c:${col}"><h3>${title}</h3><p>Indtast kode. Den sendes direkte og gemmes ikke.</p><div class="dots" id="d">${dots()}</div>
      <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-n="${n}">${n}</button>`).join('')}<button data-n="c" style="font-size:13px">Ryd</button><button data-n="0">0</button><button data-n="b">${vi('back', 20)}</button></div>
      <button class="go" data-go>${title}</button><button class="btn" data-x style="width:100%;margin-top:8px">Fortryd</button></div>`;
    m.onclick = async e => { if (e.target === m || e.target.closest('[data-x]')) return m.remove(); const b = e.target.closest('[data-n]');
      if (b) { const n = b.dataset.n; code = n === 'c' ? '' : n === 'b' ? code.slice(0, -1) : (code + n).slice(0, 8); m.querySelector('#d').innerHTML = dots(); }
      if (e.target.closest('[data-go]')) { try { await run(code); m.remove(); } catch (er) { code = ''; const d = m.querySelector('#d'); d.innerHTML = dots(); d.classList.remove('err'); void d.offsetWidth; d.classList.add('err'); m.querySelector('p').textContent = 'Det lykkedes ikke: ' + (er.message || er); } } };
    this._r.appendChild(m); }
  full(src, cap) { const d = document.createElement('div'); d.className = 'full'; d.innerHTML = `<div class="cap">${vesc(cap)}</div><button class="x">${vi('close', 18)}</button><img src="${src}">`;
    d.onclick = e => { if (e.target === d || e.target.closest('.x')) d.remove(); }; this._r.appendChild(d); }
}
