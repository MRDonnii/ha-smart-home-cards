const VERSION = "0.6.4";

const TABS = [
  ["home", "Hjem", "mdi:home-heart"],
  ["lighting", "Lysautomatik", "mdi:motion-sensor"],
  ["routines", "Rutiner", "mdi:calendar-sync-outline"],
  ["equipment", "Udstyr", "mdi:tools"],
  ["system", "Drift", "mdi:server-security"],
  ["cards", "Dashboard", "mdi:view-dashboard-edit"],
];

// Registry over kort med en delt, fil-baseret opsaetning der redigeres her
// i stedet for i det enkelte kort. Hvert omraade genbruger kortets EGEN
// editor-webkomponent (den samme som "rediger kort" i Lovelace bruger), saa
// felterne aldrig kan gaa ud af trit med kortet selv. Nyt kort med samme
// moenster: tilfoej blot et objekt her - resten (fane, kort, hent/gem) er
// generisk og kraever ingen aendringer andre steder.
const DELT_KORT_OMRAADER = [
  {
    id: "navbar",
    titel: "Navbar",
    ikon: "mdi:dock-bottom",
    beskrivelse: "Den faelles navigationsbar (navbar.json) som alle dashboards laeser fra.",
    editorTag: "ha-navbar-card-editor",
    hentUrl: "/local/ha-navbar-card/navbar.json",
    gemService: "shell_command.save_navbar_config",
  },
  // Flere kort med en delt fil tilfoejes som nye objekter her.
];

class HASettingsCenterCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = null;
    this._tab = "home";
    this._configSig = "";
    this._stateSig = "";
    this._seen = new Set();
    this._delteVaerdier = {};
    this.shadowRoot.addEventListener("click", (e) => this._click(e));
    this.shadowRoot.addEventListener("change", (e) => this._change(e));
  }

  static getStubConfig() {
    return { title: "Indstillinger", default_tab: "home", overview: {}, rooms: [], ambient_items: [], routine_groups: [], control_groups: [], operations: {} };
  }

  static async getConfigElement() {
    await customElements.whenDefined("ha-settings-center-card-editor");
    return document.createElement("ha-settings-center-card-editor");
  }

  setConfig(config) {
    if (!config) throw new Error("Kortet kræver en konfiguration");
    const next = { title: "Indstillinger", default_tab: "home", ...config };
    const sig = JSON.stringify(next);
    this._config = next;
    if (sig !== this._configSig) {
      this._configSig = sig;
      this._tab = next.default_tab || "home";
      this._render();
    }
    this._patch();
  }

  set hass(hass) {
    this._hass = hass;
    const sig = this._signature(hass);
    if (sig !== this._stateSig) {
      this._stateSig = sig;
      this._patch();
    }
  }

  getCardSize() {
    return 10;
  }
  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }

  connectedCallback() {
    // Timerens "remaining"-attribut fastfryses ved start/pause og taeller
    // ikke selv ned - kun finishes_at aendrer sig ikke, saa nedtaellingen skal
    // regnes ud lokalt og opdateres med et interval, ellers staar teksten
    // stille selvom overstyringen rent faktisk loeber.
    this._tickTimer = setInterval(() => {
      this.shadowRoot.querySelectorAll('[data-view="profile"]').forEach((n) => this._renderOverrideStatus(n));
    }, 1000);
  }

  disconnectedCallback() {
    this._closeStatusPopup();
    if (this._tickTimer) clearInterval(this._tickTimer);
  }

  _e(id) {
    return this._hass?.states?.[id];
  }
  _state(id) {
    return this._e(id)?.state ?? "unavailable";
  }
  _available(id) {
    return !!this._e(id) && !["unknown", "unavailable"].includes(this._state(id));
  }
  _on(id) {
    return ["on", "home", "open", "active", "running", "playing"].includes(this._state(id));
  }
  _esc(v) {
    return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  _icon(i) {
    return `<ha-icon icon="${this._esc(i || "mdi:cog-outline")}"></ha-icon>`;
  }
  _signature(h) {
    const ids = new Set();
    const scan = (v) => {
      if (Array.isArray(v)) v.forEach(scan);
      else if (v && typeof v === "object") Object.values(v).forEach(scan);
      else if (typeof v === "string" && /^[a-z_]+\.[a-z0-9_]+$/.test(v) && h?.states?.[v]) ids.add(v);
    };
    scan(this._config);
    return JSON.stringify(
      [...ids].sort().map((id) => {
        const e = h.states[id];
        return [id, e.state, e.last_updated, e.attributes?.unit_of_measurement, e.attributes?.friendly_name, e.attributes?.options, e.attributes?.finishes_at];
      }),
    );
  }
  _friendly(id) {
    const e = this._e(id);
    if (!e) return "Mangler";
    if (e.state === "on") return "Aktiv";
    if (e.state === "off") return "Deaktiv";
    if (["unknown", "unavailable"].includes(e.state)) return "Ikke tilgængelig";
    return String(e.state).replaceAll("_", " ");
  }
  _problem(i) {
    const s = String(this._state(i.entity)).toLowerCase();
    if (!this._available(i.entity)) return true;
    if (i.binary) return this._on(i.entity);
    return Number(s) > 0 || ["critical", "warn", "warning", "error", "failed"].includes(s);
  }
  _once(id, html) {
    if (!id || this._seen.has(id)) return "";
    this._seen.add(id);
    return html;
  }

  // ---- row builders ----

  _status(i) {
    return this._once(
      i.entity,
      `<button class="row interactive" data-action="status-popup" data-entity="${this._esc(i.entity)}" data-view="status" data-binary="${!!i.binary}">
        <span class="row-icon">${this._icon(i.icon)}</span>
        <span class="row-text"><b>${this._esc(i.name)}</b><small data-state>Kontrollerer…</small></span>
        <i class="dot"></i>
      </button>`,
    );
  }

  _toggle(i) {
    return this._once(
      i.entity,
      `<button class="row interactive toggle-btn" data-action="toggle" data-entity="${this._esc(i.entity)}" data-view="toggle">
        <span class="row-icon">${this._icon(i.icon || "mdi:toggle-switch-outline")}</span>
        <span class="row-text"><b>${this._esc(i.name)}</b><small data-state>Kontrollerer…</small></span>
        ${this._icon("mdi:check-circle")}
      </button>`,
    );
  }

  _number(i, label) {
    return this._once(
      i.entity,
      `<div class="row" data-entity="${this._esc(i.entity)}" data-view="number" data-sensor="${this._esc(i.sensor_entity || "")}" data-sensor-unit="${this._esc(i.sensor_unit || "")}">
        <span class="row-text"><b>${this._esc(label || i.name)}</b><small data-measured>${i.sensor_entity ? "Måler…" : ""}</small></span>
        <div class="stepper">
          <button data-action="step" data-direction="-">−</button>
          <strong data-value>—</strong>
          <button data-action="step" data-direction="+">+</button>
        </div>
      </div>`,
    );
  }

  _toggleTile(i) {
    return this._once(
      i.entity,
      `<button class="tile-btn" data-action="toggle" data-entity="${this._esc(i.entity)}" data-view="toggle" data-on-label="${this._esc(i.on_label || "Aktiv")}" data-off-label="${this._esc(i.off_label || "Deaktiv")}">
        ${this._icon(i.icon || "mdi:toggle-switch-outline")}
        <span><b>${this._esc(i.name)}</b><small data-state>Kontrollerer…</small></span>
      </button>`,
    );
  }

  _entityRow(i) {
    return this._once(
      i.entity,
      `<button class="row interactive" data-action="more" data-entity="${this._esc(i.entity)}" data-view="entity">
        <span class="row-icon">${this._icon(i.icon)}</span>
        <span class="row-text"><b>${this._esc(i.name)}</b><small data-state>Kontrollerer…</small></span>
        ${this._icon("mdi:chevron-right")}
      </button>`,
    );
  }

  _metric(i) {
    return this._once(
      i.entity,
      `<button class="row interactive" data-action="more" data-entity="${this._esc(i.entity)}" data-view="metric">
        <span class="row-icon">${this._icon(i.icon)}</span>
        <span class="row-text"><b>${this._esc(i.name)}</b></span>
        <span class="row-value" data-state>—</span>
      </button>`,
    );
  }

  // Profilvaelger + nulstil-knap for rum med en lysprofil (input_select).
  // Genbruger samme underliggende mekanik som rum-popuppernes "Nulstil": et
  // kald til script.rum_nulstil_automatisk med rummets noegle. Status-linjen
  // viser om den valgte profil faktisk er en manuel overstyring, og - hvis
  // rummet har en override-timer - hvor lang tid der er tilbage foer den
  // automatisk springer tilbage.
  //
  // Hvilken profilvaerdi der taeller som "automatisk drift" varierer fra rum
  // til rum - de fleste bruger "Automatisk", badevaerelset "Normal", og
  // garagen "Adaptiv". auto_value kommer derfor fra rummets egen config i
  // stedet for at blive gaettet ud fra en fast liste af ord.
  _profileControl(r) {
    return this._once(
      r.profile,
      `<div class="row profile-row" data-view="profile" data-entity="${this._esc(r.profile)}" data-timer="${this._esc(r.timer || "")}" data-auto-value="${this._esc(r.auto_value || "Automatisk")}">
        <span class="row-icon">${this._icon("mdi:theme-light-dark")}</span>
        <div class="row-text">
          <b>Lysprofil</b>
          <select class="profile-select" data-action="set-profile" data-entity="${this._esc(r.profile)}"></select>
          <small data-override-status>—</small>
        </div>
      </div>`,
    );
  }

  _resetButton(r) {
    return `<button class="row interactive reset-row" data-action="rum-nulstil" data-room="${this._esc(r.reset_room_key)}">
      <span class="row-icon">${this._icon("mdi:restore")}</span>
      <span class="row-text"><b>Nulstil til automatisk</b><small>Fjerner manuel override i ${this._esc(r.name)}</small></span>
    </button>`;
  }

  _panelHead(icon, title, subtitle) {
    return `<div class="panel-head">
      <ha-icon icon="${this._esc(icon || "mdi:cog-outline")}"></ha-icon>
      <div><b>${this._esc(title)}</b>${subtitle ? `<small>${subtitle}</small>` : ""}</div>
    </div>`;
  }

  // ---- pages ----

  _home() {
    const o = this._config.overview || {};
    const m = o.mode || {};
    return `<div class="page" data-page="home">
      <div class="page-panel">
        <div class="section">
          ${this._panelHead("mdi:shield-check-outline", "Systemstatus", "Kontrolleres løbende")}
          <div class="row-list">${(o.status_items || []).map((i) => this._status(i)).join("")}</div>
        </div>
        <div class="section">
          ${this._panelHead("mdi:home-switch", "Husets drift", "Vælg én samlet tilstand for hele hjemmet")}
          <div class="mode-row">${(m.options || [])
            .map(
              (x) =>
                `<button class="mode" data-action="mode" data-entity="${this._esc(m.entity)}" data-option="${this._esc(x.value)}">
                  <ha-icon icon="${this._esc(x.icon)}"></ha-icon><span>${this._esc(x.name)}</span>
                </button>`,
            )
            .join("")}</div>
        </div>
      </div>
    </div>`;
  }

  _room(r) {
    const toggles = [];
    const numbers = [];
    if (r.auto_entity) toggles.push(this._toggleTile({ entity: r.auto_entity, name: "Lysstyring", icon: "mdi:lightbulb-auto", on_label: "AUTO", off_label: "MANUEL" }));
    else if (r.automation) toggles.push(this._toggleTile({ entity: r.automation, name: "Presence-lys", icon: "mdi:motion-sensor" }));
    if (r.persistent) toggles.push(this._toggleTile({ entity: r.persistent, name: "Vedvarende", icon: "mdi:account-eye" }));
    if (r.lux_enabled) toggles.push(this._toggleTile({ entity: r.lux_enabled, name: "Lux-krav", icon: "mdi:brightness-auto" }));
    if (r.vacuum_exempt) toggles.push(this._toggleTile({ entity: r.vacuum_exempt, name: "Ej støvsuger", icon: "mdi:robot-vacuum-off" }));
    if (r.timeout) numbers.push(this._number({ entity: r.timeout }, "Sluk efter"));
    if (r.lux_threshold) numbers.push(this._number({ entity: r.lux_threshold, sensor_entity: r.lux_sensor, sensor_unit: " lx" }, "Lux-grænse"));
    if (r.delay) numbers.push(this._number({ entity: r.delay }, "Tænd efter"));
    const profileHtml = r.profile ? this._profileControl(r) : "";
    const resetHtml = r.reset_room_key ? this._resetButton(r) : "";
    return `<div class="subcard">
      ${this._panelHead(r.icon || "mdi:floor-plan", r.name, `${toggles.length + numbers.length} indstillinger`)}
      ${toggles.length ? `<div class="toggle-grid">${toggles.join("")}</div>` : ""}
      ${numbers.length ? `<div class="row-list" ${toggles.length ? 'style="margin-top:8px"' : ""}>${numbers.join("")}</div>` : ""}
      ${profileHtml || resetHtml ? `<div class="row-list" style="margin-top:8px">${profileHtml}${resetHtml}</div>` : ""}
    </div>`;
  }

  _lighting() {
    const resetDelay = this._config.reset_delay_entity
      ? `<div class="row-list" style="margin-bottom:10px">${this._number({ entity: this._config.reset_delay_entity }, "Nulstil manuel override efter tomt rum (Køkken, Spisestue, Stue)")}</div>`
      : "";
    return `<div class="page" data-page="lighting" hidden>
      <div class="page-panel">
        <div class="section">
          ${this._panelHead("mdi:motion-sensor", "Rum", "Presence, lux, lysprofil og nulstilling pr. rum")}
          ${resetDelay}
          <div class="subgrid">${(this._config.rooms || []).map((r) => this._room(r)).join("")}</div>
        </div>
        <div class="section">
          ${this._panelHead("mdi:lightbulb-night", "Ambientlys", "Nat- og orienteringslys")}
          <div class="toggle-grid">${(this._config.ambient_items || []).map((i) => this._toggleTile(i)).join("")}</div>
        </div>
      </div>
    </div>`;
  }

  _group(g) {
    if (g.kind === "toggle") {
      const items = (g.items || []).map((i) => this._toggleTile(i)).join("");
      return `<div class="subcard">
        ${this._panelHead(g.icon, g.title, g.subtitle)}
        <div class="toggle-grid">${items}</div>
      </div>`;
    }
    const items = (g.items || []).map((i) => (g.kind === "number" ? this._number(i) : this._entityRow(i))).join("");
    return `<div class="subcard">
      ${this._panelHead(g.icon, g.title, g.subtitle)}
      <div class="row-list">${items}</div>
    </div>`;
  }

  _routines() {
    return `<div class="page" data-page="routines" hidden>
      <div class="page-panel">
        <div class="subgrid">${(this._config.routine_groups || []).map((g) => this._group(g)).join("")}</div>
      </div>
    </div>`;
  }

  _scene() {
    const s = this._config.scene;
    if (!s) return "";
    const toggle = this._toggle({ entity: s.toggle_entity, name: s.toggle_name, icon: "mdi:movie-open" });
    const lights = (s.lights || [])
      .map((l) => {
        this._seen.add(l.brightness_entity);
        this._seen.add(l.color_entity);
        return `<div class="row scene-row">
          <span class="row-icon">${this._icon(l.icon)}</span>
          <span class="row-text"><b>${this._esc(l.name)}</b><small><span data-entity="${this._esc(l.brightness_entity)}" data-view="inline">—</span> · <span data-entity="${this._esc(l.color_entity)}" data-view="inline">—</span></small></span>
          <button class="scene-btn" data-action="more" data-more-entity="${this._esc(l.brightness_entity)}">Lys</button>
          <button class="scene-btn" data-action="more" data-more-entity="${this._esc(l.color_entity)}">Farve</button>
        </div>`;
      })
      .join("");
    return `<div class="section">
      ${this._panelHead("mdi:movie-open", s.title, "Samlet filmprofil")}
      <div class="row-list">${toggle}</div>
      <div class="row-list" style="margin-top:10px">${lights}</div>
    </div>`;
  }

  _equipment() {
    const sceneHtml = this._scene();
    return `<div class="page" data-page="equipment" hidden>
      <div class="page-panel">
        <div class="subgrid">${(this._config.control_groups || []).map((g) => this._group(g)).join("")}</div>
        ${sceneHtml}
      </div>
    </div>`;
  }

  _system() {
    const o = this._config.operations || {};
    const groups = (o.groups || [])
      .map(
        (g) => `<div class="subcard">
          ${this._panelHead(g.icon, g.title, g.subtitle)}
          <div class="row-list">${(g.items || [])
            .map(
              (a) => `<button class="row interactive action${a.danger ? " danger" : ""}" data-action="service" data-payload="${this._esc(JSON.stringify(a))}">
                <span class="row-icon">${this._icon(a.icon)}</span>
                <span class="row-text"><b>${this._esc(a.name)}</b><small>${this._esc(a.description || "")}</small></span>
                ${this._icon("mdi:chevron-right")}
              </button>`,
            )
            .join("")}</div>
        </div>`,
      )
      .join("");
    return `<div class="page" data-page="system" hidden>
      <div class="page-panel">
        <div class="section">
          ${this._panelHead("mdi:gauge", "Systemmålinger", "Status for kerne og hardware")}
          <div class="row-list">${(o.metrics || []).map((i) => this._metric(i)).join("")}</div>
        </div>
        <div class="section">
          ${this._panelHead("mdi:cog-outline", "Handlinger", "Genveje og sikre systemkommandoer")}
          <div class="subgrid">${groups}</div>
        </div>
      </div>
      ${o.info_path ? `<button class="back-btn" data-nav="${this._esc(o.info_path)}"><ha-icon icon="mdi:information-outline"></ha-icon><div><b>Systeminfo</b></div>${this._icon("mdi:arrow-right")}</button>` : ""}
    </div>`;
  }

  _cards() {
    const o = this._config.overview || {};
    return `<div class="page" data-page="cards" hidden>
      <div class="page-panel">
        <div class="section">
          ${this._panelHead("mdi:monitor-dashboard", "Dashboard", "Visning og betjening på vægpaneler")}
          <div class="toggle-grid">${(o.dashboard_items || []).map((i) => this._toggleTile(i)).join("")}</div>
          ${o.font_entity ? `<div class="row-list" style="margin-top:8px">${this._entityRow({ entity: o.font_entity, name: "Dashboard-font", icon: "mdi:format-font" })}</div>` : ""}
        </div>
        <div class="section">
          ${this._panelHead("mdi:view-dashboard-edit", "Dashboard", "Redigér den faelles opsaetning her - gemmes for alle dashboards paa een gang")}
          <div class="delt-omraader">
            ${DELT_KORT_OMRAADER.map(
              (omr) => `<div class="delt-omraade">
                ${this._panelHead(omr.ikon, omr.titel, omr.beskrivelse)}
                <div class="delt-editor-holder" data-omraade-holder="${omr.id}"><p class="delt-status">Henter…</p></div>
                <div class="delt-vaerktoej">
                  <button class="knap" data-action="gem-delt" data-omraade="${omr.id}">Gem globalt</button>
                  <small class="delt-status" data-omraade-gemstatus="${omr.id}"></small>
                </div>
              </div>`,
            ).join("")}
          </div>
        </div>
      </div>
    </div>`;
  }

  // ---- shell ----

  _render() {
    this._seen = new Set();
    this.shadowRoot.innerHTML = `<style>${this._styles()}</style>
    <ha-card>
      <div class="head">
        <ha-icon icon="mdi:tune-variant"></ha-icon>
        <div><strong>${this._esc(this._config.title)}</strong><span>Modes, automatik og drift samlet</span></div>
        <div class="head-spacer"></div>
        <div class="head-badge"><b data-health-summary>Kontrollerer…</b><small data-health-detail>—</small></div>
      </div>
      <div class="tabs">${TABS.map(([id, n, i]) => `<button class="tab" data-action="tab" data-tab="${id}"><ha-icon icon="${i}"></ha-icon><span>${n}</span></button>`).join("")}</div>
      ${this._home()}${this._lighting()}${this._routines()}${this._equipment()}${this._system()}${this._cards()}
    </ha-card>`;
    this._select(this._tab);
    this._monterDelteEditorer();
  }

  // Monterer den REELLE editor-webkomponent fra hvert kort (fx
  // ha-navbar-card-editor) inde i "Dashboard"-fanen, i stedet for at genopfinde
  // dens felter her. Kortets config-changed-hændelse holder blot vaerdien i
  // hukommelsen, indtil "Gem globalt" rent faktisk skriver den til filen.
  _monterDelteEditorer() {
    DELT_KORT_OMRAADER.forEach((o) => {
      const holder = this.shadowRoot.querySelector(`[data-omraade-holder="${o.id}"]`);
      if (!holder || holder.dataset.monteret) return;
      holder.dataset.monteret = "1";
      customElements.whenDefined(o.editorTag).then(() => {
        fetch(o.hentUrl, { cache: "no-cache" })
          .then((svar) => {
            if (!svar.ok) throw new Error("HTTP " + svar.status);
            return svar.json();
          })
          .then((data) => {
            this._delteVaerdier[o.id] = data;
            const el = document.createElement(o.editorTag);
            el.setConfig(data);
            if (this._hass) el.hass = this._hass;
            el.addEventListener("config-changed", (e) => { this._delteVaerdier[o.id] = e.detail.config; });
            holder.innerHTML = "";
            holder.appendChild(el);
          })
          .catch((e) => {
            holder.innerHTML = `<p class="delt-status">Kunne ikke hente ${this._esc(o.hentUrl)}: ${this._esc(e.message)}</p>`;
          });
      });
    });
  }

  async _gemDeltOmraade(id) {
    const omraade = DELT_KORT_OMRAADER.find((o) => o.id === id);
    const status = this.shadowRoot.querySelector(`[data-omraade-gemstatus="${id}"]`);
    const data = this._delteVaerdier[id];
    if (!omraade || !data) { if (status) status.textContent = "Intet at gemme endnu."; return; }
    if (status) status.textContent = "Gemmer…";
    try {
      const payload_b64 = this._utf8ToB64(JSON.stringify(data));
      // Payloaden sendes som et enkelt kommandolinje-argument, og Linux
      // afviser argumenter over 128 KB. Fang det her med en forstaaelig
      // besked i stedet for en kryptisk fejl fra containeren.
      if (payload_b64.length > 120000) {
        throw new Error(`opsaetningen er for stor (${Math.round(payload_b64.length / 1024)} KB)`);
      }
      const [domain, service] = omraade.gemService.split(".");
      // returnResponse er noedvendig: shell_command melder "udfoert" til
      // frontenden selv naar scriptet fejler. Uden svaret viste kortet
      // "Gemt" uanset om filen rent faktisk blev skrevet.
      const svar = await this._hass.callService(domain, service, { payload_b64 }, undefined, false, true);
      const res = svar && svar.response;
      if (res && res.returncode !== 0) {
        throw new Error((res.stderr || res.stdout || `kode ${res.returncode}`).trim());
      }
      if (status) status.textContent = "Gemt " + new Date().toLocaleTimeString("da-DK") + " — genindlæs for at se ændringen";
    } catch (e) {
      if (status) status.textContent = "Fejl: " + (e && e.message ? e.message : e);
    }
  }

  _utf8ToB64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }

  _find(id) {
    let out = null;
    const scan = (v) => {
      if (out) return;
      if (Array.isArray(v)) v.forEach(scan);
      else if (v && typeof v === "object") {
        if (v.entity === id) out = v;
        else Object.values(v).forEach(scan);
      }
    };
    scan(this._config);
    return out;
  }

  // Regner overstyringsstatus for et rums lysprofil ud fra profil-vaerdien og
  // (hvis rummet har en) override-timerens finishes_at. Kaldes baade fra
  // _patch() ved enhver hass-opdatering og hvert sekund fra _tickTimer, saa
  // nedtaellingen ikke staar stille selvom ingen entitet lige har aendret sig.
  _renderOverrideStatus(n) {
    const small = n.querySelector("[data-override-status]");
    if (!small) return;
    const profileEntity = n.dataset.entity;
    const timerEntity = n.dataset.timer;
    const autoValue = n.dataset.autoValue || "Automatisk";
    if (!this._available(profileEntity)) { small.textContent = "Ikke tilgængelig"; n.classList.remove("override-active"); return; }
    const profileState = this._state(profileEntity);
    if (profileState === autoValue) {
      small.textContent = "Automatisk styring aktiv";
      n.classList.remove("override-active");
      return;
    }
    n.classList.add("override-active");
    let text = `Manuel: ${profileState}`;
    const timer = timerEntity ? this._e(timerEntity) : null;
    if (timer && timer.state === "active" && timer.attributes?.finishes_at) {
      const remainMs = new Date(timer.attributes.finishes_at).getTime() - Date.now();
      if (remainMs > 0) {
        const mins = Math.floor(remainMs / 60000);
        const secs = Math.floor((remainMs % 60000) / 1000);
        text += ` · ${mins}:${String(secs).padStart(2, "0")} tilbage`;
      }
    }
    small.textContent = text;
  }

  _patch() {
    if (!this._hass || !this.shadowRoot.querySelector("ha-card")) return;
    this.shadowRoot.querySelectorAll("[data-omraade-holder] > *").forEach((el) => {
      if (el && "hass" in el) el.hass = this._hass;
    });
    const statuses = [...this.shadowRoot.querySelectorAll('[data-view="status"]')];
    let problems = 0;
    statuses.forEach((n) => {
      const i = { entity: n.dataset.entity, binary: n.dataset.binary === "true" };
      const p = this._problem(i);
      problems += p ? 1 : 0;
      n.classList.toggle("problem", p);
      n.classList.toggle("ok", !p);
      n.querySelector("[data-state]").textContent = !this._available(i.entity) ? "Ikke tilgængelig" : p ? (i.binary ? "Registreret" : `${this._state(i.entity)} kræver fokus`) : "Alt er normalt";
    });
    const sum = this.shadowRoot.querySelector("[data-health-summary]");
    const detail = this.shadowRoot.querySelector("[data-health-detail]");
    if (sum) sum.textContent = problems ? `${problems} kræver fokus` : "Alt fungerer";
    if (detail) detail.textContent = `${statuses.length - problems} af ${statuses.length} områder er OK`;
    const badge = this.shadowRoot.querySelector(".head-badge");
    if (badge) badge.classList.toggle("warn", problems > 0);

    this.shadowRoot.querySelectorAll('[data-view="toggle"]').forEach((n) => {
      const a = this._available(n.dataset.entity);
      const on = a && this._on(n.dataset.entity);
      n.classList.toggle("on", on);
      n.classList.toggle("missing", !a);
      n.querySelector("[data-state]").textContent = a ? (on ? (n.dataset.onLabel || "Aktiv") : (n.dataset.offLabel || "Deaktiv")) : "Ikke tilgængelig";
    });
    this.shadowRoot.querySelectorAll('[data-view="number"]').forEach((n) => {
      const e = this._e(n.dataset.entity);
      const unit = e?.attributes?.unit_of_measurement || "";
      n.classList.toggle("missing", !this._available(n.dataset.entity));
      n.querySelector("[data-value]").textContent = e ? `${e.state}${unit ? ` ${unit}` : ""}` : "—";
      if (n.dataset.sensor) n.querySelector("[data-measured]").textContent = `Nu ${this._state(n.dataset.sensor)}${n.dataset.sensorUnit || ""}`;
    });
    this.shadowRoot.querySelectorAll('[data-view="entity"]').forEach((n) => {
      n.classList.toggle("missing", !this._available(n.dataset.entity));
      n.querySelector("[data-state]").textContent = this._friendly(n.dataset.entity);
    });
    this.shadowRoot.querySelectorAll('[data-view="metric"]').forEach((n) => {
      const i = this._find(n.dataset.entity);
      n.classList.toggle("missing", !this._available(n.dataset.entity));
      n.querySelector("[data-state]").textContent = `${this._state(n.dataset.entity)}${i?.unit || ""}`;
    });
    this.shadowRoot.querySelectorAll('[data-view="inline"]').forEach((n) => (n.textContent = this._friendly(n.dataset.entity)));

    this.shadowRoot.querySelectorAll('[data-view="profile"]').forEach((n) => {
      const entity = n.dataset.entity;
      const e = this._e(entity);
      const sel = n.querySelector("select");
      const opts = e?.attributes?.options || [];
      const optSig = opts.join("|");
      if (sel.dataset.optSig !== optSig) {
        sel.innerHTML = opts.map((o) => `<option value="${this._esc(o)}">${this._esc(o)}</option>`).join("");
        sel.dataset.optSig = optSig;
      }
      if (e && sel.value !== e.state) sel.value = e.state;
      n.classList.toggle("missing", !this._available(entity));
      this._renderOverrideStatus(n);
    });

    const mode = this._config.overview?.mode?.entity;
    const state = mode ? this._state(mode) : "—";
    const current = this.shadowRoot.querySelector("[data-mode-current]");
    if (current) current.textContent = state;
    this.shadowRoot.querySelectorAll(".mode").forEach((n) => n.classList.toggle("active", n.dataset.option === state));
  }

  _select(tab) {
    if (!TABS.some(([id]) => id === tab)) tab = "home";
    this._tab = tab;
    this.shadowRoot.querySelectorAll("[data-tab]").forEach((b) => {
      const active = b.dataset.tab === tab;
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", active);
    });
    this.shadowRoot.querySelectorAll("[data-page]").forEach((p) => {
      p.hidden = p.dataset.page !== tab;
    });
  }

  _call(s, d = {}, t) {
    const [domain, name] = s.split(".");
    return this._hass?.callService(domain, name, d, t);
  }
  _more(id) {
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: id }, bubbles: true, composed: true }));
  }
  _nav(path) {
    history.pushState(null, "", path);
    window.dispatchEvent(new Event("location-changed"));
  }

  _openStatusPopup(entityId) {
    this._closeStatusPopup();
    const item = this._find(entityId) || { entity: entityId, name: "Systemstatus" };
    const entity = this._e(entityId);
    const problem = this._problem(item);
    const raw = item.detail_attribute ? entity?.attributes?.[item.detail_attribute] : null;
    let details = Array.isArray(raw) ? raw : String(raw ?? "").split(/\n|,\s*/);
    details = details.map((value) => String(value).trim()).filter((value) => value && value.toLowerCase() !== "ingen");
    if (!details.length && problem) {
      details = [item.binary ? "Sensoren har registreret en aktiv alarm." : `Statuskilden melder ${this._state(entityId)}.`];
    }
    const count = problem ? (item.binary ? 1 : Math.max(Number(this._state(entityId)) || 0, details.length)) : 0;
    const backdrop = document.createElement("div");
    backdrop.className = "ha-settings-status-backdrop";
    backdrop.style.cssText = "position:fixed;inset:0;z-index:999999;background:rgba(8,12,18,.68);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:16px";
    const panel = document.createElement("section");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", `${item.name || "Systemstatus"} detaljer`);
    panel.style.cssText = "position:relative;width:min(100%,560px);max-height:92vh;overflow:auto;padding:22px;border:1px solid var(--dashboard-border-neutral,var(--divider-color,rgba(127,145,165,.24)));border-left:calc(var(--dashboard-left-accent-width, 1) * 4px) solid var(--dashboard-danger,var(--error-color,#ef4444));border-radius:20px;background:var(--surface,var(--ha-card-background,var(--card-background-color,#111820)));box-shadow:0 28px 70px rgba(0,0,0,.5);color:var(--primary-text-color,#fff)";
    const close = document.createElement("button");
    close.textContent = "Luk ✕";
    close.setAttribute("aria-label", "Luk problemoversigt");
    close.style.cssText = "position:absolute;top:12px;right:12px;min-height:42px;padding:9px 14px;border:1px solid var(--divider-color,rgba(255,255,255,.14));border-radius:999px;background:var(--card-background-color,rgba(8,12,18,.92));color:var(--primary-text-color,#fff);font:inherit;font-size:13px;font-weight:800;cursor:pointer";
    const title = this._esc(item.name || "Systemstatus");
    const icon = this._esc(item.icon || entity?.attributes?.icon || "mdi:alert-circle-outline");
    const detailHtml = problem
      ? `<div style="display:grid;gap:8px;margin-top:16px">${details.map((value) => `<div style="padding:11px 12px;border:1px solid color-mix(in srgb,var(--error-color,#ef4444) 28%,transparent);border-radius:12px;background:color-mix(in srgb,var(--error-color,#ef4444) 9%,transparent);font-size:13px;line-height:1.45">${this._esc(value)}</div>`).join("")}</div>`
      : `<div style="margin-top:16px;padding:14px;border-radius:12px;background:color-mix(in srgb,var(--success-color,#20e3a2) 10%,transparent);color:var(--success-color,#20e3a2);font-weight:800">Ingen aktive problemer.</div>`;
    panel.innerHTML = `<div style="display:flex;align-items:center;gap:11px;padding-right:90px"><ha-icon icon="${icon}" style="--mdc-icon-size:28px;color:${problem ? "var(--error-color,#ef4444)" : "var(--success-color,#20e3a2)"}"></ha-icon><div><div style="font-size:17px;font-weight:900">${title}</div><div style="margin-top:3px;color:var(--secondary-text-color,#a7b2c2);font-size:12px">${problem ? `${count} ${count === 1 ? "problem kræver" : "problemer kræver"} opmærksomhed` : "Alt er normalt"}</div></div></div>${detailHtml}<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--divider-color,rgba(127,145,165,.2));font-size:12px;line-height:1.5;color:var(--secondary-text-color,#a7b2c2)"><b style="display:block;margin-bottom:3px;color:var(--primary-text-color,#fff)">Det skal du kigge efter</b>${this._esc(item.advice || "Kontrollér den viste enhed i Home Assistant, dens forbindelse og seneste opdatering.")}</div>`;
    panel.appendChild(close);
    backdrop.appendChild(panel);
    backdrop.addEventListener("click", (event) => { if (event.target === backdrop) this._closeStatusPopup(); });
    close.addEventListener("click", () => this._closeStatusPopup());
    this._statusEscHandler = (event) => { if (event.key === "Escape") this._closeStatusPopup(); };
    document.addEventListener("keydown", this._statusEscHandler);
    document.body.appendChild(backdrop);
    this._statusPopup = backdrop;
    close.focus();
  }

  _closeStatusPopup() {
    this._statusPopup?.remove();
    this._statusPopup = null;
    if (this._statusEscHandler) document.removeEventListener("keydown", this._statusEscHandler);
    this._statusEscHandler = null;
  }

  _change(e) {
    const el = e.target.closest?.("[data-action='set-profile']");
    if (!el) return;
    this._call("input_select.select_option", { option: el.value }, { entity_id: el.dataset.entity });
  }

  _click(e) {
    const b = e.target.closest?.("[data-action]");
    if (!b) return;
    const a = b.dataset.action;
    if (a === "tab") this._select(b.dataset.tab);
    else if (a === "toggle" && this._available(b.dataset.entity)) this._call("homeassistant.toggle", {}, { entity_id: b.dataset.entity });
    else if (a === "status-popup") this._openStatusPopup(b.dataset.entity);
    else if (a === "more") this._more(b.dataset.moreEntity || b.dataset.entity);
    else if (a === "mode") this._call("input_select.select_option", { option: b.dataset.option }, { entity_id: b.dataset.entity });
    else if (a === "rum-nulstil") this._call("script.rum_nulstil_automatisk", { room: b.dataset.room });
    else if (a === "step")
      this._call(`input_number.${b.dataset.direction === "+" ? "increment" : "decrement"}`, {}, { entity_id: b.closest("[data-entity]").dataset.entity });
    else if (a === "nav") this._nav(b.dataset.path);
    else if (a === "gem-delt") this._gemDeltOmraade(b.dataset.omraade);
    else if (a === "service") {
      const i = JSON.parse(b.dataset.payload);
      if (i.confirm && !confirm(i.confirm)) return;
      if (i.service) this._call(i.service, i.data || {}, i.entity ? { entity_id: i.entity } : i.target);
      else if (i.path) this._nav(i.path);
    }
  }

  _styles() {
    return `
      :host{display:block;--good:var(--dashboard-success, var(--success-color, #20e3a2));--warn:var(--dashboard-warning, var(--warning-color, #f59e0b));--danger:var(--dashboard-danger, var(--error-color, #ef4444));--accent:var(--dashboard-accent, var(--info-color, #38bdf8));--edge:var(--dashboard-border-neutral, var(--divider-color, rgba(127,145,165,.2)));--muted:var(--dashboard-icon-muted, var(--disabled-text-color, #64748b));--settings-surface:var(--dashboard-card-bg, var(--ha-card-background, var(--card-background-color, #111820)));--settings-solid:var(--card-background-color, var(--ha-card-background, #111820));--settings-neutral:linear-gradient(180deg,color-mix(in srgb,var(--primary-text-color) 4%,transparent),transparent),var(--settings-surface);--settings-info:var(--dashboard-surface-info-dark, linear-gradient(180deg,color-mix(in srgb,var(--accent) 12%,transparent),transparent),var(--settings-surface));--settings-positive:var(--dashboard-surface-positive-dark, linear-gradient(180deg,color-mix(in srgb,var(--good) 12%,transparent),transparent),var(--settings-surface));--settings-negative:var(--dashboard-surface-negative-dark, linear-gradient(180deg,color-mix(in srgb,var(--danger) 12%,transparent),transparent),var(--settings-surface));--settings-warning:var(--dashboard-surface-warn-dark, linear-gradient(180deg,color-mix(in srgb,var(--warn) 12%,transparent),transparent),var(--settings-surface));--settings-selected:var(--dashboard-tab-selected-bg, linear-gradient(180deg,color-mix(in srgb,var(--accent) 20%,transparent),color-mix(in srgb,var(--accent) 9%,transparent)),var(--settings-surface));color:var(--primary-text-color)}
      *{box-sizing:border-box}
      button{font:inherit;color:inherit}
      button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
      ha-card{padding:16px;border-radius:22px;background:radial-gradient(circle at 94% 0,color-mix(in srgb,var(--accent) 10%,transparent),transparent 34%),var(--settings-surface);border:var(--ha-card-border-width,1px) solid var(--ha-card-border-color,var(--edge));color:var(--primary-text-color);box-shadow:var(--dashboard-shadow-deep, var(--ha-card-box-shadow, 0 18px 50px rgba(0,0,0,.22)))}
      .head{display:flex;align-items:center;gap:12px;margin-bottom:14px}
      .head ha-icon{--mdc-icon-size:24px;color:var(--accent)}
      .head strong{display:block;font-size:16px}
      .head span{display:block;color:var(--secondary-text-color);font-size:12px;margin-top:2px}
      .head-spacer{flex:1}
      .head-badge{flex:0 0 auto;text-align:right}
      .head-badge b{display:block;font-size:13px;font-weight:800}
      .head-badge small{display:block;margin-top:2px;color:var(--secondary-text-color);font-size:10.5px}
      .head-badge.warn b{color:var(--danger)}
      .tabs{display:flex;gap:6px;margin-bottom:16px;overflow-x:auto;padding-bottom:2px}
      .tab{flex:1;min-width:0;display:flex;align-items:center;justify-content:center;gap:6px;padding:10px 8px;border-radius:12px;border:1px solid var(--edge);background:transparent;color:var(--secondary-text-color);font-size:12.5px;font-weight:800;cursor:pointer;white-space:nowrap}
      .tab span{overflow:hidden;text-overflow:ellipsis}
      .tab ha-icon{--mdc-icon-size:16px}
      .tab.active{color:var(--dashboard-icon-active, #fff);background:var(--settings-selected);border-color:var(--dashboard-tab-selected-border, var(--accent));box-shadow:0 0 14px color-mix(in srgb,var(--accent) 12%,transparent)}
      .page[hidden]{display:none}
      .page-panel{border:1px solid var(--edge);border-radius:16px;padding:14px;background:var(--settings-info)}
      .section{padding-top:14px;margin-top:14px;border-top:1px solid var(--edge)}
      .section:first-child{padding-top:0;margin-top:0;border-top:0}
      .subgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;align-items:start}
      .subcard{min-width:0;border:1px solid color-mix(in srgb,var(--accent) 14%,transparent);border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--accent);border-radius:13px;padding:11px;background:var(--settings-neutral);box-shadow:0 4px 14px rgba(0,0,0,.1)}
      .panel-head{display:flex;align-items:center;gap:10px;margin-bottom:12px}
      .panel-head ha-icon{--mdc-icon-size:18px;color:var(--accent)}
      .panel-head b{display:block;font-size:13px}
      .panel-head small{display:block;margin-top:2px;color:var(--secondary-text-color);font-size:11px}
      .row-list{display:flex;flex-direction:column;gap:8px}
      .row{position:relative;display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--accent) 14%,transparent);border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--accent);border-radius:12px;background:var(--settings-neutral);box-shadow:0 4px 12px rgba(0,0,0,.1);width:100%;text-align:left;color:inherit;font:inherit}
      .row.interactive{cursor:pointer}
      .row.missing{opacity:.6}
      .row-icon{width:30px;height:30px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex:0 0 auto;background:color-mix(in srgb,var(--muted) 14%,transparent);color:var(--muted)}
      .row-icon ha-icon{--mdc-icon-size:15px}
      .row-text{flex:1;min-width:0}
      .row-text b{display:block;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .row-text small{display:block;margin-top:2px;color:var(--secondary-text-color);font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .row-value{font-size:12px;font-weight:800;color:var(--primary-text-color);flex:0 0 auto}
      .row > ha-icon{--mdc-icon-size:16px;color:var(--muted);flex:0 0 auto}
      .row[data-view="status"] .row-icon{background:color-mix(in srgb,var(--good) 14%,transparent);color:var(--good)}
      .row[data-view="status"].problem .row-icon{background:color-mix(in srgb,var(--danger) 14%,transparent);color:var(--danger)}
      .row[data-view="status"] .dot{width:7px;height:7px;border-radius:50%;background:var(--good);flex:0 0 auto}
      .row[data-view="status"].problem .dot{background:var(--danger);box-shadow:0 0 6px var(--danger)}
      .toggle-btn{border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid transparent}
      .toggle-btn .row-icon{color:var(--muted)}
      .toggle-btn > ha-icon:last-child{--mdc-icon-size:18px;color:var(--edge);flex:0 0 auto}
      .row.on.toggle-btn{background:var(--settings-positive);border-left-color:var(--good)}
      .row.on.toggle-btn .row-icon{background:color-mix(in srgb,var(--good) 14%,transparent);color:var(--good)}
      .row.on.toggle-btn > ha-icon:last-child{color:var(--good)}
      .toggle-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px}
      .tile-btn{position:relative;display:flex;align-items:center;gap:10px;min-height:54px;padding:9px 12px;border:1px solid color-mix(in srgb,var(--accent) 14%,transparent);border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--accent);border-radius:14px;background:var(--settings-neutral);box-shadow:0 4px 12px rgba(0,0,0,.1);cursor:pointer;min-width:0}
      .tile-btn ha-icon{--mdc-icon-size:20px;color:var(--muted);flex:0 0 auto}
      .tile-btn span{min-width:0;text-align:left}
      .tile-btn b{display:block;font-size:11.5px;font-weight:700;color:var(--primary-text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .tile-btn small{display:block;margin-top:2px;font-size:9.5px;color:var(--secondary-text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .tile-btn.on{border-color:color-mix(in srgb,var(--good) 52%,transparent);border-left-color:var(--good);background:var(--settings-positive);box-shadow:0 4px 12px rgba(0,0,0,.1),0 0 16px color-mix(in srgb,var(--good) 12%,transparent)}
      .tile-btn.on ha-icon{color:var(--good)}
      .tile-btn.on small{color:var(--good)}
      .tile-btn.missing{opacity:.5}
      .stepper{display:flex;align-items:center;gap:8px;flex:0 0 auto}
      .stepper button{width:26px;height:26px;border-radius:8px;border:1px solid var(--edge);background:color-mix(in srgb,var(--accent) 10%,transparent);color:var(--accent);font-size:15px;font-weight:900;cursor:pointer;line-height:1}
      .stepper strong{min-width:56px;text-align:center;font-size:11.5px;font-weight:800}
      .row[data-view="entity"] .row-icon,.row[data-view="metric"] .row-icon{color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,transparent)}
      .mode-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}
      .mode{display:flex;align-items:center;justify-content:center;gap:7px;min-height:44px;padding:9px 13px;border-radius:12px;border:1px solid var(--edge);background:var(--settings-neutral);color:var(--secondary-text-color);font-size:11.5px;font-weight:800;cursor:pointer;white-space:nowrap}
      .mode ha-icon{--mdc-icon-size:15px}
      .mode.active{color:var(--dashboard-icon-active, #fff);background:var(--settings-selected);border-color:var(--dashboard-tab-selected-border, var(--accent))}
      .scene-row{gap:8px}
      .scene-btn{flex:0 0 auto;padding:6px 10px;border-radius:999px;border:1px solid var(--edge);background:var(--settings-info);color:var(--accent);font-size:10.5px;font-weight:800;cursor:pointer}
      .row.action .row-icon{color:var(--warn);background:color-mix(in srgb,var(--warn) 14%,transparent)}
      .row.action.danger .row-icon{color:var(--danger);background:color-mix(in srgb,var(--danger) 14%,transparent)}
      .row.action{background:var(--settings-warning);border-left-color:var(--warn)}
      .row.action.danger{background:var(--settings-negative);border-left-color:var(--danger)}
      .row.action.danger .row-text b{color:var(--danger)}
      .back-btn{display:flex;align-items:center;gap:10px;width:100%;padding:13px 14px;border-radius:15px;border:1px solid var(--edge);background:var(--settings-info);color:var(--primary-text-color);cursor:pointer;text-align:left}
      .back-btn ha-icon:first-child{--mdc-icon-size:20px;color:var(--accent)}
      .back-btn div{flex:1}
      .back-btn ha-icon:last-child{--mdc-icon-size:16px;color:var(--muted)}
      button:hover{border-color:color-mix(in srgb,var(--accent) 35%,var(--edge))}
      button:active{transform:translateY(1px)}
      .delt-omraader{display:grid;gap:14px}
      .delt-omraade{border:1px solid color-mix(in srgb,var(--accent) 14%,transparent);border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--accent);border-radius:13px;padding:12px;background:var(--settings-neutral)}
      .delt-editor-holder{margin-top:8px}
      .delt-vaerktoej{display:flex;align-items:center;gap:12px;margin-top:12px}
      .delt-status{color:var(--secondary-text-color);font-size:11.5px}
      .knap{min-height:38px;padding:0 14px;border:1px solid var(--accent);border-radius:10px;background:transparent;color:var(--accent);font:inherit;font-weight:800;cursor:pointer}
      .knap:hover{background:color-mix(in srgb,var(--accent) 12%,transparent)}
      .profile-row{align-items:flex-start}
      .profile-row .row-text{display:flex;flex-direction:column;gap:4px}
      .profile-select{margin-top:2px;width:100%;min-height:34px;padding:5px 8px;border:1px solid var(--edge);border-radius:8px;background:var(--settings-solid);color:var(--primary-text-color);font:inherit;font-size:11.5px}
      .profile-row[data-view="profile"] small{white-space:normal}
      .profile-row.override-active{border-left-color:var(--warn);background:var(--settings-warning)}
      .profile-row.override-active [data-override-status]{color:var(--warn);font-weight:700}
      .reset-row .row-icon{color:var(--accent)}
      .reset-row:hover .row-icon{color:var(--warn)}
      @media(max-width:650px){.tab span{display:none}.tab{padding:10px 4px}.subgrid{grid-template-columns:1fr}}
      @media(prefers-reduced-motion:reduce){*{transition:none!important}}
    `;
  }
}

class HASettingsCenterCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._sig = "";
  }
  setConfig(config) {
    this._config = config;
    const s = JSON.stringify(config);
    if (s !== this._sig) {
      this._sig = s;
      this._render();
    }
  }
  set hass(hass) {
    this._hass = hass;
  }
  _render() {
    this.shadowRoot.innerHTML = `<style>
      :host{display:block;padding:4px}
      .editor{display:grid;gap:12px;color:var(--primary-text-color)}
      label{display:block;margin-bottom:4px;color:var(--secondary-text-color);font-size:11px}
      input,select,textarea{box-sizing:border-box;width:100%;padding:9px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:var(--primary-text-color);font:inherit}
      textarea{min-height:260px;font-family:monospace;font-size:11.5px}
    </style>
    <div class="editor">
      <div><label>Titel</label><input id="title" value="${String(this._config?.title || "Indstillinger").replace(/"/g, "&quot;")}"></div>
      <div><label>Startfane</label><select id="tab">${TABS.map(([id, n]) => `<option value="${id}" ${this._config?.default_tab === id ? "selected" : ""}>${n}</option>`).join("")}</select></div>
      <div><label>Avanceret konfiguration (JSON)</label><textarea id="json">${JSON.stringify(this._config, null, 2)}</textarea></div>
    </div>`;
    this.shadowRoot.querySelector("#title").onchange = (e) => this._emit({ ...this._config, title: e.target.value });
    this.shadowRoot.querySelector("#tab").onchange = (e) => this._emit({ ...this._config, default_tab: e.target.value });
    this.shadowRoot.querySelector("#json").onchange = (e) => {
      try {
        this._emit(JSON.parse(e.target.value));
      } catch {
        e.target.setCustomValidity("Ugyldig JSON");
        e.target.reportValidity();
      }
    };
  }
  _emit(config) {
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }
}

if (!customElements.get("ha-settings-center-card")) customElements.define("ha-settings-center-card", HASettingsCenterCard);
if (!customElements.get("ha-settings-center-card-editor")) customElements.define("ha-settings-center-card-editor", HASettingsCenterCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha-settings-center-card",
  name: "HA Settings Center Card",
  description: "Samlet indstillingscenter uden gentagne funktioner",
  preview: true,
});
console.info(
  `%c HA SETTINGS CENTER %c v${VERSION} `,
  "color:#fff;background:#2563eb;font-weight:700",
  "color:#60a5fa;background:#0f172a",
);
