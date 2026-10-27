/*
 * Header insights (Claude AI, 2026-10-27; user: "Prøv at byg det i" – the ideas for the header): one quiet line under the
 * status with what is worth knowing right now, most important first. Wide headers show several side by side, narrow
 * ones rotate them. config.insights (all keys optional):
 *   away: binary_sensor (on = nobody home)       away_since: entity whose last change dates the trip (e.g. house mode)
 *   alarm: alarm_control_panel                   locks: [lock.*]          openings: [binary_sensor door/window]
 *   power: sensor W/kW                           price / price_mean / price_min: price sensors (price_min attribute `at`)
 *   waste: sensor with days (attributes typer, kvitteret)   waste_path
 *   calendars: [calendar.*]                      travel: [{ name, travel: minutes sensor, direction: proximity direction }]
 *   robots: [{ name, entity, room }]             car: { name, battery, range, plugged, next_start, path }
 *   forecast: true (hourly forecast of config.weather: rain in the next 6 hours, and the 6-hour strip on wide headers)
 */
import { wxInfo, sunTimes } from "../ha-room-climate-card/premium.js";

const p2 = (n) => String(n).padStart(2, "0");
const hm = (d) => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
const dur = (min) => { const m = Math.max(0, Math.round(min)); return m >= 60 ? `${Math.floor(m / 60)} t ${m % 60} min` : `${m} min`; };
const names = (list) => list.length <= 2 ? list.join(" og ") : `${list.slice(0, 2).join(", ")} +${list.length - 2}`;
const when = (d) => {
  const now = new Date(), day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 864e5);
  if (diff === 0) return `kl. ${hm(d)}`;
  if (diff === 1) return `i går ${hm(d)}`;
  if (diff === -1) return `i morgen ${hm(d)}`;
  return `${d.toLocaleDateString("da-DK", { weekday: "short" }).replace(".", "")} ${hm(d)}`;
};

export function insightIds(cfg = {}) {
  return [cfg.away, cfg.away_since, cfg.alarm, ...(cfg.locks || []), ...(cfg.openings || []), cfg.power, cfg.price, cfg.price_mean, cfg.price_min,
    cfg.waste, ...(cfg.calendars || []), ...(cfg.travel || []).flatMap((t) => [t.travel, t.direction]),
    ...(cfg.robots || []).flatMap((r) => [r.entity, r.room]), cfg.car?.battery, cfg.car?.range, cfg.car?.plugged, cfg.car?.next_start].filter(Boolean);
}

/** The insights right now, most important first: { key, icon, text, tone (ok|warn|info|accent), path?, entity? }. */
export function computeInsights(hass, cfg = {}, hourly = []) {
  const S = (id) => (id ? hass?.states?.[id] : undefined), st = (id) => S(id)?.state;
  const num = (id) => { const v = parseFloat(st(id)); return Number.isFinite(v) ? v : NaN; };
  const fname = (id) => S(id)?.attributes?.friendly_name || id;
  const valid = (v) => v != null && !["unknown", "unavailable", ""].includes(String(v));
  const out = [], now = new Date();
  const add = (prio, item) => out.push({ prio, ...item });
  const away = cfg.away && st(cfg.away) === "on";
  const alarm = cfg.alarm ? st(cfg.alarm) : null, armed = !!alarm && alarm.startsWith("armed");

  // Security: anything open or unlocked first; otherwise a calm "all closed"
  const open = (cfg.openings || []).filter((id) => st(id) === "on");
  const unlocked = (cfg.locks || []).filter((id) => ["unlocked", "open", "opening", "unlocking", "jammed"].includes(st(id)));
  if (open.length) add(1, { key: "sec", icon: "mdi:door-open", tone: "warn", text: `Åben: ${names(open.map(fname))}`, entity: open[0] });
  else if (unlocked.length) add(1, { key: "sec", icon: "mdi:lock-open-variant-outline", tone: "warn", text: `Ulåst: ${names(unlocked.map(fname))}`, entity: unlocked[0] });
  else if ((cfg.locks || []).length || (cfg.openings || []).length) add(8, { key: "sec", icon: "mdi:shield-lock-outline", tone: "ok", text: `Alt lukket og låst${armed && !away ? " · alarm til" : ""}`, entity: cfg.alarm });

  // Waste due today/tomorrow and not marked as put out
  if (cfg.waste) {
    const days = num(cfg.waste), a = S(cfg.waste)?.attributes || {};
    if (Number.isFinite(days) && days <= 1 && !a.kvitteret) add(2, { key: "waste", icon: "mdi:trash-can-outline", tone: "warn", text: `${a.typer || "Affald"} ${days === 0 ? "i dag" : "i morgen"} – sæt ud`, path: cfg.waste_path });
  }

  // On the way home: the nearest one driving towards home
  const coming = (cfg.travel || []).map((t) => ({ name: t.name, min: num(t.travel), dir: st(t.direction) })).filter((t) => t.dir === "towards" && Number.isFinite(t.min) && t.min >= 1).sort((a, b) => a.min - b.min);
  if (coming.length) {
    const together = coming.every((t) => t.min - coming[0].min < 5);
    add(3, { key: "home", icon: "mdi:home-import-outline", tone: "accent", text: `${together && coming.length > 1 ? "" : `${coming[0].name} `}hjemme om ${dur(coming[0].min)}`.replace(/^h/, "H") });
  }

  // While away: since when, and the alarm
  if (away) {
    const sinceEnt = cfg.away_since && S(cfg.away_since) ? S(cfg.away_since) : S(cfg.away);
    const holiday = String(st(cfg.away_since) || "").toLowerCase() === "ferie";
    const since = sinceEnt?.last_changed ? new Date(sinceEnt.last_changed) : null;
    add(4, { key: "away", icon: holiday ? "mdi:palm-tree" : "mdi:home-export-outline", tone: "info", text: `${holiday ? "Ferie · tomt" : "Tomt"}${since ? ` siden ${when(since)}` : ""}${armed ? " · alarm til" : ""}`, entity: cfg.alarm || cfg.away });
  }

  // Weather in the next 6 hours
  if (cfg.forecast !== false && hourly.length) {
    const next = hourly.filter((h) => new Date(h.datetime).getTime() > now.getTime() - 30 * 60e3).slice(0, 6);
    const wet = next.findIndex((h) => Number(h.precipitation_probability) >= 50 || Number(h.precipitation) >= 0.3);
    const temps = next.map((h) => Number(h.temperature)).filter(Number.isFinite);
    if (wet === 0) add(5, { key: "wx", icon: "mdi:weather-rainy", tone: "accent", text: "Regn nu og den næste time" });
    else if (wet > 0) add(5, { key: "wx", icon: "mdi:weather-rainy", tone: "accent", text: `Regn fra kl. ${p2(new Date(next[wet].datetime).getHours())}` });
    else if (temps.length) add(7, { key: "wx", icon: "mdi:weather-partly-cloudy", tone: "info", text: `Tørt de næste 6 timer · ${Math.round(Math.min(...temps))}–${Math.round(Math.max(...temps))}°` });
  }

  // Next appointment within 24 h (multi-day all-day events such as a holiday are skipped)
  let soon = null;
  for (const id of cfg.calendars || []) {
    const a = S(id)?.attributes || {}; if (!a.start_time || !a.message) continue;
    const start = new Date(String(a.start_time).replace(" ", "T")), end = new Date(String(a.end_time || a.start_time).replace(" ", "T"));
    if (a.all_day && end - start > 864e5) continue;
    if (start > now && start - now < 864e5 && (!soon || start < soon.start)) soon = { start, text: String(a.message).trim(), all: a.all_day, id };
  }
  if (soon) add(6, { key: "cal", icon: "mdi:calendar-clock", tone: "info", text: `${soon.all ? (soon.start.getDate() === now.getDate() ? "I dag" : "I morgen") : when(soon.start).replace(/^kl\./, "Kl.")} · ${soon.text}`, entity: soon.id });

  // Electricity now and the price
  const pw = S(cfg.power), price = num(cfg.price);
  if (pw && valid(pw.state) && Number.isFinite(price)) {
    const w = parseFloat(pw.state) * (String(pw.attributes?.unit_of_measurement || "W").toLowerCase() === "kw" ? 1000 : 1);
    const mean = num(cfg.price_mean), min = num(cfg.price_min), at = S(cfg.price_min)?.attributes?.at;
    const tone = Number.isFinite(mean) ? (price <= mean * 0.85 ? "ok" : price >= mean * 1.15 ? "warn" : "info") : "info";
    let cheap = "";
    if (Number.isFinite(min) && min < price * 0.85 && at) { const [h, m] = String(at).split(":").map(Number); const t = new Date(now); t.setHours(h, m || 0, 0, 0); if (t > now) cheap = ` · billigst kl. ${p2(h)}`; }
    add(7, { key: "power", icon: "mdi:flash", tone, text: `${w >= 1000 ? `${(w / 1000).toLocaleString("da-DK", { maximumFractionDigits: 1 })} kW` : `${Math.round(w)} W`} · ${price.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr/kWh${cheap}`, entity: cfg.price });
  }

  // Robots at work
  for (const r of cfg.robots || []) {
    const s = st(r.entity); if (!["cleaning", "returning", "mowing"].includes(s)) continue;
    const room = st(r.room);
    add(6, { key: `robot-${r.entity}`, icon: String(r.entity).startsWith("lawn_mower.") ? "mdi:robot-mower" : "mdi:robot-vacuum", tone: "accent", text: s === "returning" ? `${r.name} kører hjem i dock` : `${r.name} gør rent${valid(room) ? ` i ${room}` : ""}`, entity: r.entity });
  }

  // The car
  const car = cfg.car;
  if (car?.battery && Number.isFinite(num(car.battery))) {
    const bat = Math.round(num(car.battery)), plugged = car.plugged && st(car.plugged) === "on";
    const start = car.next_start && valid(st(car.next_start)) ? new Date(st(car.next_start)) : null;
    const range = num(car.range);
    const tail = plugged ? (start && start > now ? `lader ${when(start)}` : "tilsluttet") : Number.isFinite(range) ? `${Math.round(range)} km` : "";
    add(9, { key: "car", icon: plugged ? "mdi:car-electric" : "mdi:car-side", tone: bat < 20 ? "warn" : "info", text: `${car.name || "Bil"} ${bat} %${tail ? ` · ${tail}` : ""}`, path: car.path, entity: car.path ? undefined : car.battery });
  }
  return out.sort((a, b) => a.prio - b.prio);
}

/** The next 6 hours as a strip (wide headers). */
export function hoursHtml(hass, hourly = [], esc = (v) => v) {
  const now = new Date(), lat = Number(hass?.config?.latitude), lon = Number(hass?.config?.longitude);
  const next = hourly.filter((h) => new Date(h.datetime).getTime() > now.getTime() - 30 * 60e3).slice(0, 6);
  const sunCache = new Map(); const night = (t) => { const k = t.toDateString(); if (!sunCache.has(k)) sunCache.set(k, sunTimes(t, lat, lon)); const s = sunCache.get(k); return s ? t < s.rise || t > s.set : false; };
  return next.map((h, i) => {
    const t = new Date(h.datetime), w = wxInfo(h.condition, night(t)), pr = Math.max(0, Math.min(100, Number(h.precipitation_probability) || 0));
    return `<span class="h6${i === 0 ? " now" : ""}" title="${esc(`${p2(t.getHours())}:00 · ${w.label} · ${Math.round(Number(h.temperature))}° · ${pr} % regn`)}"><small>${i === 0 ? "Nu" : p2(t.getHours())}</small><ha-icon icon="${w.icon}" style="color:${w.color}"></ha-icon><b>${Math.round(Number(h.temperature))}°</b><i style="--p:${pr}%"></i></span>`;
  }).join("");
}

export const INSIGHT_CSS = `
/* wide: as many whole chips as fit, most important first (the ones that would wrap are hidden) */
.insights{position:absolute;left:50%;bottom:9px;z-index:7;display:flex;flex-wrap:wrap;justify-content:center;gap:6px;width:max-content;max-width:calc(100% - 560px);height:24px;overflow:hidden;transform:translateX(-50%);pointer-events:auto}
.insights:empty{display:none}
.ins{flex:0 0 auto;max-width:100%;display:inline-flex;align-items:center;gap:5px;min-width:0;height:24px;padding:0 10px 0 7px;border:0;border-radius:99px;cursor:pointer;font:inherit;font-size:11.5px;font-weight:700;white-space:nowrap;
  color:#f3f6fa;background:rgba(10,15,22,.42);box-shadow:inset 0 0 0 1px rgba(255,255,255,.09),0 4px 12px -6px rgba(0,0,0,.6);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.ins span{overflow:hidden;text-overflow:ellipsis}
.ins ha-icon{flex:none;--mdc-icon-size:14px;color:var(--ic,#9fd3ff)}
.ins.t-ok{--ic:#4ade80}.ins.t-warn{--ic:#fbbf24;box-shadow:inset 0 0 0 1px rgba(251,191,36,.45),0 4px 12px -6px rgba(0,0,0,.6)}.ins.t-accent{--ic:#7dd3fc}.ins.t-info{--ic:#cbd5e1}
.ins.t-warn ha-icon{animation:insPulse 2.2s ease-in-out infinite}
ha-card.has-insights .status-group{top:41%}
.hours6{position:absolute;right:250px;top:50%;z-index:6;display:flex;gap:3px;transform:translateY(-58%);pointer-events:none}
.hours6:empty{display:none}
.h6{display:flex;flex-direction:column;align-items:center;gap:1px;width:36px;padding:4px 0 3px;border-radius:11px;background:rgba(10,15,22,.28);box-shadow:inset 0 0 0 1px rgba(255,255,255,.07);color:#f3f6fa;font-variant-numeric:tabular-nums}
.h6.now{background:rgba(10,15,22,.42);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}
.h6 small{font-size:9px;font-weight:800;opacity:.75}.h6 ha-icon{--mdc-icon-size:16px}.h6 b{font-size:11px;font-weight:800}
.h6 i{width:22px;height:3px;border-radius:2px;background:rgba(255,255,255,.12);overflow:hidden;position:relative}.h6 i::after{content:"";position:absolute;left:0;top:0;bottom:0;width:var(--p,0%);background:#60a5fa}
@keyframes insPulse{50%{opacity:.45}}
@container (min-width:1181px){.ins.k-wx.t-info{display:none}}
@container (max-width:1180px){.hours6{display:none}.insights{max-width:calc(100% - 460px)}}
@container (max-width:900px){.insights{max-width:calc(100% - 400px)}}
/* narrow: one insight at a time, they take turns */
@container (max-width:720px){
  .insights{left:10px;right:10px;bottom:6px;width:auto;max-width:none;transform:none;height:22px;overflow:visible}
  .ins,.ins:nth-child(n){position:absolute;left:50%;top:0;display:inline-flex;max-width:100%;height:22px;font-size:11px;opacity:0;transform:translate(-50%,6px);transition:opacity .45s ease,transform .45s ease;pointer-events:none}
  .ins.on{opacity:1;transform:translate(-50%,0);pointer-events:auto}
  ha-card.has-insights .status-group{top:40%}
  ha-card.has-insights .status-group:not(.has-alert) span{display:none}
  ha-card.has-insights .status-group:not(.has-alert) ha-icon{width:26px;height:26px;--mdc-icon-size:26px}
}
@media (prefers-reduced-motion:reduce){.ins.t-warn ha-icon{animation:none}.ins{transition:none!important}}
`;
