import "../ha-ai-usage-card/ha-card-list-editor.js";

const VERSION = "0.1.1";

class HABambuLabDashboardCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._signature = "";
    this._built = false;
  }

  static getStubConfig() {
    return {
      title: "3D-printer",
      subtitle: "Print, materialer og strøm samlet ét sted",
      camera: "",
      secondary_camera: "",
      image: "",
      power_switch: "",
      power: "",
      daily_energy: "",
      monthly_energy: "",
      ams_power: "",
      ams_energy: "",
      online: "",
      status: "",
      stage: "",
      task: "",
      progress: "",
      current_layer: "",
      total_layers: "",
      remaining_time: "",
      end_time: "",
      nozzle_temperature: "",
      nozzle_target: "",
      bed_temperature: "",
      bed_target: "",
      active_tray: "",
      ams_humidity: "",
      ams_temperature: "",
      ams_trays: [],
      chamber_light: "",
      speed: "",
      pause_button: "",
      resume_button: "",
      stop_button: "",
      error: "",
      hms_error: "",
      aux_fan: "",
      chamber_fan: "",
      cooling_fan: "",
      animation: true,
      show_camera: true,
      show_ams: true,
    };
  }

  static getConfigElement() {
    const editor = document.createElement("ha-card-list-editor");
    editor.definition = {
      roots: [
        { key: "title", label: "Titel" }, { key: "subtitle", label: "Undertitel" },
        ...["camera","secondary_camera","image","power_switch","power","daily_energy","monthly_energy","ams_power","ams_energy","online","status","stage","task","progress","current_layer","total_layers","remaining_time","end_time","nozzle_temperature","nozzle_target","bed_temperature","bed_target","active_tray","ams_humidity","ams_temperature","chamber_light","speed","pause_button","resume_button","stop_button","error","hms_error","aux_fan","chamber_fan","cooling_fan"].map((key) => ({ key, label: key.replaceAll("_", " "), type: "entity" })),
        { key: "animation", label: "Animation", type: "boolean" },
        { key: "show_camera", label: "Vis kamera", type: "boolean" },
        { key: "show_ams", label: "Vis AMS", type: "boolean" },
      ],
      collections: [{ key: "ams_trays", label: "AMS-bakker", itemLabel: "bakke", defaults: { name: "Bakke" }, fields: [{ key: "name", label: "Navn" }, { key: "entity", label: "Entity", type: "entity" }, { key: "color", label: "Farve" }] }],
    };
    return editor;
  }

  setConfig(config) {
    this._config = { ...HABambuLabDashboardCard.getStubConfig(), ...config };
    this._signature = "";
    this._built = false;
    this._build();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._built) this._build();
    const ids = this._entityIds();
    const signature = JSON.stringify(ids.map((id) => [id, hass?.states?.[id]?.state, hass?.states?.[id]?.last_updated]));
    if (signature === this._signature) return;
    this._signature = signature;
    this._update();
  }

  getCardSize() { return 9; }
  getGridOptions() { return { rows: "auto", columns: 12, min_columns: 6 }; }
  _entityIds() { return [...new Set([...Object.entries(this._config).filter(([key]) => !["title","subtitle"].includes(key)).flatMap(([, value]) => typeof value === "string" && value.includes(".") ? [value] : []), ...(this._config.ams_trays || []).map((tray) => tray.entity)].filter(Boolean))]; }
  _state(id) { return id ? this._hass?.states?.[id] : undefined; }
  _value(id) { const state = this._state(id)?.state; return state && !["unknown","unavailable"].includes(state) ? state : "—"; }
  _number(id) { const value = Number(this._state(id)?.state); return Number.isFinite(value) ? value : undefined; }
  _escape(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[char]); }
  _fmt(value, digits = 0) { return value === undefined ? "—" : value.toLocaleString(this._hass?.locale?.language || "da-DK", { maximumFractionDigits: digits }); }
  _unit(id) { return this._state(id)?.attributes?.unit_of_measurement || ""; }
  _active() { return ["printing","running","pause","paused"].includes(String(this._value(this._config.status)).toLowerCase()) || this._number(this._config.progress) > 0 && this._number(this._config.progress) < 100; }
  _error() { return [this._config.error, this._config.hms_error].some((id) => this._state(id)?.state === "on"); }
  _text(key, value) { const node = this.shadowRoot?.querySelector(`[data-value="${key}"]`); if (node) node.textContent = value; }
  _metric(key, id, digits = 0) { this._text(key, `${this._fmt(this._number(id), digits)}${this._unit(id) ? ` ${this._unit(id)}` : ""}`); }
  _relativeTime(id) { const raw = this._value(id); if (raw === "—") return "—"; const date = new Date(raw); return Number.isFinite(date.getTime()) ? date.toLocaleTimeString(this._hass?.locale?.language || "da-DK", { hour: "2-digit", minute: "2-digit" }) : raw; }

  _build() {
    if (!this._config) return;
    const showCamera = this._config.show_camera !== false;
    const showAms = this._config.show_ams !== false;
    const trayHtml = (this._config.ams_trays || []).map((tray, index) => `<div class="tray" data-tray="${index}" style="--tray:${this._escape(tray.color || "var(--accent)")}"><i></i><span>${this._escape(tray.name || `Bakke ${index + 1}`)}</span><strong data-value="tray-${index}">—</strong></div>`).join("");
    const fanHtml = [["aux_fan","Hjælpeblæser"],["chamber_fan","Kammerblæser"],["cooling_fan","Køleblæser"]].filter(([key]) => this._config[key]).map(([key,label]) => `<button class="fan" data-entity="${this._escape(this._config[key])}"><ha-icon icon="mdi:fan"></ha-icon><span>${label}</span><strong data-value="${key}">—</strong></button>`).join("");
    const visualHtml = showCamera ? `<section class="visual"><img alt="Printerkamera"><div class="camera-switch"><button class="active" data-camera="0"><ha-icon icon="mdi:camera-overhead"></ha-icon>Top</button><button data-camera="1"><ha-icon icon="mdi:camera-side"></ha-icon>Side</button></div><div class="visual-shade"><div class="task" data-value="task">—</div><div class="stage" data-value="stage">—</div><div class="progress-row"><div class="progress"><i></i></div><strong data-value="progress">—</strong></div></div></section>` : "";
    const amsHtml = showAms ? `<section class="panel"><div class="panel-title"><ha-icon icon="mdi:tray-full"></ha-icon>AMS · <span data-value="ams-climate">—</span></div><div class="trays">${trayHtml || '<div class="stage">Tilføj AMS-bakker i editoren</div>'}</div></section>` : "";
    this.shadowRoot.innerHTML = `<style>
      :host{display:block;--accent:var(--dashboard-accent,var(--primary-color,#38bdf8));--good:var(--dashboard-success,var(--success-color,#20e3a2));--warn:var(--dashboard-warning,var(--warning-color,#f59e0b));--danger:var(--dashboard-danger,var(--error-color,#ef4444));--muted:var(--secondary-text-color,#8b99aa);--surface:var(--dashboard-card-bg,var(--ha-card-background,var(--card-background-color,#111820)));--edge:var(--dashboard-border-neutral,var(--divider-color,rgba(127,145,165,.18)))}*{box-sizing:border-box}button{font:inherit;color:inherit}ha-card{overflow:hidden;border:1px solid var(--edge);border-left:4px solid var(--accent);border-radius:24px;background:linear-gradient(145deg,color-mix(in srgb,var(--surface) 96%,var(--accent) 4%),var(--surface));color:var(--primary-text-color);box-shadow:var(--dashboard-shadow-deep,var(--ha-card-box-shadow))}.shell{padding:20px}.head{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:14px}.title{display:flex;align-items:center;gap:11px}.title-icon{display:grid;place-items:center;width:44px;height:44px;border-radius:14px;background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent)}.title-icon ha-icon{--mdc-icon-size:27px}.eyebrow{color:var(--accent);font-size:8px;font-weight:900;letter-spacing:.15em;text-transform:uppercase}.title h2{margin:3px 0 0;font-size:22px}.title small{display:block;margin-top:2px;color:var(--muted);font-size:10px}.health{display:flex;align-items:center;gap:7px;padding:7px 11px;border-radius:99px;background:color-mix(in srgb,var(--good) 12%,transparent);color:var(--good);font-size:10px;font-weight:850}.health i{width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 10px currentColor}.health.active i{animation:pulse 1.4s ease-in-out infinite}.health.error{background:color-mix(in srgb,var(--danger) 13%,transparent);color:var(--danger)}
      .main{display:grid;gap:13px}.main.no-camera{grid-template-columns:1fr}.workspace{display:grid;grid-template-columns:minmax(0,1.14fr) minmax(270px,.86fr);gap:13px;margin-top:13px;align-items:start}.bambu,.ams-side{display:grid;gap:10px}.visual,.panel{border:1px solid var(--edge);border-radius:18px;background:color-mix(in srgb,var(--surface) 91%,black 9%);overflow:hidden}.visual{position:relative;min-height:330px}.visual img{display:block;width:100%;height:100%;min-height:330px;object-fit:cover;background:#080b0f}.visual-shade{position:absolute;inset:auto 0 0;padding:54px 16px 15px;background:linear-gradient(transparent,rgba(4,7,11,.92))}.task{overflow:hidden;font-size:17px;font-weight:850;text-overflow:ellipsis;white-space:nowrap}.stage{margin-top:3px;color:var(--muted);font-size:10px;text-transform:capitalize}.progress-row{display:flex;align-items:center;gap:10px;margin-top:12px}.progress{height:8px;flex:1;overflow:hidden;border-radius:8px;background:rgba(255,255,255,.12)}.progress i{display:block;width:var(--progress,0%);height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--accent),var(--good));box-shadow:0 0 12px var(--accent);transition:width .8s ease}.progress-row strong{min-width:40px;text-align:right}.panel{padding:13px}.panel-title{display:flex;align-items:center;gap:7px;margin-bottom:10px;color:var(--muted);font-size:9px;font-weight:900;letter-spacing:.09em;text-transform:uppercase}.panel-title ha-icon{--mdc-icon-size:17px;color:var(--accent)}.metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.metric{position:relative;min-width:0;padding:10px;border-left:3px solid var(--tone,var(--accent));border-radius:11px;background:linear-gradient(145deg,color-mix(in srgb,var(--tone,var(--accent)) 8%,transparent),rgba(255,255,255,.02))}.metric span{display:block;color:var(--muted);font-size:8px}.metric strong{display:block;overflow:hidden;margin-top:4px;font-size:15px;text-overflow:ellipsis;white-space:nowrap}.temperatures{display:grid;grid-template-columns:1fr 1fr;gap:7px}.temperature{padding:10px;border-left:3px solid var(--warn);border-radius:11px;background:color-mix(in srgb,var(--warn) 7%,transparent)}.temperature span{display:block;color:var(--muted);font-size:8px}.temperature strong{display:block;margin-top:3px;font-size:18px}.temperature small{color:var(--muted);font-size:9px}.trays{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.tray{position:relative;min-width:0;padding:9px 9px 9px 13px;border-radius:10px;background:rgba(255,255,255,.035)}.tray i{position:absolute;left:0;top:7px;bottom:7px;width:4px;border-radius:4px;background:var(--tray);box-shadow:0 0 8px var(--tray)}.tray span,.tray strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tray span{color:var(--muted);font-size:7px}.tray strong{margin-top:3px;font-size:10px}.fans{display:grid;gap:7px}.fan{display:grid;grid-template-columns:30px 1fr auto;align-items:center;gap:8px;width:100%;padding:9px;border:0;border-radius:11px;background:rgba(255,255,255,.035);color:inherit;text-align:left;cursor:pointer}.fan ha-icon{color:var(--accent)}.fan.on ha-icon{animation:spin 1.2s linear infinite}.fan span{font-size:9px;color:var(--muted)}.fan strong{font-size:11px}.energy{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.energy .metric{padding:11px}.controls{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.controls button{display:flex;align-items:center;justify-content:center;gap:6px;min-height:43px;padding:7px;border:1px solid var(--edge);border-left:3px solid var(--tone,var(--accent));border-radius:12px;background:color-mix(in srgb,var(--tone,var(--accent)) 8%,var(--surface));cursor:pointer;font-size:9px;font-weight:800}.controls button:hover{background:color-mix(in srgb,var(--tone,var(--accent)) 15%,var(--surface))}.controls button ha-icon{--mdc-icon-size:18px}.controls .danger{--tone:var(--danger)}.controls .good{--tone:var(--good)}.controls .warn{--tone:var(--warn)}.controls button[disabled]{opacity:.38;cursor:not-allowed}.printing .title-icon{animation:printerFloat 2.8s ease-in-out infinite}.printing .progress i{animation:flow 1.5s linear infinite;background-size:180% 100%}.no-animation *{animation:none!important;transition:none!important}@keyframes pulse{50%{opacity:.4;transform:scale(1.5)}}@keyframes printerFloat{50%{transform:translateY(-3px);filter:drop-shadow(0 0 8px var(--accent))}}@keyframes flow{to{background-position:-180% 0}}@keyframes spin{to{transform:rotate(360deg)}}
      .camera-switch{position:absolute;z-index:3;top:12px;right:12px;display:flex;gap:6px;padding:5px;border:1px solid rgba(255,255,255,.13);border-radius:14px;background:rgba(5,9,14,.72);box-shadow:0 8px 22px rgba(0,0,0,.28);backdrop-filter:blur(12px)}.camera-switch button{display:flex;align-items:center;gap:5px;padding:7px 10px;border:0;border-radius:10px;background:transparent;color:rgba(255,255,255,.7);font-size:9px;font-weight:850;cursor:pointer}.camera-switch button.active{background:color-mix(in srgb,var(--accent) 25%,rgba(255,255,255,.06));color:white;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 50%,transparent)}.camera-switch ha-icon{--mdc-icon-size:16px}
      @media(max-width:760px){.shell{padding:13px}.head{align-items:flex-start}.title h2{font-size:18px}.title small{max-width:210px}.workspace{grid-template-columns:1fr}.visual,.visual img{min-height:220px}.energy{grid-template-columns:repeat(2,1fr)}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
    </style><ha-card><div class="shell"><header class="head"><div class="title"><span class="title-icon"><ha-icon icon="mdi:printer-3d-nozzle"></ha-icon></span><div><div class="eyebrow">Bambu Lab</div><h2>${this._escape(this._config.title)}</h2><small>${this._escape(this._config.subtitle)}</small></div></div><div class="health"><i></i><span data-value="health">Afventer data</span></div></header><div class="main ${showCamera ? "" : "no-camera"}">${visualHtml}<div class="side"><section class="panel"><div class="panel-title"><ha-icon icon="mdi:progress-clock"></ha-icon>Printstatus</div><div class="metrics"><div class="metric"><span>Lag</span><strong data-value="layers">—</strong></div><div class="metric"><span>Resterende</span><strong data-value="remaining">—</strong></div><div class="metric"><span>Forventet færdig</span><strong data-value="end">—</strong></div><div class="metric"><span>Hastighed</span><strong data-value="speed">—</strong></div></div></section><section class="panel"><div class="panel-title"><ha-icon icon="mdi:thermometer-lines"></ha-icon>Temperaturer</div><div class="temperatures"><div class="temperature"><span>Dyse</span><strong><b data-value="nozzle">—</b>° <small>/ <span data-value="nozzle-target">—</span>°</small></strong></div><div class="temperature"><span>Printbed</span><strong><b data-value="bed">—</b>° <small>/ <span data-value="bed-target">—</span>°</small></strong></div></div></section>${amsHtml}</div></div><div class="energy"><div class="metric" style="--tone:var(--good)"><span>Printer nu</span><strong data-value="power">—</strong></div><div class="metric"><span>Printer i dag</span><strong data-value="daily">—</strong></div><div class="metric"><span>Printer måned</span><strong data-value="monthly">—</strong></div><div class="metric" style="--tone:var(--good)"><span>AMS nu / total</span><strong data-value="ams-energy">—</strong></div></div><div class="controls"><button class="warn" data-action="pause"><ha-icon icon="mdi:pause"></ha-icon>Pause</button><button class="good" data-action="resume"><ha-icon icon="mdi:play"></ha-icon>Fortsæt</button><button class="danger" data-action="stop"><ha-icon icon="mdi:stop"></ha-icon>Stop</button><button data-action="light"><ha-icon icon="mdi:lightbulb"></ha-icon>Kammerlys</button><button data-action="speed"><ha-icon icon="mdi:speedometer"></ha-icon>Hastighed</button><button class="danger" data-action="power"><ha-icon data-value="power-icon" icon="mdi:power-plug-off"></ha-icon><span data-value="power-action">Sluk strøm</span></button></div></div></ha-card>`;
    const main = this.shadowRoot.querySelector(".main");
    const side = main?.querySelector(".side");
    if (main && side) {
      const workspace = document.createElement("div");
      const bambu = document.createElement("div");
      const amsSide = document.createElement("div");
      workspace.className = "workspace"; bambu.className = "bambu"; amsSide.className = "ams-side";
      const panels = [...side.querySelectorAll(":scope > .panel")];
      panels.slice(0, 2).forEach((panel) => bambu.append(panel));
      panels.slice(2).forEach((panel) => amsSide.append(panel));
      [this.shadowRoot.querySelector(".energy"), this.shadowRoot.querySelector(".controls")].filter(Boolean).forEach((node) => bambu.append(node));
      if (fanHtml) { const panel = document.createElement("section"); panel.className = "panel"; panel.innerHTML = `<div class="panel-title"><ha-icon icon="mdi:fan"></ha-icon>Blæsere</div><div class="fans">${fanHtml}</div>`; amsSide.append(panel); }
      workspace.append(bambu, amsSide); main.after(workspace); side.remove();
    }
    this.shadowRoot.addEventListener("click", (event) => this._click(event));
    this._built = true;
    this._setMedia();
    if (this._hass) this._update();
  }

  _setMedia() {
    const img = this.shadowRoot?.querySelector(".visual img"); if (!img || !this._hass) return;
    const cameras = [this._config.camera || this._config.image, this._config.secondary_camera].filter(Boolean);
    const entity = cameras[Math.min(this._cameraIndex || 0, cameras.length - 1)]; if (!entity) return;
    const path = entity.startsWith("camera.") ? `/api/camera_proxy_stream/${entity}` : `/api/image_proxy/${entity}`;
    const url = this._hass.hassUrl ? this._hass.hassUrl(path) : path;
    if (img.src !== url) img.src = url;
    this.shadowRoot.querySelectorAll("[data-camera]").forEach((button) => button.classList.toggle("active", Number(button.dataset.camera) === (this._cameraIndex || 0)));
  }

  _update() {
    if (!this._built || !this._hass) return; this._setMedia();
    const active = this._active(), error = this._error(), online = this._state(this._config.online)?.state !== "off" && this._value(this._config.online) !== "—";
    const card = this.shadowRoot.querySelector("ha-card"), health = this.shadowRoot.querySelector(".health");
    card.classList.toggle("printing", active); card.classList.toggle("no-animation", this._config.animation === false); health.classList.toggle("active", active); health.classList.toggle("error", error || !online);
    this._text("health", error ? "Printerfejl" : !online ? "Offline" : active ? "Printer nu" : "Klar");
    this._text("task", this._value(this._config.task)); this._text("stage", this._value(this._config.stage) !== "—" ? this._value(this._config.stage).replaceAll("_", " ") : this._value(this._config.status));
    const progress = Math.max(0, Math.min(100, this._number(this._config.progress) || 0)); this._text("progress", `${this._fmt(progress)}%`); this.shadowRoot.querySelector(".progress i")?.style.setProperty("--progress", `${progress}%`);
    this._text("layers", `${this._value(this._config.current_layer)} / ${this._value(this._config.total_layers)}`); this._text("remaining", `${this._value(this._config.remaining_time)}${this._unit(this._config.remaining_time) ? ` ${this._unit(this._config.remaining_time)}` : ""}`); this._text("end", this._relativeTime(this._config.end_time)); this._text("speed", this._value(this._config.speed));
    this._text("nozzle", this._fmt(this._number(this._config.nozzle_temperature))); this._text("nozzle-target", this._fmt(this._number(this._config.nozzle_target))); this._text("bed", this._fmt(this._number(this._config.bed_temperature))); this._text("bed-target", this._fmt(this._number(this._config.bed_target)));
    this._text("ams-climate", `${this._fmt(this._number(this._config.ams_temperature),1)}° · ${this._fmt(this._number(this._config.ams_humidity))}% · ${this._value(this._config.active_tray)}`);
    (this._config.ams_trays || []).forEach((tray,index)=>this._text(`tray-${index}`,this._value(tray.entity)));
    this._metric("power",this._config.power,1); this._metric("daily",this._config.daily_energy,2); this._metric("monthly",this._config.monthly_energy,2); this._text("ams-energy",`${this._fmt(this._number(this._config.ams_power),1)} W / ${this._fmt(this._number(this._config.ams_energy),2)} kWh`);
    [["aux_fan",this._config.aux_fan],["chamber_fan",this._config.chamber_fan],["cooling_fan",this._config.cooling_fan]].forEach(([key,id]) => { const state = this._state(id); const value = this._value(id); this._text(key, value); this.shadowRoot.querySelector(`[data-entity="${id}"]`)?.classList.toggle("on", state?.state === "on" || Number(state?.attributes?.percentage) > 0); });
    const powerOn = this._state(this._config.power_switch)?.state === "on"; this._text("power-action", powerOn ? "Sluk strøm" : "Tænd strøm"); const powerIcon = this.shadowRoot.querySelector('[data-value="power-icon"]'); if (powerIcon) powerIcon.setAttribute("icon", powerOn ? "mdi:power-plug-off" : "mdi:power-plug");
    this.shadowRoot.querySelector('[data-action="pause"]').disabled = !active; this.shadowRoot.querySelector('[data-action="resume"]').disabled = !["pause","paused"].includes(String(this._value(this._config.status)).toLowerCase());
  }

  async _call(entity, domain, service) { if (entity && this._hass) await this._hass.callService(domain, service, { entity_id: entity }); }
  _more(entity) { if (!entity) return; this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: entity } })); }
  _click(event) {
    const camera = event.target.closest?.("[data-camera]");
    if (camera) { this._cameraIndex = Number(camera.dataset.camera) || 0; this._setMedia(); return; }
    const entityButton = event.target.closest?.("[data-entity]");
    if (entityButton) { this._more(entityButton.dataset.entity); return; }
    const button = event.target.closest?.("[data-action]"); if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (action === "pause") this._call(this._config.pause_button,"button","press");
    else if (action === "resume") this._call(this._config.resume_button,"button","press");
    else if (action === "stop" && confirm("Stop det aktuelle print?")) this._call(this._config.stop_button,"button","press");
    else if (action === "light") this._call(this._config.chamber_light,"light","toggle");
    else if (action === "speed") this._more(this._config.speed);
    else if (action === "power") { const powerOn = this._state(this._config.power_switch)?.state === "on"; const message = powerOn ? (this._active() ? "Printeren arbejder. Vil du virkelig afbryde strømmen?" : "Sluk strømmen til 3D-printeren?") : "Tænd strømmen til 3D-printeren?"; if (confirm(message)) this._call(this._config.power_switch,"switch",powerOn ? "turn_off" : "turn_on"); }
  }
}

if (!customElements.get("ha-bambulab-dashboard-card")) customElements.define("ha-bambulab-dashboard-card", HABambuLabDashboardCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "ha-bambulab-dashboard-card", name: "HA Bambu Lab Dashboard Card", description: "Samlet responsivt 3D-printerkort med kamera, status, AMS, energi og styring", preview: true });
console.info(`%c HA BAMBU LAB DASHBOARD CARD %c v${VERSION} `,"color:white;background:#0ea5e9;font-weight:700","color:#67e8f9;background:#111827");
