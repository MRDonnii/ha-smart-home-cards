const VERSION = "0.8.3";

// Shared by desktop/mobile card instances. This warms only still images;
// live streams are still opened exclusively for the visible camera views.
const SNAPSHOT_CACHE = window.__haHomeCameraSnapshotCache ||= new Map();

const DETECTION_TYPES = [
  { key: "smoke", label: "Røgalarm", icon: "mdi:smoke-detector-alert", cls: "danger", patterns: ["smoke alarm"] },
  { key: "co", label: "CO-alarm", icon: "mdi:molecule-co", cls: "danger", patterns: ["co alarm", "carbon monoxide"] },
  { key: "baby_cry", label: "Babygråd", icon: "mdi:baby-face-outline", cls: "object", patterns: ["baby cry"] },
  { key: "person", label: "Person", icon: "mdi:account", cls: "person", patterns: ["person detected", "person"] },
  { key: "vehicle", label: "Køretøj", icon: "mdi:car", cls: "vehicle", patterns: ["vehicle detected", "vehicle"] },
  { key: "animal", label: "Dyr", icon: "mdi:paw", cls: "animal", patterns: ["animal detected", "animal"] },
  { key: "package", label: "Pakke", icon: "mdi:package-variant", cls: "object", patterns: ["package"] },
  { key: "license_plate", label: "Nummerplade", icon: "mdi:license", cls: "vehicle", patterns: ["license plate"] },
  { key: "face", label: "Ansigt", icon: "mdi:face-recognition", cls: "person", patterns: ["face detected", "face"] },
  { key: "car", label: "Bil", icon: "mdi:car-side", cls: "vehicle", patterns: ["car detected"] },
  { key: "pet", label: "Kæledyr", icon: "mdi:dog-side", cls: "animal", patterns: ["pet detected"] },
  { key: "doorbell", label: "Dørklokke", icon: "mdi:doorbell-video", cls: "object", patterns: ["doorbell", "ring"] },
  { key: "speaking", label: "Tale", icon: "mdi:account-voice", cls: "object", patterns: ["speaking detected", "speaking"] },
  { key: "audio", label: "Lydhændelse", icon: "mdi:waveform", cls: "object", patterns: ["audio object detected", "sound detection"] },
  { key: "siren", label: "Sirene", icon: "mdi:alarm-light", cls: "danger", patterns: ["siren"] },
  { key: "bark", label: "Gøen", icon: "mdi:dog", cls: "animal", patterns: ["bark"] },
  { key: "car_alarm", label: "Bilalarm", icon: "mdi:car-emergency", cls: "danger", patterns: ["car alarm"] },
  { key: "car_horn", label: "Bilhorn", icon: "mdi:bullhorn", cls: "object", patterns: ["car horn"] },
  { key: "glass_break", label: "Glasbrud", icon: "mdi:window-closed-variant", cls: "danger", patterns: ["glass break"] },
  { key: "object", label: "Objekt", icon: "mdi:bell-ring", cls: "object", patterns: ["object detected"] },
  { key: "motion", label: "Bevægelse", icon: "mdi:motion-sensor", cls: "motion", patterns: ["motion detection", "motion"] },
];

class HaHomeCameraCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._manual = {};
    this._feedEntities = {};
    this._generation = 0;
  }

  static getStubConfig() {
    return {
      title: "Kameraer",
      navigation_path: "",
      click_action: "navigate",
      show_header: true,
      preload_snapshots: true,
      cameras: [{ key: "camera_1", name: "Kamera 1", entity: "", navigation_path: "" }],
      groups: [
        {
          name: "Kamerafelt 1",
          selector_entity: "",
          camera_keys: ["camera_1"],
          auto_camera_keys: ["camera_1"],
          fallback_camera: "camera_1",
          mode: "auto",
        },
      ],
    };
  }

  static getConfigElement() {
    return document.createElement("ha-home-camera-card-editor");
  }

  setConfig(config) {
    if (!Array.isArray(config?.groups) || !config.groups.length)
      throw new Error("Kamerakortet kræver mindst én kameragruppe");
    const nextConfig = {
      title: "Kameraer lige nu",
      navigation_path: "",
      click_action: "navigate",
      aspect_ratio: "16:9",
      show_header: false,
      fill_height: false,
      preload_snapshots: true,
      ...config,
    };
    this.classList.toggle("fill-height", Boolean(nextConfig.fill_height));
    const signature = JSON.stringify(nextConfig);
    if (signature === this._configSignature) {
      this.config = nextConfig;
      return;
    }
    this.config = nextConfig;
    this._configSignature = signature;
    this._generation += 1;
    this._feedEntities = {};
    this._hassSignature = "";
    this._renderShell();
    this._update();
  }

  set hass(hass) {
    this._hass = hass;
    this._preloadSnapshots();
    const signature = this._allWatched().map((id) => {
      const state = hass?.states?.[id];
      return `${id}:${state?.state || ""}:${state?.last_changed || ""}:${state?.attributes?.entity_picture || ""}`;
    }).join("|");
    if (signature === this._hassSignature) return;
    this._hassSignature = signature;
    this._update();
  }

  getCardSize() {
    return 4;
  }

  disconnectedCallback() {
    clearTimeout(this._activityTimer);
  }

  _state(id) {
    return id ? this._hass?.states?.[id] : undefined;
  }

  _active(id) {
    return this._state(id)?.state === "on";
  }

  _cameraCatalog() {
    if (Array.isArray(this.config?.cameras)) return this.config.cameras;
    const catalog = new Map();
    for (const group of this.config?.groups || []) for (const camera of group.cameras || []) if (!catalog.has(camera.key)) catalog.set(camera.key, camera);
    return [...catalog.values()];
  }

  _snapshotUrl(camera) {
    const state = this._state(camera?.entity);
    const entityPicture = state?.attributes?.entity_picture;
    if (entityPicture) return this._hass?.hassUrl(entityPicture) || entityPicture;
    const token = state?.attributes?.access_token;
    return token ? this._hass?.hassUrl(`/api/camera_proxy/${camera.entity}?token=${token}`) : "";
  }

  _preloadSnapshots() {
    if (!this._hass || this.config?.preload_snapshots === false || typeof Image === "undefined") return;
    const wanted = new Set();
    for (const camera of this._cameraCatalog()) {
      const src = this._snapshotUrl(camera);
      if (!src) continue;
      wanted.add(src);
      const cached = SNAPSHOT_CACHE.get(src);
      if (cached && Date.now() - cached.touched < 30000) continue;
      const image = new Image();
      const entry = { image, ready: false, touched: Date.now() };
      SNAPSHOT_CACHE.set(src, entry);
      image.decoding = "async";
      image.onload = () => {
        entry.ready = true;
        entry.touched = Date.now();
        image.decode?.().catch(() => {});
      };
      image.onerror = () => SNAPSHOT_CACHE.delete(src);
      image.src = src;
    }
    if (SNAPSHOT_CACHE.size > 40) {
      [...SNAPSHOT_CACHE.entries()]
        .filter(([src]) => !wanted.has(src))
        .sort((a, b) => a[1].touched - b[1].touched)
        .slice(0, SNAPSHOT_CACHE.size - 40)
        .forEach(([src]) => SNAPSHOT_CACHE.delete(src));
    }
  }

  _groupCameras(group) {
    if (Array.isArray(group.camera_keys)) {
      const allowed = new Set(group.camera_keys);
      return this._cameraCatalog().filter((camera) => allowed.has(camera.key));
    }
    return group.cameras || [];
  }

  _isAutomatic(group, index) {
    if (this._manual[index] === "__auto__") return true;
    if (this._manual[index]) return false;
    return group.mode !== "static";
  }

  _automaticCamera(group) {
    const allowed = this._groupCameras(group);
    const autoKeys = this._getAutoCameraKeys(group);
    const cameras = allowed.filter((camera) => autoKeys.has(camera.key));
    const active = cameras.map((camera) => ({ camera, changed: this._activityTimestamp(camera) }))
      .filter((item) => item.changed > 0)
      .sort((a, b) => b.changed - a.changed);
    const selected = this._state(group.selector_entity)?.state;
    return active[0]?.camera || cameras.find((camera) => camera.key === selected);
  }

  _selected(group, index) {
    const cameras = this._groupCameras(group);
    const preferred = this._getDefaultCamera(group);
    const manual = this._manual[index];
    const automatic = this._isAutomatic(group, index) ? this._automaticCamera(group) : null;
    return cameras.find((camera) => camera.key === manual && manual !== "__auto__")
      || automatic
      || (!this._isAutomatic(group, index) && cameras.find((camera) => camera.key === group.static_camera))
      || cameras.find((camera) => camera.key === preferred)
      || cameras[0];
  }

  _defaultKey(group) {
    return `ha-home-camera-card-default::${group.selector_entity || group.name || ""}`;
  }

  _autoKey(group) {
    // v2 deliberately discards v0.8.1's migration that enabled every catalog
    // camera in every view. The configured per-view list is authoritative on
    // first load again; later dropdown changes remain local to this display.
    return `ha-home-camera-card-auto-v2::${group.selector_entity || group.name || ""}`;
  }

  _getAutoCameraKeys(group) {
    const allowed = new Set(this._groupCameras(group).map((camera) => camera.key));
    try {
      const saved = JSON.parse(localStorage.getItem(this._autoKey(group)) || "null");
      if (Array.isArray(saved)) return new Set(saved.filter((key) => allowed.has(key)));
    } catch (_) {}
    const configured = Array.isArray(group.auto_camera_keys) ? group.auto_camera_keys : [...allowed];
    return new Set(configured.filter((key) => allowed.has(key)));
  }

  _setAutoCameraKeys(group, keys) {
    try { localStorage.setItem(this._autoKey(group), JSON.stringify([...keys])); } catch (_) {}
  }

  _getDefaultCamera(group) {
    if (group.fallback_select_entity) return this._state(group.fallback_select_entity)?.state || null;
    try { return localStorage.getItem(this._defaultKey(group)) || group.fallback_camera || group.default_camera || null; } catch (_) { return group.fallback_camera || group.default_camera || null; }
  }

  _setDefaultCamera(group, key) {
    if (group.fallback_select_entity) {
      if (key) this._hass?.callService("input_select", "select_option", { entity_id: group.fallback_select_entity, option: key });
      return;
    }
    try { if (key) localStorage.setItem(this._defaultKey(group), key); else localStorage.removeItem(this._defaultKey(group)); } catch (_) {}
  }

  _candidateIds(camera) {
    const prefix = camera.detection_prefix || camera.key;
    const defaults = {
      person: `binary_sensor.${prefix}_person_detected`,
      animal: `binary_sensor.${prefix}_animal_detected`,
      vehicle: `binary_sensor.${prefix}_vehicle_detected`,
      object: `binary_sensor.${prefix}_object_detected`,
      audio: `binary_sensor.${prefix}_audio_object_detected`,
      doorbell: `binary_sensor.${prefix}_doorbell`,
      package: `event.${prefix}_package`,
      speaking: `binary_sensor.${prefix}_speaking_detected`,
      smoke: `binary_sensor.${prefix}_smoke_alarm_detected`,
      co: `binary_sensor.${prefix}_co_alarm_detected`,
      baby_cry: `binary_sensor.${prefix}_baby_cry_detected`,
      motion: `binary_sensor.${prefix}_motion`,
    };
    const configured = camera.detections || {};
    return {
      person: configured.person || defaults.person,
      animal: configured.animal || defaults.animal,
      vehicle: configured.vehicle || defaults.vehicle,
      object: configured.object || defaults.object,
      audio: configured.audio || defaults.audio,
      doorbell: configured.doorbell || defaults.doorbell,
      package: configured.package || defaults.package,
      speaking: configured.speaking || defaults.speaking,
      smoke: configured.smoke || defaults.smoke,
      co: configured.co || defaults.co,
      baby_cry: configured.baby_cry || defaults.baby_cry,
      motion: configured.motion || defaults.motion,
    };
  }

  _enabledDetections(camera) {
    return Array.isArray(camera.enabled_detections) ? new Set(camera.enabled_detections) : null;
  }

  _detectionValue(value) {
    return typeof value === "object" && !Array.isArray(value) ? value : { entity_id: value };
  }

  _detectionActive(value, expectedType) {
    return (Array.isArray(value) ? value : [value]).some((id) => {
      const binding = this._detectionValue(id);
      const state = this._state(binding.entity_id);
      if (!state) return false;
      if (state.state === "on") return true;
      if (!String(binding.entity_id).startsWith("event.")) return false;
      const required = binding.event_type || expectedType;
      const actual = [state.attributes?.event_type, ...(state.attributes?.smart_detect_types || [])].filter(Boolean);
      if (required && !actual.includes(required)) return false;
      const changed = Math.max(Date.parse(state.state || "") || 0, Date.parse(state.last_changed || "") || 0);
      const hold = Math.max(5, Number(this.config.detection_event_hold_seconds || 30)) * 1000;
      const remaining = changed + hold - Date.now();
      if (remaining <= 0) return false;
      this._nextActivityRefresh = Math.min(this._nextActivityRefresh, remaining + 50);
      return true;
    });
  }

  _activity(camera) {
    const ids = this._candidateIds(camera);
    const enabled = this._enabledDetections(camera);
    for (const type of DETECTION_TYPES) {
      if ((!enabled || enabled.has(type.key)) && this._detectionActive(ids[type.key], type.key)) return { text: type.label, icon: type.icon, cls: type.cls };
    }
    return { text: "Roligt", icon: "mdi:shield-check-outline", cls: "quiet" };
  }

  _activityTimestamp(camera) {
    const ids = this._candidateIds(camera);
    const enabled = this._enabledDetections(camera);
    let newest = 0;
    for (const type of DETECTION_TYPES) {
      if (enabled && !enabled.has(type.key)) continue;
      const values = Array.isArray(ids[type.key]) ? ids[type.key] : [ids[type.key]];
      for (const value of values.filter(Boolean)) {
        const binding = this._detectionValue(value);
        if (!this._detectionActive(binding, type.key)) continue;
        const state = this._state(binding.entity_id);
        newest = Math.max(newest, Date.parse(state?.state || "") || 0, Date.parse(state?.last_changed || "") || 0);
      }
    }
    return newest;
  }

  _allWatched() {
    return (this.config?.groups || []).flatMap((group) => [
      group.selector_entity,
      group.fallback_select_entity,
      ...this._groupCameras(group).flatMap((camera) => {
        const ids = this._candidateIds(camera);
        const enabled = this._enabledDetections(camera);
        return [camera.entity, ...DETECTION_TYPES.filter((type) => !enabled || enabled.has(type.key)).flatMap((type) => (Array.isArray(ids[type.key]) ? ids[type.key] : [ids[type.key]]).map((value) => this._detectionValue(value).entity_id))];
      }),
    ]).filter(Boolean);
  }

  _renderShell() {
    if (!this.shadowRoot || !this.config) return;
    this.shadowRoot.innerHTML = `<style>
      :host{display:block;--card-surface:var(--dashboard-card-bg,var(--ha-card-background,var(--card-background-color,#1c1f26)));--card-solid:var(--card-background-color,#1c1f26);--popup-solid:var(--popupBG,var(--dashboard-popup-bg,var(--card-background-color,#1c1f26)));--text:var(--gray800,var(--primary-text-color,#f8fafc));--muted:var(--gray600,var(--secondary-text-color,#94a3b8));--edge:var(--dashboard-border-neutral,var(--divider-color,rgba(148,163,184,.2)));--accent:var(--dashboard-accent,var(--primary-color,#62b5ff));--ok:var(--dashboard-success,var(--success-color,#54d9aa));--warn:var(--dashboard-warning,var(--warning-color,#ffbd59));--danger:var(--dashboard-danger,var(--error-color,#ff667a));--animal:var(--dashboard-orange,var(--warning-color,#f97316));--object:var(--dashboard-purple,var(--accent-color,#a855f7));--motion:var(--dashboard-cyan,var(--info-color,#06b6d4));color:var(--text)}
      *{box-sizing:border-box}ha-card{overflow:hidden;border:0;border-left:4px solid var(--accent);border-radius:18px;background:var(--card-surface);box-shadow:var(--state-card-shadow,var(--ha-card-box-shadow,0 12px 30px rgba(0,0,0,.18)))}:host(.fill-height),:host(.fill-height) ha-card{height:100%}:host(.fill-height) ha-card{display:flex;flex-direction:column}:host(.fill-height) .grid{flex:1;grid-auto-rows:minmax(0,1fr)}:host(.fill-height) .panel{display:flex;min-height:0;flex-direction:column}:host(.fill-height) .feed{flex:1;aspect-ratio:auto}
      header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 14px 4px}.heading{display:flex;align-items:center;gap:10px;min-width:0}.heading ha-icon{color:var(--accent)}h2{margin:0;font-size:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sub{margin-top:2px;color:var(--muted);font-size:11px}.all{display:flex;align-items:center;gap:5px;border:1px solid color-mix(in srgb,var(--accent) 18%,var(--edge));border-radius:999px;padding:7px 10px;background:transparent;color:var(--text);font:inherit;font-size:11px;font-weight:750;cursor:pointer;flex:0 0 auto}.all ha-icon{--mdc-icon-size:16px;color:var(--accent)}
      .grid{display:grid;grid-template-columns:repeat(var(--columns,3),minmax(0,1fr));gap:10px;padding:12px}.panel{min-width:0;overflow:hidden;border:0;border-radius:15px;background:var(--card-surface)}
      .bar{display:flex;align-items:center;gap:5px;padding:6px;background:var(--dashboard-surface-info-dark,linear-gradient(180deg,color-mix(in srgb,var(--accent) 10%,transparent),color-mix(in srgb,var(--card-solid) 18%,transparent)),var(--card-surface));border-bottom:1px solid color-mix(in srgb,var(--accent) 14%,transparent)}.name{min-width:0;flex:1}.name b,.name span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.name b{font-size:11px}.name span{display:none;color:var(--muted);font-size:9px}.activity{display:flex;align-items:center;gap:4px;color:var(--ok);font-size:10px;font-weight:800}.activity span{display:none}.activity ha-icon{--mdc-icon-size:14px}.danger .activity,.person .activity{color:var(--danger)}.animal .activity{color:var(--animal)}.vehicle .activity{color:var(--accent)}.object .activity{color:var(--object)}.motion .activity{color:var(--motion)}.choose{display:grid;width:29px;height:29px;place-items:center;border:1px solid color-mix(in srgb,var(--accent) 18%,var(--edge));border-radius:50%;padding:0;background:color-mix(in srgb,var(--card-solid) 72%,transparent);color:var(--text);cursor:pointer}.choose ha-icon{--mdc-icon-size:16px;color:var(--accent)}
      .feed{position:relative;min-width:0;min-height:0;overflow:hidden;aspect-ratio:16/9;contain:layout paint;cursor:pointer;background:var(--camera-feed-background,var(--ha-card-background,#05080d))}.feed>*{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;min-width:0!important;min-height:0!important;display:block;overflow:hidden;pointer-events:none}.snapshot{z-index:2;object-fit:cover;opacity:1;transition:opacity .28s ease;background:var(--camera-feed-background,var(--ha-card-background,#05080d))}.live-card{z-index:1;opacity:0;transition:opacity .28s ease}.feed.ready .snapshot{opacity:0}.feed.ready .live-card{opacity:1}.chips{display:none}.chip{flex:0 0 auto;border:1px solid color-mix(in srgb,var(--accent) 18%,var(--edge));border-radius:999px;padding:5px 8px;background:transparent;color:var(--muted);font:inherit;font-size:9px;font-weight:750;cursor:pointer}.chip.active{border-color:color-mix(in srgb,var(--accent) 68%,transparent);background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--text)}
      .missing{display:grid!important;place-items:center;color:var(--muted);font-size:12px}.missing ha-icon{--mdc-icon-size:30px;margin-bottom:5px}.missing div{text-align:center}
      dialog{position:fixed;width:min(90vw,320px);max-height:min(70vh,520px);margin:0;border:1px solid color-mix(in srgb,var(--accent) 24%,var(--edge));border-radius:16px;padding:0;background:linear-gradient(var(--popup-solid),var(--popup-solid)),#1c1f26;color:var(--text);box-shadow:0 18px 48px rgba(0,0,0,.62);transform-origin:top right;isolation:isolate}dialog::backdrop{background:rgba(0,0,0,.48);backdrop-filter:blur(2px)}.sheet-head{display:flex;align-items:center;justify-content:space-between;padding:10px 11px 8px;border-bottom:1px solid var(--edge);background:linear-gradient(var(--popup-solid),var(--popup-solid)),#1c1f26}.sheet-head b{font-size:13px}.close{display:grid;width:30px;height:30px;place-items:center;border:0;border-radius:50%;background:color-mix(in srgb,var(--card-solid) 85%,var(--text) 15%);color:var(--text);cursor:pointer}.close ha-icon{--mdc-icon-size:17px}.choices{display:grid;gap:6px;overflow:auto;padding:9px;background:linear-gradient(var(--popup-solid),var(--popup-solid)),#1c1f26}.choice{display:flex;align-items:center;gap:9px;width:100%;min-height:42px;border:1px solid color-mix(in srgb,var(--accent) 18%,var(--edge));border-radius:11px;padding:7px 10px;background:color-mix(in srgb,var(--text) 4%,var(--popup-solid));color:var(--text);font:inherit;text-align:left;cursor:pointer}.choice ha-icon{--mdc-icon-size:18px;color:var(--muted)}.choice span{flex:1;font-size:12px;font-weight:700}.choice.active{border-color:color-mix(in srgb,var(--accent) 70%,transparent);background:color-mix(in srgb,var(--accent) 14%,var(--popup-solid))}.choice.active ha-icon,.choice .check{color:var(--accent)}
      .choice-row{display:flex;gap:6px;align-items:stretch}.choice-row .choice{flex:1;min-width:0}.pin,.auto-pin{display:grid;flex:0 0 auto;place-items:center;border:1px solid color-mix(in srgb,var(--accent) 18%,var(--edge));border-radius:11px;padding:0;background:transparent;color:var(--muted);cursor:pointer}.pin{width:42px}.pin ha-icon{--mdc-icon-size:18px}.pin.active{border-color:color-mix(in srgb,#f5b942 45%,var(--edge));color:#f5b942}.auto-pin{width:48px;font-size:9px;font-weight:850}.auto-pin.active{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--accent);box-shadow:0 0 10px color-mix(in srgb,var(--accent) 24%,transparent)}.hint{margin:2px 2px 0;padding:0 2px;color:var(--muted);font-size:10px;line-height:1.4}
      @media(max-width:900px){.grid{grid-template-columns:repeat(var(--columns,3),minmax(0,1fr))}.feed{aspect-ratio:16/9}}
      @media(max-width:600px){header{padding:10px 10px 3px}.grid{grid-template-columns:repeat(var(--columns,3),minmax(0,1fr));padding:7px;gap:5px}.chips{display:none}.choose{display:grid;width:27px;height:27px}.choose ha-icon{--mdc-icon-size:15px}.bar{padding:5px;gap:3px}.name b{font-size:10px}.name span,.activity span{display:none}.activity ha-icon{--mdc-icon-size:13px}.feed{aspect-ratio:16/9}}
    </style><ha-card>${this.config.show_header ? `<header><div class="heading"><ha-icon icon="mdi:cctv"></ha-icon><div><h2>${this._escape(this.config.title)}</h2><div class="sub">Automatisk valg med manuel overstyring</div></div></div><button class="all" data-nav><ha-icon icon="mdi:view-dashboard-outline"></ha-icon><span>Alle kameraer</span></button></header>` : ""}<div class="grid" style="--columns:${Math.min(3, this.config.groups.length)}">${this.config.groups.map((group, index) => `<section class="panel quiet" data-panel="${index}"><div class="bar"><div class="name"><b data-name></b><span>${this._escape(group.name || `Felt ${index + 1}`)}</span></div><div class="activity"><ha-icon data-activity-icon></ha-icon><span data-activity-text></span></div><button class="choose" data-choose="${index}" aria-label="Vælg kamera"><ha-icon icon="mdi:camera-switch-outline"></ha-icon></button></div><div class="feed" data-feed="${index}"></div><div class="chips"><button class="chip" data-auto="${index}">Auto</button>${this._groupCameras(group).map((camera) => `<button class="chip" data-group="${index}" data-camera="${this._escape(camera.key)}">${this._escape(camera.name || camera.key)}</button>`).join("")}</div></section>`).join("")}</div></ha-card><dialog data-dialog><div class="sheet-head"><b data-dialog-title>Vælg kamera</b><button class="close" data-close aria-label="Luk"><ha-icon icon="mdi:close"></ha-icon></button></div><div class="choices" data-choices></div></dialog>`;
    this.shadowRoot.querySelector("[data-nav]")?.addEventListener("click", () => this._navigate(this.config.navigation_path));
    this.shadowRoot.querySelectorAll("[data-camera]").forEach((button) => button.addEventListener("click", () => {
      this._manual[Number(button.dataset.group)] = button.dataset.camera;
      this._update();
    }));
    this.shadowRoot.querySelectorAll("[data-auto]").forEach((button) => button.addEventListener("click", () => {
      delete this._manual[Number(button.dataset.auto)];
      this._update();
    }));
    this.shadowRoot.querySelectorAll("[data-choose]").forEach((button) => button.addEventListener("click", () => this._openPicker(Number(button.dataset.choose), button)));
    this.shadowRoot.querySelectorAll("[data-feed]").forEach((feed) => feed.addEventListener("click", () => this._handleFeedClick(Number(feed.dataset.feed))));
    const dialog = this.shadowRoot.querySelector("[data-dialog]");
    this.shadowRoot.querySelector("[data-close]")?.addEventListener("click", () => dialog?.close());
    dialog?.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  }

  _handleFeedClick(index) {
    const group = this.config.groups[index];
    const camera = group ? this._selected(group, index) : undefined;
    const action = camera?.click_action || this.config.click_action || "navigate";
    if (action === "none") return;
    if (action === "more-info" && camera?.entity) {
      this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: camera.entity } }));
      return;
    }
    this._navigate(camera?.navigation_path || this.config.navigation_path || "");
  }

  _openPicker(index, anchor) {
    const group = this.config.groups[index];
    const dialog = this.shadowRoot.querySelector("[data-dialog]");
    const choices = this.shadowRoot.querySelector("[data-choices]");
    if (!group || !dialog || !choices) return;
    this.shadowRoot.querySelector("[data-dialog-title]").textContent = group.name || "Vælg kamera";
    const automatic = this._isAutomatic(group, index);
    const defaultCamera = this._getDefaultCamera(group);
    const cameras = this._groupCameras(group);
    const autoKeys = this._getAutoCameraKeys(group);
    choices.innerHTML = `<button class="choice ${automatic ? "active" : ""}" data-pick-auto><ha-icon icon="mdi:auto-fix"></ha-icon><span>Automatisk valg</span>${automatic ? '<ha-icon class="check" icon="mdi:check"></ha-icon>' : ""}</button>${cameras.map((camera) => { const active = this._manual[index] === camera.key; const isDefault = defaultCamera === camera.key; const inAuto = autoKeys.has(camera.key); return `<div class="choice-row"><button class="choice ${active ? "active" : ""}" data-pick-camera="${this._escape(camera.key)}"><ha-icon icon="mdi:cctv"></ha-icon><span>${this._escape(camera.name || camera.key)}</span>${active ? '<ha-icon class="check" icon="mdi:check"></ha-icon>' : ""}</button><button class="auto-pin ${inAuto ? "active" : ""}" data-auto-pin="${this._escape(camera.key)}" aria-pressed="${inAuto}" title="Med i automatisk skift">Auto</button><button class="pin ${isDefault ? "active" : ""}" data-pin="${this._escape(camera.key)}"><ha-icon icon="${isDefault ? "mdi:star" : "mdi:star-outline"}"></ha-icon></button></div>`; }).join("")}<p class="hint">Auto vælger hvilke kameraer automatikken må skifte til. Stjernen sætter favorit/fallback.</p>`;
    choices.querySelector("[data-pick-auto]")?.addEventListener("click", () => { this._manual[index] = "__auto__"; dialog.close(); this._update(); });
    choices.querySelectorAll("[data-pick-camera]").forEach((button) => button.addEventListener("click", () => { this._manual[index] = button.dataset.pickCamera; dialog.close(); this._update(); }));
    choices.querySelectorAll("[data-auto-pin]").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      const keys = this._getAutoCameraKeys(group);
      if (keys.has(button.dataset.autoPin)) keys.delete(button.dataset.autoPin); else keys.add(button.dataset.autoPin);
      this._setAutoCameraKeys(group, keys);
      this._manual[index] = "__auto__";
      dialog.close(); this._openPicker(index, anchor); this._update();
    }));
    choices.querySelectorAll("[data-pin]").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      const key = button.dataset.pin;
      if (group.fallback_select_entity) {
        if (defaultCamera !== key) this._setDefaultCamera(group, key);
      } else {
        this._setDefaultCamera(group, defaultCamera === key ? "" : key);
      }
      dialog.close();
      this._openPicker(index, anchor);
      this._update();
    }));
    dialog.showModal();
    requestAnimationFrame(() => {
      const anchorRect = anchor.getBoundingClientRect();
      const dialogRect = dialog.getBoundingClientRect();
      const gap = 7;
      const left = Math.min(window.innerWidth - dialogRect.width - 8, Math.max(8, anchorRect.right - dialogRect.width));
      const roomBelow = window.innerHeight - anchorRect.bottom - gap;
      const top = roomBelow >= dialogRect.height ? anchorRect.bottom + gap : Math.max(8, anchorRect.top - dialogRect.height - gap);
      dialog.style.left = `${left}px`;
      dialog.style.top = `${top}px`;
      dialog.style.transformOrigin = `${Math.min(dialogRect.width - 18, Math.max(18, anchorRect.left + anchorRect.width / 2 - left))}px ${roomBelow >= dialogRect.height ? "0" : "100%"}`;
    });
  }

  _update() {
    if (!this._hass || !this.config || !this.shadowRoot.querySelector("ha-card")) return;
    clearTimeout(this._activityTimer);
    this._nextActivityRefresh = Infinity;
    this.config.groups.forEach((group, index) => {
      const camera = this._selected(group, index);
      if (!camera) return;
      const panel = this.shadowRoot.querySelector(`[data-panel="${index}"]`);
      const activity = this._activity(camera);
      panel.className = `panel ${activity.cls}`;
      panel.querySelector("[data-name]").textContent = camera.name || camera.key;
      panel.querySelector("[data-activity-icon]").setAttribute("icon", activity.icon);
      panel.querySelector("[data-activity-text]").textContent = activity.text;
      panel.querySelectorAll(".chip").forEach((chip) => {
        const active = chip.dataset.auto !== undefined ? !this._manual[index] : chip.dataset.camera === camera.key;
        chip.classList.toggle("active", active);
      });
      this._setFeed(index, camera);
    });
    if (Number.isFinite(this._nextActivityRefresh)) this._activityTimer = setTimeout(() => this._update(), this._nextActivityRefresh);
  }

  async _setFeed(index, camera) {
    if (this._feedEntities[index] === camera.entity) {
      const card = this.shadowRoot.querySelector(`[data-feed="${index}"] [data-live-card]`);
      if (card) card.hass = this._hass;
      return;
    }
    this._feedEntities[index] = camera.entity;
    const feed = this.shadowRoot.querySelector(`[data-feed="${index}"]`);
    if (!feed) return;
    const generation = this._generation;
    const state = this._state(camera.entity);
    if (!state) {
      feed.innerHTML = `<div class="missing"><div><ha-icon icon="mdi:camera-off-outline"></ha-icon><br>Kamera ikke fundet</div></div>`;
      return;
    }
    feed.classList.remove("ready");
    const snapshot = document.createElement("img");
    snapshot.className = "snapshot";
    snapshot.alt = camera.name || camera.key || "Kamera";
    snapshot.decoding = "async";
    const snapshotUrl = this._snapshotUrl(camera);
    if (snapshotUrl) snapshot.src = snapshotUrl;
    feed.replaceChildren(snapshot);
    try {
      const helpers = await window.loadCardHelpers();
      if (generation !== this._generation || this._feedEntities[index] !== camera.entity) return;
      const card = await helpers.createCardElement({
        type: "picture-elements",
        camera_image: camera.entity,
        camera_view: "live",
        elements: [],
        aspect_ratio: this.config.aspect_ratio,
        fit_mode: "cover",
        tap_action: { action: "none" },
      });
      card.classList.add("live-card");
      card.dataset.liveCard = "";
      const fitScale = Number(camera.fit_scale || 1);
      if (Number.isFinite(fitScale) && fitScale > 0) {
        card.style.transform = `scale(${fitScale})`;
        card.style.transformOrigin = "center center";
      }
      card.hass = this._hass;
      feed.appendChild(card);
      this._revealWhenReady(feed, card, generation, camera.entity);
    } catch (error) {
      feed.innerHTML = `<div class="missing"><div><ha-icon icon="mdi:alert-circle-outline"></ha-icon><br>Stream kunne ikke indlæses</div></div>`;
      console.error("HA Home Camera Card", error);
    }
  }

  _mediaReady(node) {
    if (!node) return false;
    if (node instanceof HTMLVideoElement && node.readyState >= 2) return true;
    if (node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0) return true;
    if (node.shadowRoot && this._mediaReady(node.shadowRoot)) return true;
    return Array.from(node.children || []).some((child) => this._mediaReady(child));
  }

  _revealWhenReady(feed, card, generation, entity, attempt = 0) {
    if (generation !== this._generation || this._feedEntities[feed.dataset.feed] !== entity || !card.isConnected) return;
    if ((attempt >= 4 && this._mediaReady(card)) || attempt >= 80) {
      feed.classList.add("ready");
      setTimeout(() => feed.querySelector(".snapshot")?.remove(), 320);
      return;
    }
    setTimeout(() => this._revealWhenReady(feed, card, generation, entity, attempt + 1), 100);
  }

  _navigate(path) {
    if (!path) return;
    history.pushState(null, "", path);
    window.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true }));
  }

  _escape(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
}

class HaHomeCameraCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._entityRegistry = null;
    this._registryConnection = null;
  }
  setConfig(config) {
    const nextConfig = structuredClone(config || HaHomeCameraCard.getStubConfig());
    this._ensureCatalogSchema(nextConfig);
    const signature = JSON.stringify(nextConfig);
    this.config = nextConfig;
    if (signature === this._configSignature && this.shadowRoot.hasChildNodes()) return;
    this._configSignature = signature;
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    this.shadowRoot.querySelectorAll("ha-entity-picker").forEach((picker) => { picker.hass = hass; });
    this._loadEntityRegistry();
  }
  _emit() {
    this._configSignature = JSON.stringify(this.config);
    this.dispatchEvent(new CustomEvent("config-changed", { bubbles: true, composed: true, detail: { config: structuredClone(this.config) } }));
  }
  _escape(value) { return String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  _ensureCatalogSchema(config) {
    config.groups ||= [];
    if (!Array.isArray(config.cameras)) {
      const catalog = new Map();
      for (const group of config.groups) for (const camera of group.cameras || []) if (!catalog.has(camera.key)) catalog.set(camera.key, structuredClone(camera));
      config.cameras = [...catalog.values()];
    }
    config.groups = config.groups.map((group) => {
      if (Array.isArray(group.camera_keys)) return group;
      const next = { ...group, camera_keys: (group.cameras || []).map((camera) => camera.key) };
      delete next.cameras;
      next.fallback_camera ||= next.default_camera || next.camera_keys[0] || "";
      return next;
    });
    if (!config.cameras.length) config.cameras.push({ key: "camera_1", name: "Kamera 1", entity: "" });
    if (!config.groups.length) config.groups.push({ name: "Kamerafelt 1", camera_keys: config.cameras.map((camera) => camera.key), fallback_camera: config.cameras[0].key, mode: "auto" });
    const allKeys = config.cameras.map((camera) => camera.key);
    config.groups.forEach((group) => {
      group.camera_keys = Array.isArray(group.camera_keys) ? group.camera_keys.filter((key) => allKeys.includes(key)) : [...allKeys];
      group.auto_camera_keys = Array.isArray(group.auto_camera_keys) ? group.auto_camera_keys.filter((key) => group.camera_keys.includes(key)) : [...group.camera_keys];
      group.mode ||= "auto";
      group.fallback_camera ||= group.camera_keys[0] || "";
    });
  }
  async _loadEntityRegistry() {
    const connection = this._hass?.connection;
    if (!connection?.sendMessagePromise || connection === this._registryConnection) return;
    this._registryConnection = connection;
    try {
      this._entityRegistry = await connection.sendMessagePromise({ type: "config/entity_registry/list" });
      if (this.config) this._syncDiscoveredDetections();
      if (this.isConnected && this.config) this._render();
    } catch (error) {
      this._entityRegistry = [];
      console.warn("HA Home Camera Card: smart-detektioner kunne ikke læses", error);
    }
  }
  _syncDiscoveredDetections(cameraIndexes = null) {
    const indexes = cameraIndexes || this.config.cameras.map((_, index) => index);
    let changed = false;
    for (const index of indexes) {
      const camera = this.config.cameras[index];
      if (!camera?.entity) continue;
      const discovered = this._discoverDetections(camera);
      if (!discovered.length) continue;
      const next = { ...(camera.detections || {}) };
      for (const item of discovered) {
        const value = item.event_type ? { entity_id: item.entity_id, event_type: item.event_type } : item.entity_id;
        if (JSON.stringify(next[item.key]) !== JSON.stringify(value)) { next[item.key] = value; changed = true; }
      }
      camera.detections = next;
      if (!Array.isArray(camera.enabled_detections)) {
        camera.enabled_detections = discovered.map((item) => item.key);
        changed = true;
      }
    }
    if (changed) this._emit();
    return changed;
  }
  _detectionType(entry) {
    const text = `${entry.original_name || ""} ${entry.name || ""} ${entry.entity_id || ""}`.toLowerCase().replaceAll("_", " ");
    return DETECTION_TYPES.find((type) => type.patterns.some((pattern) => text.includes(pattern)));
  }
  _typesForEntry(entry) {
    const state = this._hass?.states?.[entry.entity_id];
    const advertised = Array.isArray(state?.attributes?.event_types) ? state.attributes.event_types : [];
    const fromAttributes = advertised.map((key) => DETECTION_TYPES.find((type) => type.key === key)).filter(Boolean);
    if (fromAttributes.length) return fromAttributes;
    const direct = this._detectionType(entry);
    return direct ? [direct] : [];
  }
  _discoverDetections(camera) {
    const configured = camera.detections || {};
    const found = new Map();
    for (const type of DETECTION_TYPES) {
      const ids = Array.isArray(configured[type.key]) ? configured[type.key] : [configured[type.key]];
      for (const value of ids.filter(Boolean)) {
        const binding = typeof value === "object" ? value : { entity_id: value };
        found.set(type.key, { ...type, ...binding, configured: true });
      }
    }
    if (!this._entityRegistry) return [...found.values()];
    const cameraEntry = this._entityRegistry.find((entry) => entry.entity_id === camera.entity);
    if (!cameraEntry?.device_id) return [...found.values()];
    const candidates = this._entityRegistry.filter((entry) => entry.device_id === cameraEntry.device_id && !entry.disabled_by && this._hass?.states?.[entry.entity_id] && (entry.entity_id.startsWith("binary_sensor.") || entry.entity_id.startsWith("event.")));
    for (const entry of candidates) {
      for (const type of this._typesForEntry(entry)) {
        const existing = found.get(type.key);
        const isBinary = entry.entity_id.startsWith("binary_sensor.");
        const binding = { ...type, entity_id: entry.entity_id, ...(isBinary ? {} : { event_type: type.key }) };
        if (!existing || (!existing.configured && isBinary && existing.entity_id.startsWith("event."))) found.set(type.key, binding);
      }
    }
    return DETECTION_TYPES.map((type) => found.get(type.key)).filter(Boolean);
  }
  _detectionEditor(camera, groupIndex, cameraIndex) {
    if (!camera.entity) return `<div class="detection-box"><b>Smart-detektioner</b><small>Vælg først et kamera.</small></div>`;
    if (!this._entityRegistry) return `<div class="detection-box"><b>Smart-detektioner</b><small>Finder muligheder fra Home Assistant…</small></div>`;
    const detections = this._discoverDetections(camera);
    if (!detections.length) return `<div class="detection-box"><b>Smart-detektioner</b><small>Ingen aktive detektionsentiteter fundet på samme kameraenhed.</small></div>`;
    const enabled = Array.isArray(camera.enabled_detections) ? new Set(camera.enabled_detections) : null;
    return `<div class="detection-box"><div class="detection-title"><b>Advarsler og automatisk kameraskift</b><small>Fundet automatisk på samme UniFi Protect-kamera</small></div><div class="detection-grid">${detections.map((item) => `<label class="detection-option"><input type="checkbox" data-detection-toggle="${this._escape(item.key)}" data-detection-entity="${this._escape(item.entity_id)}" data-detection-event-type="${this._escape(item.event_type || "")}" data-group="${groupIndex}" data-camera="${cameraIndex}" ${!enabled || enabled.has(item.key) ? "checked" : ""}><ha-icon icon="${item.icon}"></ha-icon><span><b>${item.label}</b><small>${this._escape(item.entity_id)}</small></span></label>`).join("")}</div></div>`;
  }
  _catalogMarkup() {
    return `<section class="catalog"><div class="section-head"><div><b>1. Kameraer og smart-detektioner</b><small>Tilføj hvert kamera én gang. Mulighederne findes automatisk via kameraets Home Assistant-enhed.</small></div></div>${this.config.cameras.map((camera, ci) => `<div class="camera"><div class="head"><b>${this._escape(camera.name || camera.key || `Kamera ${ci + 1}`)}</b><button class="remove" data-remove-catalog-camera="${ci}">Fjern</button></div><div class="fields"><label><span>Nøgle</span><input data-catalog-field="key" data-camera="${ci}" value="${this._escape(camera.key || "")}"></label><label><span>Navn</span><input data-catalog-field="name" data-camera="${ci}" value="${this._escape(camera.name || "")}"></label><label><span>Kamera</span><ha-entity-picker data-catalog-picker="entity" data-camera="${ci}" value="${this._escape(camera.entity || "")}" include-domains='["camera"]' allow-custom-entity></ha-entity-picker></label><label><span>Billedzoom (1 = ingen)</span><input type="number" min="1" max="3" step="0.01" data-catalog-field="fit_scale" data-camera="${ci}" value="${this._escape(camera.fit_scale || 1)}"></label><label><span>Sti ved tryk (valgfri)</span><input data-catalog-field="navigation_path" data-camera="${ci}" value="${this._escape(camera.navigation_path || "")}"></label>${this._detectionEditor(camera, -1, ci)}</div></div>`).join("")}<button class="add" data-add-catalog-camera>+ Tilføj kamera</button></section>`;
  }
  _viewsMarkup() {
    return `<section class="views"><div class="section-head"><div><b>2. Visningsvinduer</b><small>Vælg statisk eller automatisk skift. Ved auto går vinduet tilbage til favoritkameraet efter aktivitet.</small></div><label><span>Antal vinduer</span><select data-view-count><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label></div>${this.config.groups.map((group, gi) => { const allowed = new Set(group.camera_keys || []); const automatic = new Set(group.auto_camera_keys || group.camera_keys || []); const available = this.config.cameras.filter((camera) => allowed.has(camera.key)); return `<div class="group"><div class="head"><b>${this._escape(group.name || `Kamerafelt ${gi + 1}`)}</b></div><div class="fields"><label><span>Navn på vindue</span><input data-group-field="name" data-group="${gi}" value="${this._escape(group.name || "")}"></label><label><span>Starttilstand</span><select data-group-select="mode" data-group="${gi}"><option value="auto" ${group.mode !== "static" ? "selected" : ""}>Automatisk efter smart-detektion</option><option value="static" ${group.mode === "static" ? "selected" : ""}>Statisk kamera</option></select></label><label><span>Favorit / fallback ved auto</span><select data-group-select="fallback_camera" data-group="${gi}"><option value="">Første valgte kamera</option>${available.map((camera) => `<option value="${this._escape(camera.key)}" ${group.fallback_camera === camera.key ? "selected" : ""}>${this._escape(camera.name || camera.key)}</option>`).join("")}</select></label><label><span>Kamera ved statisk tilstand</span><select data-group-select="static_camera" data-group="${gi}"><option value="">Brug favorit</option>${available.map((camera) => `<option value="${this._escape(camera.key)}" ${group.static_camera === camera.key ? "selected" : ""}>${this._escape(camera.name || camera.key)}</option>`).join("")}</select></label><label><span>Ekstern valgsensor (valgfri)</span><ha-entity-picker data-group-picker="selector_entity" data-group="${gi}" value="${this._escape(group.selector_entity || "")}" allow-custom-entity></ha-entity-picker></label></div><div class="camera-allow"><b>Kameraer i dette vindue</b><small>Afkrydsningen gør kameraet tilgængeligt. Auto-knappen bestemmer separat, om automatikken må skifte til det.</small><div class="allow-actions"><button type="button" data-allow-all="${gi}">Vælg alle</button><button type="button" data-allow-none="${gi}">Fravælg alle</button></div><div class="allow-grid">${this.config.cameras.map((camera) => `<div class="allow-row"><label><input type="checkbox" data-camera-allow="${this._escape(camera.key)}" data-group="${gi}" ${allowed.has(camera.key) ? "checked" : ""}><span>${this._escape(camera.name || camera.key)}</span></label><button type="button" class="auto-toggle${automatic.has(camera.key) ? " is-active" : ""}" data-camera-auto="${this._escape(camera.key)}" data-group="${gi}" aria-pressed="${automatic.has(camera.key)}" ${allowed.has(camera.key) ? "" : "disabled"}>Auto</button></div>`).join("")}</div></div></div>`; }).join("")}</section>`;
  }
  _render() {
    if (!this.shadowRoot || !this.config) return;
    this.config.groups ||= [];
    this.shadowRoot.innerHTML = `<style>*{box-sizing:border-box}.editor{display:grid;gap:14px;color:var(--primary-text-color)}.top,.catalog,.views,.group,.camera{display:grid;gap:9px;padding:12px;border:1px solid var(--divider-color);border-radius:12px}.catalog,.views{padding:14px}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}label span{display:block;margin-bottom:4px;color:var(--secondary-text-color);font-size:11px}input,select{width:100%;padding:9px;border:1px solid var(--divider-color);border-radius:8px;background:var(--popupBG,var(--card-background-color,#1c1f26));color:inherit}.head,.section-head{display:flex;justify-content:space-between;align-items:center;gap:10px}.section-head small,.camera-allow>small{display:block;margin-top:3px;color:var(--secondary-text-color);font-size:10px}.section-head>label{min-width:120px}.camera{padding:10px}.add,.remove,.allow-actions button,.auto-toggle{padding:8px 10px;border:1px solid var(--primary-color);border-radius:8px;background:transparent;color:var(--primary-color);cursor:pointer}.remove{border-color:var(--error-color);color:var(--error-color)}ha-entity-picker{display:block}.check{display:flex!important;flex-direction:row-reverse;align-items:center;justify-content:flex-end;gap:8px}.check span{margin:0!important}.check input{width:auto!important}.detection-box,.camera-allow{display:grid;gap:8px;padding:10px;border:1px solid color-mix(in srgb,var(--primary-color) 18%,var(--divider-color));border-radius:11px;background:color-mix(in srgb,var(--primary-color) 4%,var(--card-background-color));grid-column:1/-1}.allow-actions{display:flex;gap:6px}.allow-actions button{padding:5px 8px;font-size:10px}.detection-box>small,.detection-title small{display:block;margin-top:2px;color:var(--secondary-text-color);font-size:10px}.detection-grid,.allow-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.allow-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px}.detection-option,.allow-row>label{display:flex;align-items:center;gap:8px;min-width:0;padding:8px;border:1px solid var(--divider-color);border-radius:9px;background:var(--popupBG,var(--card-background-color,#1c1f26));cursor:pointer}.auto-toggle{min-width:52px;padding:7px;font-size:10px;font-weight:800}.auto-toggle.is-active{background:var(--primary-color);color:var(--text-primary-color,#fff);box-shadow:0 0 12px color-mix(in srgb,var(--primary-color) 35%,transparent)}.auto-toggle:disabled{cursor:not-allowed;opacity:.35}.detection-option input,.allow-row input{width:auto;flex:0 0 auto}.detection-option ha-icon{width:18px;height:18px;--mdc-icon-size:18px;color:var(--primary-color)}.detection-option span{min-width:0;margin:0}.detection-option b,.detection-option small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.detection-option b{font-size:11px}.detection-option small{color:var(--secondary-text-color);font-size:8px}@media(max-width:600px){.fields,.detection-grid,.allow-grid{grid-template-columns:1fr}.section-head{align-items:flex-start;flex-direction:column}.section-head>label{width:100%}}</style><div class="editor"><div class="top fields"><label><span>Titel</span><input data-root="title" value="${this._escape(this.config.title || "")}"></label><label><span>Sti til alle kameraer</span><input data-root="navigation_path" value="${this._escape(this.config.navigation_path || "")}"></label><label class="check"><span>Vis titel-linje</span><input type="checkbox" data-root-check="show_header" ${this.config.show_header ? "checked" : ""}></label></div>${this._catalogMarkup()}${this._viewsMarkup()}</div>`;
    const actionLabel = document.createElement("label");
    actionLabel.innerHTML = `<span>Klikhandling</span><select data-root="click_action"><option value="navigate">Navigér</option><option value="more-info">Mere info</option><option value="none">Ingen handling</option></select>`;
    const actionSelect = actionLabel.querySelector("select");
    actionSelect.value = this.config.click_action || "navigate";
    actionSelect.style.cssText = "width:100%;padding:9px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:inherit";
    this.shadowRoot.querySelector(".top")?.insertBefore(actionLabel, this.shadowRoot.querySelector(".top")?.children[1] || null);
    const fillLabel = document.createElement("label");
    fillLabel.className = "check";
    fillLabel.innerHTML = `<span>Udfyld tildelt højde</span><input type="checkbox" data-root-check="fill_height" ${this.config.fill_height ? "checked" : ""}>`;
    this.shadowRoot.querySelector(".top")?.appendChild(fillLabel);
    const preloadLabel = document.createElement("label");
    preloadLabel.className = "check";
    preloadLabel.innerHTML = `<span>Forindlæs stillbilleder (hurtigere skift)</span><input type="checkbox" data-root-check="preload_snapshots" ${this.config.preload_snapshots !== false ? "checked" : ""}>`;
    this.shadowRoot.querySelector(".top")?.appendChild(preloadLabel);
    this.shadowRoot.querySelectorAll("ha-entity-picker").forEach((picker) => { picker.hass = this._hass; picker.addEventListener("value-changed", (event) => this._changePicker(picker, event.detail.value)); });
    actionSelect.addEventListener("change", () => this._changeInput(actionSelect));
    this.shadowRoot.querySelectorAll("input[type=text], input:not([type])").forEach((input) => input.addEventListener("change", () => this._changeInput(input)));
    this.shadowRoot.querySelectorAll("input[type=number]").forEach((input) => input.addEventListener("change", () => this._changeInput(input)));
    this.shadowRoot.querySelectorAll("input[type=checkbox]").forEach((input) => input.addEventListener("change", () => this._changeCheckbox(input)));
    this.shadowRoot.querySelectorAll("[data-group-select]").forEach((select) => select.addEventListener("change", () => { this.config.groups[Number(select.dataset.group)][select.dataset.groupSelect] = select.value; this._emit(); }));
    const viewCount = this.shadowRoot.querySelector("[data-view-count]");
    if (viewCount) {
      viewCount.value = String(Math.min(3, Math.max(1, this.config.groups.length)));
      viewCount.addEventListener("change", () => {
        const count = Number(viewCount.value);
        const keys = this.config.cameras.map((camera) => camera.key);
        while (this.config.groups.length < count) this.config.groups.push({ name: `Kamerafelt ${this.config.groups.length + 1}`, mode: "auto", camera_keys: [...keys], auto_camera_keys: [...keys], fallback_camera: keys[0] || "" });
        this.config.groups.splice(count);
        this._emit(); this._render();
      });
    }
    this.shadowRoot.querySelectorAll("[data-allow-all]").forEach((button) => button.addEventListener("click", () => { const group = this.config.groups[Number(button.dataset.allowAll)]; group.camera_keys = this.config.cameras.map((camera) => camera.key); group.auto_camera_keys = [...group.camera_keys]; group.fallback_camera ||= group.camera_keys[0] || ""; this._emit(); this._render(); }));
    this.shadowRoot.querySelectorAll("[data-allow-none]").forEach((button) => button.addEventListener("click", () => { const group = this.config.groups[Number(button.dataset.allowNone)]; group.camera_keys = []; group.auto_camera_keys = []; group.fallback_camera = ""; group.static_camera = ""; this._emit(); this._render(); }));
    this.shadowRoot.querySelectorAll("[data-camera-auto]").forEach((button) => button.addEventListener("click", () => { const group = this.config.groups[Number(button.dataset.group)]; const keys = new Set(group.auto_camera_keys || group.camera_keys || []); if (keys.has(button.dataset.cameraAuto)) keys.delete(button.dataset.cameraAuto); else keys.add(button.dataset.cameraAuto); group.auto_camera_keys = this.config.cameras.map((camera) => camera.key).filter((key) => keys.has(key) && group.camera_keys.includes(key)); this._emit(); this._render(); }));
    this.shadowRoot.querySelector("[data-add-catalog-camera]")?.addEventListener("click", () => { let number = this.config.cameras.length + 1; while (this.config.cameras.some((camera) => camera.key === `camera_${number}`)) number += 1; const camera = { key: `camera_${number}`, name: `Kamera ${number}`, entity: "" }; this.config.cameras.push(camera); this.config.groups.forEach((group) => { group.camera_keys.push(camera.key); group.auto_camera_keys ||= []; group.auto_camera_keys.push(camera.key); }); this._emit(); this._render(); });
    this.shadowRoot.querySelectorAll("[data-remove-catalog-camera]").forEach((button) => button.addEventListener("click", () => { const camera = this.config.cameras[Number(button.dataset.removeCatalogCamera)]; this.config.cameras.splice(Number(button.dataset.removeCatalogCamera), 1); this.config.groups.forEach((group) => { group.camera_keys = group.camera_keys.filter((key) => key !== camera.key); group.auto_camera_keys = (group.auto_camera_keys || []).filter((key) => key !== camera.key); if (group.fallback_camera === camera.key) group.fallback_camera = group.camera_keys[0] || ""; }); this._emit(); this._render(); }));
  }
  _changeCheckbox(input) {
    if (input.dataset.rootCheck) this.config[input.dataset.rootCheck] = input.checked;
    else if (input.dataset.cameraAllow) {
      const group = this.config.groups[Number(input.dataset.group)];
      const keys = new Set(group.camera_keys || []);
      if (input.checked) keys.add(input.dataset.cameraAllow); else keys.delete(input.dataset.cameraAllow);
      group.camera_keys = this.config.cameras.map((camera) => camera.key).filter((key) => keys.has(key));
      group.auto_camera_keys = (group.auto_camera_keys || []).filter((key) => group.camera_keys.includes(key));
      if (!group.camera_keys.includes(group.fallback_camera)) group.fallback_camera = group.camera_keys[0] || "";
      this._emit(); this._render(); return;
    } else if (input.dataset.detectionToggle) {
      const camera = this.config.cameras[Number(input.dataset.camera)];
      const discovered = this._discoverDetections(camera);
      camera.detections = Object.fromEntries(discovered.map((item) => [item.key, item.event_type ? { entity_id: item.entity_id, event_type: item.event_type } : item.entity_id]));
      const enabled = new Set(Array.isArray(camera.enabled_detections) ? camera.enabled_detections : discovered.map((item) => item.key));
      if (input.checked) enabled.add(input.dataset.detectionToggle); else enabled.delete(input.dataset.detectionToggle);
      camera.enabled_detections = DETECTION_TYPES.map((type) => type.key).filter((key) => enabled.has(key));
    }
    this._emit();
  }
  _changeInput(input) {
    if (input.dataset.root) this.config[input.dataset.root] = input.value;
    else if (input.dataset.groupField) this.config.groups[Number(input.dataset.group)][input.dataset.groupField] = input.value;
    else if (input.dataset.catalogField) {
      const camera = this.config.cameras[Number(input.dataset.camera)];
      const oldKey = camera.key;
      camera[input.dataset.catalogField] = input.value;
      if (input.dataset.catalogField === "key" && oldKey !== input.value) this.config.groups.forEach((group) => { group.camera_keys = group.camera_keys.map((key) => key === oldKey ? input.value : key); group.auto_camera_keys = (group.auto_camera_keys || []).map((key) => key === oldKey ? input.value : key); if (group.fallback_camera === oldKey) group.fallback_camera = input.value; });
    }
    this._emit();
  }
  _changePicker(picker, value) {
    if (picker.dataset.groupPicker) this.config.groups[Number(picker.dataset.group)][picker.dataset.groupPicker] = value;
    else if (picker.dataset.catalogPicker) {
      const camera = this.config.cameras[Number(picker.dataset.camera)];
      camera[picker.dataset.catalogPicker] = value;
      delete camera.detections;
      delete camera.enabled_detections;
      this._syncDiscoveredDetections([Number(picker.dataset.camera)]);
    }
    this._emit();
    if (picker.dataset.catalogPicker) this._render();
  }
}

if (!customElements.get("ha-home-camera-card")) customElements.define("ha-home-camera-card", HaHomeCameraCard);
if (!customElements.get("ha-home-camera-card-editor")) customElements.define("ha-home-camera-card-editor", HaHomeCameraCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({ type: "ha-home-camera-card", name: "HA Home Camera Card", description: "Responsive camera overview with automatic and manual camera selection", preview: true });
console.info(`%c HA-HOME-CAMERA-CARD %c ${VERSION} `, "color:#fff;background:#2563eb;font-weight:700", "color:#60a5fa;background:#0f172a");
