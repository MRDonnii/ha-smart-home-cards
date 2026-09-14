import "../ha-ai-usage-card/ha-card-list-editor.js";

const VERSION = "0.2.13";

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
    const nextConfig = { ...HABambuLabDashboardCard.getStubConfig(), ...config };
    const nextSignature = JSON.stringify(nextConfig);
    if (this._built && nextSignature === this._configSignature) { this._config = nextConfig; return; }
    this._config = nextConfig;
    this._configSignature = nextSignature;
    this._signature = "";
    this._built = false;
    this._build();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._built) this._build();
    (this._embeddedCards || []).forEach((card) => { card.hass = hass; });
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
  _syncTaskMarquee() {
    const task = this.shadowRoot?.querySelector(".task"), viewport = this.shadowRoot?.querySelector(".task-viewport");
    if (!task || !viewport) return;
    task.classList.remove("marquee"); task.style.removeProperty("--task-shift"); task.style.removeProperty("--task-duration");
    requestAnimationFrame(() => { const distance = Math.max(0, task.scrollWidth - viewport.clientWidth); if (distance > 8) { task.style.setProperty("--task-shift", `${-distance}px`); task.style.setProperty("--task-duration", `${Math.max(8, distance / 18)}s`); task.classList.add("marquee"); } });
  }

  _build() {
    if (!this._config) return;
    const showCamera = this._config.show_camera !== false;
    const fanHtml = [["aux_fan","Hjælpeblæser"],["chamber_fan","Kammerblæser"],["cooling_fan","Køleblæser"]].filter(([key]) => this._config[key]).map(([key,label]) => `<button class="fan" data-entity="${this._escape(this._config[key])}" data-fan="${key}"><span class="fan-icon"><ha-icon icon="mdi:fan"></ha-icon></span><span class="fan-copy"><b>${label}</b><small><i><em></em></i></small></span><strong data-value="${key}">—</strong></button>`).join("");
    const heroHtml = `<section class="hero"><div class="hero-ambient"><i></i><i></i><i></i></div><div class="hero-top"><div class="hero-primary"><span class="hero-machine"><ha-icon icon="mdi:printer-3d-nozzle-outline"></ha-icon><i></i></span><div><span class="hero-label">Aktuelt print</span><span class="task-viewport"><strong class="task" data-value="task">—</strong></span><small><ha-icon icon="mdi:layers-triple-outline"></ha-icon><span data-value="stage">—</span></small></div></div><div class="hero-stats"><div><span><ha-icon icon="mdi:layers-outline"></ha-icon>Lag</span><strong data-value="layers">—</strong></div><div><span><ha-icon icon="mdi:timer-sand"></ha-icon>Resterende</span><strong data-value="remaining">—</strong></div><div><span><ha-icon icon="mdi:flag-checkered"></ha-icon>Færdig</span><strong data-value="end">—</strong></div><div class="heat"><span><ha-icon icon="mdi:printer-3d-nozzle-heat-outline"></ha-icon>Dyse</span><strong><b data-value="nozzle">—</b>° <small>/ <span data-value="nozzle-target">—</span>°</small></strong></div><div class="heat"><span><ha-icon icon="mdi:radiator"></ha-icon>Printbed</span><strong><b data-value="bed">—</b>° <small>/ <span data-value="bed-target">—</span>°</small></strong></div><div class="power"><span><ha-icon icon="mdi:flash-outline"></ha-icon>Strøm nu</span><strong data-value="power">—</strong></div></div></div><div class="print-status"><div class="print-status-meta"><span><i></i><b data-value="progress-status">Afventer</b><small>Live printforløb</small></span><strong data-value="progress">—</strong></div><div class="print-status-bar"><i><b></b></i></div></div></section>`;
    const visualHtml = showCamera ? `<section class="visual"><div class="camera-host" style="min-height:330px;background:#080b0f"></div><div class="camera-switch"><button class="active" data-camera="0"><ha-icon icon="mdi:camera-overhead"></ha-icon>Top</button><button data-camera="1"><ha-icon icon="mdi:camera-side"></ha-icon>Side</button></div></section>` : "";
    const amsHtml = "";
    this.shadowRoot.innerHTML = `<style>
      :host{display:block;--accent:var(--dashboard-accent,var(--primary-color,#38bdf8));--good:var(--dashboard-success,var(--success-color,#20e3a2));--warn:var(--dashboard-warning,var(--warning-color,#f59e0b));--danger:var(--dashboard-danger,var(--error-color,#ef4444));--muted:var(--secondary-text-color,#8b99aa);--surface:var(--dashboard-card-bg,var(--ha-card-background,var(--card-background-color,#111820)));--edge:var(--dashboard-border-neutral,var(--divider-color,rgba(127,145,165,.18)))}*{box-sizing:border-box}button{font:inherit;color:inherit}ha-card{overflow:hidden;border:1px solid var(--edge);border-left:4px solid var(--accent);border-radius:24px;background:linear-gradient(145deg,color-mix(in srgb,var(--surface) 96%,var(--accent) 4%),var(--surface));color:var(--primary-text-color);box-shadow:var(--dashboard-shadow-deep,var(--ha-card-box-shadow))}.shell{padding:20px}.head{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:14px}.title{display:flex;align-items:center;gap:11px}.title-icon{display:grid;place-items:center;width:44px;height:44px;border-radius:14px;background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent)}.title-icon ha-icon{--mdc-icon-size:27px}.eyebrow{color:var(--accent);font-size:8px;font-weight:900;letter-spacing:.15em;text-transform:uppercase}.title h2{margin:3px 0 0;font-size:22px}.title small{display:block;margin-top:2px;color:var(--muted);font-size:10px}.health{display:flex;align-items:center;gap:7px;padding:7px 11px;border-radius:99px;background:color-mix(in srgb,var(--good) 12%,transparent);color:var(--good);font-size:10px;font-weight:850}.health i{width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 10px currentColor}.health.active i{animation:pulse 1.4s ease-in-out infinite}.health.error{background:color-mix(in srgb,var(--danger) 13%,transparent);color:var(--danger)}
      .main{display:grid;gap:10px}.main.no-camera{grid-template-columns:1fr}.hero{display:grid;gap:10px;padding:11px;border:1px solid color-mix(in srgb,var(--accent) 24%,var(--edge));border-radius:18px;background:radial-gradient(circle at 88% -40%,color-mix(in srgb,var(--accent) 18%,transparent),transparent 45%),linear-gradient(120deg,color-mix(in srgb,var(--accent) 8%,var(--surface)),color-mix(in srgb,var(--surface) 96%,black 4%));overflow:hidden}.hero-top{display:grid;grid-template-columns:minmax(210px,.75fr) minmax(0,1.55fr);align-items:stretch;gap:8px}.hero-primary{display:flex;align-items:center;min-width:0;padding:4px 8px}.hero-primary>div{min-width:0}.hero-label,.hero-stats>div>span{display:block;color:var(--muted);font-size:7px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}.hero .task{display:block;overflow:hidden;margin-top:3px;font-size:15px;font-weight:850;text-overflow:ellipsis;white-space:nowrap}.hero-primary small{display:block;overflow:hidden;margin-top:3px;color:var(--muted);font-size:8px;text-overflow:ellipsis;text-transform:capitalize;white-space:nowrap}.hero-stats{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px}.hero-stats>div{min-width:0;padding:8px 9px;border:1px solid rgba(255,255,255,.035);border-radius:11px;background:rgba(255,255,255,.04);transition:transform .22s ease,background .22s ease}.hero-stats>div:hover{transform:translateY(-2px);background:color-mix(in srgb,var(--accent) 10%,rgba(255,255,255,.035))}.hero-stats strong{display:block;overflow:hidden;margin-top:4px;font-size:11px;text-overflow:ellipsis;white-space:nowrap}.hero-stats small{color:var(--muted);font-size:7px}.print-status{padding:8px 10px 9px;border:1px solid rgba(255,255,255,.04);border-radius:12px;background:rgba(0,0,0,.18)}.print-status-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:7px;font-size:8px}.print-status-meta span{display:flex;align-items:center;gap:6px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em}.print-status-meta span>i{width:6px;height:6px;border-radius:50%;background:var(--accent);box-shadow:0 0 8px var(--accent)}.print-status-meta strong{font-size:12px;color:var(--primary-text-color)}.print-status-bar{height:10px;overflow:hidden;border:1px solid color-mix(in srgb,var(--accent) 22%,transparent);border-radius:999px;background:rgba(255,255,255,.07);box-shadow:inset 0 2px 5px rgba(0,0,0,.28)}.print-status-bar>i{position:relative;display:block;width:var(--progress,0%);height:100%;overflow:hidden;border-radius:inherit;background:linear-gradient(90deg,var(--accent),#22d3ee,var(--good),var(--accent));background-size:220% 100%;box-shadow:0 0 16px color-mix(in srgb,var(--accent) 75%,transparent);transition:width .85s cubic-bezier(.22,.75,.25,1)}.print-status-bar>i>b{position:absolute;inset:0;background:linear-gradient(105deg,transparent 28%,rgba(255,255,255,.55) 45%,transparent 62%);transform:translateX(-120%)}.workspace{display:grid;grid-template-columns:minmax(0,1.14fr) minmax(330px,.86fr);gap:14px;margin-top:14px;align-items:start}.bambu,.ams-side{display:grid;gap:11px;align-content:start}.visual,.panel,.embedded-card{border-radius:18px;transition:transform .25s ease,filter .25s ease,box-shadow .25s ease}.visual,.panel{border:1px solid var(--edge);background:linear-gradient(145deg,color-mix(in srgb,var(--surface) 94%,white 2%),color-mix(in srgb,var(--surface) 93%,black 7%));overflow:hidden}.visual{position:relative;min-height:330px}.visual:hover,.embedded-card:hover{transform:translateY(-2px);filter:brightness(1.035);box-shadow:0 12px 28px rgba(0,0,0,.2)}.visual img{display:block;width:100%;height:100%;min-height:330px;object-fit:cover;background:#080b0f}.panel{padding:14px}.panel-title{display:flex;align-items:center;gap:8px;margin-bottom:11px;color:var(--muted);font-size:9px;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.panel-title ha-icon{--mdc-icon-size:18px;color:var(--accent)}.metric{position:relative;min-width:0;padding:11px;border:1px solid rgba(255,255,255,.035);border-left:3px solid var(--tone,var(--accent));border-radius:12px;background:linear-gradient(145deg,color-mix(in srgb,var(--tone,var(--accent)) 9%,transparent),rgba(255,255,255,.025));transition:transform .22s ease,filter .22s ease}.metric:hover{transform:translateY(-2px);filter:brightness(1.08)}.metric span{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:8px}.metric span ha-icon{--mdc-icon-size:14px;color:var(--tone,var(--accent))}.metric strong{display:block;overflow:hidden;margin-top:5px;font-size:15px;text-overflow:ellipsis;white-space:nowrap}.fans{display:grid;gap:7px}.fan{display:grid;grid-template-columns:34px minmax(0,1fr) auto;align-items:center;gap:10px;width:100%;padding:9px 10px;border:1px solid transparent;border-radius:12px;background:rgba(255,255,255,.04);color:inherit;text-align:left;cursor:pointer;transition:transform .2s ease,background .2s ease,border-color .2s ease}.fan:hover{transform:translateX(2px);border-color:color-mix(in srgb,var(--accent) 24%,transparent);background:color-mix(in srgb,var(--accent) 10%,rgba(255,255,255,.035))}.fan-icon{display:grid;place-items:center;width:32px;height:32px;border-radius:10px;background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent)}.fan ha-icon{--mdc-icon-size:19px}.fan.on ha-icon{animation:spin 1.2s linear infinite}.fan-copy{display:block;min-width:0}.fan-copy>b{display:block;font-size:9px}.fan-copy>small{display:block;margin-top:6px}.fan-copy i{display:block;height:3px;overflow:hidden;border-radius:99px;background:rgba(255,255,255,.1)}.fan-copy em{display:block;width:var(--fan,0%);height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--accent),var(--good));transition:width .6s ease}.fan strong{font-size:10px}.energy{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.energy .metric{padding:10px}.controls{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.controls button{display:flex;min-width:0;align-items:center;justify-content:flex-start;gap:8px;min-height:47px;padding:8px 10px;border:1px solid var(--edge);border-left:3px solid var(--tone,var(--accent));border-radius:12px;background:linear-gradient(145deg,color-mix(in srgb,var(--tone,var(--accent)) 10%,var(--surface)),color-mix(in srgb,var(--surface) 96%,black 4%));cursor:pointer;font-size:9px;font-weight:800;text-align:left;transition:transform .16s ease,background .2s ease,box-shadow .2s ease}.controls button:hover{transform:translateY(-2px);background:color-mix(in srgb,var(--tone,var(--accent)) 15%,var(--surface));box-shadow:0 8px 18px rgba(0,0,0,.18)}.controls button:active{transform:scale(.97)}.controls button ha-icon{flex:0 0 auto;--mdc-icon-size:19px;color:var(--tone,var(--accent))}.controls .danger{--tone:var(--danger)}.controls .good{--tone:var(--good)}.controls .warn{--tone:var(--warn)}.controls button[disabled]{opacity:.38;cursor:not-allowed}.printing .title-icon{animation:printerFloat 2.8s ease-in-out infinite}.printing .print-status-bar>i{animation:statusFlow 2.2s linear infinite}.printing .print-status-bar>i>b{animation:statusSweep 1.75s ease-in-out infinite}.printing .print-status-meta span>i{animation:pulse 1.4s ease-in-out infinite}.printing .energy .metric:first-child{animation:energyBreathe 2.8s ease-in-out infinite}.no-animation *{animation:none!important;transition:none!important}@keyframes pulse{50%{opacity:.4;transform:scale(1.5)}}@keyframes printerFloat{50%{transform:translateY(-3px);filter:drop-shadow(0 0 8px var(--accent))}}@keyframes statusFlow{to{background-position:-220% 0}}@keyframes statusSweep{60%,100%{transform:translateX(135%)}}@keyframes energyBreathe{50%{filter:brightness(1.12);box-shadow:0 0 18px color-mix(in srgb,var(--accent) 18%,transparent)}}@keyframes spin{to{transform:rotate(360deg)}}
      .hero{position:relative;isolation:isolate;padding:14px 15px 13px;border-color:color-mix(in srgb,var(--accent) 38%,var(--edge));box-shadow:inset 0 1px 0 rgba(255,255,255,.055),0 12px 32px rgba(0,0,0,.14)}.hero:before{content:"";position:absolute;z-index:-1;inset:0;background:linear-gradient(110deg,transparent 0 38%,color-mix(in srgb,var(--accent) 7%,transparent) 52%,transparent 66%);background-size:220% 100%;opacity:.7}.hero:after{content:"";position:absolute;z-index:3;left:0;top:18px;bottom:18px;width:3px;border-radius:0 5px 5px 0;background:linear-gradient(180deg,var(--accent),#22d3ee,var(--good));box-shadow:0 0 16px color-mix(in srgb,var(--accent) 80%,transparent)}.hero-ambient{position:absolute;z-index:-1;inset:0;overflow:hidden;pointer-events:none}.hero-ambient i{position:absolute;border:1px solid color-mix(in srgb,var(--accent) 13%,transparent);border-radius:50%}.hero-ambient i:nth-child(1){width:180px;height:180px;right:-60px;top:-112px}.hero-ambient i:nth-child(2){width:120px;height:120px;right:-17px;top:-82px}.hero-ambient i:nth-child(3){width:8px;height:8px;right:50px;top:31px;background:var(--accent);border:0;box-shadow:0 0 22px var(--accent)}.hero-top{position:relative;z-index:1;grid-template-columns:minmax(245px,.8fr) minmax(0,1.7fr);gap:12px}.hero-primary{gap:12px;padding:2px 8px}.hero-machine{position:relative;display:grid;place-items:center;flex:0 0 48px;width:48px;height:48px;border:1px solid color-mix(in srgb,var(--accent) 34%,transparent);border-radius:15px;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 18%,transparent),rgba(255,255,255,.025));color:var(--accent);box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 8px 20px rgba(0,0,0,.18)}.hero-machine ha-icon{--mdc-icon-size:27px}.hero-machine i{position:absolute;right:-2px;bottom:-2px;width:10px;height:10px;border:2px solid var(--surface);border-radius:50%;background:var(--good);box-shadow:0 0 10px var(--good)}.task-viewport{display:block;overflow:hidden;min-width:0;mask-image:linear-gradient(90deg,#000 0,#000 92%,transparent 100%)}.hero .task{display:block;width:max-content;min-width:100%;font-size:17px;letter-spacing:-.02em;white-space:nowrap}.hero .task.marquee{animation:taskMarquee var(--task-duration,12s) ease-in-out 1.2s infinite alternate}.hero-primary small{display:flex;align-items:center;gap:5px}.hero-primary small ha-icon{--mdc-icon-size:13px;color:var(--accent)}.hero-stats{gap:7px}.hero-stats>div{position:relative;display:grid;grid-template-columns:1fr;grid-template-rows:auto 1fr;align-items:stretch;row-gap:6px;padding:9px 10px 10px;border-color:rgba(255,255,255,.055);background:linear-gradient(145deg,rgba(255,255,255,.055),rgba(255,255,255,.022));box-shadow:inset 0 1px 0 rgba(255,255,255,.035)}.hero-stats>div:after{content:"";position:absolute;left:10px;right:10px;bottom:0;height:2px;border-radius:3px;background:var(--accent);opacity:.22}.hero-stats>div.heat:after{background:var(--warn)}.hero-stats>div.power:after{background:var(--good)}.hero-stats>div>span{display:flex;align-items:center;gap:5px}.hero-stats>div>span ha-icon{--mdc-icon-size:13px;color:var(--accent)}.hero-stats .heat>span ha-icon{color:var(--warn)}.hero-stats .power>span ha-icon{color:var(--good)}.hero-stats strong{align-self:end;justify-self:end;margin:0;text-align:right;font-size:12px}.hero-stats strong small{white-space:nowrap}.print-status{position:relative;z-index:1;padding:9px 11px 10px;border-color:color-mix(in srgb,var(--accent) 12%,rgba(255,255,255,.04));background:linear-gradient(90deg,rgba(0,0,0,.24),color-mix(in srgb,var(--accent) 5%,rgba(0,0,0,.18)))}.print-status-meta span small{margin-left:4px;color:var(--muted);font-size:7px;font-weight:700;letter-spacing:.04em}.print-status-meta>strong{font-size:15px;font-variant-numeric:tabular-nums}.print-status-bar{height:11px}.printing .hero:before{animation:heroScan 5s linear infinite}.printing .hero-ambient i:nth-child(1){animation:orbit 10s linear infinite}.printing .hero-ambient i:nth-child(2){animation:orbitReverse 7s linear infinite}.printing .hero-machine{animation:machineFloat 2.8s ease-in-out infinite}.printing .hero-machine i{animation:statusPulse 1.6s ease-in-out infinite}.printing .hero-stats>div{animation:statWake 3.6s ease-in-out infinite}.printing .hero-stats>div:nth-child(2){animation-delay:.18s}.printing .hero-stats>div:nth-child(3){animation-delay:.36s}.printing .hero-stats>div:nth-child(4){animation-delay:.54s}.printing .hero-stats>div:nth-child(5){animation-delay:.72s}.printing .hero-stats>div:nth-child(6){animation-delay:.9s}@keyframes taskMarquee{to{transform:translateX(var(--task-shift,0))}}@keyframes heroScan{to{background-position:-220% 0}}@keyframes orbit{to{transform:rotate(360deg)}}@keyframes orbitReverse{to{transform:rotate(-360deg)}}@keyframes machineFloat{50%{transform:translateY(-2px);filter:drop-shadow(0 0 8px color-mix(in srgb,var(--accent) 55%,transparent))}}@keyframes statusPulse{50%{transform:scale(1.35);opacity:.55}}@keyframes statWake{50%{border-color:color-mix(in srgb,var(--accent) 14%,rgba(255,255,255,.055))}}.camera-switch{position:absolute;z-index:3;top:12px;right:12px;display:flex;gap:6px;padding:5px;border:1px solid rgba(255,255,255,.13);border-radius:14px;background:rgba(5,9,14,.72);box-shadow:0 8px 22px rgba(0,0,0,.28);backdrop-filter:blur(12px)}.camera-switch button{display:flex;align-items:center;gap:5px;padding:7px 10px;border:0;border-radius:10px;background:transparent;color:rgba(255,255,255,.7);font-size:9px;font-weight:850;cursor:pointer}.camera-switch button.active{background:color-mix(in srgb,var(--accent) 25%,rgba(255,255,255,.06));color:white;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 50%,transparent)}.camera-switch ha-icon{--mdc-icon-size:16px}
      .head{display:grid;grid-template-columns:minmax(250px,1fr) auto auto;align-items:center;gap:14px}.top-fans{display:grid;grid-template-columns:repeat(3,minmax(112px,1fr));gap:7px;padding:5px;border:1px solid color-mix(in srgb,var(--accent) 13%,var(--edge));border-radius:15px;background:rgba(0,0,0,.12);box-shadow:inset 0 1px 0 rgba(255,255,255,.035)}.top-fans .fan{grid-template-columns:27px minmax(0,1fr) auto;gap:7px;min-height:42px;padding:5px 7px;border:1px solid rgba(255,255,255,.035);border-radius:10px;background:linear-gradient(145deg,rgba(255,255,255,.045),rgba(255,255,255,.018))}.top-fans .fan:hover{transform:translateY(-1px)}.top-fans .fan-icon{position:relative;width:27px;height:27px;border-radius:8px}.top-fans .fan-icon:after{content:"";position:absolute;inset:-3px;border:1px solid color-mix(in srgb,var(--accent) 20%,transparent);border-radius:10px;opacity:0}.top-fans .fan.on .fan-icon:after{animation:fanHalo 1.8s ease-in-out infinite}.top-fans .fan ha-icon{--mdc-icon-size:17px}.top-fans .fan-copy>b{overflow:hidden;font-size:7px;text-overflow:ellipsis;white-space:nowrap}.top-fans .fan-copy>small{margin-top:4px}.top-fans .fan-copy i{height:2px}.top-fans .fan strong{font-size:8px;font-variant-numeric:tabular-nums}.top-fans .fan.on{border-color:color-mix(in srgb,var(--accent) 18%,transparent);background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 9%,transparent),rgba(255,255,255,.02));box-shadow:0 0 16px color-mix(in srgb,var(--accent) 8%,transparent)}@keyframes fanHalo{50%{inset:-6px;opacity:.75}100%{opacity:0}}
      @media(min-width:761px){.title-icon{width:52px;height:52px;border-radius:16px}.title-icon ha-icon{--mdc-icon-size:31px}.eyebrow{font-size:10px}.title h2{font-size:27px}.title small{font-size:13px;line-height:1.35}.health{padding:10px 14px;font-size:12px}.health i{width:9px;height:9px}.top-fans{grid-template-columns:repeat(3,minmax(130px,1fr));padding:6px}.top-fans .fan{grid-template-columns:32px minmax(0,1fr) auto;min-height:48px;padding:7px 9px}.top-fans .fan-icon{width:32px;height:32px}.top-fans .fan ha-icon{--mdc-icon-size:20px}.top-fans .fan-copy>b{font-size:10px}.top-fans .fan-copy>small{margin-top:6px}.top-fans .fan-copy i{height:3px}.top-fans .fan strong{font-size:11px}.hero{padding:17px 18px 15px}.hero-top{grid-template-columns:minmax(250px,.65fr) minmax(0,1.55fr);gap:16px}.hero-machine{flex-basis:58px;width:58px;height:58px;border-radius:17px}.hero-machine ha-icon{--mdc-icon-size:33px}.hero-label{font-size:10px}.hero .task{font-size:20px;line-height:1.22}.hero-primary small{margin-top:6px;font-size:11px}.hero-primary small ha-icon{--mdc-icon-size:15px}.hero-stats{grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:1fr;gap:8px}.hero-stats>div{grid-template-columns:minmax(0,1fr) auto;grid-template-rows:1fr;align-items:center;row-gap:0;column-gap:10px}.hero-stats strong{align-self:center}.hero-stats>div{padding:12px 11px}.hero-stats>div>span{font-size:10px}.hero-stats>div>span ha-icon{--mdc-icon-size:16px}.hero-stats strong{margin:0;font-size:16px}.hero-stats small{font-size:10px}.print-status{padding:11px 13px 12px}.print-status-meta{margin-bottom:9px;font-size:11px}.print-status-meta span small{font-size:9px}.print-status-meta>strong{font-size:19px}.print-status-bar{height:13px}}
      @media(min-width:761px){.workspace{align-items:stretch}.bambu,.ams-side{height:100%}.ams-side{grid-template-rows:auto auto minmax(0,1fr)}.controls-panel{display:flex;min-height:0;flex-direction:column}.controls-panel .controls{flex:1;grid-auto-rows:minmax(82px,1fr)}.controls-panel .controls button{min-height:82px;padding:14px 16px;gap:11px;font-size:11px;border-radius:15px}.controls-panel .controls button ha-icon{--mdc-icon-size:25px}}
      @media(max-width:980px){.hero-top{grid-template-columns:1fr}.hero-stats{grid-template-columns:repeat(3,minmax(0,1fr))}.workspace{grid-template-columns:minmax(0,1fr) minmax(300px,.82fr)}}@media(max-width:760px){.shell{padding:13px}.head{grid-template-columns:minmax(0,1fr) auto;align-items:flex-start}.top-fans{grid-column:1/-1;grid-row:2;width:100%;grid-template-columns:repeat(3,minmax(0,1fr))}.title h2{font-size:21px}.title small{max-width:210px;font-size:11px;line-height:1.35}.top-fans .fan-copy>b{font-size:8px}.top-fans .fan strong{font-size:9px}.hero-label{font-size:8px}.hero .task{font-size:17px}.hero-primary small{font-size:9px}.workspace{display:flex;flex-direction:column}.ams-side{display:contents}.ams-card-host{order:1}.bambu{order:2}.ams-side>.panel{order:3}.ams-side>.energy-panel{order:4}.ams-side>.controls-panel{order:5}.ams-side>.energy-panel,.ams-side>.controls-panel{align-self:stretch;width:100%;max-width:100%;min-width:0}.energy-panel .energy,.controls-panel .controls{width:100%;min-width:0}.controls button{overflow:hidden}.controls button span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.print-status-meta{font-size:9px}.print-status-meta span small{font-size:8px}.print-status-meta>strong{font-size:16px}.visual,.visual img{min-height:220px}.hero-stats{grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:1fr;gap:6px}.hero-stats>div{min-height:0;padding:8px 7px}.hero-stats>div>span{gap:4px;font-size:8px;letter-spacing:.035em}.hero-stats>div>span ha-icon{--mdc-icon-size:13px}.hero-stats strong{margin:0;font-size:14px}.hero-stats small{font-size:9px}.energy{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.controls{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
    </style><ha-card><div class="shell"><header class="head"><div class="title"><span class="title-icon"><ha-icon icon="mdi:printer-3d-nozzle"></ha-icon></span><div><div class="eyebrow">Bambu Lab</div><h2>${this._escape(this._config.title)}</h2><small>${this._escape(this._config.subtitle)}</small></div></div>${fanHtml ? `<div class="top-fans" aria-label="Blæsere">${fanHtml}</div>` : ""}<div class="health"><i></i><span data-value="health">Afventer data</span></div></header><div class="main ${showCamera ? "" : "no-camera"}">${heroHtml}${visualHtml}<div class="side">${amsHtml}</div></div><section class="panel energy-panel"><div class="panel-title"><ha-icon icon="mdi:lightning-bolt-outline"></ha-icon>Energi og forbrug</div><div class="energy"><div class="metric"><span><ha-icon icon="mdi:calendar-today"></ha-icon>Printer i dag</span><strong data-value="daily">—</strong></div><div class="metric"><span><ha-icon icon="mdi:calendar-month"></ha-icon>Printer måned</span><strong data-value="monthly">—</strong></div><div class="metric" style="--tone:var(--good)"><span><ha-icon icon="mdi:chart-timeline-variant-shimmer"></ha-icon>AMS nu / total</span><strong data-value="ams-energy">—</strong></div></div></section><section class="panel controls-panel"><div class="panel-title"><ha-icon icon="mdi:tune-variant"></ha-icon>Printerstyring</div><div class="controls"><button class="warn" data-action="pause"><ha-icon icon="mdi:pause"></ha-icon>Pause</button><button class="good" data-action="resume"><ha-icon icon="mdi:play"></ha-icon>Fortsæt</button><button class="danger" data-action="stop"><ha-icon icon="mdi:stop"></ha-icon>Stop</button><button data-action="light"><ha-icon icon="mdi:lightbulb"></ha-icon>Kammerlys</button><button data-action="speed"><ha-icon icon="mdi:speedometer"></ha-icon>Hastighed</button><button class="danger" data-action="power"><ha-icon data-value="power-icon" icon="mdi:power-plug-off"></ha-icon><span data-value="power-action">Sluk strøm</span></button></div></section></div></ha-card>`;
    const main = this.shadowRoot.querySelector(".main");
    const side = main?.querySelector(".side");
    if (main && side) {
      const workspace = document.createElement("div");
      const bambu = document.createElement("div");
      const amsSide = document.createElement("div");
      workspace.className = "workspace"; bambu.className = "bambu"; amsSide.className = "ams-side";
      const panels = [...side.querySelectorAll(":scope > .panel")];
      panels.forEach((panel) => amsSide.append(panel));
      if (this._config.printer) { const host = document.createElement("div"); host.className = "embedded-card printer-card-host"; bambu.prepend(host); }
      if (this._config.ams) { const host = document.createElement("div"); host.className = "embedded-card ams-card-host"; amsSide.prepend(host); }
      [this.shadowRoot.querySelector(".energy-panel"), this.shadowRoot.querySelector(".controls-panel")].filter(Boolean).forEach((node) => amsSide.append(node));
      workspace.append(bambu, amsSide); main.after(workspace); side.remove();
    }
    this.shadowRoot.addEventListener("click", (event) => this._click(event));
    this.shadowRoot.querySelectorAll("[data-camera]").forEach((button) => button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); this._selectCamera(Number(button.dataset.camera) || 0); }));
    this._built = true;
    this._mountEmbeddedCards();
    if (this._hass) this._update();
  }

  async _mountEmbeddedCards() {
    const token = {}; this._mountToken = token; this._embeddedCards = [];
    const helpers = await window.loadCardHelpers?.();
    if (!helpers || this._mountToken !== token) return;
    const mount = (host, config, className = "") => { if (!host || !config) return; const card = helpers.createCardElement(config); const wrap = document.createElement("div"); wrap.className = className; wrap.append(card); host.append(wrap); if (this._hass) card.hass = this._hass; this._embeddedCards.push(card); return wrap; };
    const cameraHost = this.shadowRoot.querySelector(".camera-host");
    const cameras = [this._config.camera || this._config.image, this._config.secondary_camera].filter(Boolean);
    this._cameraViews = cameras.map((entity, index) => { const config = entity.startsWith("camera.") ? { type:"picture-glance", entities:[], camera_image:entity, camera_view:"live", show_state:false, show_name:false, aspect_ratio:"16:9", fit_mode:"cover" } : { type:"picture-entity", entity, show_state:false, show_name:false, camera_view:"auto", fit_mode:"cover" }; const view = mount(cameraHost, config, "camera-view"); if (view) view.style.display = index === 0 ? "block" : "none"; return view; });
    mount(this.shadowRoot.querySelector(".printer-card-host"), { type:"custom:ha-bambulab-print_status-card", printer:this._config.printer, style:"graphic" });
    if (this._config.show_ams !== false) mount(this.shadowRoot.querySelector(".ams-card-host"), { type:"custom:ha-bambulab-ams-card", ams:this._config.ams, style:"vector", show_type:true, show_info_bar:true, spool_anim_reflection:true, spool_anim_wiggle:true });
    this._setMedia();
  }

  _setMedia() {
    (this._cameraViews || []).forEach((view, index) => { if (view) view.style.display = index === (this._cameraIndex || 0) ? "block" : "none"; });
    this.shadowRoot.querySelectorAll("[data-camera]").forEach((button) => button.classList.toggle("active", Number(button.dataset.camera) === (this._cameraIndex || 0)));
  }

  _selectCamera(index) { this._cameraIndex = index; this._setMedia(); }

  _update() {
    if (!this._built || !this._hass) return; this._setMedia();
    const active = this._active(), error = this._error(), online = this._state(this._config.online)?.state !== "off" && this._value(this._config.online) !== "—";
    const card = this.shadowRoot.querySelector("ha-card"), health = this.shadowRoot.querySelector(".health");
    card.classList.toggle("printing", active); card.classList.toggle("no-animation", this._config.animation === false); health.classList.toggle("active", active); health.classList.toggle("error", error || !online);
    this._text("health", error ? "Printerfejl" : !online ? "Offline" : active ? "Printer nu" : "Klar");
    const taskValue = this._value(this._config.task), taskNode = this.shadowRoot.querySelector(".task"); if (taskNode?.textContent !== taskValue) { this._text("task", taskValue); this._syncTaskMarquee(); } this._text("stage", this._value(this._config.stage) !== "—" ? this._value(this._config.stage).replaceAll("_", " ") : this._value(this._config.status));
    const progress = Math.max(0, Math.min(100, this._number(this._config.progress) || 0)); this._text("progress", `${this._fmt(progress)}%`); this._text("progress-status", active ? "Printer" : progress >= 100 ? "Færdig" : "Klar"); this.shadowRoot.querySelector(".print-status-bar > i")?.style.setProperty("--progress", `${progress}%`);
    this._text("layers", `${this._value(this._config.current_layer)} / ${this._value(this._config.total_layers)}`); this._text("remaining", `${this._fmt(this._number(this._config.remaining_time),1)}${this._unit(this._config.remaining_time) ? ` ${this._unit(this._config.remaining_time)}` : ""}`); this._text("end", this._relativeTime(this._config.end_time)); this._text("speed", this._value(this._config.speed));
    this._text("nozzle", this._fmt(this._number(this._config.nozzle_temperature))); this._text("nozzle-target", this._fmt(this._number(this._config.nozzle_target))); this._text("bed", this._fmt(this._number(this._config.bed_temperature))); this._text("bed-target", this._fmt(this._number(this._config.bed_target)));
    this._text("ams-climate", `${this._fmt(this._number(this._config.ams_temperature),1)}° · ${this._fmt(this._number(this._config.ams_humidity))}% · ${this._value(this._config.active_tray)}`);
    (this._config.ams_trays || []).forEach((tray,index)=>this._text(`tray-${index}`,this._value(tray.entity)));
    this._metric("power",this._config.power,1); this._metric("daily",this._config.daily_energy,2); this._metric("monthly",this._config.monthly_energy,2); this._text("ams-energy",`${this._fmt(this._number(this._config.ams_power),1)} W / ${this._fmt(this._number(this._config.ams_energy),2)} kWh`);
    [["aux_fan",this._config.aux_fan],["chamber_fan",this._config.chamber_fan],["cooling_fan",this._config.cooling_fan]].forEach(([key,id]) => { const state = this._state(id); const value = this._value(id); const percentage = Math.max(0,Math.min(100,Number(state?.attributes?.percentage ?? state?.state) || 0)); this._text(key, value); const fan = this.shadowRoot.querySelector(`[data-fan="${key}"]`); fan?.classList.toggle("on", state?.state === "on" || percentage > 0); fan?.style.setProperty("--fan",`${percentage}%`); });
    const powerOn = this._state(this._config.power_switch)?.state === "on"; this._text("power-action", powerOn ? "Sluk strøm" : "Tænd strøm"); const powerIcon = this.shadowRoot.querySelector('[data-value="power-icon"]'); if (powerIcon) powerIcon.setAttribute("icon", powerOn ? "mdi:power-plug-off" : "mdi:power-plug");
    const pauseButton = this.shadowRoot.querySelector('[data-action="pause"]');
    const resumeButton = this.shadowRoot.querySelector('[data-action="resume"]');
    if (pauseButton) pauseButton.disabled = !active;
    if (resumeButton) resumeButton.disabled = !["pause", "paused"].includes(String(this._value(this._config.status)).toLowerCase());
  }

  async _call(entity, domain, service) { if (entity && this._hass) await this._hass.callService(domain, service, { entity_id: entity }); }
  _more(entity) { if (!entity) return; this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: entity } })); }
  _click(event) {
    const camera = event.target.closest?.("[data-camera]");
    if (camera) { this._selectCamera(Number(camera.dataset.camera) || 0); return; }
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
