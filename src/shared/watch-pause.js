// Vagtens status og pause for dens notifikationer (Claude AI, 2026-10-26; bruger: "vi skal kunne snooze dem hvis vi ikke vil
// have dem i nogle timer eller til næste dag"). Bruges af nummerplade- og personvagtens kort:
//   guard_entity: binary_sensor, der er "on", når vagten er aktiv (attributten grund vises)
//   pause_entity: input_datetime med dato og tid – notifikationerne holder pause til da; registreringerne fortsætter
const p2 = n => String(n).padStart(2, '0');
const stamp = d => `${p2(d.getHours())}.${p2(d.getMinutes())}`;
const ymdhms = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:00`;

function untilText(d) {
  const now = new Date(), tom = new Date(now); tom.setDate(now.getDate() + 1);
  if (d.toDateString() === now.toDateString()) return `kl. ${stamp(d)}`;
  if (d.toDateString() === tom.toDateString()) return `i morgen kl. ${stamp(d)}`;
  return `${d.toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short' })} kl. ${stamp(d)}`;
}

// "I morgen kl. 7" – dagens kl. 7, hvis det er før kl. 4 om natten (samme regel som scriptet protect_vagt_pause).
function target(kind) {
  const d = new Date();
  if (kind === 'off') return new Date(d.getTime() - 60e3);
  if (kind === 'morning') { if (d.getHours() >= 4) d.setDate(d.getDate() + 1); d.setHours(7, 0, 0, 0); return d; }
  return new Date(d.getTime() + Number(kind) * 3600e3);
}

export const WATCH_PAUSE_CSS = `
.wp{position:relative;display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:16px 0 0;padding:10px 12px;border-radius:14px;
  background:color-mix(in srgb,var(--primary-text-color,#fff) 4%,transparent);border:1px solid color-mix(in srgb,var(--primary-text-color,#fff) 7%,transparent)}
.wp[hidden]{display:none}
.wp .st{display:flex;align-items:center;gap:8px;min-width:0;flex:1 1 220px;font-size:12.5px;line-height:1.3}
.wp .st ha-icon{--mdc-icon-size:20px;flex:none;color:var(--wp-c)}
.wp .st b{display:block;font-weight:750}.wp .st small{display:block;color:var(--secondary-text-color,#9ba5b3);font-size:11px;margin-top:1px}
.wp .bt{display:flex;gap:6px;flex-wrap:wrap}
.wp button{appearance:none;border:0;cursor:pointer;display:inline-flex;align-items:center;gap:5px;padding:7px 11px;border-radius:10px;font:inherit;font-size:11.5px;font-weight:750;
  color:var(--primary-text-color,#fff);background:color-mix(in srgb,var(--primary-text-color,#fff) 7%,transparent)}
.wp button:hover{background:color-mix(in srgb,var(--primary-text-color,#fff) 12%,transparent)}
.wp button ha-icon{--mdc-icon-size:15px}
.wp button.go{background:color-mix(in srgb,var(--accent,#54a8f5) 22%,transparent);color:var(--accent,#54a8f5)}
`;

export function renderWatchPause(box, hass, cfg) {
  if (!box || !hass) return;
  if (!cfg.pause_entity && !cfg.guard_entity) { box.hidden = true; return; }
  box.hidden = false; box._hass = hass; box._cfg = cfg;
  const g = cfg.guard_entity ? hass.states[cfg.guard_entity] : null, p = cfg.pause_entity ? hass.states[cfg.pause_entity] : null;
  const ts = Number(p?.attributes?.timestamp), until = Number.isFinite(ts) ? new Date(ts * 1000) : null, paused = !!until && until > new Date();
  const armed = g ? g.state === 'on' : null, grund = g?.attributes?.grund || '';
  const icon = paused ? 'mdi:bell-sleep-outline' : armed ? 'mdi:shield-check' : 'mdi:shield-home-outline';
  const color = paused ? 'var(--warning-color,#f5b14c)' : armed ? 'var(--success-color,#45d19a)' : 'var(--secondary-text-color,#9ba5b3)';
  const head = armed == null ? 'Notifikationer' : armed ? `Vagten er aktiv · ${grund}` : 'Vagten venter – I er hjemme';
  const sub = paused ? `Beskeder på pause til ${untilText(until)} · der registreres stadig`
    : armed === false ? 'Registrerer og sender besked, når ingen er hjemme' : 'Begge telefoner får besked';
  const btns = !cfg.pause_entity ? '' : paused ? '<button class="go" data-pause="off"><ha-icon icon="mdi:bell-ring-outline"></ha-icon>Genoptag beskeder</button>'
    : '<button data-pause="1"><ha-icon icon="mdi:bell-sleep-outline"></ha-icon>1 t</button><button data-pause="3">3 t</button><button data-pause="morning">Til i morgen kl. 7</button>';
  const html = `<div class="st" style="--wp-c:${color}"><ha-icon icon="${icon}"></ha-icon><span><b>${head}</b><small>${sub}</small></span></div><div class="bt">${btns}</div>`;
  if (box._v !== html) { box._v = html; box.innerHTML = html; }
  if (!box._bound) {
    box._bound = true;
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pause]'); if (!b) return; e.stopPropagation();
      box._hass.callService('input_datetime', 'set_datetime', { entity_id: box._cfg.pause_entity, datetime: ymdhms(target(b.dataset.pause)) });
    });
    // Teksten "til kl. …" og udløbet af pausen følger uret, også uden nye tilstande.
    box._tick = setInterval(() => { if (!box.isConnected) { clearInterval(box._tick); return; } renderWatchPause(box, box._hass, box._cfg); }, 30e3);
  }
}
