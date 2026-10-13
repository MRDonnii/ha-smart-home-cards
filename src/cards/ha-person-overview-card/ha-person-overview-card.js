const VERSION = "0.3.1";
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
        ])
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
  _valid(v) {
    return (
      v && !["unknown", "unavailable", "none"].includes(String(v).toLowerCase())
    );
  }
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
        ? "Ude"
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
      charging = /charg|lader/i.test(this._s(p.charging)?.state || "");
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
    const dist = Number(this._s(p.distance)?.state),
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
    return `<button class="person" data-path="${p.navigation_path || ""}" style="--person-color:${color}"><span class="portrait" style="${pic ? `background-image:url('${pic.replaceAll("'", "%27")}')` : ""}"></span><span class="main"><b>${p.name || person?.attributes?.friendly_name || "Person"}</b><strong style="color:${color}">${status}</strong><small>${place}</small></span><span class="mini battery"><b>${battery === null ? "--" : Math.round(battery) + "%"}</b>${this._segments(bActive, bColor, `color-mix(in srgb,${bColor} 45%,transparent)`)}<small>${charging ? "Lader" : "Batteri"}</small></span><span class="mini trip"><b>${tripMain}</b>${this._segments(home ? 5 : Number.isFinite(dist) ? Math.max(1, 5 - Math.floor(dist / 5)) : 0, color, glow)}<small>${tripLabel}</small></span></button>`;
  }
  // v2 (Claude AI, 2026-10-13; user: "byg noget helt nyt … med samme mulighed for at skifte tilbage"): a round portrait
  // in a presence-coloured ring, the name with a status chip, the place or the trip home, and a battery pill.
  _v2() { const id = this._config?.style_entity; return id ? this._hass?.states?.[id]?.state === "on" : this._config?.style === "v2"; }
  _personV2(p) {
    const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const person = this._s(p.entity); const tracker = this._s(p.tracker) || person; const state = tracker?.state || person?.state || "unknown";
    const home = state === "home"; const away = state === "not_home";
    const color = home ? "var(--presence-home,#37e69a)" : away ? "var(--presence-away,#ffb347)" : this._valid(state) ? "var(--presence-zone,#58b9ff)" : "var(--presence-unknown,#8795a5)";
    const status = home ? "Hjemme" : away ? "Ude" : this._valid(state) ? state : "Ukendt";
    const city = this._s(p.city)?.state; const place = this._valid(city) ? city : home ? p.home_label || "Hjemme" : "";
    const level = Number(this._s(p.battery)?.state); const battery = Number.isFinite(level) ? Math.max(0, Math.min(100, level)) : null;
    const charging = /charg|lader/i.test(this._s(p.charging)?.state || "");
    const bColor = battery === null ? "var(--presence-unknown,#8795a5)" : battery < 20 ? "var(--battery-critical,#ff4665)" : battery < 40 ? "var(--battery-low,#ffb347)" : "var(--battery-good,#41d98d)";
    const dist = Number(this._s(p.distance)?.state); const travel = Number(this._s(p.travel_time)?.state);
    const trip = home ? "" : [Number.isFinite(travel) ? `${Math.round(travel)} min hjem` : "", Number.isFinite(dist) ? (dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1).replace(".", ",")} km`) : ""].filter(Boolean).join(" · ");
    const pic = p.image || person?.attributes?.entity_picture || "";
    const initial = esc((p.name || "?").trim()[0] || "?");
    return `<button class="pv2 ${home ? "home" : away ? "away" : "zone"}" data-path="${esc(p.navigation_path || "")}" style="--pc:${color};--bc:${bColor}">
      <span class="av"${pic ? ` style="background-image:url('${pic.replaceAll("'", "%27")}')"` : ""}>${pic ? "" : initial}</span>
      <span class="tx"><b>${esc(p.name || person?.attributes?.friendly_name || "Person")}</b>
        <span class="st"><i></i>${esc(status)}</span>
        <small>${trip ? `<ha-icon icon="mdi:car-arrow-left"></ha-icon>${esc(trip)}` : esc(place)}</small></span>
      ${battery === null ? "" : `<span class="bat${charging ? " chg" : ""}"><span class="bb"><i style="width:${battery}%"></i></span><b>${Math.round(battery)}%</b>${charging ? '<ha-icon icon="mdi:lightning-bolt"></ha-icon>' : ""}</span>`}
    </button>`;
  }
  _render() {
    if (!this.shadowRoot || !this._config) return;
    // The shell (styles and ha-card) is built once per config. A state update only refreshes the person
    // buttons: rebuilding ha-card every time made card-mod attach to a new one each minute and keep the old
    // ones (and their document listeners) alive, so a dashboard tab grew until it froze (Claude AI).
    const grid = this._built ? this.shadowRoot.querySelector(".grid") : null;
    if (grid) {
      const v2 = this._v2(); grid.classList.toggle("v2", v2);
      grid.innerHTML = this._config.persons.map((p) => (v2 ? this._personV2(p) : this._person(p))).join("");
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
      + "@media(min-width:1101px) and (max-height:950px){.pv2{height:72px;padding:6px 12px 6px 10px}.pv2 .av{width:50px;height:50px}.pv2 .tx b{font-size:16px}}"
      + ".pv2 .st{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"
      + "@media(max-width:600px){.pv2{grid-template-columns:auto minmax(0,1fr);gap:9px;padding:9px 10px;height:84px}.pv2 .av{width:48px;height:48px}.pv2 .tx b{font-size:15px;padding-right:46px}.pv2 .st{font-size:10px;padding:1px 7px 1px 6px}.pv2 small{font-size:10.5px}"
      + ".pv2 .bat{position:absolute;right:9px;top:9px;flex-direction:row;align-items:center;gap:4px}.pv2 .bb{width:20px;height:10px;padding:1.5px}.pv2 .bb::after{top:3px;height:4px}.pv2 .bat b{font-size:10.5px}.pv2 .bat ha-icon{--mdc-icon-size:12px;margin:0}}"
      + "@media(prefers-reduced-motion:reduce){.pv2 .st i,.pv2 .bat.chg .bb i{animation:none}}";
    this.shadowRoot.append(viewportStyle);
    if (this._v2()) { const g = this.shadowRoot.querySelector(".grid"); g.classList.add("v2"); g.innerHTML = this._config.persons.map((p) => this._personV2(p)).join(""); }
    this.shadowRoot.querySelector(".grid").style.gridTemplateColumns =
      `repeat(${window.matchMedia("(max-width: 600px)").matches ? this._config.mobile_columns || 2 : this._config.columns || 2},minmax(0,1fr))`;
    this._wire();
  }
  _wire() {
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
