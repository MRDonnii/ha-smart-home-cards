const VERSION = "0.2.0";
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
  _render() {
    if (!this.shadowRoot || !this._config) return;
    this.shadowRoot.innerHTML = `<style>:host{display:block}*{box-sizing:border-box}.grid{display:grid;grid-template-columns:repeat(${this._config.columns || 2},minmax(0,1fr));gap:10px}.person{position:relative;isolation:isolate;display:grid;grid-template-columns:minmax(0,1fr) 104px;grid-template-rows:1fr 1fr;grid-template-areas:'main battery' 'main trip';height:92px;overflow:hidden;padding:10px 14px;border:0;border-left:4px solid var(--person-color);border-radius:18px;background:var(--surface,var(--ha-card-background,var(--card-background-color,#142332)));box-shadow:var(--state-card-shadow,var(--dashboard-shadow-strong, var(--ha-card-box-shadow, 0 8px 22px rgba(0,0,0,.18))));color:var(--primary-text-color);text-align:left;cursor:pointer}.portrait{position:absolute;z-index:-1;right:66px;top:50%;width:122px;height:122px;transform:translateY(-50%);border-radius:50%;background-position:center;background-size:cover;opacity:.28;filter:saturate(1.04) contrast(1.03)}.main{grid-area:main;display:flex;min-width:0;flex-direction:column;justify-content:center;gap:5px}.main b{overflow:hidden;font-size:16px;text-overflow:ellipsis;white-space:nowrap;color:var(--gray800,var(--primary-text-color))}.main strong{font-size:11px}.main small,.mini small{overflow:hidden;color:var(--gray600,var(--secondary-text-color));text-overflow:ellipsis;white-space:nowrap}.main small{font-size:11px}.mini{display:flex;min-width:0;flex-direction:column;align-items:flex-end;justify-content:center}.battery{grid-area:battery}.trip{grid-area:trip}.mini b{font-size:12px}.mini small{font-size:8px}.segments{display:flex;gap:2px;margin:3px 0}.segments i{width:9px;height:5px;border-radius:999px}@media(max-width:600px){.grid{gap:8px}.person{grid-template-columns:minmax(0,1fr) 88px;height:92px;padding:9px 11px}.portrait{right:49px}.main b{font-size:15px}.segments i{width:8px}}@media(max-width:430px){.grid{grid-template-columns:1fr}}</style><ha-card><div class="grid">${this._config.persons.map((p) => this._person(p)).join("")}</div></ha-card>`;
    const viewportStyle=document.createElement("style");
    viewportStyle.textContent="@media(min-width:1101px) and (max-height:950px){.grid{gap:6px}.person{height:70px;padding:5px 12px}.portrait{width:98px;height:98px}.main{gap:2px}}";
    this.shadowRoot.append(viewportStyle);
    this.shadowRoot.querySelector(".grid").style.gridTemplateColumns =
      `repeat(${window.matchMedia("(max-width: 600px)").matches ? this._config.mobile_columns || 2 : this._config.columns || 2},minmax(0,1fr))`;
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
