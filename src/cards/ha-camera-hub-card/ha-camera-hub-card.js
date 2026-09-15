const VERSION = "0.6.1";

const EVENTS_REFRESH_MS = 30 * 1000;
const SYSTEM_TICK_MS = 30 * 1000;
const EVENTS_WINDOW_HOURS = 36;

const TYPE_INFO = {
  person: { label: "Person", icon: "mdi:account", cls: "person" },
  animal: { label: "Dyr", icon: "mdi:paw", cls: "animal" },
  pet: { label: "Kæledyr", icon: "mdi:paw", cls: "animal" },
  vehicle: { label: "Køretøj", icon: "mdi:car", cls: "vehicle" },
  car: { label: "Bil", icon: "mdi:car", cls: "vehicle" },
  package: { label: "Pakke", icon: "mdi:package-variant", cls: "object" },
  license_plate: { label: "Nummerplade", icon: "mdi:card-text-outline", cls: "object" },
  face: { label: "Ansigt", icon: "mdi:face-recognition", cls: "object" },
  ring: { label: "Dørklokke", icon: "mdi:doorbell-video", cls: "object" },
  motion: { label: "Bevægelse", icon: "mdi:motion-sensor", cls: "motion" },
};
const FILTERS = [
  ["all", "Alle", "mdi:view-list"],
  ["person", "Person", "mdi:account"],
  ["vehicle", "Køretøj", "mdi:car"],
  ["animal", "Dyr", "mdi:paw"],
  ["motion", "Bevægelse", "mdi:motion-sensor"],
  ["object", "Andet", "mdi:bell-ring"],
];

class HACameraHubCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._sig = "";
    this._tab = "live";
    this._filter = "all";
    this._liveFeeds = {};
    this._liveGeneration = 0;
    this._events = [];
    this._eventsFetchedAt = 0;
    this._eventsFetching = false;
    this._media = null;
    this._eventSig = "";
    this._eventsRenderSig = "";
    this._thumbGeneration = 0;
    this._mediaRoot = null;
    this._mediaRootFetchedAt = 0;
    this._thumbBlobCache = new Map();
  }

  static getStubConfig() {
    return {
      title: "Overvågning",
      subtitle: "Live, hændelser og systemstatus",
      protect_ingress_path: "/hassio/ingress/local_unifi-protect-ingress",
      quick_links: [],
      cameras: [
        { key: "fordor", name: "Fordør", icon: "mdi:doorbell-video", area: "udenfor", ai: true, res: "medium", doorbell: true },
      ],
      nvr: {
        storage_entity: "sensor.unifi_protect_storage_utilization",
        capacity_entity: "sensor.unifi_protect_recording_capacity",
        cpu_entity: "sensor.unifi_protect_cpu_utilization",
        temp_entity: "sensor.unifi_protect_cpu_temperature",
        memory_entity: "sensor.unifi_protect_memory_utilization",
        uptime_entity: "sensor.unifi_protect_uptime",
        hdd_entities: ["binary_sensor.unifi_protect_hdd_1", "binary_sensor.unifi_protect_hdd_2"],
      },
    };
  }

  static getConfigElement() {
    return document.createElement("ha-camera-hub-card-editor");
  }

  setConfig(config) {
    const stub = HACameraHubCard.getStubConfig();
    const nextConfig = { ...stub, ...config, nvr: { ...stub.nvr, ...(config?.nvr || {}) }, quick_links: Array.isArray(config?.quick_links) ? structuredClone(config.quick_links) : [] };
    const signature = JSON.stringify(nextConfig);
    this._config = nextConfig;
    if (signature === this._configSignature) return;
    this._configSignature = signature;
    this._cameras = (this._config.cameras || []).map((c) => {
      const eventPrefix = `event.${c.area}_${c.key}`;
      const eventSources = [
        ...(c.ai ? [{ id: `${eventPrefix}_smart_detection` }] : []),
        { id: `${eventPrefix}_motion_detection`, fallbackType: "motion" },
        ...(c.doorbell ? [{ id: `event.${c.key}_doorbell`, fallbackType: "ring" }] : []),
      ];
      return {
        ...c,
        camera_entity: `camera.${c.key}_${c.res || "medium"}_resolution_channel`,
        event_entity: eventSources[0]?.id,
        event_sources: eventSources,
        motion_entity: `binary_sensor.${c.key}_motion`,
      };
    });
    this._liveFeeds = {};
    this._liveGeneration += 1;
    this._sig = "";
    this._eventSig = "";
    this._eventsRenderSig = "";
    this._buildShell();
  }

  connectedCallback() {
    this._fetchEvents();
    if (!this._eventsTimer) this._eventsTimer = setInterval(() => this._fetchEvents(), EVENTS_REFRESH_MS);
    if (!this._systemTimer) this._systemTimer = setInterval(() => this._renderSystem(), SYSTEM_TICK_MS);
  }
  disconnectedCallback() {
    clearInterval(this._eventsTimer);
    clearInterval(this._systemTimer);
    clearTimeout(this._eventsDebounceTimer);
    for (const cached of this._thumbBlobCache.values()) if (cached.url) URL.revokeObjectURL(cached.url);
    this._thumbBlobCache.clear();
    this._eventsTimer = undefined;
    this._systemTimer = undefined;
  }

  _watchedIds() {
    const c = this._config;
    return [
      c.nvr.storage_entity, c.nvr.capacity_entity, c.nvr.cpu_entity, c.nvr.temp_entity, c.nvr.memory_entity, c.nvr.uptime_entity,
      ...(c.nvr.hdd_entities || []),
      ...(this._cameras || []).flatMap((cam) => [cam.camera_entity, ...(cam.event_sources || []).map((source) => source.id)]),
    ].filter(Boolean);
  }

  set hass(hass) {
    this._hass = hass;
    const ids = this._watchedIds();
    const sig = JSON.stringify(ids.map((id) => [id, hass?.states?.[id]?.state]));
    const eventSig = JSON.stringify((this._cameras || []).flatMap((cam) => (cam.event_sources || []).map((source) => {
      const state = hass?.states?.[source.id];
      return [source.id, state?.state, state?.attributes?.event_id, state?.attributes?.event_type];
    })));
    this._updateLiveTiles();
    if (sig !== this._sig) {
      this._sig = sig;
      this._renderSystem();
    }
    if (eventSig !== this._eventSig) {
      this._eventSig = eventSig;
      this._ingestLiveEvents();
      clearTimeout(this._eventsDebounceTimer);
      this._eventsDebounceTimer = setTimeout(() => this._fetchEvents(), 750);
    }
  }

  _s(id) {
    return id ? this._hass?.states?.[id] : undefined;
  }
  _num(id) {
    const n = Number(this._s(id)?.state);
    return Number.isFinite(n) ? n : undefined;
  }
  _esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  _more(id) {
    if (!id) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: id }, bubbles: true, composed: true }));
  }
  _navigate(path) {
    if (!path) return;
    history.pushState(null, "", path);
    window.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true }));
  }
  _mediaUrl(url) {
    if (!url) return "";
    return /^https?:\/\//i.test(url) ? url : this._hass.hassUrl(url);
  }
  _browseMedia(contentId) {
    return this._hass.callWS({ type: "media_source/browse_media", media_content_id: contentId });
  }
  _resolveMedia(contentId) {
    return this._hass.callWS({ type: "media_source/resolve_media", media_content_id: contentId });
  }
  _findMediaChild(node, name) {
    if (!name || !Array.isArray(node?.children)) return null;
    const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const target = norm(name);
    return node.children.find((child) => norm(child.title) === target) || node.children.find((child) => norm(child.title).includes(target)) || null;
  }
  _ago(iso) {
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.round(ms / 60000);
    if (m < 1) return "lige nu";
    if (m < 60) return `${m} min siden`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} t siden`;
    return `${Math.round(h / 24)} d siden`;
  }
  _time(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "--:--" : d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
  }

  _eventKey(event) {
    return event.eventId || `${event.cameraKey}:${event.ts}:${event.type}`;
  }

  _wallTimestamp(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return NaN;
    const timeZone = this._hass?.config?.time_zone || "Europe/Copenhagen";
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  }

  _ingestLiveEvents() {
    let changed = false;
    for (const cam of this._cameras || []) {
      for (const source of cam.event_sources || []) {
        const state = this._s(source.id);
        const iso = state?.state;
        const ts = Date.parse(iso || "");
        const type = state?.attributes?.event_type || source.fallbackType;
        if (!Number.isFinite(ts) || !type || Date.now() - ts > EVENTS_WINDOW_HOURS * 3600000) continue;
        const eventId = state.attributes?.event_id;
        const candidate = { ts, iso, cameraKey: cam.key, cameraName: cam.name, cameraEntity: cam.camera_entity, type, eventId };
        const exists = this._events.some((event) => this._eventKey(event) === this._eventKey(candidate));
        if (exists) continue;
        this._events.push(candidate);
        if (this._camThumbs?.[cam.key]) delete this._camThumbs[cam.key];
        changed = true;
      }
    }
    if (!changed) return;
    this._events.sort((a, b) => b.ts - a.ts);
    this._events = this._events.slice(0, 300);
    if (this._tab === "events") this._renderEvents(true);
  }

  _liveActivity(cam) {
    const on = (suffix) => this._s(`binary_sensor.${cam.key}_${suffix}`)?.state === "on";
    if (cam.ai) {
      if (on("person_detected")) return { text: "Person", icon: "mdi:account", cls: "person" };
      if (on("animal_detected")) return { text: "Dyr", icon: "mdi:paw", cls: "animal" };
      if (on("vehicle_detected")) return { text: "Køretøj", icon: "mdi:car", cls: "vehicle" };
      if (on("object_detected") || on("audio_object_detected") || on("license_plate_detected") || (cam.doorbell && on("doorbell")))
        return { text: "Hændelse", icon: "mdi:bell-ring", cls: "object" };
    }
    if (this._s(cam.motion_entity)?.state === "on") return { text: "Bevægelse", icon: "mdi:motion-sensor", cls: "motion" };
    return { text: "Roligt", icon: "mdi:shield-check-outline", cls: "quiet" };
  }

  _updateLiveTiles() {
    if (!this._hass || this._tab !== "live") return;
    (this._cameras || []).forEach((cam) => {
      this._setLiveFeed(cam);
      const tile = this.shadowRoot.querySelector(`[data-cam-tile="${cam.key}"]`);
      const badge = this.shadowRoot.querySelector(`[data-cam-badge="${cam.key}"]`);
      if (tile && badge) {
        const activity = this._liveActivity(cam);
        tile.className = `cam-tile ${activity.cls}`;
        badge.querySelector("ha-icon")?.setAttribute("icon", activity.icon);
        const label = badge.querySelector("span");
        if (label && label.textContent !== activity.text) label.textContent = activity.text;
      }
    });
  }

  _suspendLiveFeeds() {
    this._liveGeneration += 1;
    this._liveFeeds = {};
    this.shadowRoot.querySelectorAll("[data-feed]").forEach((feed) => {
      feed.classList.remove("ready");
      feed.replaceChildren();
    });
  }

  async _setLiveFeed(cam) {
    const key = cam.key;
    if (this._liveFeeds[key] === cam.camera_entity) {
      const card = this.shadowRoot.querySelector(`[data-feed="${key}"] [data-live-card]`);
      if (card) card.hass = this._hass;
      return;
    }
    this._liveFeeds[key] = cam.camera_entity;
    const feed = this.shadowRoot.querySelector(`[data-feed="${key}"]`);
    if (!feed) return;
    const generation = this._liveGeneration;
    const state = this._s(cam.camera_entity);
    if (!state) {
      feed.innerHTML = `<div class="missing"><div><ha-icon icon="mdi:camera-off-outline"></ha-icon><br>Kamera ikke fundet</div></div>`;
      return;
    }
    feed.classList.remove("ready");
    const snapshot = document.createElement("img");
    snapshot.className = "snapshot";
    snapshot.alt = cam.name || key;
    snapshot.decoding = "async";
    const entityPicture = state.attributes?.entity_picture;
    if (entityPicture) snapshot.src = this._hass.hassUrl(entityPicture);
    else if (state.attributes?.access_token) snapshot.src = this._hass.hassUrl(`/api/camera_proxy/${cam.camera_entity}?token=${state.attributes.access_token}`);
    feed.replaceChildren(snapshot);
    try {
      const helpers = await window.loadCardHelpers();
      if (generation !== this._liveGeneration || this._liveFeeds[key] !== cam.camera_entity) return;
      const card = await helpers.createCardElement({
        type: "picture-elements",
        camera_image: cam.camera_entity,
        camera_view: "live",
        elements: [],
        aspect_ratio: "16:9",
        fit_mode: "cover",
        tap_action: { action: "none" },
      });
      card.classList.add("live-card");
      card.dataset.liveCard = "";
      card.hass = this._hass;
      feed.appendChild(card);
      this._revealWhenReady(feed, card, generation, key);
    } catch (error) {
      feed.innerHTML = `<div class="missing"><div><ha-icon icon="mdi:alert-circle-outline"></ha-icon><br>Stream kunne ikke indlæses</div></div>`;
      console.error("HA Camera Hub Card", error);
    }
  }

  _mediaReady(node) {
    if (!node) return false;
    if (node instanceof HTMLVideoElement && node.readyState >= 2) return true;
    if (node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0) return true;
    if (node.shadowRoot && this._mediaReady(node.shadowRoot)) return true;
    return Array.from(node.children || []).some((child) => this._mediaReady(child));
  }

  _revealWhenReady(feed, card, generation, key, attempt = 0) {
    if (generation !== this._liveGeneration || !card.isConnected) return;
    if ((attempt >= 4 && this._mediaReady(card)) || attempt >= 80) {
      feed.classList.add("ready");
      setTimeout(() => feed.querySelector(".snapshot")?.remove(), 320);
      return;
    }
    setTimeout(() => this._revealWhenReady(feed, card, generation, key, attempt + 1), 100);
  }

  async _fetchEvents() {
    if (!this._hass?.callApi || this._eventsFetching) return;
    const ids = (this._cameras || []).flatMap((cam) => (cam.event_sources || []).map((source) => source.id)).filter(Boolean);
    if (!ids.length) return;
    this._eventsFetching = true;
    try {
      const start = new Date(Date.now() - (this._eventsFetchedAt ? 5 * 60 * 1000 : EVENTS_WINDOW_HOURS * 3600000));
      const path = `history/period/${encodeURIComponent(start.toISOString())}?filter_entity_id=${encodeURIComponent(ids.join(","))}`;
      const result = await this._hass.callApi("GET", path);
      const byEntity = new Map();
      for (const series of Array.isArray(result) ? result : []) {
        const id = series.find((row) => row.entity_id)?.entity_id;
        if (id) byEntity.set(id, series);
      }
      const events = [];
      for (const cam of this._cameras) {
        for (const source of cam.event_sources || []) {
          const series = byEntity.get(source.id) || [];
          for (const row of series) {
            const ts = row.state;
            const d = new Date(ts);
            if (Number.isNaN(d.getTime())) continue;
            const eventType = row.attributes?.event_type || source.fallbackType;
            if (!eventType) continue;
            events.push({
              ts: d.getTime(), iso: ts, cameraKey: cam.key, cameraName: cam.name,
              cameraEntity: cam.camera_entity, type: eventType, eventId: row.attributes?.event_id,
            });
          }
        }
      }
      const combined = new Map();
      for (const event of [...events, ...this._events]) {
        const fallbackKey = `${event.cameraKey}:${event.ts}:${event.type}`;
        const existing = combined.get(fallbackKey);
        const merged = existing ? { ...existing, ...event, eventId: event.eventId || existing.eventId } : event;
        combined.set(fallbackKey, merged);
      }
      const cutoff = Date.now() - EVENTS_WINDOW_HOURS * 3600000;
      this._events = [...combined.values()].filter((event) => event.ts >= cutoff).sort((a, b) => b.ts - a.ts).slice(0, 300);
      this._eventsFetchedAt = Date.now();
      if (this._tab === "events") this._renderEvents();
    } catch (error) {
      console.warn("HA Camera Hub Card: events history could not be loaded", error);
    } finally {
      this._eventsFetching = false;
    }
  }

  _typeInfo(type) {
    return TYPE_INFO[type] || { label: type, icon: "mdi:bell-outline", cls: "object" };
  }

  _parseMediaTimestamp(title) {
    if (!title) return NaN;
    // UniFi Protects egen medie-browser navngiver klip som "MM/DD/YY HH:MM:SS <varighed>s <type>",
    // uafhængigt af HA's sprog/lokalitet, fx "09/10/26 09:00:34 38s Audio Detection".
    const mdy = title.match(/^(\d{2})\/(\d{2})\/(\d{2})[ ,]+(\d{2}):(\d{2}):(\d{2})/);
    if (mdy) {
      const [, mm, dd, yy, hh, mi, ss] = mdy.map(Number);
      return Date.UTC(2000 + yy, mm - 1, dd, hh, mi, ss);
    }
    const isoMatch = title.match(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/);
    if (isoMatch) {
      const iso = new Date(isoMatch[0].replace(" ", "T"));
      if (!Number.isNaN(iso.getTime())) return iso.getTime();
    }
    const direct = new Date(title);
    return Number.isNaN(direct.getTime()) ? NaN : direct.getTime();
  }

  async _resolvePlayableNode(node, depth = 0) {
    const children = node?.children || [];
    if (!children.length || depth >= 4) return node;
    if (children.some((child) => child.can_play)) return node;
    const preferred =
      children.find((child) => /all\s*events?/i.test(child.title)) ||
      children.find((child) => /:all:recent:1$/.test(child.media_content_id || "") || /last\s*24\s*hours?/i.test(child.title)) ||
      (children.length === 1 ? children[0] : children.find((child) => child.can_expand));
    if (!preferred) return node;
    const next = await this._browseMedia(preferred.media_content_id);
    return this._resolvePlayableNode(next, depth + 1);
  }

  _findClosestMediaChild(children, targetTs, toleranceMs = 90 * 1000) {
    if (!Number.isFinite(targetTs)) return null;
    const targetWallTs = this._wallTimestamp(targetTs);
    let best = null;
    let bestDiff = Infinity;
    for (const child of children) {
      if (!child.can_play) continue;
      const ts = this._parseMediaTimestamp(child.title);
      if (Number.isNaN(ts)) continue;
      const diff = Math.abs(ts - targetWallTs);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = child;
      }
    }
    return bestDiff <= toleranceMs ? best : null;
  }

  async _openMediaBrowser(cam, event) {
    const dialog = this.shadowRoot.querySelector("[data-media-dialog]");
    if (!dialog || !this._hass?.callWS) return;
    this._media = { loading: true, error: null, stack: [{ title: cam?.name || "Hændelser", node: null }], playing: null };
    this._renderMediaDialog();
    if (!dialog.open) dialog.showModal();
    let targetNode = null;
    try {
      const root = await this._browseMedia("media-source://unifiprotect");
      let cameraNode = this._findMediaChild(root, cam?.name);
      if (!cameraNode && Array.isArray(root.children)) {
        for (const child of root.children) {
          if (!child.can_expand) continue;
          const sub = await this._browseMedia(child.media_content_id);
          const found = this._findMediaChild(sub, cam?.name);
          if (found) {
            cameraNode = found;
            break;
          }
        }
      }
      targetNode = cameraNode ? await this._browseMedia(cameraNode.media_content_id) : root;
      let stackTitle = cameraNode ? cam?.name || cameraNode.title : "Hændelser (alle kameraer)";
      if (cameraNode) {
        const playable = await this._resolvePlayableNode(targetNode);
        if (playable !== targetNode) {
          targetNode = playable;
          stackTitle += " · Alle hændelser";
        }
      }
      this._media = {
        loading: false,
        error: null,
        stack: [{ title: stackTitle, node: targetNode }],
        playing: null,
      };
    } catch (error) {
      console.error("HA Camera Hub Card: media browse failed", error);
      this._media = { loading: false, error: "Kunne ikke indlæse hændelser fra Medier.", stack: [{ title: cam?.name || "Hændelser", node: null }], playing: null };
      this._renderMediaDialog();
      return;
    }
    const match = event && Array.isArray(targetNode.children) ? this._findClosestMediaChild(targetNode.children, event.ts) : null;
    if (match) {
      await this._mediaPlay(match);
    } else {
      if (event) this._media.notice = "Kunne ikke finde et præcist match automatisk – vælg klippet herunder.";
      this._renderMediaDialog();
    }
  }

  async _mediaDrill(child) {
    if (!this._media) return;
    this._media.loading = true;
    this._renderMediaDialog();
    try {
      const node = await this._browseMedia(child.media_content_id);
      this._media.stack.push({ title: child.title, node });
      this._media.loading = false;
    } catch (error) {
      this._media.loading = false;
      this._media.error = "Mappen kunne ikke åbnes.";
    }
    this._renderMediaDialog();
  }

  _mediaBack() {
    if (!this._media) return;
    if (this._media.playing) {
      this._media.playing = null;
      this._renderMediaDialog();
      return;
    }
    if (this._media.stack.length > 1) this._media.stack.pop();
    this._renderMediaDialog();
  }

  async _mediaRefresh() {
    if (!this._media || this._media.playing) return;
    const top = this._media.stack[this._media.stack.length - 1];
    const contentId = top?.node?.media_content_id;
    if (!contentId) return;
    this._media.loading = true;
    this._media.notice = null;
    this._media.error = null;
    this._renderMediaDialog();
    try {
      top.node = await this._browseMedia(contentId);
    } catch (error) {
      this._media.error = "Kunne ikke opdatere hændelser.";
    }
    this._media.loading = false;
    this._renderMediaDialog();
  }

  async _mediaPlay(child) {
    if (!this._media) return;
    this._media.loading = true;
    this._renderMediaDialog();
    try {
      const resolved = await this._resolveMedia(child.media_content_id);
      this._media.playing = { url: this._mediaUrl(resolved.url), mime: resolved.mime_type, title: child.title };
      this._media.loading = false;
    } catch (error) {
      this._media.loading = false;
      this._media.error = "Klippet kunne ikke afspilles.";
    }
    this._renderMediaDialog();
  }

  _closeMediaDialog() {
    this.shadowRoot.querySelector("[data-media-dialog]")?.close();
    this._media = null;
  }

  _renderMediaDialog() {
    const dialog = this.shadowRoot.querySelector("[data-media-dialog]");
    const body = this.shadowRoot.querySelector("[data-media-body]");
    const titleEl = this.shadowRoot.querySelector("[data-media-title]");
    const backBtn = this.shadowRoot.querySelector("[data-media-back]");
    const refreshBtn = this.shadowRoot.querySelector("[data-media-refresh]");
    if (!dialog || !body || !titleEl || !backBtn || !this._media) return;
    const top = this._media.stack[this._media.stack.length - 1];
    titleEl.textContent = this._media.playing ? this._media.playing.title : top?.title || "Hændelser";
    backBtn.hidden = this._media.stack.length <= 1 && !this._media.playing;
    if (refreshBtn) refreshBtn.hidden = !!this._media.playing;

    if (this._media.loading) {
      body.innerHTML = `<div class="media-loading">Indlæser…</div>`;
      return;
    }
    if (this._media.error) {
      body.innerHTML = `<div class="media-error">${this._esc(this._media.error)}</div>`;
      return;
    }
    if (this._media.playing) {
      const isVideo = (this._media.playing.mime || "").startsWith("video");
      body.innerHTML = `<div class="media-player">${
        isVideo
          ? `<video src="${this._esc(this._media.playing.url)}" controls autoplay playsinline></video>`
          : `<img src="${this._esc(this._media.playing.url)}" alt="${this._esc(this._media.playing.title)}" style="width:100%;border-radius:12px">`
      }</div>`;
      return;
    }
    const children = top?.node?.children || [];
    if (!children.length) {
      body.innerHTML = `<div class="media-loading">Ingen hændelser fundet her.</div>`;
      return;
    }
    body.innerHTML = `<div class="media-grid">${children
      .map(
        (child, i) => `<button class="media-item" data-media-child="${i}">
          <div class="media-thumb">${
            child.thumbnail
              ? `<img src="${this._esc(this._mediaUrl(child.thumbnail))}" alt="">`
              : `<ha-icon icon="${child.can_expand ? "mdi:folder-outline" : "mdi:play-circle-outline"}"></ha-icon>`
          }${child.can_play ? `<div class="play-badge"><ha-icon icon="mdi:play-circle"></ha-icon></div>` : ""}</div>
          <span>${this._esc(child.title)}</span>
        </button>`,
      )
      .join("")}</div>`;
    body.querySelectorAll("[data-media-child]").forEach((btn) => {
      const child = children[Number(btn.dataset.mediaChild)];
      btn.addEventListener("click", () => {
        if (child.can_play) this._mediaPlay(child);
        else if (child.can_expand) this._mediaDrill(child);
      });
    });
  }

  _eventsHtml() {
    if (!this._events.length) return `<div class="empty">Ingen hændelser fundet de seneste ${EVENTS_WINDOW_HOURS} timer</div>`;
    const filtered = this._filter === "all" ? this._events : this._events.filter((e) => this._typeInfo(e.type).cls === this._filter);
    if (!filtered.length) return `<div class="empty">Ingen hændelser matcher filteret</div>`;
    return `<div class="event-list">${filtered
      .slice(0, 150)
      .map((e) => {
        const info = this._typeInfo(e.type);
        return `<div class="event-row ${info.cls}" data-media-cam="${this._esc(e.cameraKey)}" data-media-ts="${e.ts}" title="Afspil hændelse">
          <div class="event-thumb" data-thumb-key="${this._esc(e.cameraKey)}" data-thumb-ts="${e.ts}" data-event-id="${this._esc(e.eventId || "")}"><ha-icon icon="mdi:cctv"></ha-icon></div>
          <div class="event-icon ${info.cls}"><ha-icon icon="${info.icon}"></ha-icon></div>
          <div class="event-main">
            <b>${this._esc(e.cameraName)}</b>
            <span data-event-meta data-event-iso="${this._esc(e.iso)}" data-event-label="${this._esc(info.label)}">${this._esc(info.label)} &middot; ${this._time(e.iso)} &middot; ${this._esc(this._ago(e.iso))}</span>
          </div>
          <button class="event-open" data-more="${this._esc(e.cameraEntity)}" title="Vis kamera nu" onclick="event.stopPropagation()"><ha-icon icon="mdi:cctv"></ha-icon></button>
        </div>`;
      })
      .join("")}</div>`;
  }

  async _ensureCamThumbs(camKey) {
    const now = Date.now();
    this._camThumbs ||= {};
    const cached = this._camThumbs[camKey];
    if (cached && now - cached.fetchedAt < 3 * 60 * 1000) return cached.items;
    const cam = (this._cameras || []).find((c) => c.key === camKey);
    if (!cam || !this._hass?.callWS) return cached?.items || [];
    try {
      const root = await this._getMediaRoot();
      let cameraNode = this._findMediaChild(root, cam.name);
      if (!cameraNode && Array.isArray(root.children)) {
        for (const child of root.children) {
          if (!child.can_expand) continue;
          const sub = await this._browseMedia(child.media_content_id);
          const found = this._findMediaChild(sub, cam.name);
          if (found) {
            cameraNode = found;
            break;
          }
        }
      }
      if (!cameraNode) return cached?.items || [];
      const camNode = await this._browseMedia(cameraNode.media_content_id);
      const playable = await this._resolvePlayableNode(camNode);
      const items = (playable.children || [])
        .filter((child) => child.can_play && child.thumbnail)
        .map((child) => ({
          ts: this._parseMediaTimestamp(child.title),
          eventId: String(child.media_content_id || "").match(/:event:([^:]+)$/)?.[1],
          thumbnail: this._mediaUrl(child.thumbnail),
        }))
        .filter((item) => Number.isFinite(item.ts));
      this._camThumbs[camKey] = { fetchedAt: now, items };
      return items;
    } catch (error) {
      return cached?.items || [];
    }
  }

  async _getMediaRoot() {
    const now = Date.now();
    if (this._mediaRoot && now - this._mediaRootFetchedAt < 60 * 1000) return this._mediaRoot;
    if (!this._mediaRootPromise) {
      this._mediaRootPromise = this._browseMedia("media-source://unifiprotect")
        .then((root) => {
          this._mediaRoot = root;
          this._mediaRootFetchedAt = Date.now();
          return root;
        })
        .finally(() => { this._mediaRootPromise = null; });
    }
    return this._mediaRootPromise;
  }

  _closestThumbUrl(items, targetTs, eventId, toleranceMs = 90 * 1000) {
    if (eventId) {
      const exact = items.find((item) => item.eventId === eventId);
      if (exact) return exact.thumbnail;
    }
    const targetWallTs = this._wallTimestamp(targetTs);
    let best = null;
    let bestDiff = Infinity;
    for (const item of items) {
      const diff = Math.abs(item.ts - targetWallTs);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = item;
      }
    }
    return bestDiff <= toleranceMs ? best?.thumbnail : null;
  }

  async _authenticatedThumbnail(url) {
    const cached = this._thumbBlobCache.get(url);
    if (cached?.url) return cached.url;
    if (cached?.promise) return cached.promise;
    const auth = this._hass?.auth || this._hass?.connection?.options?.auth;
    const token = auth?.data?.access_token || auth?.accessToken;
    if (!token) throw new Error("Home Assistant access token is unavailable");
    const promise = fetch(url, {
      credentials: "same-origin",
      headers: { Authorization: `Bearer ${token}` },
    }).then(async (response) => {
      if (!response.ok) throw new Error(`Thumbnail request failed (${response.status})`);
      const objectUrl = URL.createObjectURL(await response.blob());
      this._thumbBlobCache.set(url, { url: objectUrl, fetchedAt: Date.now() });
      while (this._thumbBlobCache.size > 240) {
        const [oldKey, oldValue] = this._thumbBlobCache.entries().next().value;
        if (oldValue?.url) URL.revokeObjectURL(oldValue.url);
        this._thumbBlobCache.delete(oldKey);
      }
      return objectUrl;
    }).catch((error) => {
      this._thumbBlobCache.delete(url);
      throw error;
    });
    this._thumbBlobCache.set(url, { promise });
    return promise;
  }

  async _hydrateEventThumbs(mount) {
    this._thumbGeneration += 1;
    const nodes = Array.from(mount.querySelectorAll("[data-thumb-key]"));
    const keys = [...new Set(nodes.map((node) => node.dataset.thumbKey))];
    await Promise.all(keys.map(async (key) => {
      const items = await this._ensureCamThumbs(key);
      if (!items.length || !mount.isConnected) return;
      const jobs = Array.from(mount.querySelectorAll(`[data-thumb-key="${CSS.escape(key)}"]`)).map((node) => {
        const ts = Number(node.dataset.thumbTs);
        const sourceUrl = this._closestThumbUrl(items, ts, node.dataset.eventId);
        return sourceUrl ? { node, sourceUrl } : null;
      }).filter(Boolean);
      for (const job of jobs) {
        const cachedBlob = this._thumbBlobCache.get(job.sourceUrl)?.url;
        if (!job.node.isConnected || (job.node.dataset.thumbnailSource === job.sourceUrl && cachedBlob && job.node.querySelector("img")?.src === cachedBlob)) continue;
        try {
          const objectUrl = await this._authenticatedThumbnail(job.sourceUrl);
          if (!job.node.isConnected) continue;
          job.node.dataset.thumbnailSource = job.sourceUrl;
          job.node.replaceChildren(Object.assign(document.createElement("img"), { src: objectUrl, alt: "" }));
        } catch (error) {
          console.warn("HA Camera Hub Card: thumbnail could not be loaded", error);
        }
      }
    }));
  }

  _renderEvents(forceStructure = false) {
    const mount = this.shadowRoot.querySelector("[data-events-mount]");
    if (!mount) return;
    const visible = (this._filter === "all" ? this._events : this._events.filter((event) => this._typeInfo(event.type).cls === this._filter)).slice(0, 150);
    const signature = JSON.stringify([this._filter, visible.map((event) => [this._eventKey(event), event.eventId])]);
    if (!forceStructure && signature === this._eventsRenderSig && mount.hasChildNodes()) {
      mount.querySelectorAll("[data-event-meta]").forEach((meta) => {
        const value = `${meta.dataset.eventLabel} · ${this._time(meta.dataset.eventIso)} · ${this._ago(meta.dataset.eventIso)}`;
        if (meta.textContent !== value) meta.textContent = value;
      });
      this._hydrateEventThumbs(mount);
      return;
    }
    this._eventsRenderSig = signature;
    mount.innerHTML = `<div class="filters">${FILTERS.map(
      ([key, label, icon]) => `<button class="filter-chip ${this._filter === key ? "active" : ""}" data-filter="${key}"><ha-icon icon="${icon}"></ha-icon>${label}</button>`,
    ).join("")}</div>${this._eventsHtml()}`;
    if (!mount.dataset.bound) {
      mount.dataset.bound = "true";
      mount.addEventListener("click", (event) => {
        const more = event.target.closest?.("[data-more]");
        if (more) { event.stopPropagation(); this._more(more.dataset.more); return; }
        const filter = event.target.closest?.("[data-filter]");
        if (filter) { this._filter = filter.dataset.filter; this._renderEvents(true); return; }
        const row = event.target.closest?.("[data-media-cam]");
        if (!row) return;
        const cam = (this._cameras || []).find((candidate) => candidate.key === row.dataset.mediaCam);
        const ts = Number(row.dataset.mediaTs);
        if (cam) this._openMediaBrowser(cam, Number.isFinite(ts) ? { ts } : null);
      });
    }
    this._hydrateEventThumbs(mount);
  }

  _renderSystem() {
    const mount = this.shadowRoot.querySelector("[data-system-mount]");
    if (!mount || !this._hass) return;
    const c = this._config.nvr;
    const storage = this._num(c.storage_entity);
    const capacitySec = this._num(c.capacity_entity);
    const capacityDays = Number.isFinite(capacitySec) ? capacitySec / 86400 : undefined;
    const cpu = this._num(c.cpu_entity);
    const temp = this._num(c.temp_entity);
    const memory = this._num(c.memory_entity);
    const uptime = this._s(c.uptime_entity)?.state;
    const hddIssues = (c.hdd_entities || []).filter((id) => this._s(id)?.state === "on").length;
    const online = (this._cameras || []).filter((cam) => this._s(cam.camera_entity) && this._s(cam.camera_entity)?.state !== "unavailable").length;
    const total = (this._cameras || []).length;

    const row = (icon, label, value, warn) => `<div class="row ${warn ? "warn" : ""}"><ha-icon icon="${icon}"></ha-icon><span class="row-label">${label}</span><span class="row-value">${value}</span></div>`;

    const html = `
      <div class="row-list">
        ${row("mdi:cctv", "Kameraer online", `${online} / ${total}`, online < total)}
        ${row("mdi:harddisk", "Lagerplads brugt", Number.isFinite(storage) ? `${storage.toFixed(1)} %` : "—", storage >= 90)}
        ${row("mdi:calendar-clock", "Optagekapacitet tilbage", Number.isFinite(capacityDays) ? `${capacityDays.toFixed(1)} dage` : "—", capacityDays < 3)}
        ${row("mdi:chip", "CPU", Number.isFinite(cpu) ? `${cpu.toFixed(0)} %` : "—", cpu >= 90)}
        ${row("mdi:thermometer", "CPU-temperatur", Number.isFinite(temp) ? `${temp.toFixed(0)}°` : "—", temp >= 75)}
        ${row("mdi:memory", "Hukommelse", Number.isFinite(memory) ? `${memory.toFixed(0)} %` : "—", memory >= 90)}
        ${row("mdi:timer-outline", "NVR oppetid", uptime || "—", false)}
        ${row("mdi:harddisk-plus", "Disk-fejl", hddIssues > 0 ? `${hddIssues} disk(e)` : "Ingen", hddIssues > 0)}
      </div>
      <button class="protect-btn" data-media-cam="">
        <ha-icon icon="mdi:play-box-multiple-outline"></ha-icon>
        <div><b>Gennemse hændelser i Medier</b><small>Alle kameraers klip via Home Assistants indbyggede medieafspiller</small></div>
      </button>
      <button class="protect-btn" data-nav="${this._esc(this._config.protect_ingress_path)}">
        <ha-icon icon="mdi:open-in-new"></ha-icon>
        <div><b>Åbn UniFi Protect</b><small>Det native UniFi-interface (kræver at ingress-adgang virker på dit setup)</small></div>
      </button>
    `;
    this._patchMount(mount, html);
    if (!mount.dataset.bound) {
      mount.dataset.bound = "true";
      mount.addEventListener("click", (event) => {
        const nav = event.target.closest?.("[data-nav]");
        if (nav) { this._navigate(nav.dataset.nav); return; }
        if (event.target.closest?.("[data-media-cam]")) this._openMediaBrowser(null);
      });
    }
  }

  _patchMount(mount, html) {
    const template = document.createElement("template");
    template.innerHTML = html;
    const current = Array.from(mount.childNodes);
    const next = Array.from(template.content.childNodes);
    for (let index = current.length - 1; index >= next.length; index -= 1) current[index].remove();
    for (let index = 0; index < next.length; index += 1) {
      const existing = mount.childNodes[index];
      if (!existing) mount.appendChild(next[index].cloneNode(true));
      else this._morphNode(existing, next[index]);
    }
  }

  _morphNode(current, next) {
    if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName) {
      current.replaceWith(next.cloneNode(true)); return;
    }
    if (current.nodeType === Node.TEXT_NODE) {
      if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
      return;
    }
    if (current.nodeType !== Node.ELEMENT_NODE) return;
    for (const attribute of Array.from(current.attributes)) if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
    for (const attribute of Array.from(next.attributes)) if (current.getAttribute(attribute.name) !== attribute.value) current.setAttribute(attribute.name, attribute.value);
    const currentChildren = Array.from(current.childNodes);
    const nextChildren = Array.from(next.childNodes);
    for (let index = currentChildren.length - 1; index >= nextChildren.length; index -= 1) currentChildren[index].remove();
    for (let index = 0; index < nextChildren.length; index += 1) {
      const existing = current.childNodes[index];
      if (!existing) current.appendChild(nextChildren[index].cloneNode(true));
      else this._morphNode(existing, nextChildren[index]);
    }
  }

  _buildShell() {
    if (!this.shadowRoot) return;
    const c = this._config;
    const tabs = [
      ["live", "Live", "mdi:cctv"],
      ["events", "Hændelser", "mdi:bell-ring-outline"],
      ["system", "System", "mdi:server-network"],
    ];
    this.shadowRoot.innerHTML = `<style>
      :host{display:block;--good:var(--dashboard-success, var(--success-color, #20e3a2));--warn:var(--dashboard-warning, var(--warning-color, #f59e0b));--danger:var(--dashboard-danger, var(--error-color, #ef4444));--accent:var(--dashboard-accent, var(--info-color, #38bdf8));--edge:var(--dashboard-border-neutral, var(--divider-color, rgba(127,145,165,.2)));--muted:var(--dashboard-icon-muted, var(--disabled-text-color, #64748b));--animal:#f97316;--object:#a855f7;--motion:#06b6d4;--card-surface:var(--dashboard-card-bg,var(--ha-card-background,var(--card-background-color,#111820)));--card-solid:var(--card-background-color,#111820)}
      *{box-sizing:border-box}
      ha-card{padding:16px;border-radius:22px;background:var(--card-surface);border:var(--ha-card-border-width,1px) solid var(--ha-card-border-color,var(--edge));color:var(--primary-text-color);box-shadow:var(--ha-card-box-shadow)}
      .head{display:flex;align-items:center;gap:12px;margin-bottom:14px;padding:0 4px}
      .head ha-icon{--mdc-icon-size:24px;color:var(--accent)}
      .head strong{display:block;font-size:16px}
      .head span{display:block;color:var(--secondary-text-color);font-size:12px;margin-top:2px}
      .tabs{display:flex;gap:6px;margin-bottom:14px;padding:0 4px}
      .tab{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:10px 8px;border-radius:12px;border:1px solid var(--edge);background:transparent;color:var(--secondary-text-color);font-size:12.5px;font-weight:800;cursor:pointer}
      .tab ha-icon{--mdc-icon-size:16px}
      .tab.active{color:#fff;background:var(--accent);border-color:var(--accent)}
      .panel[hidden]{display:none}
      .empty{padding:34px 16px;text-align:center;color:var(--secondary-text-color);font-size:12.5px}
      .live-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}
      .cam-tile{position:relative;border:1px solid color-mix(in srgb,var(--good) 18%,transparent);border-left:4px solid var(--good);border-radius:14px;overflow:hidden;background:linear-gradient(145deg,color-mix(in srgb,var(--good) 6%,transparent),transparent 55%),var(--card-surface);box-shadow:0 6px 16px rgba(0,0,0,.12);transition:border-color .25s ease,background .25s ease}
      .cam-tile.person{border-color:color-mix(in srgb,var(--danger) 30%,transparent);border-left-color:var(--danger);background:linear-gradient(145deg,color-mix(in srgb,var(--danger) 10%,transparent),transparent 55%),var(--card-surface)}
      .cam-tile.animal{border-color:color-mix(in srgb,var(--animal) 30%,transparent);border-left-color:var(--animal);background:linear-gradient(145deg,color-mix(in srgb,var(--animal) 10%,transparent),transparent 55%),var(--card-surface)}
      .cam-tile.vehicle{border-color:color-mix(in srgb,var(--accent) 30%,transparent);border-left-color:var(--accent);background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 10%,transparent),transparent 55%),var(--card-surface)}
      .cam-tile.object{border-color:color-mix(in srgb,var(--object) 30%,transparent);border-left-color:var(--object);background:linear-gradient(145deg,color-mix(in srgb,var(--object) 10%,transparent),transparent 55%),var(--card-surface)}
      .cam-tile.motion{border-color:color-mix(in srgb,var(--motion) 30%,transparent);border-left-color:var(--motion);background:linear-gradient(145deg,color-mix(in srgb,var(--motion) 10%,transparent),transparent 55%),var(--card-surface)}
      .cam-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px}
      .cam-bar b{font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .cam-badge{display:flex;align-items:center;gap:4px;flex:0 0 auto;font-size:10px;font-weight:800;color:var(--good)}
      .cam-badge ha-icon{--mdc-icon-size:14px}
      .cam-tile.person .cam-badge{color:var(--danger)}
      .cam-tile.animal .cam-badge{color:var(--animal)}
      .cam-tile.vehicle .cam-badge{color:var(--accent)}
      .cam-tile.object .cam-badge{color:var(--object)}
      .cam-tile.motion .cam-badge{color:var(--motion)}
      .feed{position:relative;aspect-ratio:16/9;overflow:hidden;cursor:pointer;background:#05080d}
      .feed>*{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;min-width:0!important;min-height:0!important;display:block;overflow:hidden}
      .snapshot{z-index:2;object-fit:cover;opacity:1;transition:opacity .28s ease}
      .live-card{z-index:1;opacity:0;transition:opacity .28s ease}
      .feed.ready .snapshot{opacity:0;pointer-events:none}
      .feed.ready .live-card{opacity:1}
      .missing{display:grid!important;place-items:center;color:var(--muted);font-size:11px;text-align:center}
      .missing ha-icon{--mdc-icon-size:24px;margin-bottom:4px}
      .filters{display:flex;gap:6px;overflow-x:auto;padding:0 4px 12px}
      .filter-chip{flex:0 0 auto;display:flex;align-items:center;gap:5px;padding:7px 12px;border-radius:999px;border:1px solid var(--edge);background:transparent;color:var(--secondary-text-color);font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap}
      .filter-chip ha-icon{--mdc-icon-size:14px}
      .filter-chip.active{color:#fff;background:var(--accent);border-color:var(--accent)}
      .event-list{display:flex;flex-direction:column;gap:8px;max-height:520px;overflow-y:auto;padding:2px}
      .event-row{position:relative;display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--muted) 16%,transparent);border-left:3px solid var(--muted);border-radius:12px;background:linear-gradient(145deg,color-mix(in srgb,var(--muted) 6%,transparent),transparent 60%),var(--card-surface);box-shadow:0 4px 12px rgba(0,0,0,.1);cursor:pointer}
      .event-row.person{border-color:color-mix(in srgb,var(--danger) 28%,transparent);border-left-color:var(--danger);background:linear-gradient(145deg,color-mix(in srgb,var(--danger) 9%,transparent),transparent 60%),var(--card-surface)}
      .event-row.animal{border-color:color-mix(in srgb,var(--animal) 28%,transparent);border-left-color:var(--animal);background:linear-gradient(145deg,color-mix(in srgb,var(--animal) 9%,transparent),transparent 60%),var(--card-surface)}
      .event-row.vehicle{border-color:color-mix(in srgb,var(--accent) 28%,transparent);border-left-color:var(--accent);background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 9%,transparent),transparent 60%),var(--card-surface)}
      .event-row.object{border-color:color-mix(in srgb,var(--object) 28%,transparent);border-left-color:var(--object);background:linear-gradient(145deg,color-mix(in srgb,var(--object) 9%,transparent),transparent 60%),var(--card-surface)}
      .event-row.motion{border-color:color-mix(in srgb,var(--motion) 28%,transparent);border-left-color:var(--motion);background:linear-gradient(145deg,color-mix(in srgb,var(--motion) 9%,transparent),transparent 60%),var(--card-surface)}
      .event-thumb{width:44px;height:44px;border-radius:11px;display:flex;align-items:center;justify-content:center;flex:0 0 auto;overflow:hidden;background:color-mix(in srgb,var(--muted) 14%,transparent);color:var(--muted)}
      .event-thumb ha-icon{--mdc-icon-size:18px}
      .event-thumb img{width:100%;height:100%;object-fit:cover;display:block}
      .event-icon{width:26px;height:26px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex:0 0 auto;background:color-mix(in srgb,var(--muted) 16%,transparent);color:var(--muted)}
      .event-icon ha-icon{--mdc-icon-size:14px}
      .event-icon.person{background:color-mix(in srgb,var(--danger) 16%,transparent);color:var(--danger)}
      .event-icon.animal{background:color-mix(in srgb,var(--animal) 16%,transparent);color:var(--animal)}
      .event-icon.vehicle{background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent)}
      .event-icon.object{background:color-mix(in srgb,var(--object) 16%,transparent);color:var(--object)}
      .event-icon.motion{background:color-mix(in srgb,var(--motion) 16%,transparent);color:var(--motion)}
      .event-main{flex:1;min-width:0}
      .event-main b{display:block;font-size:12.5px}
      .event-main span{display:block;margin-top:2px;font-size:11px;color:var(--secondary-text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .event-open{flex:0 0 auto;width:32px;height:32px;border-radius:10px;border:1px solid var(--edge);background:transparent;color:var(--accent);cursor:pointer;display:flex;align-items:center;justify-content:center}
      .event-open ha-icon{--mdc-icon-size:16px}
      .row-list{display:flex;flex-direction:column;gap:8px}
      .row{position:relative;display:flex;align-items:center;gap:10px;padding:11px 13px;border:1px solid color-mix(in srgb,var(--accent) 16%,transparent);border-left:3px solid var(--accent);border-radius:12px;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 6%,transparent),transparent 60%),var(--card-surface);box-shadow:0 4px 12px rgba(0,0,0,.1)}
      .row.warn{border-color:color-mix(in srgb,var(--danger) 30%,transparent);border-left-color:var(--danger);background:linear-gradient(145deg,color-mix(in srgb,var(--danger) 10%,transparent),transparent 60%),var(--card-surface)}
      .row ha-icon{--mdc-icon-size:17px;color:var(--accent);flex:0 0 auto}
      .row.warn ha-icon{color:var(--danger)}
      .row-label{flex:1;font-size:12.5px;color:var(--secondary-text-color)}
      .row-value{font-size:12.5px;font-weight:800}
      .row.warn .row-value{color:var(--danger)}
      .protect-btn{display:flex;align-items:center;gap:10px;width:100%;margin-top:14px;padding:13px 14px;border-radius:15px;border:1px solid var(--edge);background:transparent;color:var(--primary-text-color);cursor:pointer;text-align:left}
      .protect-btn ha-icon{--mdc-icon-size:20px;color:var(--accent)}
      .protect-btn small{display:block;color:var(--secondary-text-color);font-size:11px;margin-top:2px}
      .protect-btn+.protect-btn{margin-top:8px}
      .quick-links{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:9px;margin-top:14px;padding-top:14px;border-top:1px solid var(--edge)}
      .quick-link{display:grid;grid-template-columns:38px minmax(0,1fr) 24px;align-items:center;gap:10px;min-width:0;padding:11px 12px;border:1px solid color-mix(in srgb,var(--accent) 28%,var(--edge));border-radius:13px;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 9%,transparent),transparent 70%);color:var(--primary-text-color);text-align:left;cursor:pointer}
      .quick-link>.quick-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:11px;background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent)}.quick-link>.quick-icon ha-icon{--mdc-icon-size:22px}.quick-link b{display:block;overflow:hidden;font-size:12.5px;text-overflow:ellipsis;white-space:nowrap}.quick-link small{display:block;margin-top:2px;color:var(--secondary-text-color);font-size:10.5px}.quick-link>.arrow{--mdc-icon-size:18px;color:var(--accent)}
      dialog[data-media-dialog]{width:min(94vw,560px);max-height:82vh;margin:auto;border:1px solid var(--edge);border-radius:18px;padding:0;background:var(--card-surface);color:var(--primary-text-color);box-shadow:0 18px 50px rgba(0,0,0,.35)}
      dialog[data-media-dialog]::backdrop{background:rgba(0,0,0,.5);backdrop-filter:blur(2px)}
      .sheet-head{display:flex;align-items:center;gap:8px;padding:13px 14px;border-bottom:1px solid var(--edge)}
      .sheet-head b{flex:1;font-size:14px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .sheet-head button{display:grid;place-items:center;flex:0 0 auto;width:32px;height:32px;border:0;border-radius:50%;background:color-mix(in srgb,var(--card-solid) 85%,var(--primary-text-color) 15%);color:var(--primary-text-color);cursor:pointer}
      .sheet-head button ha-icon{--mdc-icon-size:18px}
      .sheet-head [data-media-back][hidden],.sheet-head [data-media-refresh][hidden]{visibility:hidden;display:grid}
      .media-body{padding:12px 14px 16px;overflow-y:auto;max-height:calc(82vh - 58px)}
      .media-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
      .media-item{border:1px solid var(--edge);border-radius:12px;overflow:hidden;cursor:pointer;background:var(--card-surface);text-align:left;padding:0;color:inherit;font:inherit}
      .media-thumb{position:relative;aspect-ratio:16/9;background:#05080d;display:flex;align-items:center;justify-content:center;color:var(--muted)}
      .media-thumb img{width:100%;height:100%;object-fit:cover;display:block}
      .media-thumb ha-icon{--mdc-icon-size:28px}
      .media-thumb .play-badge{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.18);color:#fff}
      .media-item span{display:block;padding:6px 8px;font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .media-player video{width:100%;border-radius:12px;background:#000;display:block}
      .media-loading,.media-error{padding:30px 10px;text-align:center;color:var(--secondary-text-color);font-size:12.5px}
      .media-error{color:var(--danger)}
      @media(max-width:600px){.tab span{display:none}.tab{padding:10px 4px}}
    </style>
    <ha-card>
      <div class="head">
        <ha-icon icon="mdi:cctv"></ha-icon>
        <div><strong>${this._esc(c.title)}</strong><span>${this._esc(c.subtitle)}</span></div>
      </div>
      <div class="tabs">${tabs.map(([key, label, icon]) => `<button class="tab ${this._tab === key ? "active" : ""}" data-tab="${key}"><ha-icon icon="${icon}"></ha-icon><span>${label}</span></button>`).join("")}</div>
      <div class="panel" data-panel="live" ${this._tab === "live" ? "" : "hidden"}><div class="live-grid">${(this._cameras || [])
        .map(
          (cam) => `<section class="cam-tile" data-cam-tile="${this._esc(cam.key)}">
            <div class="cam-bar">
              <b>${this._esc(cam.name || cam.key)}</b>
              <span class="cam-badge" data-cam-badge="${this._esc(cam.key)}"><ha-icon icon="mdi:shield-check-outline"></ha-icon><span>Roligt</span></span>
            </div>
            <div class="feed" data-feed="${this._esc(cam.key)}"><div class="empty">Indlæser…</div></div>
          </section>`,
        )
        .join("")}</div></div>
      <div class="panel" data-panel="events" ${this._tab === "events" ? "" : "hidden"}><div data-events-mount></div></div>
      <div class="panel" data-panel="system" ${this._tab === "system" ? "" : "hidden"}><div data-system-mount></div></div>
      ${(c.quick_links || []).length ? `<div class="quick-links">${c.quick_links.map((link) => `<button class="quick-link" data-quick-link="${this._esc(link.navigation_path || "")}"><span class="quick-icon"><ha-icon icon="${this._esc(link.icon || "mdi:arrow-right-circle-outline")}"></ha-icon></span><span><b>${this._esc(link.name || "Åbn")}</b><small>${this._esc(link.subtitle || "Åbn oversigt")}</small></span><ha-icon class="arrow" icon="mdi:chevron-right"></ha-icon></button>`).join("")}</div>` : ""}
    </ha-card>
    <dialog data-media-dialog>
      <div class="sheet-head">
        <button data-media-back hidden title="Tilbage"><ha-icon icon="mdi:arrow-left"></ha-icon></button>
        <b data-media-title>Hændelser</b>
        <button data-media-refresh title="Opdater"><ha-icon icon="mdi:refresh"></ha-icon></button>
        <button data-media-close aria-label="Luk"><ha-icon icon="mdi:close"></ha-icon></button>
      </div>
      <div class="media-body" data-media-body></div>
    </dialog>`;

    this.shadowRoot.querySelectorAll("[data-tab]").forEach((el) =>
      el.addEventListener("click", () => {
        const previousTab = this._tab;
        this._tab = el.dataset.tab;
        if (previousTab === "live" && this._tab !== "live") this._suspendLiveFeeds();
        this.shadowRoot.querySelectorAll("[data-tab]").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === this._tab));
        this.shadowRoot.querySelectorAll("[data-panel]").forEach((panel) => {
          panel.hidden = panel.dataset.panel !== this._tab;
        });
        if (this._tab === "events") {
          this._renderEvents();
          this._fetchEvents();
        }
        if (this._tab === "system") this._renderSystem();
        if (this._tab === "live") this._updateLiveTiles();
      }),
    );

    this.shadowRoot.querySelectorAll("[data-feed]").forEach((feed) =>
      feed.addEventListener("click", () => {
        const cam = (this._cameras || []).find((c2) => c2.key === feed.dataset.feed);
        if (cam) this._more(cam.camera_entity);
      }),
    );
    this.shadowRoot.querySelectorAll("[data-quick-link]").forEach((button) => button.addEventListener("click", () => this._navigate(button.dataset.quickLink)));

    const mediaDialog = this.shadowRoot.querySelector("[data-media-dialog]");
    this.shadowRoot.querySelector("[data-media-close]")?.addEventListener("click", () => this._closeMediaDialog());
    this.shadowRoot.querySelector("[data-media-back]")?.addEventListener("click", () => this._mediaBack());
    this.shadowRoot.querySelector("[data-media-refresh]")?.addEventListener("click", () => this._mediaRefresh());
    mediaDialog?.addEventListener("click", (event) => {
      if (event.target === mediaDialog) this._closeMediaDialog();
    });
    mediaDialog?.addEventListener("close", () => {
      this._media = null;
    });

    if (this._hass) {
      this._updateLiveTiles();
      this._renderSystem();
    }
    if (this._events.length) this._renderEvents();
  }

  getCardSize() {
    return 20;
  }
}

class HACameraHubCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  setConfig(config) {
    const stub = HACameraHubCard.getStubConfig();
    const nextConfig = structuredClone(config || stub);
    nextConfig.nvr = { ...stub.nvr, ...(nextConfig.nvr || {}) };
    nextConfig.nvr.hdd_entities ||= [];
    nextConfig.cameras ||= [];
    const signature = JSON.stringify(nextConfig);
    this.config = nextConfig;
    if (signature === this._configSignature && this.shadowRoot.hasChildNodes()) return;
    this._configSignature = signature;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this.shadowRoot.querySelectorAll("ha-entity-picker").forEach((picker) => {
      picker.hass = hass;
    });
  }

  _emit() {
    this._configSignature = JSON.stringify(this.config);
    this.dispatchEvent(new CustomEvent("config-changed", { bubbles: true, composed: true, detail: { config: structuredClone(this.config) } }));
  }

  _esc(v) {
    return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  _render() {
    if (!this.shadowRoot || !this.config) return;
    const c = this.config;
    this.shadowRoot.innerHTML = `<style>
      *{box-sizing:border-box}
      .editor{display:grid;gap:12px;color:var(--primary-text-color)}
      .top,.group,.camera{display:grid;gap:8px;padding:12px;border:1px solid var(--divider-color);border-radius:12px}
      .fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      label span{display:block;margin-bottom:4px;color:var(--secondary-text-color);font-size:11px}
      input,select{width:100%;padding:9px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:inherit;font:inherit}
      .head{display:flex;justify-content:space-between;align-items:center}
      .camera{padding:9px}
      .add,.remove{padding:8px 10px;border:1px solid var(--primary-color);border-radius:8px;background:transparent;color:var(--primary-color);cursor:pointer;font:inherit}
      .remove{border-color:var(--error-color);color:var(--error-color)}
      ha-entity-picker{display:block}
      .hdd-row{display:flex;align-items:center;gap:8px}
      .hdd-row ha-entity-picker{flex:1}
      .check{display:flex!important;flex-direction:row-reverse;align-items:center;justify-content:flex-end;gap:8px}
      .check span{margin:0!important}
      .check input{width:auto!important}
      @media(max-width:600px){.fields{grid-template-columns:1fr}}
    </style>
    <div class="editor">
      <div class="top fields">
        <label><span>Titel</span><input data-root="title" value="${this._esc(c.title)}"></label>
        <label><span>Undertitel</span><input data-root="subtitle" value="${this._esc(c.subtitle)}"></label>
        <label><span>UniFi Protect ingress-sti (valgfri)</span><input data-root="protect_ingress_path" value="${this._esc(c.protect_ingress_path)}"></label>
      </div>

      <section class="group">
        <div class="head"><b>NVR / systemstatus</b></div>
        <div class="fields">
          <label><span>Lagerplads (%)</span><ha-entity-picker data-nvr-picker="storage_entity" value="${this._esc(c.nvr.storage_entity)}" include-domains='["sensor"]' allow-custom-entity></ha-entity-picker></label>
          <label><span>Optagekapacitet (sekunder)</span><ha-entity-picker data-nvr-picker="capacity_entity" value="${this._esc(c.nvr.capacity_entity)}" include-domains='["sensor"]' allow-custom-entity></ha-entity-picker></label>
          <label><span>CPU (%)</span><ha-entity-picker data-nvr-picker="cpu_entity" value="${this._esc(c.nvr.cpu_entity)}" include-domains='["sensor"]' allow-custom-entity></ha-entity-picker></label>
          <label><span>CPU-temperatur</span><ha-entity-picker data-nvr-picker="temp_entity" value="${this._esc(c.nvr.temp_entity)}" include-domains='["sensor"]' allow-custom-entity></ha-entity-picker></label>
          <label><span>Hukommelse (%)</span><ha-entity-picker data-nvr-picker="memory_entity" value="${this._esc(c.nvr.memory_entity)}" include-domains='["sensor"]' allow-custom-entity></ha-entity-picker></label>
          <label><span>NVR oppetid</span><ha-entity-picker data-nvr-picker="uptime_entity" value="${this._esc(c.nvr.uptime_entity)}" include-domains='["sensor"]' allow-custom-entity></ha-entity-picker></label>
        </div>
        <div class="head"><b>Disk-fejlsensorer</b></div>
        ${c.nvr.hdd_entities
          .map(
            (id, hi) => `<div class="hdd-row"><ha-entity-picker data-hdd-picker="${hi}" value="${this._esc(id)}" include-domains='["binary_sensor"]' allow-custom-entity></ha-entity-picker><button class="remove" data-remove-hdd="${hi}">Fjern</button></div>`,
          )
          .join("")}
        <button class="add" data-add-hdd>+ Tilføj disk-sensor</button>
      </section>

      ${c.cameras
        .map(
          (cam, ci) => `<section class="camera">
            <div class="head"><b>${this._esc(cam.name || cam.key || `Kamera ${ci + 1}`)}</b><button class="remove" data-remove-camera="${ci}">Fjern kamera</button></div>
            <div class="fields">
              <label><span>Nøgle (matcher entity-navn, fx "fordor")</span><input data-camera-field="key" data-camera="${ci}" value="${this._esc(cam.key || "")}"></label>
              <label><span>Navn</span><input data-camera-field="name" data-camera="${ci}" value="${this._esc(cam.name || "")}"></label>
              <label><span>Ikon (mdi:...)</span><input data-camera-field="icon" data-camera="${ci}" value="${this._esc(cam.icon || "mdi:cctv")}"></label>
              <label><span>Område (bruges i hændelses-entity)</span><input data-camera-field="area" data-camera="${ci}" value="${this._esc(cam.area || "")}"></label>
              <label><span>Live-opløsning</span>
                <select data-camera-select="res" data-camera="${ci}">
                  ${["low", "medium", "high"].map((r) => `<option value="${r}" ${(cam.res || "medium") === r ? "selected" : ""}>${r}</option>`).join("")}
                </select>
              </label>
              <label class="check"><span>AI-detektion (person/dyr/køretøj)</span><input type="checkbox" data-camera-check="ai" data-camera="${ci}" ${cam.ai ? "checked" : ""}></label>
              <label class="check"><span>Dørklokke</span><input type="checkbox" data-camera-check="doorbell" data-camera="${ci}" ${cam.doorbell ? "checked" : ""}></label>
            </div>
          </section>`,
        )
        .join("")}
      <button class="add" data-add-camera>+ Tilføj kamera</button>
    </div>`;

    this.shadowRoot.querySelectorAll("input[data-root]").forEach((input) =>
      input.addEventListener("change", () => {
        this.config[input.dataset.root] = input.value;
        this._emit();
      }),
    );
    this.shadowRoot.querySelectorAll("ha-entity-picker[data-nvr-picker]").forEach((picker) => {
      picker.hass = this._hass;
      picker.addEventListener("value-changed", (event) => {
        this.config.nvr[picker.dataset.nvrPicker] = event.detail.value;
        this._emit();
      });
    });
    this.shadowRoot.querySelectorAll("ha-entity-picker[data-hdd-picker]").forEach((picker) => {
      picker.hass = this._hass;
      picker.addEventListener("value-changed", (event) => {
        this.config.nvr.hdd_entities[Number(picker.dataset.hddPicker)] = event.detail.value;
        this._emit();
      });
    });
    this.shadowRoot.querySelector("[data-add-hdd]")?.addEventListener("click", () => {
      this.config.nvr.hdd_entities.push("");
      this._emit();
      this._render();
    });
    this.shadowRoot.querySelectorAll("[data-remove-hdd]").forEach((button) =>
      button.addEventListener("click", () => {
        this.config.nvr.hdd_entities.splice(Number(button.dataset.removeHdd), 1);
        this._emit();
        this._render();
      }),
    );
    this.shadowRoot.querySelectorAll("input[data-camera-field]").forEach((input) =>
      input.addEventListener("change", () => {
        this.config.cameras[Number(input.dataset.camera)][input.dataset.cameraField] = input.value;
        this._emit();
        if (input.dataset.cameraField === "name" || input.dataset.cameraField === "key") this._render();
      }),
    );
    this.shadowRoot.querySelectorAll("select[data-camera-select]").forEach((select) =>
      select.addEventListener("change", () => {
        this.config.cameras[Number(select.dataset.camera)][select.dataset.cameraSelect] = select.value;
        this._emit();
      }),
    );
    this.shadowRoot.querySelectorAll("input[data-camera-check]").forEach((input) =>
      input.addEventListener("change", () => {
        this.config.cameras[Number(input.dataset.camera)][input.dataset.cameraCheck] = input.checked;
        this._emit();
      }),
    );
    this.shadowRoot.querySelector("[data-add-camera]")?.addEventListener("click", () => {
      this.config.cameras.push({ key: "", name: "Nyt kamera", icon: "mdi:cctv", area: "udenfor", ai: true, res: "medium" });
      this._emit();
      this._render();
    });
    this.shadowRoot.querySelectorAll("[data-remove-camera]").forEach((button) =>
      button.addEventListener("click", () => {
        this.config.cameras.splice(Number(button.dataset.removeCamera), 1);
        this._emit();
        this._render();
      }),
    );
  }
}

if (!customElements.get("ha-camera-hub-card")) customElements.define("ha-camera-hub-card", HACameraHubCard);
if (!customElements.get("ha-camera-hub-card-editor")) customElements.define("ha-camera-hub-card-editor", HACameraHubCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha-camera-hub-card",
  name: "HA Camera Hub Card",
  description: "Samlet kamera-hub: live-grid, hændelseslog og NVR-systemstatus for UniFi Protect",
  preview: true,
});
console.info(
  `%c HA CAMERA HUB CARD %c v${VERSION} `,
  "color:#fff;background:#2563eb;font-weight:700",
  "color:#60a5fa;background:#0f172a",
);
