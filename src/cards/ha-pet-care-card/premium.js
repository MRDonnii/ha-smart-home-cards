// Premium look of the pet care card (Claude AI, 2026-10-29; user asked for a more exclusive, premium pet page
// with animations): a hero with the pet in a ring of today's meals and a soft aurora with drifting paw prints, the
// day's meals on a timeline with a "now" marker, an animated food silo and water bowl, and (with `heat`) the heat
// cycle as a ribbon of days. Calm by default: everything moves slowly, nothing blinks, and it all stops with
// `animation: false` or reduced motion.

const MEAL_COLORS = { done: "var(--pp-good)", pending: "var(--pp-food)", missed: "var(--pp-danger)", skipped: "var(--pp-muted)", disabled: "var(--pp-muted)" };
const DAY_START = 6 * 60; const DAY_END = 22 * 60;

const pawSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8.35 3c1.18-.17 2.43 1.12 2.79 2.9.36 1.77-.29 3.35-1.47 3.53-1.17.18-2.43-1.11-2.8-2.89C6.5 4.77 7.17 3.19 8.35 3m7.15 0c1.19.19 1.85 1.77 1.5 3.54-.38 1.78-1.63 3.07-2.81 2.89-1.19-.18-1.84-1.76-1.47-3.53.36-1.78 1.61-3.07 2.78-2.9M3 7.6c1.14-.49 2.69.4 3.5 1.95.76 1.58.5 3.24-.63 3.73-1.13.49-2.67-.39-3.46-1.96C1.62 9.75 1.9 8.08 3 7.6m18 0c1.1.48 1.38 2.15.59 3.72-.79 1.57-2.33 2.45-3.46 1.96-1.13-.49-1.39-2.15-.63-3.73C18.31 8 19.86 7.11 21 7.6m-1.67 10.78c.04.94-.68 1.98-1.54 2.37-1.79.82-3.91-.88-5.9-.88-1.99 0-4.13 1.77-5.89.88-1-.49-1.69-1.79-1.56-2.87.18-1.49 1.95-2.29 3.01-3.38 1.41-1.41 2.41-4.06 4.44-4.06 2.02 0 3.08 2.61 4.44 4.06 1.12 1.23 2.99 2.27 3 3.88"/></svg>';

const minutes = (hhmm) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || "")); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const nowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const pct = (m) => Math.max(0, Math.min(100, ((m - DAY_START) / (DAY_END - DAY_START)) * 100));

export function premiumCountdown(meal) {
  const t = minutes(meal?.time); if (t == null) return "";
  const left = t - nowMinutes(); if (left <= 0) return "nu";
  const h = Math.floor(left / 60); const m = left % 60;
  return h ? `om ${h} t${m ? ` ${m} min` : ""}` : `om ${m} min`;
}

/** The parts of the card that move with the clock (the now marker and the countdown), updated each minute. */
export function premiumTick(root, card) {
  const now = pct(nowMinutes());
  root.querySelector(".pp-progress")?.style.setProperty("width", `${now}%`);
  root.querySelector(".pp-now")?.style.setProperty("left", `${now}%`);
  const el = root.querySelector("[data-countdown]");
  if (el) { const meal = (card._config.meals || [])[Number(el.dataset.countdown)]; el.textContent = premiumCountdown(meal); }
}

function heatModel(card) {
  const h = card._config.heat; if (!h?.sensor) return null;
  const st = card._entity(h.sensor); if (!st) return null;
  const a = st.attributes || {};
  const duration = card._number(h.duration) ?? (Number(/af ca\. (\d+)/.exec(st.state)?.[1]) || 21);
  const day = Number(a.dag);
  const inHeat = Number.isFinite(day) && day >= 1 && day <= duration;
  const fmt = (d) => d.toLocaleDateString(card._hass?.locale?.language || "da", { day: "numeric", month: "short", year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined });
  const date = (v, shift = 0) => { if (!v) return ""; const d = new Date(`${String(v).slice(0, 10)}T12:00:00`); if (Number.isNaN(d.getTime())) return ""; d.setDate(d.getDate() + shift); return fmt(d); };
  const inDays = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return fmt(d); };
  const phase = (d) => (d <= 8 ? "bleed" : d <= 14 ? "fertile" : "late");
  const phaseText = { bleed: "Blødning", fertile: "Mest frugtbar", late: "Sidste del" };
  return {
    duration, day, inHeat, fase: String(a.fase || ""), phase: inHeat ? phase(day) : null, phaseText,
    start: date(card._state(h.start) || ""), end: date(a.forventet_slut), next: date(a.naeste_forventet), daysToNext: Number(a.dage_til_naeste),
    // How far she is (Claude AI, 2026-10-29; user: "se hvor langt hun er i løbetid og hvornår næste ca starter"):
    // days left, the next phase and when it starts, and outside the heat when to start watching (14 days before).
    left: inHeat ? duration - day : null,
    nextPhase: !inHeat ? null : day <= 8 ? { name: "Mest frugtbar", in: 9 - day, date: inDays(9 - day) } : day <= 14 ? { name: "Sidste del", in: 15 - day, date: inDays(15 - day) } : null,
    watch: date(a.naeste_forventet, -14),
    startRaw: /^\d{4}-\d{2}-\d{2}/.test(card._state(h.start) || "") ? card._state(h.start).slice(0, 10) : "",
    script: h.script, calendar: h.calendar, sensor: h.sensor,
    // The same window as the front page tile: the 14 days before the expected heat, and up to 30 days late.
    soon: inHeat || !Number.isFinite(Number(a.dage_til_naeste)) || a.dage_til_naeste == null || a.dage_til_naeste > 14 || a.dage_til_naeste < -30 ? ""
      : a.dage_til_naeste > 1 ? `Løbetid om ca. ${a.dage_til_naeste} dage` : a.dage_til_naeste === 1 ? "Løbetid ca. i morgen" : "Løbetid ventes nu",
  };
}

function heatHtml(card, H, esc) {
  if (!H) return "";
  const cells = Array.from({ length: H.duration }, (_, i) => {
    const d = i + 1; const ph = d <= 8 ? "bleed" : d <= 14 ? "fertile" : "late";
    const state = !H.inHeat ? "" : d < H.day ? " past" : d === H.day ? " today" : "";
    return `<i class="pp-cell ${ph}${state}" style="--i:${i}" title="Dag ${d}"></i>`;
  }).join("");
  const marker = H.inHeat ? `<span class="pp-heat-marker" style="left:calc(${((H.day - 0.5) / H.duration) * 100}% - 1px)"><b>Dag ${H.day}</b></span>` : "";
  // In the heat the ring is how far she is (day of the cycle), outside it a countdown to the next.
  const ringOf = (offset, big, small) => `<div class="pp-heat-count"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="27"/><circle class="v" cx="32" cy="32" r="27" style="stroke-dashoffset:${offset.toFixed(1)}"/></svg><b>${big}</b><small>${small}</small></div>`;
  const ring = H.inHeat ? ringOf(170 * (1 - H.day / H.duration), `${Math.round((H.day / H.duration) * 100)}%`, "forløbet")
    : Number.isFinite(H.daysToNext) && H.daysToNext >= 0 ? ringOf(170 * Math.min(1, H.daysToNext / 183), H.daysToNext, "dage") : "";
  const days = (n) => (n === 0 ? "i dag" : n === 1 ? "i morgen" : `om ${n} dage`);
  return `<section class="pp-panel pp-heat${H.inHeat ? " active" : ""}" style="--d:3">
    <header class="pp-head"><span class="pp-hicon"><ha-icon icon="mdi:flower-tulip-outline"></ha-icon></span><div><h3>Løbetid</h3>
      <p>${H.inHeat ? `<b>${esc(H.phaseText[H.phase])}</b> · dag ${H.day} af ca. ${H.duration} · hold hanner væk` : "Ikke i løbetid lige nu"}</p></div>${ring}</header>
    ${H.inHeat ? `<div class="pp-ribbon">${cells}${marker}</div>
    <div class="pp-legend"><span class="bleed"><i></i>Blødning (dag 1–8)</span><span class="fertile"><i></i>Mest frugtbar (9–14)</span><span class="late"><i></i>Sidste del</span></div>` : ""}
    <div class="pp-facts">
      ${H.start ? `<div><small>${H.inHeat ? "Startede" : "Sidst startet"}</small><b>${esc(H.start)}</b></div>` : ""}
      ${H.inHeat && H.end ? `<div><small>Slutter ca.</small><b>${esc(H.end)}</b><em>${H.left} ${H.left === 1 ? "dag" : "dage"} tilbage</em></div>` : ""}
      ${H.nextPhase ? `<div><small>Næste fase</small><b>${esc(H.nextPhase.name)}</b><em>fra ${esc(H.nextPhase.date)} · ${days(H.nextPhase.in)}</em></div>` : ""}
      ${!H.inHeat && H.watch && H.daysToNext > 14 ? `<div><small>Hold øje fra</small><b>${esc(H.watch)}</b><em>${days(H.daysToNext - 14)}</em></div>` : ""}
      ${H.next ? `<div><small>${H.inHeat ? "Næste løbetid ca." : "Næste ca."}</small><b>${esc(H.next)}</b>${Number.isFinite(H.daysToNext) && H.daysToNext >= 0 ? `<em>${days(H.daysToNext)}</em>` : ""}</div>` : ""}
    </div>
    ${card._heatForm ? heatFormHtml(card, H, esc) : `<div class="pp-actions">
      ${H.script ? H.inHeat
        ? `<button class="pp-btn ghost" data-heatform><ha-icon icon="mdi:calendar-edit"></ha-icon>Ret startdato</button>`
        : `<button class="pp-btn heat" data-heatform><ha-icon icon="mdi:calendar-start"></ha-icon>Hun er gået i løbetid</button>` : ""}
      ${H.calendar ? `<button class="pp-btn ghost" data-info="${esc(H.calendar)}"><ha-icon icon="mdi:calendar-heart"></ha-icon>Kalender</button>` : ""}
    </div>`}
    <p class="pp-note">Et skøn for en Labrador: ca. 3 uger hver ca. 6. måned. Det bliver mere præcist med hendes egne datoer.</p>
  </section>`;
}

export const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const daysAgo = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n); return isoDay(d); };

// The form for the first day of a heat (Claude AI, 2026-10-29; user: "Skal der ikke være en knap til start løbetid
// hvis det ikke passer med tiden du har sat"): during the heat it corrects the start, outside it registers a new heat.
// A date input instead of window.prompt, which the phone apps do not all show.
function heatFormHtml(card, H, esc) {
  const f = card._heatForm; const today = daysAgo(0);
  const quick = [[0, "I dag"], [1, "I går"], [2, "I forgårs"]].map(([n, t]) => `<button class="pp-quick${f.value === daysAgo(n) ? " on" : ""}" data-hday="${n}">${t}</button>`).join("");
  const note = H.inHeat
    ? "Den nuværende løbetid i kalenderen bliver erstattet af den nye dato, og skønnet for den næste bliver regnet om."
    : "Den sidste løbetid bliver i kalenderen som historik. Den nye bliver lagt ind, og skønnet for den næste bliver regnet om.";
  return `<div class="pp-heatform">
    <h4>${H.inHeat ? "Hvornår startede løbetiden?" : "Hvornår gik hun i løbetid?"}</h4>
    <div class="pp-quicks">${quick}<input type="date" data-hdate value="${esc(f.value)}" max="${today}"></div>
    <p>${note}</p>${f.error ? `<p class="err">${esc(f.error)}</p>` : ""}
    <div class="pp-actions"><button class="pp-btn heat" data-hsave${f.busy ? " disabled" : ""}><ha-icon icon="mdi:check"></ha-icon>${f.busy ? "Gemmer …" : "Gem"}</button>
      <button class="pp-btn ghost" data-hcancel><ha-icon icon="mdi:close"></ha-icon>Annullér</button></div></div>`;
}

export function premiumHtml(card) {
  const c = card._config; const esc = (v) => card._escape(v);
  const meals = c.meals || [];
  const info = meals.map((meal, i) => {
    const skipped = card._on(meal.skip); const enabled = card._on(meal.enabled); const status = card._state(meal.status);
    const tone = !enabled ? "disabled" : skipped ? "skipped" : status === "done" ? "done" : status === "missed" ? "missed" : "pending";
    return { meal, i, skipped, enabled, tone, t: minutes(meal.time) };
  });
  const planned = info.filter((m) => m.enabled && !m.skipped);
  const done = planned.filter((m) => m.tone === "done").length;
  const now = nowMinutes();
  const next = planned.find((m) => m.tone === "pending" && m.t != null && m.t >= now) || planned.find((m) => m.tone === "pending");
  const percent = Math.max(0, Math.min(100, card._number(c.container_percent) ?? 0));
  const grams = card._number(c.container_grams); const daily = card._number(c.daily_amount);
  const daysLeft = Number.isFinite(grams) && daily > 0 ? grams / daily : undefined;
  const water = card._waterOk(); const error = card._error(); const mode = card._state(c.feeder_mode);
  const level = percent <= 10 ? "danger" : percent <= 30 ? "warn" : "good";
  const H = heatModel(card);
  const mood = error ? ["Foderautomaten melder fejl", "danger"] : !water && c.water ? ["Vandskålen skal fyldes", "danger"]
    : level === "danger" ? ["Foderbeholderen er næsten tom", "warn"] : planned.some((m) => m.tone === "missed") ? ["Et måltid blev ikke givet", "warn"] : ["Alt er godt", "good"];
  // The ring around the pet: one arc per planned meal of today.
  const n = Math.max(1, info.length); const gap = 16; /* round caps eat 9 of the gap */ const C = 2 * Math.PI * 52; const seg = (C - n * gap) / n;
  const arcs = info.map((m, i) => `<circle class="pp-arc ${m.tone}" cx="60" cy="60" r="52" style="stroke:${MEAL_COLORS[m.tone]};stroke-dasharray:${seg.toFixed(2)} ${(C - seg).toFixed(2)};stroke-dashoffset:${(-(i * (seg + gap) + gap / 2)).toFixed(2)};--i:${i}"/>`).join("");
  const chips = [
    `<span class="pp-chip food"><ha-icon icon="mdi:food-drumstick"></ha-icon>${done} af ${planned.length} måltider</span>`,
    next ? `<span class="pp-chip next"><ha-icon icon="mdi:clock-outline"></ha-icon>${esc(next.meal.name)} ${esc(next.meal.time)} · <b data-countdown="${next.i}">${premiumCountdown(next.meal)}</b></span>` : `<span class="pp-chip good"><ha-icon icon="mdi:check-circle"></ha-icon>Dagens måltider er givet</span>`,
    c.water ? `<span class="pp-chip ${water ? "water" : "danger"}"><ha-icon icon="${water ? "mdi:water" : "mdi:water-off"}"></ha-icon>${water ? "Vand i skålen" : "Mangler vand"}</span>` : "",
    H?.inHeat ? `<span class="pp-chip heat"><ha-icon icon="mdi:flower-tulip"></ha-icon>Løbetid dag ${H.day}/${H.duration}</span>`
      : H?.soon ? `<span class="pp-chip heat"><ha-icon icon="mdi:flower-tulip-outline"></ha-icon>${H.soon}</span>` : "",
  ].filter(Boolean).join("");
  const nodes = info.filter((m) => m.t != null).map((m) => `<button class="pp-node ${m.tone}" style="left:${pct(m.t)}%" data-info="${esc(m.meal.status || "")}" title="${esc(`${m.meal.name} ${m.meal.time}`)}"><ha-icon icon="${m.tone === "done" ? "mdi:check" : m.tone === "missed" ? "mdi:close" : m.tone === "skipped" ? "mdi:debug-step-over" : esc(m.meal.icon || "mdi:bowl-mix")}"></ha-icon></button>`).join("");
  const label = { done: "Givet", pending: "Afventer", missed: "Misset", skipped: "Springes over", disabled: "Slået fra" };
  const mealCards = info.map((m) => `<article class="pp-meal ${m.tone}" style="--i:${m.i}">
      <div class="pp-meal-top"><span class="pp-micon"><ha-icon icon="${esc(m.meal.icon || "mdi:bowl-mix")}"></ha-icon></span>
        <div><h4>${esc(m.meal.name || `Måltid ${m.i + 1}`)}</h4><button class="pp-status" data-info="${esc(m.meal.status || "")}">${esc(m.meal.time || "—")}<i></i>${label[m.tone]}</button></div>
        ${m.meal.enabled ? `<button class="pp-tog${m.enabled ? " on" : ""}" data-toggle="${esc(m.meal.enabled)}" aria-label="${esc(m.meal.name)} til/fra"><i></i></button>` : ""}</div>
      <div class="pp-meal-actions">
        ${m.meal.feed_action ? `<button class="pp-btn" data-feed="${esc(m.meal.feed_action)}" data-name="${esc(m.meal.name)}"><ha-icon icon="mdi:food-drumstick-outline"></ha-icon>Giv nu</button>` : ""}
        ${m.meal.skip ? `<button class="pp-btn ghost" data-skip="${esc(m.meal.skip)}" data-name="${esc(m.meal.name)}" data-skipped="${m.skipped}"><ha-icon icon="${m.skipped ? "mdi:undo-variant" : "mdi:skip-next"}"></ha-icon>${m.skipped ? "Fortryd" : "Spring over"}</button>` : ""}
      </div></article>`).join("");
  const hours = [6, 9, 12, 15, 18, 21].map((h) => `<span style="left:${pct(h * 60)}%">${String(h).padStart(2, "0")}</span>`).join("");
  return `<ha-card class="pp ${card._config.animation === false ? "still" : ""}${card._ppIntro ? "" : " intro"}">
  <section class="pp-hero ${mood[1]}">
    <div class="pp-aurora"></div>
    <div class="pp-paws">${[0, 1, 2, 3, 4, 5].map((i) => `<span style="--p:${i}">${pawSvg}</span>`).join("")}</div>
    <div class="pp-avatar"><svg class="pp-ring" viewBox="0 0 120 120"><circle class="pp-ring-bg" cx="60" cy="60" r="52"/>${arcs}</svg>
      <div class="pp-face"><ha-icon icon="${esc(c.icon || "mdi:dog-side")}"></ha-icon></div><span class="pp-count">${done}/${planned.length}</span></div>
    <div class="pp-id"><span class="pp-eyebrow">${esc(c.title || "Kæledyrspleje")}</span><h2>${esc(c.pet_name || "Kæledyr")}</h2>
      <p class="pp-mood ${mood[1]}"><i></i>${esc(mood[0])}</p><div class="pp-chips">${chips}</div></div>
  </section>
  <div class="pp-grid">
    <section class="pp-panel pp-day" style="--d:1">
      <header class="pp-head"><span class="pp-hicon"><ha-icon icon="mdi:calendar-clock"></ha-icon></span><div><h3>Dagens måltider</h3><p>${done} af ${planned.length} givet${next ? ` · næste ${esc(next.meal.name.toLowerCase())} kl. ${esc(next.meal.time)}` : ""}</p></div>
        ${c.feeder_mode ? `<button class="pp-mode ${mode === "schedule" ? "on" : ""}" data-mode><ha-icon icon="${mode === "schedule" ? "mdi:calendar-check" : "mdi:hand-back-right"}"></ha-icon>${mode === "schedule" ? "Plan" : "Manuel"}</button>` : ""}</header>
      <div class="pp-timeline"><div class="pp-track"><span class="pp-progress" style="width:${pct(now)}%"></span><span class="pp-now" style="left:${pct(now)}%"><i></i></span>${nodes}</div><div class="pp-hours">${hours}</div></div>
      <div class="pp-meals">${mealCards}</div>
    </section>
    <section class="pp-panel pp-supply${c.water ? "" : " food"}" style="--d:2">
      <header class="pp-head"><span class="pp-hicon"><ha-icon icon="mdi:silo-outline"></ha-icon></span><div><h3>${c.water ? "Foder og vand" : "Foder"}</h3><p>${error ? "Foderautomaten melder fejl" : `${card._format(percent)} % i beholderen`}</p></div></header>
      <div class="pp-supply-row">
        <button class="pp-silo ${level}" data-info="${esc(c.container_percent || c.container_grams || "")}" aria-label="Foderbeholder ${card._format(percent)} %">
          <span class="pp-silo-fill" style="height:${percent}%"><span class="pp-wave"></span></span><span class="pp-silo-glass"></span><b>${card._format(percent)}<small>%</small></b></button>
        <div class="pp-stats">
          <div><small>I beholderen</small><b>${Number.isFinite(grams) ? `${card._format(grams)} g` : "—"}</b></div>
          <div><small>Rækker ca.</small><b>${daysLeft != null ? `${card._format(daysLeft, daysLeft < 10 ? 1 : 0)} dage` : "—"}</b></div>
          <div><small>Pr. dag</small><b>${Number.isFinite(daily) ? `${card._format(daily)} g` : "—"}</b></div>
          ${c.refill_action ? `<button class="pp-btn ghost" data-refill><ha-icon icon="mdi:refresh"></ha-icon>Fyldt op</button>` : ""}
        </div>
        ${c.water ? `<button class="pp-bowl ${water ? "ok" : "empty"}" data-info="${esc(c.water)}" aria-label="${water ? "Vand i skålen" : "Mangler vand"}">
          <span class="pp-bowl-water"><i></i><i></i></span>
          <b>${water ? "Vand" : "Tom"}</b>${c.water_battery ? `<small>${card._format(card._number(c.water_battery))} % batteri</small>` : ""}</button>` : ""}
      </div>
    </section>
    ${heatHtml(card, H, esc)}
  </div>
</ha-card>`;
}

export const PREMIUM_STYLE = `
:host{display:block}
.pp{--pp-good:var(--dashboard-success,#4fe0a6);--pp-food:#ffb547;--pp-water:#4cc9ff;--pp-heat:#ff6fa5;--pp-heat2:#c86bff;--pp-danger:var(--dashboard-danger,#ff667a);--pp-muted:var(--dashboard-icon-muted,#7b8796);
  --pp-surface:var(--surface,var(--ha-card-background,var(--card-background-color,#141c27)));--pp-line:color-mix(in srgb,var(--primary-text-color) 9%,transparent);
  overflow:visible;border:0;background:none;box-shadow:none;display:grid;gap:14px}
.pp-hero{position:relative;isolation:isolate;overflow:hidden;display:grid;grid-template-columns:auto minmax(0,1fr);gap:22px;align-items:center;padding:24px 26px;border-radius:26px;
  background:linear-gradient(135deg,color-mix(in srgb,var(--pp-surface) 92%,#000),var(--pp-surface));border:1px solid var(--pp-line);
  border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--pp-food);box-shadow:var(--dashboard-shadow-strong,0 14px 40px rgba(0,0,0,.28))}
.pp-hero.danger{border-left-color:var(--pp-danger)}.pp-hero.warn{border-left-color:var(--pp-food)}.pp-hero.good{border-left-color:var(--pp-good)}
.pp-aurora{position:absolute;inset:-40%;z-index:-2;background:radial-gradient(40% 35% at 20% 30%,color-mix(in srgb,var(--pp-food) 28%,transparent),transparent 70%),radial-gradient(35% 30% at 75% 25%,color-mix(in srgb,var(--pp-water) 20%,transparent),transparent 70%),radial-gradient(40% 40% at 60% 85%,color-mix(in srgb,var(--pp-heat2) 18%,transparent),transparent 70%);filter:blur(10px);animation:ppAurora 26s ease-in-out infinite alternate}
@keyframes ppAurora{0%{transform:translate(0,0) rotate(0)}50%{transform:translate(4%,-3%) rotate(8deg)}100%{transform:translate(-3%,4%) rotate(-6deg)}}
.pp-paws{position:absolute;inset:0;z-index:-1;pointer-events:none}
.pp-paws span{position:absolute;bottom:-30px;left:calc(18% + var(--p) * 13%);width:18px;height:18px;color:color-mix(in srgb,var(--primary-text-color) 13%,transparent);transform:rotate(calc(var(--p) * 23deg - 40deg));animation:ppPaw 16s linear infinite;animation-delay:calc(var(--p) * -2.7s)}
.pp-paws svg{width:100%;height:100%}
@keyframes ppPaw{0%{transform:translateY(0) rotate(-20deg);opacity:0}15%{opacity:1}85%{opacity:.9}100%{transform:translateY(-210px) rotate(15deg);opacity:0}}
.pp-avatar{position:relative;width:132px;height:132px;display:grid;place-items:center}
.pp-ring{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)}
.pp-ring-bg{fill:none;stroke:color-mix(in srgb,var(--primary-text-color) 8%,transparent);stroke-width:9}
.pp-arc{fill:none;stroke-width:9;stroke-linecap:round;filter:drop-shadow(0 0 6px currentColor)}
.pp-arc.done{color:var(--pp-good)}.pp-arc.pending{color:var(--pp-food);opacity:.55}.pp-arc.missed{color:var(--pp-danger)}.pp-arc.skipped,.pp-arc.disabled{opacity:.3;filter:none}
.pp.intro .pp-arc{animation:ppArc 1.4s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i) * .18s + .2s)}
@keyframes ppArc{from{opacity:0;stroke-width:2}}
.pp-face{width:92px;height:92px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 30%,color-mix(in srgb,var(--pp-food) 30%,var(--pp-surface)),var(--pp-surface) 72%);box-shadow:inset 0 0 0 1px var(--pp-line),0 10px 30px rgba(0,0,0,.25)}
.pp-face ha-icon{--mdc-icon-size:54px;color:color-mix(in srgb,var(--pp-food) 75%,var(--primary-text-color));animation:ppBreath 5.5s ease-in-out infinite;transform-origin:50% 80%}
@keyframes ppBreath{0%,100%{transform:scale(1) rotate(0)}40%{transform:scale(1.04) rotate(-3deg)}70%{transform:scale(1.02) rotate(2deg)}}
.pp-count{position:absolute;bottom:-4px;right:-2px;padding:3px 9px;border-radius:999px;background:var(--pp-surface);border:1px solid var(--pp-line);font-size:12px;font-weight:800}
.pp-id{min-width:0}.pp-eyebrow{font-size:10.5px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:var(--pp-food)}
.pp-id h2{margin:2px 0 4px;font-size:40px;line-height:1;font-weight:850;letter-spacing:-.02em;background:linear-gradient(100deg,var(--primary-text-color) 30%,color-mix(in srgb,var(--pp-food) 80%,var(--primary-text-color)));-webkit-background-clip:text;background-clip:text;color:transparent}
.pp-mood{display:flex;align-items:center;gap:8px;margin:0 0 12px;font-size:14px;font-weight:700;color:var(--secondary-text-color)}
.pp-mood i{--dot:var(--pp-good);width:9px;height:9px;border-radius:50%;background:var(--dot);animation:ppPulse 2.6s ease-out infinite}
.pp-mood.warn i{--dot:var(--pp-food)}.pp-mood.danger i{--dot:var(--pp-danger)}
@keyframes ppPulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--dot) 55%,transparent)}70%,100%{box-shadow:0 0 0 9px transparent}}
.pp-chips{display:flex;flex-wrap:wrap;gap:7px}
.pp-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:999px;font-size:12.5px;font-weight:700;background:color-mix(in srgb,var(--primary-text-color) 6%,transparent);border:1px solid var(--pp-line)}
.pp-chip ha-icon{--mdc-icon-size:16px}.pp-chip.food ha-icon{color:var(--pp-food)}.pp-chip.next ha-icon{color:var(--pp-food)}.pp-chip.water ha-icon{color:var(--pp-water)}.pp-chip.good ha-icon{color:var(--pp-good)}
.pp-chip.heat{border-color:color-mix(in srgb,var(--pp-heat) 45%,transparent);background:color-mix(in srgb,var(--pp-heat) 12%,transparent)}.pp-chip.heat ha-icon{color:var(--pp-heat)}
.pp-chip.danger{border-color:color-mix(in srgb,var(--pp-danger) 50%,transparent);background:color-mix(in srgb,var(--pp-danger) 14%,transparent)}.pp-chip.danger ha-icon{color:var(--pp-danger)}
.pp-grid{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(280px,1fr);gap:14px}
.pp-heat{grid-column:1/-1}.pp-heat.active{order:-1}
.pp-panel{position:relative;min-width:0;padding:18px;border-radius:22px;background:var(--pp-surface);border:1px solid var(--pp-line);border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--pp-food);box-shadow:var(--dashboard-shadow-strong,0 12px 32px rgba(0,0,0,.22))}
.pp-supply{border-left-color:var(--pp-water)}.pp-supply.food{border-left-color:var(--pp-food)}.pp-supply.food .pp-hicon{background:color-mix(in srgb,var(--pp-food) 15%,transparent);color:var(--pp-food)}.pp-heat{border-left-color:var(--pp-heat)}
.pp.intro .pp-panel,.pp.intro .pp-hero{animation:ppRise .7s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--d, 0) * .08s)}
@keyframes ppRise{from{opacity:0;transform:translateY(10px)}}
.pp-head{display:flex;align-items:center;gap:12px;margin-bottom:14px}.pp-head>div{flex:1;min-width:0}
.pp-head h3{margin:0;font-size:16px;font-weight:800}.pp-head p{margin:2px 0 0;font-size:12.5px;color:var(--secondary-text-color)}
.pp-hicon{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:color-mix(in srgb,var(--pp-food) 15%,transparent);color:var(--pp-food)}
.pp-supply .pp-hicon{background:color-mix(in srgb,var(--pp-water) 15%,transparent);color:var(--pp-water)}.pp-heat .pp-hicon{background:color-mix(in srgb,var(--pp-heat) 15%,transparent);color:var(--pp-heat)}
.pp-hicon ha-icon{--mdc-icon-size:21px}
button{font:inherit;color:inherit;cursor:pointer}
.pp-mode{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;border:1px solid var(--pp-line);background:color-mix(in srgb,var(--primary-text-color) 5%,transparent);font-size:12.5px;font-weight:700}
.pp-mode.on{border-color:color-mix(in srgb,var(--pp-good) 45%,transparent);background:color-mix(in srgb,var(--pp-good) 12%,transparent)}.pp-mode ha-icon{--mdc-icon-size:16px}
.pp-timeline{position:relative;margin:4px 6px 18px}
.pp-track{position:relative;height:8px;border-radius:999px;background:color-mix(in srgb,var(--primary-text-color) 8%,transparent);margin:18px 0 8px}
.pp-progress{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:linear-gradient(90deg,color-mix(in srgb,var(--pp-food) 40%,transparent),var(--pp-food));transition:width 1s}
.pp-now{position:absolute;top:50%;width:0;height:0;transition:left 1s}
.pp-now i{position:absolute;left:-7px;top:-7px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 0 0 4px color-mix(in srgb,var(--pp-food) 45%,transparent),0 0 16px var(--pp-food);animation:ppNow 2.4s ease-in-out infinite}
@keyframes ppNow{50%{box-shadow:0 0 0 7px color-mix(in srgb,var(--pp-food) 20%,transparent),0 0 22px var(--pp-food)}}
.pp-node{position:absolute;top:50%;transform:translate(-50%,-50%);display:grid;place-items:center;width:34px;height:34px;padding:0;border-radius:50%;border:2px solid var(--pp-surface);background:var(--pp-surface);box-shadow:0 0 0 2px currentColor}
.pp-node ha-icon{--mdc-icon-size:17px}
.pp-node.done{color:var(--pp-good);background:color-mix(in srgb,var(--pp-good) 22%,var(--pp-surface));box-shadow:0 0 0 2px currentColor,0 0 14px color-mix(in srgb,var(--pp-good) 60%,transparent)}
.pp-node.pending{color:var(--pp-food);animation:ppNode 3s ease-in-out infinite}.pp-node.missed{color:var(--pp-danger)}.pp-node.skipped,.pp-node.disabled{color:var(--pp-muted);opacity:.7}
@keyframes ppNode{50%{box-shadow:0 0 0 2px currentColor,0 0 0 7px color-mix(in srgb,var(--pp-food) 18%,transparent)}}
.pp-hours{position:relative;height:14px}.pp-hours span{position:absolute;transform:translateX(-50%);font-size:10.5px;color:var(--secondary-text-color);font-variant-numeric:tabular-nums}
.pp-meals{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
.pp-meal{padding:12px;border-radius:16px;background:color-mix(in srgb,var(--primary-text-color) 4%,transparent);border:1px solid var(--pp-line)}
.pp.intro .pp-meal{animation:ppRise .6s both;animation-delay:calc(.25s + var(--i) * .08s)}
.pp-meal.done{border-color:color-mix(in srgb,var(--pp-good) 35%,transparent);background:linear-gradient(160deg,color-mix(in srgb,var(--pp-good) 10%,transparent),transparent 70%)}
.pp-meal.missed{border-color:color-mix(in srgb,var(--pp-danger) 40%,transparent)}.pp-meal.skipped,.pp-meal.disabled{opacity:.72}
.pp-meal-top{display:flex;align-items:center;gap:10px}.pp-meal-top>div{flex:1;min-width:0}
.pp-meal-top h4{margin:0 0 3px;font-size:14px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pp-micon{display:grid;place-items:center;width:34px;height:34px;border-radius:11px;background:color-mix(in srgb,var(--pp-food) 13%,transparent);color:var(--pp-food)}.pp-micon ha-icon{--mdc-icon-size:19px}
.pp-status{display:inline-flex;align-items:center;gap:6px;padding:0;border:0;background:none;color:var(--secondary-text-color);font-size:11.5px;font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums}
.pp-status i{width:7px;height:7px;border-radius:50%;background:var(--pp-food)}.done .pp-status i{background:var(--pp-good)}.missed .pp-status i{background:var(--pp-danger)}.skipped .pp-status i,.disabled .pp-status i{background:var(--pp-muted)}
.pp-meal{container-type:inline-size}
.pp-meal-actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:7px;margin-top:11px}.pp-meal-actions .pp-btn{white-space:nowrap;padding:8px 8px}
@container (max-width:230px){.pp-meal-actions .pp-btn ha-icon{display:none}}
.pp-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 12px;border-radius:12px;border:0;background:var(--pp-food);color:#1d1305;font-size:12.5px;font-weight:800;transition:transform .15s}
.pp-btn:active{transform:scale(.97)}.pp-btn ha-icon{--mdc-icon-size:16px}
.pp-btn.ghost{background:color-mix(in srgb,var(--primary-text-color) 7%,transparent);color:inherit;border:1px solid var(--pp-line)}
.pp-btn.heat{background:linear-gradient(120deg,var(--pp-heat),var(--pp-heat2));color:#fff}
.pp-tog{flex:0 0 auto;position:relative;width:40px;height:24px;padding:0;border-radius:999px;border:1px solid var(--pp-line);background:color-mix(in srgb,var(--primary-text-color) 10%,transparent)}
.pp-tog i{position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .2s}
.pp-tog.on{background:var(--pp-good);border-color:transparent}.pp-tog.on i{transform:translateX(16px)}
.pp-supply-row{display:grid;grid-template-columns:auto minmax(0,1fr);gap:16px;align-items:center}
.pp-silo{position:relative;width:86px;height:150px;padding:0;border-radius:24px 24px 18px 18px;border:2px solid color-mix(in srgb,var(--primary-text-color) 18%,transparent);background:color-mix(in srgb,var(--primary-text-color) 4%,transparent);overflow:hidden}
.pp-silo-fill{position:absolute;left:0;right:0;bottom:0;background:radial-gradient(circle at 20% 30%,rgba(255,255,255,.25) 0 2px,transparent 3px) 0 0/14px 12px,radial-gradient(circle at 70% 70%,rgba(0,0,0,.18) 0 2.5px,transparent 3.5px) 0 0/16px 14px,linear-gradient(180deg,#e9a24a,#a8642a);transition:height 1.2s cubic-bezier(.2,.8,.2,1)}
.pp-silo.warn .pp-silo-fill{background:radial-gradient(circle at 20% 30%,rgba(255,255,255,.25) 0 2px,transparent 3px) 0 0/14px 12px,linear-gradient(180deg,#f2c14e,#b98a26)}
.pp-silo.danger .pp-silo-fill{background:linear-gradient(180deg,#ff8a7a,#c2403a)}
.pp-silo.warn .pp-wave{background:radial-gradient(12px 8px at 12px 10px,#f2c14e 98%,transparent) 0 0/24px 14px}.pp-silo.danger .pp-wave{background:radial-gradient(12px 8px at 12px 10px,#ff8a7a 98%,transparent) 0 0/24px 14px}
.pp-wave{position:absolute;left:-50%;top:-7px;width:200%;height:14px;background:radial-gradient(12px 8px at 12px 10px,#e9a24a 98%,transparent) 0 0/24px 14px;animation:ppWave 6s linear infinite;opacity:.95}
@keyframes ppWave{to{transform:translateX(24px)}}
.pp-silo-glass{position:absolute;inset:0;background:linear-gradient(100deg,rgba(255,255,255,.18),transparent 30%,transparent 70%,rgba(255,255,255,.08));pointer-events:none}
.pp-silo b{position:absolute;left:0;right:0;top:12px;text-align:center;font-size:22px;font-weight:850;text-shadow:0 2px 8px rgba(0,0,0,.45)}.pp-silo b small{font-size:12px}
.pp-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px;align-content:center}
.pp-stats small,.pp-facts small{display:block;font-size:11px;color:var(--secondary-text-color);text-transform:uppercase;letter-spacing:.06em;font-weight:700}
.pp-stats b,.pp-facts b{font-size:17px;font-weight:800}.pp-stats .pp-btn{grid-column:1/-1;justify-self:start}
.pp-bowl{grid-column:1/-1;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;padding:10px 14px;border-radius:16px;border:1px solid var(--pp-line);background:color-mix(in srgb,var(--pp-water) 7%,transparent);text-align:left;position:relative;overflow:hidden}
.pp-bowl-water{position:relative;width:54px;height:22px;border-radius:0 0 30px 30px;background:linear-gradient(180deg,#7fd9ff,#2a9bd6);box-shadow:inset 0 3px 0 rgba(255,255,255,.35)}
.pp-bowl.empty .pp-bowl-water{background:color-mix(in srgb,var(--primary-text-color) 10%,transparent);box-shadow:none}
.pp-bowl-water i{position:absolute;left:50%;top:5px;width:8px;height:3px;border-radius:50%;border:1px solid rgba(255,255,255,.75);transform:translateX(-50%);animation:ppRipple 3.2s ease-out infinite}
.pp-bowl-water i+i{animation-delay:1.6s}.pp-bowl.empty .pp-bowl-water i{display:none}
@keyframes ppRipple{from{width:6px;height:2px;opacity:.9}to{width:44px;height:9px;opacity:0}}
.pp-bowl b{font-size:15px;font-weight:800}.pp-bowl small{font-size:11.5px;color:var(--secondary-text-color);justify-self:end}
.pp-bowl.empty{border-color:color-mix(in srgb,var(--pp-danger) 45%,transparent);background:color-mix(in srgb,var(--pp-danger) 10%,transparent)}
.pp-heat .pp-head{margin-bottom:12px}
.pp-heat-count{position:relative;width:64px;height:64px;display:grid;place-items:center}.pp-head>.pp-heat-count{flex:0 0 64px}.pp-heat-count svg{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)}
.pp-heat-count circle{fill:none;stroke:color-mix(in srgb,var(--primary-text-color) 9%,transparent);stroke-width:6}.pp-heat-count circle.v{stroke:var(--pp-heat);stroke-dasharray:170;stroke-linecap:round}
.pp-heat-count b{position:relative;margin-top:-8px;font-size:16px;font-weight:850;line-height:1}.pp-heat-count small{position:absolute;bottom:16px;font-size:9.5px;color:var(--secondary-text-color)}
.pp-ribbon{position:relative;display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:4px;height:34px;margin:26px 0 10px}
.pp-cell{border-radius:7px;opacity:.28}.pp-cell.bleed{background:#ff5c7c}.pp-cell.fertile{background:linear-gradient(180deg,#ff7ac0,#c86bff)}.pp-cell.late{background:#ffa3c4}
.pp-cell.past{opacity:.85}.pp-cell.today{opacity:1;box-shadow:0 0 0 2px #fff,0 0 18px var(--pp-heat);animation:ppToday 2.8s ease-in-out infinite}
@keyframes ppToday{50%{box-shadow:0 0 0 2px #fff,0 0 28px var(--pp-heat)}}
.pp.intro .pp-cell{animation:ppCell .5s both;animation-delay:calc(var(--i) * .03s)}.pp.intro .pp-cell.today{animation:ppCell .5s both,ppToday 2.8s ease-in-out .9s infinite}
@keyframes ppCell{from{transform:scaleY(.2);opacity:0}}
.pp-heat-marker{position:absolute;top:-24px;transform:translateX(-50%);font-size:11.5px;white-space:nowrap}.pp-heat-marker b{padding:2px 8px;border-radius:999px;background:var(--pp-heat);color:#fff;font-weight:800}
.pp-legend{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:12px;font-size:12px;color:var(--secondary-text-color)}
.pp-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}.pp-legend .bleed i{background:#ff5c7c}.pp-legend .fertile i{background:linear-gradient(180deg,#ff7ac0,#c86bff)}.pp-legend .late i{background:#ffa3c4}
.pp-facts{display:flex;flex-wrap:wrap;gap:12px 26px;margin:4px 0 14px}.pp-facts em{display:block;font-style:normal;font-size:12px;color:var(--pp-heat);font-weight:700}
.pp-actions{display:flex;flex-wrap:wrap;gap:8px}
.pp-heatform{margin-top:4px;padding:14px;border-radius:16px;border:1px solid color-mix(in srgb,var(--pp-heat) 40%,transparent);background:color-mix(in srgb,var(--pp-heat) 8%,transparent)}
.pp-heatform{animation:ppSlide .35s ease-out}
@keyframes ppSlide{from{transform:translateY(6px)}}
.pp-heatform h4{margin:0 0 10px;font-size:14px;font-weight:800}.pp-heatform p{margin:10px 0 12px;font-size:12px;color:var(--secondary-text-color)}.pp-heatform p.err{color:var(--pp-danger);font-weight:700}
.pp-quicks{display:flex;flex-wrap:wrap;align-items:center;gap:7px}
.pp-quick{padding:8px 13px;border-radius:999px;border:1px solid var(--pp-line);background:color-mix(in srgb,var(--primary-text-color) 6%,transparent);font-size:12.5px;font-weight:700}
.pp-quick.on{border-color:transparent;background:var(--pp-heat);color:#fff}
.pp-quicks input{min-height:36px;padding:6px 10px;border-radius:12px;border:1px solid var(--pp-line);background:color-mix(in srgb,var(--primary-text-color) 6%,transparent);color:inherit;font:inherit;font-size:13px;color-scheme:dark light}
.pp-btn[disabled]{opacity:.6;pointer-events:none}
.pp-note{margin:12px 0 0;font-size:11.5px;color:var(--secondary-text-color)}
.pp.still *,.pp.still *::before,.pp.still *::after{animation:none!important;transition:none!important}
@media(prefers-reduced-motion:reduce){.pp *{animation:none!important;transition:none!important}}
@media(max-width:820px){.pp-grid{grid-template-columns:minmax(0,1fr)}.pp-hero{grid-template-columns:minmax(0,1fr);justify-items:center;text-align:center;padding:22px 18px}.pp-chips{justify-content:center}.pp-mood{justify-content:center}.pp-id h2{font-size:36px}}
@media(max-width:700px){.pp-meals{grid-template-columns:minmax(0,1fr)}}
@media(max-width:480px){.pp-stats{grid-template-columns:minmax(0,1fr)}}
`;
