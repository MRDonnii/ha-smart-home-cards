const VERSION = "0.1.61";

const FIELDS = [
  ["primary_supply", "Fjernvarme fremløb"], ["primary_return", "Fjernvarme retur"], ["primary_valve", "Fjernvarme hovedventil"], ["summer_cutoff", "Sommerudkobling"],
  ["primary_cooling", "Fjernvarme afkøling"], ["pressure", "Anlægstryk"],
  ["meter_power", "Aktuel effekt"], ["meter_flow", "Aktuelt flow"],
  ["meter_energy_total", "Energi total"], ["meter_volume_total", "Volumen total"],
  ["ch_supply", "Radiator fremløb"], ["ch_return", "Radiator retur"],
  ["ch_valve", "Radiatorventil"], ["ch_flow", "Radiatorflow"],
  ["ch_power", "Radiatoreffekt"], ["ch_outdoor", "Udetemperatur"],
  ["ch_pump", "Radiatorpumpe"], ["dhw_cold_in", "Koldtvand ind"],
  ["dhw_hot_out", "Varmt brugsvand"], ["dhw_flow", "Brugsvandsflow"],
  ["dhw_power", "Brugsvandseffekt"], ["dhw_valve", "Brugsvandsventil"],
  ["dhw_setpoint", "Brugsvand setpunkt"], ["dhw_status", "Brugsvand status"],
  ["circulation_temp", "Cirkulationstemperatur"], ["circulation_status", "Cirkulationsstatus"],
  ["circulation_bypass_temp", "Bypass temperatur"], ["bvv_bypass_status", "Bypass status"],
  ["standby", "Standby"], ["vacation", "Ferie"], ["sentio_active", "Varmekald aktiv"],
  ["sentio_status", "Varmekald status"], ["sentio_call_active", "Varmekald i gang"],
  ["sentio_fejl", "Varmekald fejl"], ["auto_standby_active", "Auto standby"],
  ["auto_standby_status", "Auto standby status"], ["auto_standby_engaged", "Standby aktiveret"],
  ["auto_standby_fejl", "Auto standby fejl"], ["auto_standby_data_valid", "Standby data gyldig"],
  ["auto_standby_all_warm", "Alle rum varme nok"]
];

class HAFjernvarmeHouseCard extends HTMLElement {
  static getStubConfig() {
    return { title: "Fjernvarme", animation: true, entities: Object.fromEntries(FIELDS.map(([k]) => [k, ""])) };
  }
  static async getConfigElement() { return document.createElement("ha-fjernvarme-house-card-editor"); }
  constructor() {
    super(); this.attachShadow({ mode: "open" }); this._config = {}; this._hass = null; this._signature = "";
    this._id = `fvh-${Math.random().toString(36).slice(2, 9)}`;
    this.shadowRoot.addEventListener("click", event => this._handleMoreInfo(event));
    this.shadowRoot.addEventListener("keydown", event => this._handleMoreInfo(event));
  }
  setConfig(config) {
    if (!config) throw new Error("Ugyldig konfiguration");
    const nextConfig = { title: "Fjernvarme", animation: true, show_details: true, ...config, entities: { ...(config.entities || {}) } };
    const signature = JSON.stringify(nextConfig);
    this._config = nextConfig;
    if (signature === this._configSignature) return;
    this._configSignature = signature;
    this._signature = ""; this._render(true);
  }
  set hass(hass) {
    this._hass = hass;
    const ids = [...Object.values(this._config.entities || {}).flat()].filter(v => typeof v === "string");
    const sig = JSON.stringify(ids.map(id => [id, hass?.states?.[id]?.state, hass?.states?.[id]?.attributes?.unit_of_measurement]));
    if (sig !== this._signature) { this._signature = sig; this._render(); }
  }
  getCardSize() { return this._config.show_details === false ? 10 : 14; }
  getGridOptions() { return { rows: "auto", columns: 12, min_columns: 6 }; }
  _entityId(key) {
    const configured = this._config.entities?.[key];
    if (configured) return configured;
    if (key === "summer_cutoff") return Object.keys(this._hass?.states || {}).find(id => /wavin_calefa.*itc_max_outdoor_temp$/.test(id));
    return undefined;
  }
  _entity(key) { const id = this._entityId(key); return id ? this._hass?.states?.[id] : undefined; }
  _num(key) { const n = Number.parseFloat(String(this._entity(key)?.state ?? "").replace(",", ".")); return Number.isFinite(n) ? n : undefined; }
  _on(key) { return ["on","true","active","open","opening","running","heat","heating","ja","til","aktiv","kører"].includes(String(this._entity(key)?.state || "").toLowerCase()); }
  _flowing(key) { const n=this._num(key); return Number.isFinite(n) ? n > 0.01 : this._on(key); }
  _fmt(key, digits = 1, fallbackUnit = "") {
    const e = this._entity(key); if (!e || ["unknown","unavailable",""].includes(e.state)) return "—";
    const n = this._num(key); if (!Number.isFinite(n)) return this._esc(e.state);
    const lang = this._hass?.locale?.language || this._hass?.language || "da";
    const unit = e.attributes?.unit_of_measurement || fallbackUnit;
    return `${n.toLocaleString(lang,{maximumFractionDigits:digits})}${unit ? ` ${unit}` : ""}`;
  }
  _esc(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]); }
  _temp(key) { const n=this._num(key); return Number.isFinite(n) ? `${this._fmt(key,1,"°C")}` : "—"; }
  _tempColor(value) {
    if (!Number.isFinite(value)) return "#8295a5";
    const stops=[[5,[79,145,220]],[15,[92,190,215]],[25,[119,205,190]],[35,[225,188,111]],[50,[238,124,79]],[70,[235,78,70]]];
    if(value<=stops[0][0]) return `rgb(${stops[0][1]})`;
    for(let i=1;i<stops.length;i++){ if(value<=stops[i][0]){const [a,ca]=stops[i-1],[b,cb]=stops[i],t=(value-a)/(b-a);return `rgb(${ca.map((x,j)=>Math.round(x+(cb[j]-x)*t)).join(",")})`;}}
    return `rgb(${stops.at(-1)[1]})`;
  }
  _returnColor(supply, ret) {
    const cooling = Number.isFinite(supply) && Number.isFinite(ret) ? Math.max(0,supply-ret) : this._num("primary_cooling");
    const t = Math.sqrt(Math.max(0,Math.min(1,(cooling || 0)/24)));
    return `hsl(${Math.round(12+198*t)} ${Math.round(82-18*t)}% ${Math.round(59+3*t)}%)`;
  }
  _coolingStatusColor(value) {
    if (!Number.isFinite(value)) return "var(--secondary-text-color)";
    return value >= 20 ? "var(--success-color, #62cf8e)" : "var(--error-color, #ef6666)";
  }
  _pipe(cls, path, active=true, count=8) {
    const duration = 6.1 + count * .08;
    return `<g class="pipe ${cls} ${active ? "active" : ""}"><path class="pipe-rim" d="${path}"/><path class="pipe-core" d="${path}"/><path class="pipe-heat" d="${path}"/><path class="water-sheen" d="${path}"/>${Array.from({length:count},(_,i)=>`<g class="water-pulse"><ellipse cx="0" cy="0" rx="4.5" ry="1.8"/><circle cx="-8" cy="0" r=".8"/><animateMotion dur="${duration}s" begin="-${(i*duration/count).toFixed(2)}s" repeatCount="indefinite" rotate="auto" path="${path}"/></g>`).join("")}</g>`;
  }
  _metric(label,key,digits=1,cls="") { return `<div class="metric entity-hit ${cls}" data-key="${key}" tabindex="0"><small>${label}</small><strong>${this._fmt(key,digits)}</strong></div>`; }
  _status(label,key) { const e=this._entity(key), bad=/fejl|alarm|kritisk/i.test(key)&&this._on(key); return `<div class="metric entity-hit ${bad?"bad":""}" data-key="${key}" tabindex="0"><small>${label}</small><strong>${e?this._esc(e.state):"—"}</strong></div>`; }
  _standbyStatus() { const e=this._entity("auto_standby_status"), countdown=e?.attributes?.countdown; const value=e?`${this._esc(e.state)}${countdown?` · ${this._esc(countdown)}`:""}`:"—"; return `<div class="metric entity-hit" data-key="auto_standby_status" tabindex="0"><small>Auto standby</small><strong>${value}</strong></div>`; }
  _binaryStatus(label,key,onText,offText) { const e=this._entity(key); return `<div class="metric entity-hit" data-key="${key}" tabindex="0"><small>${label}</small><strong>${e?(this._on(key)?onText:offText):"—"}</strong></div>`; }
  _alarmStatus(alarms) { return `<div class="metric ${alarms?"bad":""}"><small>Alarmer</small><strong>${alarms?`${alarms} aktiv${alarms>1?"e":""}`:"Ingen"}</strong></div>`; }
  _handleMoreInfo(event) {
    if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
    const element = event.target?.closest?.("[data-key]");
    if (!element) return;
    if (event.type === "keydown") event.preventDefault();
    event.stopPropagation();
    const entityId = this._entityId(element.dataset.key);
    if (!entityId || Array.isArray(entityId)) return;
    this.dispatchEvent(new CustomEvent("hass-more-info",{detail:{entityId},bubbles:true,composed:true}));
  }
  _render(forceStructure = false) {
    if (!this.shadowRoot) return;
    const ps=this._num("primary_supply"), pr=this._num("primary_return"), cs=this._num("ch_supply"), cr=this._num("ch_return"), hot=this._num("dhw_hot_out"), cold=this._num("dhw_cold_in");
    const primaryReturn=this._returnColor(ps,pr), radiatorReturn=this._returnColor(cs,cr);
    const primaryActive=this._flowing("meter_flow");
    const chActive=this._flowing("ch_flow");
    const dhwActive=this._flowing("dhw_flow");
    const bypass=this._on("bvv_bypass_status") || /aktiv|open|on/i.test(String(this._entity("bvv_bypass_status")?.state||""));
    const alarmIds=Array.isArray(this._config.entities?.alarms)?this._config.entities.alarms:[];
    const alarms=alarmIds.filter(id=>["on","true","active","problem"].includes(String(this._hass?.states?.[id]?.state||"").toLowerCase())).length;
    const operating = this._on("standby") ? "Standby" : this._on("vacation") ? "Ferie" : chActive && dhwActive ? "Radiator + varmt vand" : dhwActive ? "Varmt vand" : chActive ? "Radiatorvarme" : "Klar";
    const details = this._config.show_details === false ? "" : `<div class="details">
      <section><h3>Nøgletal</h3><div class="metric-grid">${this._metric("Aktuel effekt","meter_power",1)}${this._metric("Anlægstryk","pressure",1)}${this._metric("Energi total","meter_energy_total",1)}${this._metric("Volumen total","meter_volume_total",1)}</div></section>
      <section><h3>Drift</h3><div class="metric-grid">${this._binaryStatus("Radiatorpumpe","ch_pump","Til","Fra")}${this._standbyStatus()}${this._binaryStatus("Calefa standby","standby","Til","Fra")}${this._binaryStatus("Standbyfejl","auto_standby_fejl","Fejl","Ingen")}</div></section>
      <section><h3>Varmt vand</h3><div class="metric-grid">${this._metric("Måltemperatur","dhw_setpoint",1)}${this._status("Status","dhw_status")}${this._metric("Cirkulation","circulation_temp",1)}${this._status("Bypass","bvv_bypass_status")}</div></section>
      <section><h3>Sikkerhed</h3><div class="metric-grid">${this._binaryStatus("Rumdata","auto_standby_data_valid","Gyldige","Fejlsikring")}${this._binaryStatus("Alle rum varme","auto_standby_all_warm","Ja","Nej")}${this._binaryStatus("Ferie","vacation","Til","Fra")}${this._alarmStatus(alarms)}</div></section>
    </div>`;
    const markup=`<style>${this._styles(ps,primaryReturn,cs,radiatorReturn,hot,cold)}</style><style>${this._responsiveStyles()}</style><ha-card class="${alarms?"alarm":""}">
      <header><div><small>VARMECENTRAL</small><h2>${this._esc(this._config.title)}</h2></div><div class="chips"><span class="alarm-chip">${alarms?`${alarms} alarm${alarms>1?"er":""}`:"Ingen alarmer"}</span><span>${operating}</span></div></header>
      <div class="hero"><div class="diagram"><svg viewBox="0 0 760 520" role="img" aria-label="Fjernvarmeunit med radiator, varmt vand og bypass">
        <defs>
          <linearGradient id="${this._id}-primary" x1="0" x2="1"><stop stop-color="#ef534f"/><stop offset=".55" stop-color="${this._tempColor(ps)}"/><stop offset="1" stop-color="${primaryReturn}"/></linearGradient>
          <linearGradient id="${this._id}-ch" x1="0" x2="1"><stop stop-color="${this._tempColor(cs)}"/><stop offset="1" stop-color="${radiatorReturn}"/></linearGradient>
          <linearGradient id="${this._id}-dhw" x1="0" x2="1"><stop stop-color="${this._tempColor(hot)}"/><stop offset="1" stop-color="#f2a063"/></linearGradient><linearGradient id="${this._id}-radiator-cooling" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ef514d"/><stop offset=".30" stop-color="#eb965f"/><stop offset=".68" stop-color="#55bebd"/><stop offset="1" stop-color="#4f94dc"/></linearGradient>
        </defs>
        <path class="house" d="M150 68 L430 8 750 68 V506 H150 Z"/><text class="zone" x="75" y="48" text-anchor="middle">FJERNVARMENET</text><text class="zone" x="430" y="34" text-anchor="middle">INDE I HUSET</text>
        ${this._pipe("primary-supply","M24 132 H200",primaryActive,7)}${this._pipe("primary-return","M200 360 H24",primaryActive,7)}
        ${this._pipe("dhw-hot","M380 350 H620 Q640 350 640 330",dhwActive,7)}${this._pipe("dhw-cold","M500 495 V430 H380",dhwActive,7)}
        <g class="unit"><rect x="200" y="80" width="180" height="400" rx="20"/><text class="unit-title" x="290" y="102" text-anchor="middle">WAVIN CALEFA</text>
          <g class="exchanger"><rect x="216" y="110" width="148" height="150" rx="12"/><text class="ex-title" x="290" y="130" text-anchor="middle">RADIATOR</text><g class="exchanger-metrics" text-anchor="middle"><text class="k" x="290" y="151">VENTIL</text><text class="v entity-hit" data-key="ch_valve" tabindex="0" x="290" y="167">${this._fmt("ch_valve",0)}</text><text class="k" x="290" y="188">FLOW</text><text class="v entity-hit" data-key="ch_flow" tabindex="0" x="290" y="204">${this._fmt("ch_flow",1)}</text><text class="k" x="290" y="225">EFFEKT</text><text class="v entity-hit" data-key="ch_power" tabindex="0" x="290" y="241">${this._fmt("ch_power",1)}</text></g></g>
          <g class="exchanger dhw-exchanger"><rect x="216" y="272" width="148" height="197" rx="12"/><text class="ex-title" x="290" y="292" text-anchor="middle">VARMT VAND</text><g class="exchanger-metrics" text-anchor="middle"><text class="k" x="290" y="313">VENTIL</text><text class="v entity-hit" data-key="dhw_valve" tabindex="0" x="290" y="329">${this._fmt("dhw_valve",0)}</text><text class="k" x="290" y="350">FLOW</text><text class="v entity-hit" data-key="dhw_flow" tabindex="0" x="290" y="366">${this._fmt("dhw_flow",1)}</text><text class="k" x="290" y="387">EFFEKT</text><text class="v entity-hit" data-key="dhw_power" tabindex="0" x="290" y="403">${this._fmt("dhw_power",1)}</text></g></g>
          <g class="dhw-bypass ${bypass ? "active" : ""} entity-hit" data-key="bvv_bypass_status" tabindex="0"><rect class="bypass-hit" x="223" y="421" width="134" height="44" rx="8"/><text class="bypass-status" x="290" y="430" text-anchor="middle">BYPASS ${bypass ? "AKTIV" : "LUKKET"}</text><g class="bypass-values" text-anchor="middle"><text class="k" x="258" y="440">FLOW</text><text class="v entity-hit" data-key="dhw_flow" tabindex="0" x="258" y="450">${this._fmt("dhw_flow",1)}</text><text class="k" x="322" y="440">TEMP</text><text class="v entity-hit" data-key="circulation_bypass_temp" tabindex="0" x="322" y="450">${this._temp("circulation_bypass_temp")}</text></g><path class="bypass-track" d="M230 459 H350"/><path class="bypass-flow" pathLength="100" d="M230 459 H350"/></g>
          <circle cx="200" cy="132" r="5"/><circle cx="200" cy="360" r="5"/><circle cx="380" cy="119" r="5"/><circle cx="380" cy="220" r="5"/><circle cx="380" cy="350" r="5"/><circle cx="380" cy="430" r="5"/>
        </g>
        <g class="radiator" transform="translate(587 102)"><rect width="146" height="135" rx="12"/></g>${this._pipe("ch-circuit","M380 119 H612 V205 H628 V119 H644 V205 H660 V119 H676 V205 H692 V119 H708 V220 H380",chActive,8)}
        <g class="label inside-temp entity-hit" data-key="ch_supply" tabindex="0" transform="translate(500 68)" text-anchor="middle"><text>Radiator fremløb</text><text class="label-value" style="font-size:29.25px" y="29">${this._temp("ch_supply")}</text></g><g class="label inside-temp entity-hit" data-key="ch_return" tabindex="0" transform="translate(500 169)" text-anchor="middle"><text>Radiator retur</text><text class="label-value" style="font-size:29.25px" y="29">${this._temp("ch_return")}</text></g><g class="label inside-temp entity-hit" data-key="dhw_hot_out" tabindex="0" transform="translate(500 299)" text-anchor="middle"><text>Varmt brugsvand</text><text class="label-value" style="font-size:29.25px" y="29">${this._temp("dhw_hot_out")}</text></g><g class="label inside-temp entity-hit" data-key="dhw_cold_in" tabindex="0" transform="translate(520 447)" text-anchor="start"><text>Koldtvand ind</text><text class="label-value" style="font-size:29.25px" y="29">${this._temp("dhw_cold_in")}</text></g><g class="tap ${dhwActive ? "active" : ""}" transform="translate(610 270)"><path class="tap-body" d="M30 60 V31 Q30 16 45 16 H78 Q90 16 90 28 V35"/><path class="tap-handle" d="M20 31 H40 M30 21 V41"/><path class="tap-outlet" d="M90 35 V47"/><path class="basin" d="M7 68 H108 L98 88 Q58 99 17 88 Z"/><path class="drop" d="M90 54 C81 66 85 75 90 75 C96 75 100 66 90 54Z"/><text x="58" y="111" text-anchor="middle">VARMT VAND</text></g>
        <g class="label primary in entity-hit" data-key="primary_supply" tabindex="0" transform="translate(75 68)" text-anchor="middle"><text>Fjernvarme fremløb</text><text class="label-value" style="font-size:31.5px" y="30">${this._temp("primary_supply")}</text></g><g class="delta entity-hit" data-key="primary_cooling" tabindex="0" transform="translate(75 205)"><text text-anchor="middle">AFKØLING</text><text class="label-value" style="font-size:20px" text-anchor="middle" y="26">${this._fmt("primary_cooling",1)}</text></g><g class="flow-metric entity-hit" data-key="meter_flow" tabindex="0" transform="translate(75 270)"><text text-anchor="middle">FLOW</text><text class="label-value" style="font-size:20px" text-anchor="middle" y="26">${this._fmt("meter_flow",1)}</text></g><g class="label primary out entity-hit" data-key="primary_return" tabindex="0" transform="translate(75 400)" text-anchor="middle"><text>Retur</text><text class="label-value" style="font-size:31.5px" y="31">${this._temp("primary_return")}</text></g><g class="outdoor-value entity-hit" data-key="ch_outdoor" tabindex="0" transform="translate(430 -42)" text-anchor="middle"><text>UDETEMPERATUR</text><text class="value" style="font-size:22.5px" y="24">${this._temp("ch_outdoor")}</text></g>
        
        

      </svg></div></div>${details}
    </ha-card>`;
    const currentCard = this.shadowRoot.querySelector("ha-card");
    if (forceStructure || !currentCard) {
      this.shadowRoot.innerHTML = markup;
      return;
    }
    const template = document.createElement("template");
    template.innerHTML = markup;
    const currentStyles = this.shadowRoot.querySelectorAll("style");
    const nextStyles = template.content.querySelectorAll("style");
    currentStyles.forEach((style, index) => {
      if (nextStyles[index] && style.textContent !== nextStyles[index].textContent) style.textContent = nextStyles[index].textContent;
    });
    this._morphNode(currentCard, template.content.querySelector("ha-card"));
  }
  _morphNode(current, next) {
    if (!current || !next) return;
    if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName) {
      current.replaceWith(next.cloneNode(true)); return;
    }
    if (current.nodeType === Node.TEXT_NODE) {
      if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
      return;
    }
    if (current.nodeType !== Node.ELEMENT_NODE) return;
    for (const attribute of Array.from(current.attributes)) {
      if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
    }
    for (const attribute of Array.from(next.attributes)) {
      if (current.getAttribute(attribute.name) !== attribute.value) current.setAttribute(attribute.name, attribute.value);
    }
    const currentChildren = Array.from(current.childNodes);
    const nextChildren = Array.from(next.childNodes);
    for (let index = currentChildren.length - 1; index >= nextChildren.length; index -= 1) currentChildren[index].remove();
    for (let index = 0; index < nextChildren.length; index += 1) {
      const existing = current.childNodes[index];
      if (!existing) current.appendChild(nextChildren[index].cloneNode(true));
      else this._morphNode(existing, nextChildren[index]);
    }
  }
  _styles(ps,pr,cs,cr,hot,cold) { return `
    :host{display:block;--card-surface:var(--dashboard-card-bg,var(--ha-card-background,var(--card-background-color,#111820)))}ha-card{display:block;box-sizing:border-box;padding:16px;overflow:hidden;background:var(--card-surface);color:var(--primary-text-color);border:1px solid color-mix(in srgb,var(--divider-color) 65%,transparent);border-radius:28px}header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:3px 7px 9px}header small{font-size:10px;letter-spacing:.18em;color:var(--secondary-text-color)}h2{font-size:25px;margin:3px 0 0}.chips{display:flex;gap:7px;align-items:center;justify-content:flex-end;flex-wrap:wrap}.chips span{font-size:10px;padding:7px 10px;border:1px solid color-mix(in srgb,var(--success-color,#62cfad) 32%,transparent);border-radius:18px;color:var(--success-color,#7bd9ba);background:#55cba908}.alarm .alarm-chip{color:#f18787;border-color:#e7666655;background:#e7666610}.hero{display:grid;grid-template-columns:minmax(0,1fr) 92px;gap:10px}.diagram{min-width:0;aspect-ratio:760/520}.diagram svg{width:100%;height:100%;overflow:visible}.house{fill:#f2994a14;stroke:#78a4b940;stroke-width:1.5}.zone{font-size:10px;letter-spacing:1.6px;font-weight:700;fill:var(--secondary-text-color)}.pipe-rim,.pipe-core,.pipe-heat,.water-sheen{fill:none;stroke-linecap:round;stroke-linejoin:round}.pipe-rim{stroke:#8597a5;stroke-width:18;opacity:.75}.pipe-core{stroke:#1b2b35;stroke-width:14}.pipe-heat{stroke-width:9;opacity:.65}.water-sheen{display:none;stroke:rgba(222,247,255,.38);stroke-width:1.4;stroke-dasharray:3 16;filter:drop-shadow(0 0 1.5px rgba(190,236,255,.34))}.pipe.active .water-sheen{display:inline;animation:water-shimmer 3.2s linear infinite}.primary-supply .pipe-heat{stroke:#ed554f}.primary-return .pipe-heat{stroke:${pr}}.ch-circuit .pipe-heat{stroke:url(#${this._id}-radiator-cooling)}.ch-circuit .water-sheen{stroke-width:1.2;opacity:.38;animation-duration:4.4s!important}.ch-circuit .water-pulse{fill:rgba(231,249,255,.60);opacity:.46;transform:scale(.62)}.dhw-hot .pipe-heat{stroke:url(#${this._id}-dhw)}.dhw-cold .pipe-heat{stroke:${this._tempColor(cold)}}.water-pulse{display:none;fill:rgba(230,249,255,.66);filter:drop-shadow(0 0 2px rgba(195,239,255,.30));opacity:.62}.water-pulse circle{fill:rgba(255,255,255,.36)}.pipe.active .water-pulse{display:inline}.pipe:not(.active){opacity:.42}.pipe:not(.active) .water-sheen{display:none;animation:none}.unit rect{fill:#162631;stroke:#83a9ba;stroke-width:1.7}.unit text{font-size:8px;font-weight:700;letter-spacing:1px;fill:#a9bcc7}.unit .unit-title{font-size:9px}.exchanger .ex-title{font-size:9px}.exchanger-metrics .k{font-size:6.5px;fill:var(--secondary-text-color);font-weight:600}.exchanger-metrics .v{font-size:12px;fill:var(--primary-text-color);font-weight:700;letter-spacing:0}.exchanger-metrics .v.small{font-size:8px}.primary-row text{font-size:7px;fill:var(--secondary-text-color);letter-spacing:.05em}.primary-row .value{font-size:14px;font-weight:700;fill:var(--primary-text-color);letter-spacing:0}.primary-row .primary-flow{font-size:8px;fill:var(--secondary-text-color)}.outdoor-value text,.outdoor-value .value{font-size:8px;letter-spacing:.08em;fill:var(--secondary-text-color)}.outdoor-value .value{font-weight:700;letter-spacing:0;fill:var(--primary-text-color)}.unit circle{fill:#dce8ed;stroke:#13202a}.exchanger rect{fill:#1c2d38;stroke:#7598aa;stroke-width:1;opacity:.85}.exchanger path{fill:none;stroke:#7598aa;stroke-width:3.5;opacity:.85}.radiator>rect{fill:#1a2a35;stroke:#94aeba;stroke-width:1.5}.radiator .fin{fill:#253b47;stroke:#688492;stroke-width:.7}.radiator text,.tap text{font-size:8px;letter-spacing:1px;fill:var(--secondary-text-color)}.unit-valve circle{fill:#192a35;stroke:#d7a06f;stroke-width:1.2}.unit-valve path{fill:none;stroke:#e5b17d;stroke-width:1.3}.unit-valve text{font-size:6.5px;letter-spacing:.04em;fill:#e9c39d}.primary-unit-valve text{fill:#b9cbd4}.tap .tap-body,.tap .tap-outlet{fill:none;stroke:#9bb0ba;stroke-width:5;stroke-linecap:round;stroke-linejoin:round}.tap .tap-handle{fill:none;stroke:#b9cbd3;stroke-width:3;stroke-linecap:round}.tap .basin{fill:#172832;stroke:#7894a2;stroke-width:2;stroke-linejoin:round}.tap .drop{fill:${this._tempColor(hot)};stroke:none;opacity:0}.tap.active .drop{animation:drop 2s ease-in infinite}.label text,.bypass-label text,.bypass-icon text,.circuit-meta text,.delta text,.flow-metric text{font-size:9px;fill:var(--secondary-text-color)}.bypass-icon circle{fill:#1b2c37;stroke:#7898a8;stroke-width:1.5}.bypass-icon path{fill:none;stroke:#7898a8;stroke-width:2;stroke-linecap:round}.bypass-icon text{fill:var(--secondary-text-color);font-size:8px}.bypass-icon .label-value{fill:var(--primary-text-color);font-size:12px;font-weight:650}.bypass-icon.active circle{stroke:#e99a6f;filter:drop-shadow(0 0 5px #e87e5855)}.bypass-icon.active path{stroke:#e99a6f;transform-origin:center;animation:bypass-turn 2.4s linear infinite}.circuit-meta text{fill:var(--secondary-text-color);font-size:8px}.circuit-meta .label-value{fill:var(--primary-text-color);font-size:12px;font-weight:650}.label .pipe-meta{font-size:9px;fill:#b7c4cc}.label .label-value,.bypass-label .label-value,.delta .label-value,.flow-metric .label-value{font-size:15px;font-weight:650;fill:var(--primary-text-color)}.label.primary .label-value{font-size:21px}.delta .label-value{font-size:19px;fill:${this._coolingStatusColor(this._num("primary_cooling"))}}aside{display:grid;grid-template-rows:repeat(4,1fr);border-left:1px solid #ffffff14;padding-left:8px}.metric{min-width:0;display:flex;flex-direction:column;justify-content:center;text-align:center;padding:7px 4px}.metric small,.metric strong{display:block;overflow:hidden;text-overflow:ellipsis}.metric small{font-size:8px;color:var(--secondary-text-color);white-space:normal}.metric strong{font-size:13px;font-weight:600;margin-top:3px;white-space:nowrap}.details{display:grid;grid-template-columns:1.05fr 1fr 1.25fr 1.2fr;gap:8px;padding-top:11px;margin-top:5px;border-top:1px solid #ffffff12}.details section{min-width:0;padding:9px;border:1px solid #ffffff0e;border-radius:13px;background:#ffffff04}.details h3{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--secondary-text-color);margin:0 0 6px}.metric-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px}.metric-grid .metric{border-radius:8px;background:#ffffff04;min-height:37px}.metric.bad strong{color:#ef7777}@keyframes bypass-turn{to{transform:rotate(360deg)}}@keyframes water-shimmer{to{stroke-dashoffset:-38}}@keyframes drop{0%,35%{transform:translateY(-3px);opacity:0}60%{opacity:1}100%{transform:translateY(10px);opacity:0}}${this._config.animation===false?".water-pulse{display:none!important}.water-sheen,.drop,.bypass-icon.active path,.bypass-icon.active .bypass-pulse,.dhw-bypass.active .bypass-flow{animation:none!important}":""}@media(prefers-reduced-motion:reduce){.water-pulse{display:none!important}.water-sheen,.drop,.bypass-icon.active path,.bypass-icon.active .bypass-pulse,.dhw-bypass.active .bypass-flow{animation:none!important}}@media(max-width:700px){ha-card{padding:11px;border-radius:22px}.hero{grid-template-columns:minmax(0,1fr) 72px}.details{grid-template-columns:repeat(2,minmax(0,1fr))}h2{font-size:21px}.chips .alarm-chip{display:none}}@media(max-width:480px){.hero{grid-template-columns:1fr}.diagram{aspect-ratio:760/540}aside{grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:auto;border-left:0;border-top:1px solid #ffffff14;padding:5px 0 0}.details{grid-template-columns:1fr}.chips span{font-size:8px;padding:5px 7px}.label.primary .label-value{font-size:18px}}
  `; }
  _responsiveStyles() { return `
    :host {
      container-type: inline-size;
      --fv-bg: var(--primary-background-color, #1c1c1c);
      --fv-fg: var(--primary-text-color);
      --fv-muted: var(--secondary-text-color);
      --fv-component: color-mix(in srgb, var(--fv-bg) 91%, var(--fv-fg) 9%);
      --fv-component-strong: color-mix(in srgb, var(--fv-bg) 68%, var(--fv-fg) 32%);
      --fv-line: color-mix(in srgb, var(--fv-fg) 18%, transparent);
    }
    ha-card {
      background: var(--ha-card-background, var(--card-background-color, var(--fv-bg)));
      color: var(--fv-fg);
      border-color: var(--fv-line);
    }
    .hero { grid-template-columns: minmax(0, 1fr); }
    .label > text:first-child, .outdoor-value > text:first-child { font-size: 10.5px; }
    .inside-temp > text:first-child { font-size: 12.5px; }
    aside .metric { padding-inline: 1px; }
    aside .metric small {
      font-size: 11px;
      line-height: 1.15;
      text-wrap: balance;
    }
    aside .metric strong {
      font-size: 18px;
      line-height: 1.05;
      letter-spacing: -.02em;
    }
    .label .label-value, .outdoor-value .value {
      fill: color-mix(in srgb, var(--fv-fg) 78%, var(--fv-bg));
    }
    .label .label-value { font-size: 26px !important; }
    .label.primary .label-value { font-size: 28px !important; }
    .outdoor-value .value { font-size: 20px !important; }
    .house { fill: #f2994a14; stroke: var(--fv-line); }
    .pipe-rim { stroke: color-mix(in srgb, var(--fv-fg) 42%, var(--fv-bg)); }
    .pipe-core { stroke: color-mix(in srgb, var(--fv-bg) 54%, var(--fv-fg) 46%); }
    .dhw-cold .pipe-heat { stroke: #3e9ed3; }
    .unit rect, .exchanger rect, .radiator > rect, .radiator .fin,
    .unit-valve circle, .bypass-icon circle, .tap .basin {
      fill: var(--fv-component);
      stroke: color-mix(in srgb, var(--fv-fg) 38%, transparent);
    }
    .exchanger path, .tap .tap-body, .tap .tap-outlet, .tap .tap-handle,
    .bypass-icon path { stroke: color-mix(in srgb, var(--fv-fg) 48%, transparent); }
    .bypass-icon .bypass-pulse { fill: none; stroke: transparent; opacity: 0; transform-origin: center; }
    .bypass-icon.active .bypass-pulse { stroke: #e99a6f; animation: bypass-pulse 1.8s ease-out infinite; }
    @keyframes bypass-pulse { 0% { opacity: .7; transform: scale(.72); } 75%,100% { opacity: 0; transform: scale(1.3); } }
    .dhw-bypass .bypass-hit { fill: color-mix(in srgb, var(--fv-fg) 3%, transparent); stroke: color-mix(in srgb, var(--fv-fg) 10%, transparent); stroke-width: .7; }
    .dhw-bypass .bypass-status { fill: var(--fv-muted); font-size: 7.5px; font-weight: 750; letter-spacing: .075em; }
    .dhw-bypass.active .bypass-hit { fill: color-mix(in srgb, #e99a6f 11%, transparent); stroke: color-mix(in srgb, #e99a6f 55%, transparent); }
    .dhw-bypass.active .bypass-status { fill: #f0a277; }
    .dhw-bypass .bypass-values .k { fill: var(--fv-muted); font-size: 6.5px; font-weight: 650; letter-spacing: .04em; }
    .dhw-bypass .bypass-values .v { fill: var(--fv-fg); font-size: 10px; font-weight: 750; }
    .dhw-bypass .bypass-track, .dhw-bypass .bypass-flow { fill: none; stroke-linecap: round; stroke-linejoin: round; }
    .dhw-bypass .bypass-track { stroke: color-mix(in srgb, var(--fv-fg) 44%, transparent); stroke-width: 6; }
    .dhw-bypass .bypass-flow { stroke: #fff0df; stroke-width: 4; stroke-dasharray: 8 9; opacity: 0; filter: drop-shadow(0 0 3px #e99a6f); }
    .dhw-bypass.active .bypass-track { stroke: #e99a6f; filter: drop-shadow(0 0 5px #e87e5877); }
    .dhw-bypass.active .bypass-flow { opacity: 1; animation: dhw-bypass-flow 1.15s linear infinite; }
    @keyframes dhw-bypass-flow { to { stroke-dashoffset: -34; } }
    .unit circle { fill: color-mix(in srgb, var(--fv-bg) 35%, var(--fv-fg) 65%); stroke: var(--fv-bg); }
    .unit text, .unit-valve text, .label .pipe-meta { fill: var(--fv-muted); }
    aside, .details { border-color: var(--fv-line); }
    .details section, .metric-grid .metric {
      border-color: var(--fv-line);
      background: color-mix(in srgb, var(--fv-fg) 4%, transparent);
    }
    .entity-hit { cursor: pointer; }
    .entity-hit:focus-visible { outline: 2px solid var(--info-color, #4aa3ff); outline-offset: 2px; }
    .ch-circuit.active .pipe-heat {
      opacity: .92;
      filter: drop-shadow(0 0 4px color-mix(in srgb, var(--warning-color, #f2994a) 58%, transparent));
    }
    .ch-circuit.active .water-sheen {
      stroke-width: 2.3;
      opacity: .88;
      stroke-dasharray: 5 12;
      filter: drop-shadow(0 0 3px rgba(225, 248, 255, .72));
      animation-duration: 2.5s !important;
    }
    .ch-circuit.active .water-pulse {
      opacity: .9;
      transform: scale(.92);
      filter: drop-shadow(0 0 4px rgba(221, 247, 255, .78));
    }
    @container (max-width: 700px) {
      ha-card { padding: 12px 9px; border-radius: 22px; }
      header { padding: 1px 4px 8px; }
      header small { font-size: 11px; }
      h2 { font-size: 30px; }
      .chips { max-width: 52%; }
      .chips .alarm-chip { display: inline-flex; }
      .chips span { font-size: 11px; padding: 7px 9px; }
      .hero { grid-template-columns: 1fr; gap: 8px; }
      .diagram { width: 100%; aspect-ratio: 760 / 520; }
      aside {
        grid-template-columns: repeat(4, minmax(0, 1fr));
        grid-template-rows: auto;
        border-left: 0;
        border-top: 1px solid var(--fv-line);
        padding: 8px 0 0;
      }
      aside .metric { min-width: 0; padding: 6px 2px; }
      aside .metric small { font-size: 11px; line-height: 1.15; }
      aside .metric strong { font-size: 18px; }
      .zone { font-size: 13px; }
      .unit text { font-size: 11px; }
      .unit .unit-title, .exchanger .ex-title { font-size: 12px; }
      .exchanger-metrics .k { font-size: 9.5px; }
      .exchanger-metrics .v { font-size: 17px; }
      .label text, .circuit-meta text, .delta text, .flow-metric text { font-size: 14px; }
      .label > text:first-child, .outdoor-value > text:first-child { font-size: 14px; }
      .label .label-value { font-size: 32px !important; }
      .label.primary .label-value { font-size: 33px !important; }
      .circuit-meta .label-value { font-size: 36px !important; }
      .delta .label-value, .flow-metric .label-value { font-size: 22px !important; }
      .outdoor-value text { font-size: 13px; }
      .outdoor-value .value { font-size: 25px !important; }
      .label .pipe-meta { font-size: 12px; }
      .tap text { font-size: 10px; }
      .details { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
      .details section { padding: 8px 6px; }
      .metric-grid .metric { min-height: 42px; }
      .metric-grid .metric small { font-size: 10px; }
      .metric-grid .metric strong { font-size: 17px; }
    }
  `; }
}

class HAFjernvarmeHouseCardEditor extends HTMLElement {
  setConfig(config){this._config=config||{};if(!this._form)this._render();else this._form.data=this._config;}
  set hass(hass){this._hass=hass;if(this._form)this._form.hass=hass;}
  _render(){
    if(!this._config)return;
    this.innerHTML=`<style>:host{display:block;padding:12px}.hint{color:var(--secondary-text-color);font-size:12px;margin:0 0 12px}</style><p class="hint">Alle felter kan ændres. Tomme felter vises som — på kortet.</p><ha-form></ha-form>`;
    this._form=this.querySelector("ha-form"); this._form.hass=this._hass; this._form.data=this._config;
    this._form.schema=[{name:"title",selector:{text:{}}},{name:"animation",selector:{boolean:{}}},{name:"show_details",selector:{boolean:{}}},{type:"expandable",name:"entities",title:"Entiteter",schema:FIELDS.map(([name,label])=>({name,label,selector:{entity:{}}}))}];
    this._form.computeLabel=s=>s.label||s.name;
    this._form.addEventListener("value-changed",e=>{this.dispatchEvent(new CustomEvent("config-changed",{detail:{config:e.detail.value},bubbles:true,composed:true}));});
  }
}

const CONTROL_FIELDS = [
  ["auto_standby", "Automatisk standby", "switch"],
  ["auto_standby_status", "Automatisk standby status", "sensor"],
  ["curve_type", "Varmekurvetype", "select"], ["curve_value", "Varmekurveværdi", "number"],
  ["curve_offset", "Forskydning", "number"], ["min_supply", "Minimum fremløb", "number"],
  ["max_supply", "Maksimum fremløb", "number"], ["summer_cutoff", "Sommerudkobling", "number"],
  ["return_mode", "Returbegrænser", "select"], ["return_enabled", "Returbegrænser aktiv", "switch"],
  ["max_return", "Maksimum retur", "number"], ["return_gain", "Returforstærkning", "number"],
  ["room_profile", "Komfortprofil", "select"], ["room_schedule", "Planlagt skema", "switch"],
  ["room_temporary_mode", "Midlertidig tilstand", "switch"], ["eco_temperature", "Øko temperatur", "number"],
  ["comfort_temperature", "Komforttemperatur", "number"], ["extra_comfort_temperature", "Ekstra komfort", "number"],
  ["temporary_temperature", "Midlertidig temperatur", "number"], ["temporary_duration", "Varighed", "number"],
  ["standby", "Calefa standby", "switch"], ["circulation_pump", "Cirkulationspumpe", "switch"],
  ["heating_state", "Varmestatus", "sensor"], ["regulator_state", "Regulator", "sensor"],
  ["blocked_reason", "Varme blokeret af", "sensor"]
];

const DATA_FIELDS = [
  ["meter_total_energy", "Total energi"], ["meter_day_energy", "Energi i dag"],
  ["meter_day_cost", "Pris i dag"], ["meter_month_cost", "Pris denne måned"],
  ["meter_total_volume", "Total volumen"], ["meter_flow", "Aktuelt flow"],
  ["meter_supply", "Måler fremløb"], ["meter_return", "Måler retur"],
  ["meter_cooling", "Afkøling"], ["meter_power", "Aktuel effekt"],
  ["meter_hours", "Driftstimer"], ["meter_max_flow_year", "Maks. flow år"],
  ["meter_max_power_year", "Maks. effekt år"], ["meter_energy_e8", "Energi E8"],
  ["meter_energy_e9", "Energi E9"], ["meter_rssi", "Signalstyrke"],
  ["meter_alarm", "Målerstatus"], ["calefa_supply", "Calefa fremløb"],
  ["calefa_return", "Calefa retur"], ["calefa_cooling", "Calefa afkøling"],
  ["cvv_supply", "CVV fremløb"], ["cvv_return", "CVV retur"],
  ["cvv_cooling", "CVV afkøling"], ["cvv_valve", "CVV ventil"],
  ["dhw_power", "Varmtvandseffekt"]
];

class HACalefaDetailsCard extends HTMLElement {
  static getStubConfig() { return { title: "Calefa styring", entities: Object.fromEntries([...CONTROL_FIELDS, ...DATA_FIELDS].map(([key]) => [key, ""])) }; }
  static async getConfigElement() { return document.createElement("ha-calefa-details-card-editor"); }
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {}; this._hass = null; this._signature = ""; this._configSignature = "";
    this.shadowRoot.addEventListener("click", event => this._handleClick(event));
    this.shadowRoot.addEventListener("change", event => this._handleChange(event));
    this.shadowRoot.addEventListener("keydown", event => this._handleKeydown(event));
  }
  setConfig(config) {
    if (!config) throw new Error("Ugyldig konfiguration");
    const next = { title: "Calefa styring", ...config, entities: { ...(config.entities || {}) } };
    const signature = JSON.stringify(next);
    this._config = next;
    if (signature === this._configSignature) return;
    this._configSignature = signature; this._signature = ""; this._renderStructure(); this._updateValues(true);
  }
  set hass(hass) {
    this._hass = hass;
    const ids = Object.values(this._config.entities || {}).filter(Boolean);
    const signature = JSON.stringify(ids.map(id => {
      const state = hass?.states?.[id];
      return [id, state?.state, state?.attributes?.min, state?.attributes?.max, state?.attributes?.step, state?.attributes?.options];
    }));
    if (signature !== this._signature) { this._signature = signature; this._updateValues(); this._historyCards?.forEach(card => { card.hass = hass; }); }
  }
  getCardSize() { return 8; }
  getGridOptions() { return { rows: "auto", columns: 12, min_columns: 6 }; }
  _entity(key) { const id = this._config.entities?.[key]; return id ? this._hass?.states?.[id] : undefined; }
  _escape(value) { return String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]); }
  _renderStructure() {
    if (!this.shadowRoot) return;
    const number = (key, label, icon) => `<div class="control number-control" data-control="${key}"><button class="info" data-more="${key}" aria-label="Vis ${label}"><ha-icon icon="${icon}"></ha-icon><span>${label}</span></button><div class="stepper"><button data-step="-1" aria-label="Sænk ${label}">−</button><strong data-value="${key}">—</strong><button data-step="1" aria-label="Hæv ${label}">+</button></div></div>`;
    const toggle = (key, label, description, icon) => `<button class="control toggle" data-toggle="${key}"><span class="control-icon"><ha-icon icon="${icon}"></ha-icon></span><span><b>${label}</b><small>${description}</small></span><span class="switch" aria-hidden="true"><i></i></span></button>`;
    const select = (key, label, icon) => `<label class="control select-control" data-control="${key}"><span class="select-label"><ha-icon icon="${icon}"></ha-icon><span>${label}</span></span><select data-select="${key}" aria-label="${label}"></select></label>`;
    const metric = (key, label, icon, tone) => `<button class="data-metric ${tone}" data-more="${key}"><ha-icon icon="${icon}"></ha-icon><span><small>${label}</small><strong data-value="${key}">—</strong></span></button>`;
    this.shadowRoot.innerHTML = `<style>${this._styles()}</style><ha-card>
      <header><div><small>WAVIN CALEFA</small><h2>${this._escape(this._config.title)}</h2><p>Styring, målerdata og historik samlet</p></div><div class="status" data-summary>Indlæser…</div></header>
      <nav class="category-tabs" aria-label="Detaljekategori"><button class="active" data-tab="control"><ha-icon icon="mdi:tune-variant"></ha-icon>Styring</button><button data-tab="meter"><ha-icon icon="mdi:meter-gas"></ha-icon>Målerdata</button><button data-tab="history"><ha-icon icon="mdi:chart-line"></ha-icon>Historik</button></nav>
      <div class="category-panel active" data-panel="control"><div class="quick">${toggle("auto_standby","Automatisk standby","Stopper varmen, når alle valgte rum er varme","mdi:weather-night")}</div>
      <div class="sections">
        <section><div class="section-title"><ha-icon icon="mdi:chart-bell-curve-cumulative"></ha-icon><div><h3>Varmekurve</h3><p>Fremløbstemperatur efter vejret</p></div></div>${select("curve_type","Kurvetype","mdi:tune-variant")}
          <div class="control-grid">${number("curve_value","Kurveværdi","mdi:chart-bell-curve-cumulative")}${number("curve_offset","Forskydning","mdi:arrow-up-down")}${number("min_supply","Minimum fremløb","mdi:thermometer-chevron-down")}${number("max_supply","Maksimum fremløb","mdi:thermometer-chevron-up")}${number("summer_cutoff","Sommerudkobling","mdi:white-balance-sunny")}</div></section>
        <section><div class="section-title"><ha-icon icon="mdi:thermometer-lines"></ha-icon><div><h3>Returbegrænser</h3><p>Holder returtemperaturen nede</p></div></div>${select("return_mode","Regulering","mdi:tune")}${toggle("return_enabled","Returbegrænser","Aktiver temperaturbegrænsning","mdi:thermometer-alert")}
          <div class="control-grid">${number("max_return","Maksimum retur","mdi:thermometer-high")}${number("return_gain","Forstærkning","mdi:signal")}</div></section>
        <section><div class="section-title"><ha-icon icon="mdi:home-thermometer"></ha-icon><div><h3>RUM</h3><p>Komfortprofil og midlertidig varme</p></div></div>${select("room_profile","Komfortprofil","mdi:home-heart")}
          <div class="toggle-grid">${toggle("room_schedule","Planlagt skema","Brug Calefas tidsplan","mdi:calendar-clock")}${toggle("room_temporary_mode","Midlertidig tilstand","Tidsbegrænset temperatur","mdi:timer-outline")}</div>
          <div class="control-grid">${number("eco_temperature","Øko temperatur","mdi:leaf")}${number("comfort_temperature","Komforttemperatur","mdi:home-heart")}${number("extra_comfort_temperature","Ekstra komfort","mdi:fire")}${number("temporary_temperature","Midlertidig temperatur","mdi:thermometer-plus")}${number("temporary_duration","Varighed","mdi:timer-sand")}</div></section>
        <section><div class="section-title"><ha-icon icon="mdi:cog-outline"></ha-icon><div><h3>Avanceret</h3><p>Direkte drift og diagnose</p></div></div><div class="toggle-grid">${toggle("standby","Calefa standby","Manuel standby for anlægget","mdi:power-sleep")}${toggle("circulation_pump","Cirkulationspumpe","Manuel pumpestyring","mdi:pump")}</div>
          <div class="diagnostics"><button data-more="heating_state"><small>Varmestatus</small><strong data-value="heating_state">—</strong></button><button data-more="regulator_state"><small>Regulator</small><strong data-value="regulator_state">—</strong></button><button data-more="blocked_reason"><small>Blokeret af</small><strong data-value="blocked_reason">—</strong></button></div></section>
      </div></div>
      <div class="category-panel" data-panel="meter"><div class="data-section"><div class="section-title"><ha-icon icon="mdi:cash-clock"></ha-icon><div><h3>Forbrug og økonomi</h3><p>De vigtigste summer og omkostninger</p></div></div><div class="data-grid">${metric("meter_total_energy","Total energi","mdi:counter","red")}${metric("meter_day_energy","Energi i dag","mdi:calendar-today","amber")}${metric("meter_day_cost","Pris i dag","mdi:cash","cyan")}${metric("meter_month_cost","Pris denne måned","mdi:calendar-month","blue")}${metric("meter_total_volume","Total volumen","mdi:water","blue")}</div></div>
        <div class="data-section"><div class="section-title"><ha-icon icon="mdi:transit-connection-variant"></ha-icon><div><h3>Aktuel drift</h3><p>Temperatur, flow og effekt fra MULTICAL</p></div></div><div class="data-grid">${metric("meter_supply","Fremløb","mdi:thermometer-chevron-up","red")}${metric("meter_return","Retur","mdi:thermometer-chevron-down","blue")}${metric("meter_cooling","Afkøling","mdi:snowflake-thermometer","green")}${metric("meter_flow","Flow","mdi:pipe","cyan")}${metric("meter_power","Effekt","mdi:flash","violet")}${metric("meter_alarm","Målerstatus","mdi:shield-check","green")}</div></div>
        <div class="data-section"><div class="section-title"><ha-icon icon="mdi:gauge"></ha-icon><div><h3>Måler og maksimum</h3><p>Tekniske tællere og signal</p></div></div><div class="data-grid compact">${metric("meter_hours","Driftstimer","mdi:timer-outline","slate")}${metric("meter_max_flow_year","Maks. flow år","mdi:waves-arrow-up","cyan")}${metric("meter_max_power_year","Maks. effekt år","mdi:flash-alert","amber")}${metric("meter_energy_e8","Energi E8","mdi:home-lightning-bolt","violet")}${metric("meter_energy_e9","Energi E9","mdi:home-lightning-bolt-outline","blue")}${metric("meter_rssi","Signalstyrke","mdi:signal","slate")}</div></div></div>
      <div class="category-panel" data-panel="history"><div class="history-section"><div class="section-title"><ha-icon icon="mdi:meter-gas"></ha-icon><div><h3>Kamstrup MULTICAL</h3><p>Temperatur, afkøling og effekt · 24 timer</p></div></div><div data-history="meter"></div></div><div class="history-section"><div class="section-title"><ha-icon icon="mdi:radiator"></ha-icon><div><h3>Fjernvarmekreds</h3><p>Calefa fremløb, retur og afkøling · 24 timer</p></div></div><div data-history="calefa"></div></div><div class="history-section"><div class="section-title"><ha-icon icon="mdi:heating-coil"></ha-icon><div><h3>Radiatorkreds</h3><p>CVV temperaturer og ventil · 24 timer</p></div></div><div data-history="cvv"></div></div><div class="history-section"><div class="section-title"><ha-icon icon="mdi:water-boiler"></ha-icon><div><h3>Varmt vand</h3><p>Effektforbrug · 24 timer</p></div></div><div data-history="dhw"></div></div></div>
      <ha-icon class="watermark" icon="mdi:home-thermometer-outline"></ha-icon>
    </ha-card>`;
    this._mountHistoryCards();
  }
  _updateValues(force = false) {
    if (!this._hass || !this.shadowRoot.querySelector("ha-card")) return;
    for (const [key,, type] of CONTROL_FIELDS) {
      const state = this._entity(key);
      if (type === "number" || type === "sensor") {
        const value = this.shadowRoot.querySelector(`[data-value="${key}"]`);
        if (value) value.textContent = state ? `${state.state}${state.attributes?.unit_of_measurement ? ` ${state.attributes.unit_of_measurement}` : ""}` : "—";
        if (type === "number") {
          const holder = this.shadowRoot.querySelector(`[data-control="${key}"]`);
          holder?.querySelectorAll("[data-step]").forEach(button => {
            const direction = Number(button.dataset.step), current = Number(state?.state), bound = direction < 0 ? Number(state?.attributes?.min) : Number(state?.attributes?.max);
            button.disabled = !state || !Number.isFinite(current) || (Number.isFinite(bound) && (direction < 0 ? current <= bound : current >= bound));
          });
        }
      }
      if (type === "switch") {
        const button = this.shadowRoot.querySelector(`[data-toggle="${key}"]`), active = state?.state === "on";
        if (button) { button.classList.toggle("active", active); button.classList.toggle("unavailable", !state || state.state === "unavailable"); button.setAttribute("aria-pressed", String(active)); }
      }
      if (type === "select") {
        const select = this.shadowRoot.querySelector(`[data-select="${key}"]`);
        if (!select) continue;
        const options = Array.isArray(state?.attributes?.options) ? state.attributes.options : [];
        const optionSignature = JSON.stringify(options);
        if (force || select.dataset.options !== optionSignature) {
          const focused = this.shadowRoot.activeElement === select;
          select.replaceChildren(...options.map(option => { const node = document.createElement("option"); node.value = option; node.textContent = option; return node; }));
          select.dataset.options = optionSignature;
          if (focused) select.focus();
        }
        if (state && select.value !== state.state) select.value = state.state;
        select.disabled = !state || state.state === "unavailable";
      }
    }
    for (const [key] of DATA_FIELDS) {
      const state = this._entity(key), value = this.shadowRoot.querySelector(`[data-value="${key}"]`);
      if (value) value.textContent = state && !["unknown","unavailable",""].includes(state.state) ? `${state.state}${state.attributes?.unit_of_measurement ? ` ${state.attributes.unit_of_measurement}` : ""}` : "—";
    }
    const auto = this._entity("auto_standby"), autoStatus = this._entity("auto_standby_status"), heating = this._entity("heating_state");
    const summary = this.shadowRoot.querySelector("[data-summary]");
    const countdown = autoStatus?.attributes?.countdown;
    if (summary) { summary.textContent = auto?.state === "on" && autoStatus ? `${autoStatus.state}${countdown ? ` · ${countdown}` : ""}` : heating?.state || "Klar"; summary.classList.toggle("active", auto?.state === "on"); }
    const autoDescription = this.shadowRoot.querySelector('[data-toggle="auto_standby"] small');
    if (autoDescription) autoDescription.textContent = auto?.state === "on" && autoStatus?.attributes?.description ? `${autoStatus.attributes.description}${countdown ? ` (${countdown})` : ""}` : "Stopper varmen, når alle valgte rum er varme";
  }
  _handleClick(event) {
    const tab = event.target.closest?.("[data-tab]");
    if (tab) {
      this.shadowRoot.querySelectorAll("[data-tab]").forEach(button => button.classList.toggle("active", button === tab));
      this.shadowRoot.querySelectorAll("[data-panel]").forEach(panel => panel.classList.toggle("active", panel.dataset.panel === tab.dataset.tab));
      return;
    }
    const step = event.target.closest?.("[data-step]");
    if (step) {
      const holder = step.closest("[data-control]"), key = holder?.dataset.control, state = this._entity(key);
      if (!state) return;
      const amount = Number(state.attributes?.step) || 1, current = Number(state.state), direction = Number(step.dataset.step);
      const min = Number(state.attributes?.min), max = Number(state.attributes?.max);
      let value = current + direction * amount;
      if (Number.isFinite(min)) value = Math.max(min, value); if (Number.isFinite(max)) value = Math.min(max, value);
      this._hass.callService("number", "set_value", { entity_id: state.entity_id, value: Number(value.toFixed(4)) }); return;
    }
    const toggle = event.target.closest?.("[data-toggle]");
    if (toggle && !toggle.classList.contains("unavailable")) {
      const entity = this._config.entities?.[toggle.dataset.toggle];
      if (entity) this._hass.callService("homeassistant", "toggle", { entity_id: entity }); return;
    }
    const more = event.target.closest?.("[data-more]");
    if (more) this._showMore(more.dataset.more);
  }
  _handleChange(event) {
    const select = event.target.closest?.("[data-select]"); if (!select) return;
    const entity = this._config.entities?.[select.dataset.select];
    if (entity) this._hass.callService("select", "select_option", { entity_id: entity, option: select.value });
  }
  _handleKeydown(event) { if ((event.key === "Enter" || event.key === " ") && event.target.closest?.("[data-more]") && event.target.tagName !== "BUTTON") { event.preventDefault(); this._showMore(event.target.closest("[data-more]").dataset.more); } }
  _showMore(key) { const entityId = this._config.entities?.[key]; if (entityId) this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true })); }
  async _mountHistoryCards() {
    this._historyCards = [];
    if (!window.loadCardHelpers) return;
    const helpers = await window.loadCardHelpers();
    if (!this.isConnected && !this.shadowRoot.querySelector("ha-card")) return;
    const definitions = {
      meter: [["meter_supply","Fremløb","#ef5350"],["meter_return","Retur","#42a5f5"],["meter_cooling","Afkøling","#22c55e"],["meter_power","Effekt","#ab47bc"]],
      calefa: [["calefa_supply","Fremløb","#ef5350"],["calefa_return","Retur","#42a5f5"],["calefa_cooling","Afkøling","#22c55e"]],
      cvv: [["cvv_supply","Fremløb","#ef5350"],["cvv_return","Retur","#42a5f5"],["cvv_cooling","Afkøling","#22c55e"],["cvv_valve","Ventil","#d07888"]],
      dhw: [["dhw_power","Varmtvand effekt","#f59e0b"]]
    };
    for (const [name, series] of Object.entries(definitions)) {
      const target = this.shadowRoot.querySelector(`[data-history="${name}"]`); if (!target) continue;
      const entities = series.map(([key,label,color]) => ({entity:this._config.entities?.[key],name:label,color})).filter(item => item.entity);
      if (!entities.length) { target.textContent = "Ingen historik-entiteter valgt"; continue; }
      const card = await helpers.createCardElement({type:"custom:mini-graph-card",entities,hours_to_show:24,points_per_hour:2,line_width:3,font_size:72,animate:false,hour24:true,show:{graph:"line",icon:false,name:false,state:true,legend:true,labels:false}});
      card.hass = this._hass; target.replaceChildren(card); this._historyCards.push(card);
    }
  }
  _styles() { return `
    :host{display:block;container-type:inline-size;--surface:var(--dashboard-card-bg,var(--ha-card-background,var(--card-background-color,#15191f)));--panel:var(--dashboard-surface-info-dark,color-mix(in srgb,var(--primary-text-color,#fff) 5%,var(--surface)));--line:color-mix(in srgb,var(--primary-text-color,#fff) 13%,transparent);--accent:var(--dashboard-accent,var(--accent-color,#ff7043))}*{box-sizing:border-box}ha-card{position:relative;overflow:hidden;padding:22px;background:var(--surface);color:var(--primary-text-color,#fff);border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:18px;box-shadow:var(--ha-card-box-shadow,0 10px 28px rgba(0,0,0,.18))}header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:16px}header small{font-size:10px;letter-spacing:.16em;color:var(--secondary-text-color,#9ba9b7)}h2{font-size:26px;margin:3px 0}header p,.section-title p{margin:0;color:var(--secondary-text-color,#9ba9b7);font-size:13px}.status{border:1px solid var(--line);border-radius:999px;padding:8px 12px;font-size:12px;color:var(--secondary-text-color,#9ba9b7)}.status.active{color:var(--success-color,#62cf8e);border-color:color-mix(in srgb,var(--success-color,#62cf8e) 45%,transparent)}.category-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-bottom:12px;padding:4px;border:1px solid var(--line);border-radius:14px;background:color-mix(in srgb,var(--primary-text-color,#fff) 3%,transparent)}.category-tabs button{display:flex;justify-content:center;align-items:center;gap:7px;min-height:40px;border:0;border-radius:10px;background:transparent;color:var(--secondary-text-color,#9ba9b7);font:inherit;font-weight:700;cursor:pointer}.category-tabs button.active{background:color-mix(in srgb,var(--accent) 17%,transparent);color:var(--primary-text-color,#fff)}.category-tabs ha-icon{--mdc-icon-size:19px}.category-panel{display:none}.category-panel.active{display:block}.quick{margin-bottom:12px}.sections{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.sections section,.data-section,.history-section{min-width:0;padding:16px;background:var(--panel);border:1px solid var(--line);border-radius:16px}.data-section+.data-section,.history-section+.history-section{margin-top:10px}.section-title{display:flex;gap:11px;align-items:center;margin-bottom:13px}.section-title>ha-icon{color:var(--accent);--mdc-icon-size:25px}.section-title h3{font-size:18px;margin:0 0 2px}.control-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px}.control{min-width:0;border:1px solid var(--line);border-radius:13px;background:color-mix(in srgb,var(--primary-text-color,#fff) 4%,transparent);color:inherit}.toggle{width:100%;display:grid;grid-template-columns:38px minmax(0,1fr) 40px;gap:10px;align-items:center;text-align:left;padding:11px;cursor:pointer;font:inherit}.toggle-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px}.control-icon{display:grid;place-items:center;width:36px;height:36px;border-radius:11px;background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent)}.toggle b,.toggle small{display:block}.toggle b{font-size:13px}.toggle small{font-size:10px;color:var(--secondary-text-color,#9ba9b7);margin-top:3px;line-height:1.25}.switch{width:36px;height:21px;padding:2px;border-radius:999px;background:color-mix(in srgb,var(--primary-text-color,#fff) 18%,transparent);transition:.2s}.switch i{display:block;width:17px;height:17px;border-radius:50%;background:var(--secondary-text-color,#9ba9b7);transition:.2s}.toggle.active .switch{background:color-mix(in srgb,var(--success-color,#62cf8e) 52%,transparent)}.toggle.active .switch i{transform:translateX(15px);background:var(--success-color,#62cf8e)}.toggle.unavailable{opacity:.45}.select-control{display:flex;align-items:center;gap:10px;padding:8px 10px;margin-bottom:8px}.select-label{display:flex;align-items:center;gap:8px;min-width:115px;font-size:12px;color:var(--secondary-text-color,#9ba9b7)}.select-label ha-icon{color:var(--accent);--mdc-icon-size:19px}.select-control select{min-width:0;flex:1;padding:9px 32px 9px 10px;border:1px solid var(--line);border-radius:10px;background:var(--card-background-color,#1c1f26);color:var(--primary-text-color,#fff);font:inherit;font-size:13px}.number-control{padding:9px}.info{display:flex;align-items:center;gap:7px;width:100%;padding:0 2px 8px;border:0;background:none;color:var(--secondary-text-color,#9ba9b7);font:inherit;font-size:11px;text-align:left;cursor:pointer}.info ha-icon{color:var(--accent);--mdc-icon-size:18px}.stepper{display:grid;grid-template-columns:36px minmax(62px,1fr) 36px;align-items:center;gap:4px}.stepper button{height:34px;border:1px solid var(--line);border-radius:9px;background:color-mix(in srgb,var(--primary-text-color,#fff) 5%,transparent);color:var(--accent);font-size:23px;cursor:pointer}.stepper button:disabled{opacity:.3;cursor:not-allowed}.stepper strong{text-align:center;font-size:18px;white-space:nowrap}.diagnostics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:8px}.diagnostics button{min-width:0;padding:10px;border:1px solid var(--line);border-radius:12px;background:color-mix(in srgb,var(--primary-text-color,#fff) 4%,transparent);color:inherit;text-align:left;cursor:pointer}.diagnostics small,.diagnostics strong{display:block;overflow:hidden;text-overflow:ellipsis}.diagnostics small{color:var(--secondary-text-color,#9ba9b7);font-size:10px}.diagnostics strong{margin-top:4px;font-size:13px;white-space:nowrap}.data-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.data-grid.compact{grid-template-columns:repeat(3,minmax(0,1fr))}.data-metric{min-width:0;display:flex;gap:10px;align-items:center;padding:12px;border:1px solid var(--line);border-left:3px solid var(--tone,#78909c);border-radius:13px;background:color-mix(in srgb,var(--primary-text-color,#fff) 4%,transparent);color:inherit;text-align:left;cursor:pointer}.data-metric>ha-icon{color:var(--tone,#78909c);--mdc-icon-size:23px}.data-metric span,.data-metric small,.data-metric strong{display:block;min-width:0}.data-metric small{color:var(--secondary-text-color,#9ba9b7);font-size:10px}.data-metric strong{margin-top:3px;font-size:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.data-metric.red{--tone:#ef5350}.data-metric.amber{--tone:#f59e0b}.data-metric.cyan{--tone:#06b6d4}.data-metric.blue{--tone:#42a5f5}.data-metric.green{--tone:#22c55e}.data-metric.violet{--tone:#ab47bc}.data-metric.slate{--tone:#78909c}.history-section [data-history]{min-height:80px}.watermark{position:absolute;right:18px;bottom:12px;opacity:.045;--mdc-icon-size:92px;pointer-events:none}button:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}@container(max-width:760px){ha-card{padding:16px}.sections{grid-template-columns:1fr}.control-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.data-grid,.data-grid.compact{grid-template-columns:repeat(2,minmax(0,1fr))}}@container(max-width:420px){header{display:block}.status{display:inline-block;margin-top:10px}.category-tabs button{font-size:11px}.control-grid,.toggle-grid,.data-grid,.data-grid.compact{grid-template-columns:1fr}.diagnostics{grid-template-columns:1fr}.select-control{align-items:flex-start;flex-direction:column}.select-control select{width:100%}}
  `; }
}

class HACalefaDetailsCardEditor extends HTMLElement {
  setConfig(config){this._config=config||{};if(!this._form)this._render();else this._form.data=this._config;}
  set hass(hass){this._hass=hass;if(this._form)this._form.hass=hass;}
  _render(){
    if(!this._config)return;
    this.innerHTML=`<style>:host{display:block;padding:12px}.hint{color:var(--secondary-text-color);font-size:12px;margin:0 0 12px}</style><p class="hint">Vælg kun de funktioner, der findes i installationen. Tomme felter vises som utilgængelige.</p><ha-form></ha-form>`;
    this._form=this.querySelector("ha-form");this._form.hass=this._hass;this._form.data=this._config;
    this._form.schema=[{name:"title",selector:{text:{}}},{type:"expandable",name:"entities",title:"Calefa-entiteter",schema:[...CONTROL_FIELDS.map(([name,label,domain])=>({name,label,selector:{entity:domain==="sensor"?{}:{domain}}})),...DATA_FIELDS.map(([name,label])=>({name,label,selector:{entity:{}}}))]}];
    this._form.computeLabel=s=>s.label||s.name;this._form.addEventListener("value-changed",event=>this.dispatchEvent(new CustomEvent("config-changed",{detail:{config:event.detail.value},bubbles:true,composed:true})));
  }
}

if(!customElements.get("ha-fjernvarme-house-card"))customElements.define("ha-fjernvarme-house-card",HAFjernvarmeHouseCard);
if(!customElements.get("ha-fjernvarme-house-card-v2"))customElements.define("ha-fjernvarme-house-card-v2",class extends HAFjernvarmeHouseCard{});
if(!customElements.get("ha-fjernvarme-house-card-editor"))customElements.define("ha-fjernvarme-house-card-editor",HAFjernvarmeHouseCardEditor);
if(!customElements.get("ha-calefa-details-card"))customElements.define("ha-calefa-details-card",HACalefaDetailsCard);
if(!customElements.get("ha-calefa-details-card-editor"))customElements.define("ha-calefa-details-card-editor",HACalefaDetailsCardEditor);
window.customCards=window.customCards||[];
window.customCards.push({type:"ha-calefa-details-card",name:"HA Calefa Details Card",description:"Samlet styring af varmekurve, returbegrænser, RUM og Calefa-drift",preview:true});
console.info(`%c HA-FJERNVARME-HOUSE-CARD %c ${VERSION} `,"color:#fff;background:#bb433f;font-weight:700","color:#bb433f;background:#fff");
