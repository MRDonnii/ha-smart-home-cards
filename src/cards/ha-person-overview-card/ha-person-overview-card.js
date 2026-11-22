import { isNewLook, lookEditorHtml, wireLookEditor } from "../../shared/look.js";
const VERSION = "0.6.1";
class HAPersonOverviewCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._sig = "";
  }
  static getStubConfig() {
    return {
      columns: 2,
      mobile_columns: 2,
      persons: [
        {
          name: "Person",
          entity: "person.example",
          tracker: "device_tracker.phone",
          battery: "sensor.phone_battery",
          city: "sensor.phone_city",
        },
      ],
    };
  }
  static getConfigElement() {
    return document.createElement("ha-person-overview-card-editor");
  }
  setConfig(c) {
    if (!Array.isArray(c?.persons) || !c.persons.length)
      throw new Error("persons skal indeholde mindst én person");
    this._config = { columns: 2, mobile_columns: 2, ...c };
    this._built = false;
    this._render();
  }
  set hass(h) {
    this._hass = h;
    const ids =
      this._config?.persons
        ?.flatMap((p) => [
          p.entity,
          p.tracker,
          p.city,
          p.battery,
          p.charging,
          p.distance,
          p.travel_time,
          this._geoId(p),
        ])
        .concat([].concat(this._config?.trip_calendar || []))
        .concat(this._config?.style_entity || [])
        .filter(Boolean) || [];
    const sig = JSON.stringify(
      ids.map((id) => [id, h.states[id]?.state, h.states[id]?.last_updated]),
    );
    if (sig !== this._sig) {
      this._sig = sig;
      this._render();
    }
  }
  getCardSize() {
    return Math.ceil((this._config?.persons?.length || 1) / 2) * 2;
  }
  _s(id) {
    return this._hass?.states?.[id];
  }
  // ---------- where someone is without a zone (Claude AI, 2026-10-27; user: "tager ud fra lokation hvis ikke der er en
  // zone oprettet i området? enten med By eller som nu Lalandia søndervig") ----------
  // The phone's own geocoded sensor (iOS/Android companion app, sensor.<tracker>_geocoded_location, or p.geocoded):
  // a known place (Areas Of Interest), else the district (Sub Locality), else the town. Trackers without one (the boys'
  // watches) use the town in their address; anyone within 1.5 km of a person with a better place shares it.
  _geoId(p) {
    if (p.geocoded) return p.geocoded;
    const t = String(p.tracker || "").split(".")[1];
    const id = t ? `sensor.${t}_geocoded_location` : "";
    return id && this._s(id) ? id : "";
  }
  _ownPlace(p) {
    const ok = (v) => this._valid(v) && !["n/a", "na", "-"].includes(String(v).trim().toLowerCase());
    const geo = this._s(this._geoId(p))?.attributes;
    if (geo) { const poi = String(geo["Areas Of Interest"] || "").split(/[,;]/)[0]; for (const v of [poi, geo["Sub Locality"], geo.Locality]) if (ok(v)) return { name: String(v).trim(), rank: v === poi ? 3 : 2 }; }
    const tracker = this._s(p.tracker)?.attributes || {};
    const addr = String(tracker.address || "");
    const town = addr.match(/\b\d{4}\s+([^,]+)/)?.[1];
    if (ok(town)) return { name: town.trim(), rank: 1 };
    const city = this._s(p.city)?.state;
    if (ok(city) && !/\d/.test(city)) return { name: city, rank: 1 };
    return null;
  }
  _coords(p) {
    for (const id of [p.entity, p.tracker]) {
      const a = this._s(id)?.attributes || {}; const lat = Number(a.latitude), lon = Number(a.longitude);
      if (a.latitude != null && Number.isFinite(lat) && Number.isFinite(lon)) return [lat, lon];
    }
    return null;
  }
  // A trip in the calendar (trip_calendar, e.g. "Lalandia søndervig" all-day 26–30/10): while someone is more than 25 km
  // from home during an ongoing all-day event of two days or more, its title is the place.
  _trip(p) {
    const cals = [].concat(this._config.trip_calendar || []); if (!cals.length || !(this._km(p) > 25)) return "";
    for (const id of cals) {
      const a = this._s(id)?.attributes || {}; if (this._s(id)?.state !== "on" || !a.all_day || !a.message) continue;
      const start = new Date(String(a.start_time).replace(" ", "T")), end = new Date(String(a.end_time).replace(" ", "T"));
      const days = Math.round((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 864e5);
      if (days >= 2) return String(a.message).trim().replace(/^./, (c) => c.toUpperCase());
    }
    return "";
  }
  _place(p) {
    const trip = this._trip(p); if (trip) return trip;
    let best = this._ownPlace(p); const here = this._coords(p);
    if (here) for (const q of this._config.persons || []) {
      if (q === p) continue; const there = this._coords(q); if (!there) continue;
      const r = Math.PI / 180, dLat = (there[0] - here[0]) * r, dLon = (there[1] - here[1]) * r;
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(here[0] * r) * Math.cos(there[0] * r) * Math.sin(dLon / 2) ** 2;
      if (6371000 * 2 * Math.asin(Math.sqrt(h)) > 1500) continue;
      const theirs = this._ownPlace(q); if (theirs && (!best || theirs.rank > best.rank)) best = theirs;
    }
    return best?.name || "";
  }
  // Distance home in km whatever the sensor's unit (the boys' proximity sensors report metres: "117811,0 km").
  _km(p) {
    const s = this._s(p.distance); const v = Number(s?.state); if (!Number.isFinite(v)) return NaN;
    const unit = String(s.attributes?.unit_of_measurement || "km").toLowerCase();
    return unit === "m" ? v / 1000 : unit === "mi" ? v * 1.609344 : unit === "ft" ? v * 0.0003048 : v;
  }
  _valid(v) {
    return (
      v && !["unknown", "unavailable", "none"].includes(String(v).toLowerCase())
    );
  }
  // iOS reports "Charging", "Not Charging" or "Full": only a real charge counts (Claude AI, 2026-10-13 – "Not Charging"
  // matched /charg/ and showed both phones as charging).
  _charging(p) { const v = String(this._s(p.charging)?.state || "").trim().toLowerCase(); return ["charging", "lader", "oplader", "on", "true"].includes(v); }
  _segments(active, color, glow) {
    return `<span class="segments">${[1, 2, 3, 4, 5].map((i) => `<i style="background:${i <= active ? color : "var(--presence-segment-off,rgba(120,140,160,.22))"};box-shadow:${i <= active ? `0 0 7px ${glow}` : "none"}"></i>`).join("")}</span>`;
  }
  _person(p) {
    const person = this._s(p.entity),
      tracker = this._s(p.tracker) || person,
      state = tracker?.state || person?.state || "unknown";
    const home = state === "home",
      away = state === "not_home",
      color = home
        ? "var(--presence-home,#37e69a)"
        : away
          ? "var(--presence-away,#ffb347)"
          : this._valid(state)
            ? "var(--presence-zone,#58b9ff)"
            : "var(--presence-unknown,#8795a5)",
      glow = `color-mix(in srgb,${color} 42%,transparent)`;
    const status = home
      ? "Hjemme"
      : away
        ? this._place(p) || "Ude"
        : this._valid(state)
          ? state
          : "Ukendt";
    const city = this._s(p.city)?.state;
    const place = this._valid(city)
      ? city
      : home
        ? p.home_label || "Hjemme"
        : status;
    const level = Number(this._s(p.battery)?.state),
      battery = Number.isFinite(level)
        ? Math.max(0, Math.min(100, level))
        : null,
      charging = this._charging(p);
    const bColor =
      battery === null
        ? "var(--presence-unknown,#8795a5)"
        : battery < 20
          ? "var(--battery-critical,#ff4665)"
          : battery < 40
            ? "var(--battery-low,#ffb347)"
            : battery < 80
              ? "var(--battery-good,#41d98d)"
              : "var(--battery-full,#23e6b3)";
    const bActive = battery === null ? 0 : Math.max(1, Math.ceil(battery / 20));
    const dist = this._km(p),
      travel = Number(this._s(p.travel_time)?.state),
      tripMain = home
        ? "Hjemme"
        : Number.isFinite(travel)
          ? `${Math.round(travel)} min`
          : "Hjemtur",
      tripLabel = home
        ? "Ankommet"
        : Number.isFinite(dist)
          ? `${dist < 1 ? Math.round(dist * 1000) + " m" : dist.toFixed(1) + " km"}`
          : "Afstand ukendt";
    const pic = p.image || person?.attributes?.entity_picture || "";
    const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    return `<button class="person" data-path="${esc(p.navigation_path || "")}" style="--person-color:${color}"><span class="portrait" style="${pic ? `background-image:url('${esc(pic.replaceAll("'", "%27"))}')` : ""}"></span><span class="main"><b>${esc(p.name || person?.attributes?.friendly_name || "Person")}</b><strong style="color:${color}">${esc(status)}</strong><small>${esc(place)}</small></span><span class="mini battery"><b>${battery === null ? "--" : Math.round(battery) + "%"}</b>${this._segments(bActive, bColor, `color-mix(in srgb,${bColor} 45%,transparent)`)}<small>${charging ? "Lader" : "Batteri"}</small></span><span class="mini trip"><b>${tripMain}</b>${this._segments(home ? 5 : Number.isFinite(dist) ? Math.max(1, 5 - Math.floor(dist / 5)) : 0, color, glow)}<small>${tripLabel}</small></span></button>`;
  }
  // v2 (Claude AI, 2026-10-13; user: "byg noget helt nyt … med samme mulighed for at skifte tilbage"): a round portrait
  // in a presence-coloured ring, the name with a status chip, the place or the trip home, and a battery pill.
  _v2() { return isNewLook(this._hass, this._config); }
  _personV2(p) {
    const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const person = this._s(p.entity); const tracker = this._s(p.tracker) || person; const state = tracker?.state || person?.state || "unknown";
    const home = state === "home"; const away = state === "not_home";
    const color = home ? "var(--presence-home,#37e69a)" : away ? "var(--presence-away,#ffb347)" : this._valid(state) ? "var(--presence-zone,#58b9ff)" : "var(--presence-unknown,#8795a5)";
    const where = away ? this._place(p) : "";
    const status = home ? "Hjemme" : away ? where || "Ude" : this._valid(state) ? state : "Ukendt";
    const place = home ? p.home_label || "Hjemme" : where;
    const level = Number(this._s(p.battery)?.state); const battery = Number.isFinite(level) ? Math.max(0, Math.min(100, level)) : null;
    const charging = this._charging(p);
    const bColor = battery === null ? "var(--presence-unknown,#8795a5)" : battery < 20 ? "var(--battery-critical,#ff4665)" : battery < 40 ? "var(--battery-low,#ffb347)" : "var(--battery-good,#41d98d)";
    const dist = this._km(p); const travel = Number(this._s(p.travel_time)?.state);
    const trip = home ? "" : [Number.isFinite(travel) ? `${Math.round(travel)} min hjem` : "", Number.isFinite(dist) ? (dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1).replace(".", ",")} km`) : ""].filter(Boolean).join(" · ");
    const pic = p.image || person?.attributes?.entity_picture || "";
    const initial = esc((p.name || "?").trim()[0] || "?");
    // battery_style: ring (Claude AI, 2026-10-27; user: "samme cirkel som alt andet til batteri med batteri% i midten … med
    // farveskift efter batteristatus"): the status tiles' ring, the level in the middle, red/amber/green by level.
    const ring = this._config.battery_style === "ring";
    const C = 2 * Math.PI * 15;
    const bat = battery === null ? "" : ring
      ? `<span class="bring${charging ? " chg" : ""}" title="Batteri ${Math.round(battery)} %${charging ? " · lader" : ""}"><svg viewBox="0 0 36 36" aria-hidden="true"><circle class="tr" cx="18" cy="18" r="15"></circle><circle class="pr" cx="18" cy="18" r="15" stroke-dasharray="${(battery / 100 * C).toFixed(1)} ${C.toFixed(1)}"></circle></svg><b>${Math.round(battery)}<small>%</small></b>${charging ? '<ha-icon icon="mdi:lightning-bolt"></ha-icon>' : ""}</span>`
      : `<span class="bat${charging ? " chg" : ""}"><span class="bb"><i style="width:${battery}%"></i></span><b>${Math.round(battery)}%</b>${charging ? '<ha-icon icon="mdi:lightning-bolt"></ha-icon>' : ""}</span>`;
    return `<button class="pv2 ${home ? "home" : away ? "away" : "zone"}${ring && bat ? " has-ring" : ""}" data-path="${esc(p.navigation_path || "")}" style="--pc:${color};--bc:${bColor}">
      <span class="av${battery !== null && battery < 20 && !charging ? " low" : ""}"${pic ? ` style="background-image:url('${pic.replaceAll("'", "%27")}')"` : ""}>${pic ? "" : initial}</span>
      <span class="tx"><b><span class="mq"><span>${esc(p.name || person?.attributes?.friendly_name || "Person")}</span></span></b>
        <span class="st"><i></i><span class="mq"><span>${esc(status)}</span></span></span>
        <small>${trip ? `<ha-icon icon="mdi:car-arrow-left"></ha-icon>` : ""}<span class="mq"><span>${esc(trip || place)}</span></span></small></span>
      ${bat}
    </button>`;
  }
  // combined (v2 only): every person in one tile, side by side (user, 2026-10-13: "de 4 person kort … i én flise").
  _combined() { return this._v2() && this._config?.combined === true; }
  _personMini(p) {
    const full = this._personV2(p);
    return full.replace('class="pv2 ', 'class="pv2 mini ');
  }
  // Phones (user, 2026-10-13: "Person kort skal laves helt om på mobilen"): one low line grouped by status – who is home as
  // overlapping portraits, who is out with their trip home or zone. Each portrait opens the person's page.
  _personLine() {
    const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const info = this._config.persons.map((p) => {
      const person = this._s(p.entity); const tracker = this._s(p.tracker) || person; const state = tracker?.state || person?.state || "unknown";
      const home = state === "home"; const away = state === "not_home";
      const color = home ? "var(--presence-home,#37e69a)" : away ? "var(--presence-away,#ff5d8f)" : this._valid(state) ? "var(--presence-zone,#58b9ff)" : "var(--presence-unknown,#8795a5)";
      const level = Number(this._s(p.battery)?.state); const low = Number.isFinite(level) && level < 20;
      const travel = Number(this._s(p.travel_time)?.state);
      const spot = away ? this._place(p) : "";
      const where = home ? "" : away ? [spot, Number.isFinite(travel) ? `${Math.round(travel)} min hjem` : ""].filter(Boolean).join(" · ") || "Ude" : this._valid(state) ? state : "Ukendt";
      const pic = p.image || person?.attributes?.entity_picture || "";
      const av = `<span class="lav${low ? " low" : ""}" style="--pc:${color}${pic ? `;background-image:url('${pic.replaceAll("'", "%27")}')` : ""}">${pic ? "" : esc((p.name || "?")[0])}</span>`;
      return { p, home, where, av, color, name: p.name || person?.attributes?.friendly_name || "Person" };
    });
    const homes = info.filter((x) => x.home); const outs = info.filter((x) => !x.home);
    const btn = (x, inner, cls = "") => `<button class="lp ${cls}" data-path="${esc(x.p.navigation_path || "")}" title="${esc(x.name)}" style="--pc:${x.color}">${inner}</button>`;
    return `<div class="cline"><div class="lg home"><span class="ll"><i></i>Hjemme <b>${homes.length}</b></span><span class="lavs">${homes.map((x) => btn(x, x.av)).join("") || '<span class="none">Ingen</span>'}</span></div>
      <div class="lg out">${outs.length ? outs.map((x) => btn(x, `${x.av}<span class="lt"><b>${esc(x.name)}</b><small>${esc(x.where)}</small></span>`, "wide")).join("") : '<span class="all">Alle er hjemme</span>'}</div></div>`;
  }
  _gridHtml() {
    if (this._combined()) return `<div class="combo">${this._config.persons.map((p) => this._personMini(p)).join("")}</div>${this._personLine()}`;
    const v2 = this._v2(); return this._config.persons.map((p) => (v2 ? this._personV2(p) : this._person(p))).join("");
  }
  _render() {
    if (!this.shadowRoot || !this._config) return;
    // The shell (styles and ha-card) is built once per config. A state update only refreshes the person
    // buttons: rebuilding ha-card every time made card-mod attach to a new one each minute and keep the old
    // ones (and their document listeners) alive, so a dashboard tab grew until it froze (Claude AI).
    const grid = this._built ? this.shadowRoot.querySelector(".grid") : null;
    if (grid) {
      const v2 = this._v2(); grid.classList.toggle("v2", v2); grid.classList.toggle("combined", this._combined());
      grid.innerHTML = this._gridHtml();
      this._wire();
      return;
    }
    this._built = true;
    this.shadowRoot.innerHTML = `<style>:host{display:block}*{box-sizing:border-box}ha-card{overflow:visible;border:0;border-radius:0;background:none;box-shadow:none}.grid{display:grid;grid-template-columns:repeat(${this._config.columns || 2},minmax(0,1fr));gap:10px}.person{position:relative;isolation:isolate;display:grid;grid-template-columns:minmax(0,1fr) 104px;grid-template-rows:1fr 1fr;grid-template-areas:'main battery' 'main trip';height:92px;overflow:hidden;padding:10px 14px;border:0;border-left:calc(var(--dashboard-left-accent-width, 1) * 4px) solid var(--person-color);border-radius:18px;background:var(--surface,var(--ha-card-background,var(--card-background-color,#142332)));box-shadow:var(--state-card-shadow,var(--dashboard-shadow-strong, var(--ha-card-box-shadow, 0 8px 22px rgba(0,0,0,.18))));color:var(--primary-text-color);text-align:left;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease}.person:hover{transform:translateY(calc(var(--dashboard-card-highlight, 1) * -2px));box-shadow:var(--dashboard-shadow-strong,var(--ha-card-box-shadow,none)),0 calc(var(--dashboard-card-highlight, 1) * 12px) calc(var(--dashboard-card-highlight, 1) * 26px) rgba(0,0,0,calc(var(--dashboard-card-highlight, 1) * .26))}.person:active{transform:translateY(0)}@media(prefers-reduced-motion:reduce){.person{transition:none}.person:hover{transform:none}}.portrait{position:absolute;z-index:-1;right:66px;top:50%;width:122px;height:122px;transform:translateY(-50%);border-radius:50%;background-position:center;background-size:cover;opacity:.28;filter:saturate(1.04) contrast(1.03)}.main{grid-area:main;display:flex;min-width:0;flex-direction:column;justify-content:center;gap:5px}.main b{overflow:hidden;font-size:16px;text-overflow:ellipsis;white-space:nowrap;color:var(--gray800,var(--primary-text-color))}.main strong{font-size:11px}.main small,.mini small{overflow:hidden;color:var(--gray600,var(--secondary-text-color));text-overflow:ellipsis;white-space:nowrap}.main small{font-size:11px}.mini{display:flex;min-width:0;flex-direction:column;align-items:flex-end;justify-content:center}.battery{grid-area:battery}.trip{grid-area:trip}.mini b{font-size:12px}.mini small{font-size:8px}.segments{display:flex;gap:2px;margin:3px 0}.segments i{width:9px;height:5px;border-radius:999px}@media(max-width:600px){.grid{gap:8px}.person{grid-template-columns:minmax(0,1fr) 88px;height:92px;padding:9px 11px}.portrait{right:49px}.main b{font-size:15px}.segments i{width:8px}}@media(max-width:430px){.grid{grid-template-columns:1fr}}</style><ha-card><div class="grid">${this._config.persons.map((p) => this._person(p)).join("")}</div></ha-card>`;
    const viewportStyle=document.createElement("style");
    viewportStyle.textContent="@media(min-width:1101px) and (max-height:950px){.grid{gap:6px}.person{height:70px;padding:5px 12px}.portrait{width:98px;height:98px}.main{gap:2px}}"
      + ".pv2{position:relative;isolation:isolate;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;width:100%;height:92px;padding:10px 14px 10px 12px;border:0;border-radius:18px;overflow:hidden;cursor:pointer;text-align:left;font:inherit;color:var(--primary-text-color,#fff);"
      + "background:radial-gradient(90% 140% at 0% 50%,color-mix(in srgb,var(--pc) 14%,transparent),transparent 62%),var(--surface,var(--ha-card-background,var(--card-background-color,#172536)));box-shadow:var(--dashboard-shadow-strong,var(--ha-card-box-shadow,0 8px 22px rgba(0,0,0,.18))),inset 0 0 0 1px color-mix(in srgb,var(--pc) 16%,transparent);transition:transform .25s cubic-bezier(.2,1.4,.4,1),box-shadow .25s}"
      + ".pv2:hover{box-shadow:var(--dashboard-shadow-strong,none),inset 0 0 0 1px color-mix(in srgb,var(--pc) 40%,transparent),0 0 26px -10px var(--pc)}.pv2:active{transform:scale(.97)}"
      + ".pv2 .av{width:64px;height:64px;border-radius:50%;background:center 18%/cover no-repeat color-mix(in srgb,var(--pc) 18%,#111);display:grid;place-items:center;font-size:24px;font-weight:800;color:var(--pc);box-shadow:0 0 0 3px var(--pc),0 0 0 6px color-mix(in srgb,var(--pc) 18%,transparent),0 8px 22px -6px var(--pc)}"
      + ".pv2.away .av{filter:saturate(.75)}"
      + ".pv2 .tx{min-width:0;display:flex;flex-direction:column;gap:3px}.pv2 .tx b{font-size:18px;font-weight:800;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
      + ".pv2 .st{display:inline-flex;align-items:center;gap:6px;width:max-content;padding:2px 9px 2px 7px;border-radius:999px;font-size:11px;font-weight:800;color:var(--pc);background:color-mix(in srgb,var(--pc) 14%,transparent)}.pv2 .st i{width:6px;height:6px;border-radius:50%;background:var(--pc);box-shadow:0 0 8px var(--pc);animation:pvBlink 2.4s ease-in-out infinite}@keyframes pvBlink{50%{opacity:.35}}"
      + ".pv2 small{display:flex;align-items:center;gap:4px;font-size:12px;color:var(--secondary-text-color,#a7b2c2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pv2 small ha-icon{--mdc-icon-size:15px;color:var(--pc);flex:none}"
      + ".pv2 .bat{display:flex;flex-direction:column;align-items:flex-end;gap:4px;font-size:12px}.pv2 .bat b{font-size:13px;font-weight:800}.pv2 .bb{position:relative;width:34px;height:14px;border-radius:4px;box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--primary-text-color,#fff) 35%,transparent);padding:2px}.pv2 .bb::after{content:'';position:absolute;right:-4px;top:4px;width:2.5px;height:6px;border-radius:0 2px 2px 0;background:color-mix(in srgb,var(--primary-text-color,#fff) 35%,transparent)}.pv2 .bb i{display:block;height:100%;border-radius:2px;background:var(--bc);box-shadow:0 0 6px var(--bc)}"
      + ".pv2 .bat.chg .bb i{animation:pvChg 1.6s ease-in-out infinite}@keyframes pvChg{50%{opacity:.5}}.pv2 .bat ha-icon{--mdc-icon-size:14px;color:#ffd166;margin-top:-2px}"
      + ".pv2 .bring{position:relative;display:grid;place-items:center;width:42px;height:42px;flex:none}.pv2 .bring svg{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg);overflow:visible}"
      + ".pv2 .bring circle{fill:none;stroke-width:4;stroke-linecap:round}.pv2 .bring .tr{stroke:color-mix(in srgb,var(--primary-text-color,#fff) 9%,transparent)}"
      + ".pv2 .bring .pr{stroke:var(--bc);filter:drop-shadow(0 0 3px color-mix(in srgb,var(--bc) 70%,transparent));transition:stroke-dasharray .9s cubic-bezier(.16,1,.3,1),stroke .9s ease}"
      + ".pv2 .bring b{position:relative;display:flex;align-items:baseline;font-size:11.5px;font-weight:800;line-height:1;letter-spacing:-.02em;font-variant-numeric:tabular-nums;color:color-mix(in srgb,var(--bc) 30%,var(--primary-text-color,#fff))}.pv2 .bring b small{font-size:.68em;font-weight:700;margin-left:.5px;opacity:.8}"
      + ".pv2 .bring ha-icon{position:absolute;right:-4px;bottom:-3px;--mdc-icon-size:12px;width:15px;height:15px;display:grid;place-items:center;border-radius:50%;color:#ffd166;background:var(--surface,var(--ha-card-background,var(--card-background-color,#172536)))}"
      + ".pv2 .bring.chg .pr{animation:pvChg 1.6s ease-in-out infinite}"
      + ".pv2.mini .bring{position:absolute;top:8px;right:8px;width:36px;height:36px}.pv2.mini .bring b{font-size:10px}.pv2.mini.has-ring .tx b{padding-right:42px}.pv2.mini.has-ring .st{max-width:calc(100% - 42px)}"
      + "@media(min-width:1101px) and (max-height:950px){.pv2{height:72px;padding:6px 12px 6px 10px}.pv2 .av{width:50px;height:50px}.pv2 .tx b{font-size:16px}.pv2 .bring{width:36px;height:36px}.pv2.mini .bring{top:5px;right:6px;width:32px;height:32px}.pv2.mini .bring b{font-size:9.5px}}"
      + ".pv2 .st{max-width:100%;overflow:hidden;white-space:nowrap}.pv2 .tx b,.pv2 small{min-width:0;max-width:100%;text-overflow:clip}.pv2 .tx>*{min-width:0}"
      // A zone name too long for its chip scrolls back and forth (user, 2026-10-13: "så skal det bare være en rulletekst").
      + ".mq{display:block;min-width:0;overflow:hidden}.mq>span{display:inline-block;white-space:nowrap}.mq.run{mask-image:linear-gradient(90deg,#000 85%,transparent);-webkit-mask-image:linear-gradient(90deg,#000 85%,transparent)}.mq.run>span{animation:mqRoll var(--mqd,5s) ease-in-out infinite alternate}"
      + "@keyframes mqRoll{0%,18%{transform:translateX(0)}82%,100%{transform:translateX(calc(-1 * var(--mqx,0px)))}}@media(prefers-reduced-motion:reduce){.mq.run>span{animation:none}}"
      + "@media(max-width:600px){.pv2{grid-template-columns:auto minmax(0,1fr);gap:9px;padding:9px 10px;height:84px}.pv2 .av{width:48px;height:48px}.pv2 .tx b{font-size:15px;padding-right:46px}.pv2 .st{font-size:10px;padding:1px 7px 1px 6px}.pv2 small{font-size:10.5px}"
      + ".pv2 .bat{position:absolute;right:9px;top:9px;flex-direction:row;align-items:center;gap:4px}.pv2 .bb{width:20px;height:10px;padding:1.5px}.pv2 .bb::after{top:3px;height:4px}.pv2 .bat b{font-size:10.5px}.pv2 .bat ha-icon{--mdc-icon-size:12px;margin:0}}"
      + ".grid.combined{display:block}.combo{display:grid;grid-template-columns:repeat(var(--pn,4),minmax(0,1fr));gap:4px;padding:8px;border-radius:20px;background:radial-gradient(120% 160% at 0% 0%,color-mix(in srgb,var(--presence-home,#37e69a) 9%,transparent),transparent 55%),var(--surface,var(--ha-card-background,var(--card-background-color,#172536)));box-shadow:var(--dashboard-shadow-strong,var(--ha-card-box-shadow,0 8px 22px rgba(0,0,0,.18))),inset 0 0 0 1px color-mix(in srgb,var(--primary-text-color,#fff) 7%,transparent)}"
      + ".pv2.mini{grid-template-columns:auto minmax(0,1fr);align-items:center;text-align:left;height:auto;gap:10px;padding:8px 10px;background:none;box-shadow:none;border-radius:16px}"
      + ".pv2.mini:hover{background:color-mix(in srgb,var(--pc) 8%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--pc) 30%,transparent)}"
      + ".pv2.mini .av{width:46px;height:46px;box-shadow:0 0 0 2.5px var(--pc),0 0 0 5px color-mix(in srgb,var(--pc) 16%,transparent),0 6px 16px -6px var(--pc)}.pv2.mini .tx{gap:2px;min-width:0}.pv2.mini .tx b{font-size:14.5px;padding-right:38px}.pv2.mini .st{font-size:10px;padding:1px 7px 1px 6px}.pv2.mini small{font-size:10.5px}"
      + ".pv2.mini .bat{position:absolute;top:8px;right:8px;flex-direction:row;align-items:center;gap:3px}.pv2.mini .bb{width:18px;height:9px;padding:1.5px}.pv2.mini .bb::after{top:2.5px;height:4px}.pv2.mini .bat b{font-size:10px}.pv2.mini .bat ha-icon{--mdc-icon-size:11px;margin:0}"
      + "@media(min-width:1101px) and (max-height:950px){.pv2.mini{padding:5px 8px;gap:8px}.pv2.mini .av{width:40px;height:40px}.pv2.mini .tx b{font-size:13.5px}}"
      // Phones: a strip – portrait (its ring is the status colour), the name, and the battery; the status chip and place go
      // (user, 2026-10-13: "person kort på mobilen … så det hele kan være der").
      // Phones: built like the desktop tile, two per row (user, 2026-10-13: "kan vel godt bygges mere som det på desktop").
      // Phones: all four in one row – portrait, name and status; no battery, a critical one (<20 %) shows as a faint red
      // pulse around the portrait (user, 2026-10-13).
      // … with the name and status to the right of the portrait (user: "Info skal der være plads til højre for billedet").
      + "@media(max-width:600px){.combo{grid-template-columns:repeat(4,minmax(0,1fr));gap:0;padding:7px 3px}.pv2.mini{grid-template-columns:auto minmax(0,1fr);align-items:center;text-align:left;padding:4px 3px;gap:5px;border-radius:12px}.pv2.mini .av{width:32px;height:32px;font-size:13px;box-shadow:0 0 0 2px var(--pc),0 0 0 4px color-mix(in srgb,var(--pc) 16%,transparent)}.pv2.mini .tx{align-items:flex-start;gap:2px}.pv2.mini .tx b{font-size:11.5px;padding-right:0;max-width:100%}.pv2.mini .st{font-size:8.5px;padding:1px 5px 1px 4px;gap:3px;max-width:100%}.pv2.mini .st i{width:5px;height:5px;flex:none}.pv2.mini .bat,.pv2.mini .bring{display:none!important}.pv2.mini.has-ring .tx b{padding-right:0}.pv2.mini.has-ring .st{max-width:100%}.pv2.mini small{display:flex;font-size:9px;gap:2px;max-width:100%}.pv2.mini small ha-icon{--mdc-icon-size:11px}"
      + ".pv2 .av.low{animation:avLow 2.4s ease-in-out infinite}@keyframes avLow{0%,100%{box-shadow:0 0 0 2.5px var(--pc),0 0 0 5px rgba(255,70,101,.25),0 0 10px 2px rgba(255,70,101,.25)}50%{box-shadow:0 0 0 2.5px var(--pc),0 0 0 6px rgba(255,70,101,.55),0 0 16px 5px rgba(255,70,101,.45)}}"
      + "}"
      + ".cline{display:none}"
      + "@media(max-width:0px){.grid.combined .combo{display:none}.cline{display:flex;align-items:center;gap:8px;min-height:58px;padding:7px 9px;border-radius:18px;background:var(--surface,var(--ha-card-background,var(--card-background-color,#172536)));box-shadow:var(--dashboard-shadow-strong,var(--ha-card-box-shadow,0 8px 22px rgba(0,0,0,.18))),inset 0 0 0 1px color-mix(in srgb,var(--primary-text-color,#fff) 7%,transparent)}"
      + ".lg{display:flex;align-items:center;gap:6px;min-width:0}.lg.home{flex:0 0 auto}.lg.out{flex:1;justify-content:flex-end;gap:5px;overflow:hidden}"
      + ".ll{display:flex;flex-direction:column;font-size:9.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--presence-home,#37e69a)}.ll i{display:none}.ll b{font-size:15px;letter-spacing:0;color:var(--primary-text-color,#fff)}"
      + ".lavs{display:flex;padding-left:8px}.lavs .lp{margin-left:-8px}.lp{display:flex;align-items:center;gap:6px;padding:0;border:0;background:none;color:inherit;font:inherit;cursor:pointer;min-width:0}"
      + ".lav{flex:none;display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:center 18%/cover no-repeat color-mix(in srgb,var(--pc) 20%,#111);font-weight:800;font-size:14px;color:var(--pc);box-shadow:0 0 0 2px var(--pc),0 0 0 4px var(--surface-solid,#151a21);position:relative}"
      + ".lav.low::after{content:'';position:absolute;right:-1px;top:-1px;width:9px;height:9px;border-radius:50%;background:#ff4665;box-shadow:0 0 0 2px #151a21}"
      + ".lp.wide{padding:3px 9px 3px 3px;border-radius:999px;background:color-mix(in srgb,var(--pc) 12%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--pc) 35%,transparent)}.lp.wide .lav{width:30px;height:30px;box-shadow:0 0 0 2px var(--pc)}"
      + ".lt{display:flex;flex-direction:column;min-width:0;text-align:left;line-height:1.15}.lt b{font-size:12px;white-space:nowrap}.lt small{font-size:10px;color:var(--pc);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
      + ".all,.none{font-size:11.5px;font-weight:700;color:var(--secondary-text-color,#a7b2c2)}}"
      + "@media(prefers-reduced-motion:reduce){.pv2 .st i,.pv2 .bat.chg .bb i{animation:none}}";
    this.shadowRoot.append(viewportStyle);
    if (this._v2()) { const g = this.shadowRoot.querySelector(".grid"); g.classList.add("v2"); g.classList.toggle("combined", this._combined()); g.innerHTML = this._gridHtml(); }
    this.shadowRoot.querySelector(".grid").style.gridTemplateColumns =
      `repeat(${window.matchMedia("(max-width: 600px)").matches ? this._config.mobile_columns || 2 : this._config.columns || 2},minmax(0,1fr))`;
    this._wire();
  }
  _marquee() {
    requestAnimationFrame(() => this.shadowRoot?.querySelectorAll(".mq").forEach((m) => {
      const over = (m.firstElementChild?.scrollWidth || 0) - m.clientWidth; const run = over > 2;
      m.classList.toggle("run", run); if (run) { m.style.setProperty("--mqx", `${over + 6}px`); m.style.setProperty("--mqd", `${Math.max(3.5, over / 10).toFixed(1)}s`); }
    }));
  }
  _wire() {
    this._marquee();
    this.shadowRoot.querySelectorAll(".portrait").forEach((portrait) => {
      portrait.style.left = "50%";
      portrait.style.right = "auto";
      portrait.style.transform = "translate(-50%, -50%)";
    });
    this.shadowRoot.querySelectorAll("[data-path]").forEach(
      (b) =>
        (b.onclick = () => {
          if (!b.dataset.path) return;
          history.pushState(null, "", b.dataset.path);
          window.dispatchEvent(new Event("location-changed"));
        }),
    );
  }
}
class HAPersonOverviewCardEditor extends HTMLElement {
  setConfig(c) {
    this._config = c;
    this._render();
  }
  set hass(h) {
    this._hass = h;
  }
  _render() {
    if (!this._config) return;
    this.innerHTML = `<p>Redigér personer som JSON. Hver person kan bruge name, entity, tracker, city, battery, charging, distance, travel_time, image og navigation_path.</p><textarea style="width:100%;min-height:260px">${JSON.stringify(this._config.persons || [], null, 2)}</textarea>`;
    this.insertAdjacentHTML("beforeend", lookEditorHtml(this._config));
    wireLookEditor(this, this, () => this._config);
    this.querySelector("textarea").onchange = (e) => {
      try {
        this.dispatchEvent(
          new CustomEvent("config-changed", {
            detail: {
              config: { ...this._config, persons: JSON.parse(e.target.value) },
            },
            bubbles: true,
            composed: true,
          }),
        );
      } catch {
        e.target.setCustomValidity("Ugyldig JSON");
      }
    };
  }
}
customElements.define("ha-person-overview-card", HAPersonOverviewCard);
customElements.define(
  "ha-person-overview-card-editor",
  HAPersonOverviewCardEditor,
);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha-person-overview-card",
  name: "HA Person Overview Card",
  description: "Samlet personoversigt med lokation, batteri og hjemtur",
  preview: true,
});
console.info(
  `%c HA PERSON OVERVIEW CARD %c v${VERSION} `,
  "color:white;background:#2687b8;font-weight:700",
  "color:#69c4ff;background:#161b22",
);
