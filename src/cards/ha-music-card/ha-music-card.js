// HA Music Card: a full music app for Music Assistant inside Home Assistant (library, search, detail pages, queue,
// speaker picking and grouping, now-playing bar / full-screen player). Look and feel follow Spotify and the Music
// Assistant web app. The shell is built once; views redraw their own region and the now-playing parts update in place.
// By Claude AI.
import "./editor.js";
import { keepScroll } from "../shared/keep-scroll.js";
import { STYLES } from "./styles.js";
import { icon, ICONS } from "./icons.js";
import { MusicApi, fixImageUrl, mediaTypeFromUri } from "./api.js";
import {
  esc, fmtTime, homeView, libraryView, libraryItems, searchView, detailView, queuePanel, speakersPanel,
  barHtml, miniHtml, fullPlayerHtml, menuHtml, LIB_TYPES, artistNames
} from "./views.js";
import { sampleColor, tone } from "./color.js";

const VERSION = "0.1.2";
const GROUPING = 524288;
const PAGE = 50;
const RECENT_KEY = "ha-music-card:recent-searches";
const ACTIVE_KEY = "ha-music-card:active-player";
const SIDE_PLAYLIST_LIMIT = 500;

const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (_e) { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_e) { /* private mode */ } }
};

class HaMusicCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this.api = new MusicApi(() => this._hass, () => this._config);
    this._items = new Map();
    this._itemSeq = 0;
    this._hist = [{ name: "home" }];
    this._histIdx = 0;
    this._data = { home: null, lib: new Map(), detail: new Map(), search: new Map() };
    this._panel = null;
    this._sheets = [];
    this._queue = null;
    this._queueItems = null;
    this._favOverride = new Map();
    this._mode = "wide";
    this._dragging = null;
    this._timers = new Set();
    this._visible = true;
    this._built = false;
  }

  static getStubConfig() { return { entities: [], fill_height: true }; }
  static getConfigElement() { return document.createElement("ha-music-card-editor"); }

  setConfig(config) {
    if (!config || typeof config !== "object") throw new Error("Musikkortet kræver en konfiguration");
    if (config.entities && !Array.isArray(config.entities)) throw new Error("entities skal være en liste");
    this._config = { fill_height: true, bottom_offset: 110, top_offset: 8, ...config };
    this.api.clearCache();
    if (this._built) { this._applyAccent(); this._applyHeight(); this._renderAll(); }
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (!this._built) return;
    if (first) { this._initActive(); this._renderAll(); return; }
    this._onHassUpdate();
  }
  get hass() { return this._hass; }

  getCardSize() { return 12; }
  getGridOptions() { return { columns: "full", rows: "auto", min_columns: 6 }; }

  connectedCallback() {
    if (!this._built) this._build();
    this._ro = new ResizeObserver(() => this._onResize());
    this._ro.observe(this);
    this._io = new IntersectionObserver((entries) => { this._visible = entries.some((e) => e.isIntersecting); this._syncTicker(); });
    this._io.observe(this);
    this._onWinResize = () => this._applyHeight();
    window.addEventListener("resize", this._onWinResize);
    this._onVis = () => this._syncTicker();
    document.addEventListener("visibilitychange", this._onVis);
    if (this._hass) { this._initActive(); this._renderAll(); }
  }

  disconnectedCallback() {
    this._ro?.disconnect(); this._io?.disconnect(); this._libIo?.disconnect();
    this._ro = this._io = this._libIo = null;
    window.removeEventListener("resize", this._onWinResize);
    document.removeEventListener("visibilitychange", this._onVis);
    clearInterval(this._ticker); this._ticker = null;
    for (const t of this._timers) clearTimeout(t);
    this._timers.clear();
    clearTimeout(this._lpTimer);
  }

  _later(fn, ms) {
    const t = setTimeout(() => { this._timers.delete(t); fn(); }, ms);
    this._timers.add(t);
    return t;
  }

  // ---------- Shell ----------
  _build() {
    this._built = true;
    this._touch = typeof matchMedia === "function" && matchMedia("(hover: none)").matches;
    this.shadowRoot.innerHTML = `<style>${STYLES}</style><ha-card class="mc"><div class="shell wide${this._touch ? " touch" : ""}">
      <nav class="side"></nav>
      <main class="main"><header class="top"></header><div class="content"></div></main>
      <aside class="panel"></aside>
      <footer class="bar"></footer>
      <div class="mini"></div>
      <nav class="tabs"></nav>
      <div class="sheet"></div>
      <div class="layer"><div class="scrim" data-closemenu></div><div class="menu"></div></div>
      <div class="toast" role="status" aria-live="polite"></div></div></ha-card>`;
    const $ = (s) => this.shadowRoot.querySelector(s);
    this.$ = { shell: $(".shell"), side: $(".side"), top: $(".top"), content: $(".content"), panel: $(".panel"), bar: $(".bar"), mini: $(".mini"),
      tabs: $(".tabs"), sheet: $(".sheet"), layer: $(".layer"), menu: $(".menu"), toast: $(".toast") };
    const root = this.shadowRoot;
    root.addEventListener("click", (e) => this._onClick(e));
    root.addEventListener("input", (e) => this._onInput(e));
    root.addEventListener("change", (e) => this._onChange(e));
    root.addEventListener("keydown", (e) => this._onKey(e));
    root.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    root.addEventListener("contextmenu", (e) => this._onContextMenu(e));
    root.addEventListener("error", (e) => this._onImgError(e), true);
    for (const type of ["pointerup", "pointercancel"]) root.addEventListener(type, () => this._endPress());
    root.addEventListener("pointermove", (e) => this._movePress(e));
    this.$.content.addEventListener("scroll", () => this._onContentScroll(), { passive: true });
    this._wireSheetSwipe();
    this._applyAccent();
    this._applyHeight();
  }

  _onResize() {
    const w = this.getBoundingClientRect().width;
    if (!w) return;
    const mode = w < 700 ? "narrow" : (w < 900 ? "medium" : "wide");
    const changed = mode !== this._mode;
    this._mode = mode;
    const sh = this.$.shell;
    sh.classList.toggle("narrow", mode === "narrow");
    sh.classList.toggle("medium", mode === "medium");
    sh.classList.toggle("wide", mode === "wide");
    this._dock = w >= 1100;
    this._applyPanelLayout();
    this._applyHeight();
    // The main column decides how much table fits: a narrow column drops the album column.
    const mainW = this.$.content.getBoundingClientRect().width;
    this.$.content.classList.toggle("cozy", mainW < 640);
    if (changed) {
      if (mode !== "narrow") this._closeSheets();
      if (mode === "narrow" && this._panel) { const p = this._panel; this._panel = null; this._applyPanelLayout(); this._openSheet(p); }
      this._renderTop(); this._renderNowPlaying(true);
    }
  }

  _applyPanelLayout() {
    const sh = this.$.shell;
    const docked = Boolean(this._panel) && this._dock && this._mode === "wide";
    sh.classList.toggle("panel-docked", docked);
    sh.classList.toggle("panel-overlay", Boolean(this._panel) && !docked && this._mode !== "narrow");
    // Without a docked panel the third grid column would still cost a gap, so the grid is set per state.
    sh.style.gridTemplateColumns = this._mode === "narrow" ? "" : `var(--mc-side-w, 232px) minmax(0, 1fr)${docked ? " 340px" : ""}`;
    sh.style.gridTemplateAreas = this._mode === "narrow" ? "" : (docked ? '"side main panel" "bar bar bar"' : '"side main" "bar bar"');
  }

  _applyHeight() {
    const c = this._config;
    const card = this.shadowRoot.querySelector("ha-card");
    if (!card) return;
    if (c.fill_height === false) { card.style.setProperty("--mc-height", c.height ? `${parseInt(c.height, 10)}px` : "760px"); return; }
    const vh = window.innerHeight || 800;
    const rect = this.getBoundingClientRect();
    let top = rect.top + (window.scrollY || 0);
    if (!(top >= 0) || top > vh * 0.6) top = 0;
    top = Math.max(top, Number(c.top_offset) || 0);
    const h = Math.max(420, vh - top - (Number(c.bottom_offset) || 0));
    card.style.setProperty("--mc-height", `${Math.round(h)}px`);
  }

  _applyAccent(rgb) {
    const host = this.$?.shell;
    if (!host) return;
    if (this._config.accent) { host.style.setProperty("--mc-accent", this._config.accent); return; }
    if (rgb) {
      const a = tone(rgb, { minS: 0.45, l: [0.52, 0.66] });
      host.style.setProperty("--mc-accent", `rgb(${a.join(",")})`);
      host.style.setProperty("--mc-accent-rgb", a.join(","));
      const d = tone(rgb, { minS: 0.25, l: [0.2, 0.26] });
      host.style.setProperty("--mc-np-bg", `rgb(${d.join(",")})`);
    } else {
      host.style.removeProperty("--mc-accent");
      host.style.removeProperty("--mc-accent-rgb");
      host.style.removeProperty("--mc-np-bg");
    }
  }

  // ---------- Players ----------
  _playerIds() {
    const conf = this._config.entities || [];
    if (conf.length) return conf.map((e) => (typeof e === "string" ? e : e.entity_id)).filter(Boolean);
    const ents = this._hass?.entities || {};
    return Object.keys(this._hass?.states || {}).filter((id) => id.startsWith("media_player.") && ents[id]?.platform === "music_assistant" && !ents[id]?.hidden)
      .sort((a, b) => this._playerName(a).localeCompare(this._playerName(b), "da"));
  }

  _playerConf(id) { return (this._config.entities || []).find((e) => typeof e === "object" && e.entity_id === id) || {}; }

  _playerName(id) {
    const conf = this._playerConf(id);
    if (conf.name) return conf.name;
    const fn = this._hass?.states?.[id]?.attributes?.friendly_name || id.split(".")[1];
    return fn.replace(/\s*\(Music Assistant\)\s*$/i, "").replace(/\s+audio$/i, "").trim();
  }

  _player(id) {
    const s = this._hass?.states?.[id];
    const a = s?.attributes || {};
    const conf = this._playerConf(id);
    const isGroup = a.mass_player_type === "group";
    const confIcon = String(conf.icon || "").replace(/^mdi:/, "").replace(/-([a-z])/g, (_m, c) => c.toUpperCase());
    const state = s?.state || "unavailable";
    const playing = state === "playing";
    const title = a.media_title || "";
    let status;
    if (!s || state === "unavailable") status = "Ikke tilgængelig";
    else if (state === "off") status = "Slukket";
    else if (playing) status = [title, a.media_artist].filter(Boolean).join(" · ") || "Spiller";
    else if (state === "paused") status = title ? `På pause · ${title}` : "På pause";
    else status = "Klar";
    return {
      entity_id: id, name: this._playerName(id), icon: ICONS[confIcon] ? confIcon : (isGroup ? "speakerMultiple" : "speaker"), state, playing,
      available: Boolean(s) && state !== "unavailable", volume: Number(a.volume_level) || 0, muted: Boolean(a.is_volume_muted), isGroup,
      canGroup: Boolean((Number(a.supported_features) || 0) & GROUPING), members: Array.isArray(a.group_members) ? a.group_members : [], status, title
    };
  }

  _initActive() {
    if (this._active) return;
    const ids = this._playerIds();
    const saved = store.get(ACTIVE_KEY, null);
    const pick = [this._config.default_player, saved].find((id) => id && ids.includes(id) && this._hass.states[id]);
    this._active = pick || ids.find((id) => this._hass.states[id]?.state === "playing") || ids[0] || null;
  }

  _setActive(id) {
    if (!id || id === this._active) return;
    this._active = id;
    store.set(ACTIVE_KEY, id);
    this._queue = null; this._queueItems = null;
    this._renderNowPlaying(true);
    this._renderPanels(true);
    this._refreshQueue();
    this._renderTop();
  }

  _groupMembers() {
    const active = this._player(this._active);
    const ids = new Set(active.members.filter((m) => m !== this._active));
    for (const id of this._playerIds()) {
      if (id !== this._active && this._player(id).members.includes(this._active)) ids.add(id);
    }
    return [...ids];
  }

  // ---------- Now playing ----------
  _np() {
    const id = this._active;
    const s = this._hass?.states?.[id];
    const a = s?.attributes || {};
    const q = this._queue;
    const cur = q?.current;
    const title = a.media_title || "";
    const matches = cur && (!title || cur.name === title || (cur.name && title.includes(cur.name)));
    const item = matches ? cur : null;
    const playing = s?.state === "playing";
    const duration = Number(a.media_duration) || (item?.duration ?? 0);
    let position = Number(a.media_position) || 0;
    if (playing && a.media_position_updated_at) position += (Date.now() - Date.parse(a.media_position_updated_at)) / 1000;
    if (duration) position = Math.min(position, duration);
    const live = Boolean(title) && (item?.media_type === "radio" || (!duration && playing));
    const members = this._groupMembers();
    const name = this._playerName(id || "");
    const uri = item?.uri || a.media_content_id || "";
    const favorite = this._favOverride.has(uri) ? this._favOverride.get(uri) : Boolean(item?.favorite);
    const picture = a.entity_picture ? fixImageUrl(a.entity_picture, this._config, 512) : "";
    const image = item?.image || picture;
    const imageLarge = item?.image_large || picture;
    return {
      entity: id, playerName: name, title, artist: a.media_artist || artistNames(item), album: a.media_album_name || item?.album?.name || "",
      item: item ? { ...item, image, image_large: imageLarge } : (title ? { media_type: "track", image, image_large: imageLarge } : null),
      image, imageLarge, playing, state: s?.state, duration, position: Math.max(0, position), live, shuffle: Boolean(a.shuffle), repeat: a.repeat || "off",
      volume: Number(a.volume_level) || 0, muted: Boolean(a.is_volume_muted), favorite, uri,
      canFav: Boolean(uri) && (this.api.hasMassQueue || Boolean(this._favButton(id))), groupCount: members.length,
      speakerLabel: id ? `${name}${members.length ? ` +${members.length}` : ""}` : "Vælg højttaler", panel: this._panel
    };
  }

  _favButton(id) {
    const ents = this._hass?.entities || {};
    const dev = ents[id]?.device_id;
    if (!dev) return null;
    return Object.values(ents).find((e) => e.device_id === dev && /^button\..*favorite_current_song(_\d+)?$/.test(e.entity_id))?.entity_id || null;
  }

  _renderNowPlaying(force = false) {
    if (!this._built || !this._hass) return;
    const np = this._np();
    const sig = JSON.stringify([np.entity, np.title, np.artist, np.image, np.playing, np.shuffle, np.repeat, np.muted, np.live, np.favorite, np.speakerLabel,
      np.panel, np.canFav, Math.round(np.duration), this._mode, Math.round(np.volume * 100)]);
    if (force || sig !== this._npSig) {
      const volChanged = !force && this._npSig && JSON.parse(this._npSig)[15] !== Math.round(np.volume * 100);
      const onlyVol = volChanged && this._npSig && JSON.stringify(JSON.parse(this._npSig).slice(0, 15)) === JSON.stringify(JSON.parse(sig).slice(0, 15));
      this._npSig = sig;
      if (onlyVol) { this._syncRanges(np); }
      else {
        this.$.shell.classList.toggle("idle-np", !np.title);
        if (this._mode !== "narrow") this.$.bar.innerHTML = barHtml(np);
        else this.$.mini.innerHTML = miniHtml(np);
        if (this._sheets.at(-1) === "player") this._renderSheet();
        this._syncRanges(np);
        this._markCurrent(np);
        this._sampleAccent(np.imageLarge || np.image);
      }
    }
    this._syncTicker();
  }

  _syncRanges(np = this._np()) {
    const root = this.shadowRoot;
    for (const el of root.querySelectorAll("[data-seek]")) {
      if (this._dragging === el) continue;
      el.max = Math.max(1, Math.round(np.duration));
      el.value = Math.round(np.position);
      setP(el);
    }
    for (const el of root.querySelectorAll("[data-pos]")) el.textContent = np.live ? "" : fmtTime(np.position);
    for (const el of root.querySelectorAll(".fp [data-dur]")) el.textContent = `-${fmtTime(Math.max(0, np.duration - np.position))}`;
    for (const el of root.querySelectorAll("[data-miniprog]")) el.style.width = `${np.duration ? Math.min(100, (np.position / np.duration) * 100) : 0}%`;
    for (const el of root.querySelectorAll("[data-npvol]")) { if (this._dragging !== el) { el.value = Math.round(np.volume * 100); setP(el); } }
  }

  _syncTicker() {
    const playing = this._hass?.states?.[this._active]?.state === "playing";
    const want = playing && this.isConnected && this._visible && document.visibilityState !== "hidden";
    if (want && !this._ticker) this._ticker = setInterval(() => this._syncRanges(), 1000);
    else if (!want && this._ticker) { clearInterval(this._ticker); this._ticker = null; }
  }

  _isCurrent(item) {
    const np = this._npCache;
    if (!item || !np?.title) return false;
    if (item.uri && np.uri && item.uri === np.uri) return true;
    return item.media_type === "track" && item.name === np.title && (!np.artist || artistNames(item).split(", ").some((a) => np.artist.includes(a)));
  }

  _markCurrent(np) {
    this._npCache = np;
    for (const row of this.shadowRoot.querySelectorAll(".tr[data-track]")) {
      const item = this._items.get(row.dataset.track);
      const on = this._isCurrent(item);
      const n = row.querySelector(".n");
      if (on === row.classList.contains("on") && !(on && n && n.querySelector(".eq")?.classList.contains("paused") === np.playing)) continue;
      row.classList.toggle("on", on);
      if (n) n.innerHTML = `${on ? `<span class="eq${np.playing ? "" : " paused"}"><i></i><i></i><i></i></span>` : `<span>${esc(row.dataset.label || Number(row.dataset.idx) + 1)}</span>`}${icon("play")}`;
    }
  }

  async _sampleAccent(url) {
    if (this._config.accent || url === this._accentUrl) return;
    this._accentUrl = url;
    const rgb = url ? await sampleColor(url) : null;
    if (url !== this._accentUrl) return;
    this._applyAccent(rgb);
  }

  // ---------- hass updates ----------
  _onHassUpdate() {
    // Only pick a speaker when none is chosen yet. A chosen one that drops out of hass for a moment (an integration
    // reload, a reconnect) stays chosen and shows as unavailable, instead of jumping to another speaker and sending the
    // next "play" somewhere else.
    if (!this._active) this._initActive();
    const ids = this._playerIds();
    const sig = JSON.stringify(ids.map((id) => {
      const s = this._hass.states[id];
      const a = s?.attributes || {};
      return [id, s?.state, a.media_title, a.media_artist, a.volume_level, a.is_volume_muted, a.group_members, a.shuffle, a.repeat, a.media_position_updated_at, a.entity_picture];
    }));
    if (sig === this._playersSig) return;
    this._playersSig = sig;
    const a = this._hass.states[this._active]?.attributes || {};
    const trackKey = `${this._active}|${a.media_title}|${a.media_content_id}`;
    if (trackKey !== this._trackKey) { this._trackKey = trackKey; this._refreshQueue(); }
    this._renderNowPlaying();
    this._renderPanels();
    if (this._mode === "narrow") this._renderTopChip();
  }

  _refreshQueue() {
    clearTimeout(this._qTimer);
    this._timers.delete(this._qTimer);
    this._qTimer = this._later(async () => {
      const id = this._active;
      if (!id) return;
      try {
        const q = await this.api.queue(id);
        if (id !== this._active) return;
        this._queue = q;
        if (this._queueShown()) {
          this._queueLoading = !this._queueItems;
          this._queueItems = await this.api.queueItems(id, q);
          this._queueLoading = false;
        }
      } catch (_e) {
        this._queue = null;
      }
      if (id !== this._active) return;
      this._renderNowPlaying(true);
      this._renderPanels(true);
    }, 250);
  }

  _queueShown() { return this._panel === "queue" || this._sheets.includes("queue"); }

  // ---------- Full render ----------
  _renderAll() {
    if (!this._built || !this._hass) return;
    this._onResize();
    this._renderSide();
    this._renderTabs();
    this._renderTop();
    this._renderView(true);
    this._renderNowPlaying(true);
    this._renderPanels(true);
    if (!this._queue) this._refreshQueue();
  }

  _ctx() {
    const np = this._npCache || this._np();
    this._npCache = np;
    return { reg: (item) => this._reg(item), isCurrent: (item) => this._isCurrent(item), playing: np.playing, hasQueueApi: this.api.hasMassQueue };
  }

  _reg(item) {
    const key = `i${(this._itemSeq += 1)}`;
    this._items.set(key, item);
    return key;
  }

  get _view() { return this._hist[this._histIdx]; }

  _renderSide() {
    const v = this._view;
    const item = (name, label, ic, on) => `<button class="nav-item${on ? " on" : ""}" data-nav="${name}" title="${label}">${icon(ic)}<span>${label}</span></button>`;
    // every library playlist, like Spotify's library list (favourites alone left most of them out)
    const pls = this._data.home?.sidePlaylists || this._data.home?.playlists || [];
    this.$.side.innerHTML = `<div class="side-box">
      ${this._mode === "medium" ? `<button class="nav-item" data-sidetoggle title="Menu">${icon("menu")}<span>Skjul menu</span></button>` : ""}
      ${item("home", "Hjem", "home", v.name === "home")}${item("search", "Søg", "magnify", v.name === "search")}</div>
      <div class="side-box grow"><div class="nav-label">Dit bibliotek</div>
      ${LIB_TYPES.map(([t, l, ic]) => item(`library:${t}`, l, ic, v.name === "library" && v.type === t)).join("")}
      ${pls.length ? `<div class="nav-label">Playlister</div>${pls.map((p) => `<button class="side-pl" data-open="${this._reg(p)}">${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" data-ph="playlistMusic">` : `<span class="ph art">${icon("playlistMusic")}</span>`}<span style="min-width:0"><div class="t">${esc(p.name)}</div><div class="s">Playliste</div></span></button>`).join("")}` : ""}</div>`;
  }

  _renderTabs() {
    const v = this._view;
    const tab = (act, label, ic, on) => `<button class="tab${on ? " on" : ""}" ${act}>${icon(ic)}${label}</button>`;
    this.$.tabs.innerHTML = tab('data-nav="home"', "Hjem", "home", v.name === "home" && !this._sheets.length)
      + tab('data-nav="search"', "Søg", "magnify", v.name === "search" && !this._sheets.length)
      + tab(`data-nav="library:${this._lastLib || "playlist"}"`, "Bibliotek", "bookshelf", (v.name === "library" || v.name === "detail") && !this._sheets.length)
      + tab('data-sheet="speakers"', "Højttalere", "speakerMultiple", this._sheets.includes("speakers"));
  }

  _renderTop() {
    if (!this._built) return;
    const v = this._view;
    const narrow = this._mode === "narrow";
    const back = `<button class="round" data-back aria-label="Tilbage" ${this._histIdx > 0 ? "" : "disabled"}>${icon("chevronLeft")}</button>`;
    const fwd = narrow ? "" : `<button class="round" data-fwd aria-label="Frem" ${this._histIdx < this._hist.length - 1 ? "" : "disabled"}>${icon("chevronRight")}</button>`;
    const title = v.name === "detail" ? v.item?.name : (v.name === "library" ? LIB_TYPES.find((t) => t[0] === v.type)?.[1] : "");
    const search = v.name === "search"
      ? `<label class="search-box">${icon("magnify")}<input data-search type="text" inputmode="search" placeholder="Hvad vil du høre?" value="${esc(v.query || "")}" autocomplete="off" enterkeyhint="search">${v.query ? `<button data-searchclear aria-label="Ryd">${icon("close")}</button>` : ""}</label>` : "";
    const showBack = !narrow || this._histIdx > 0;
    this.$.top.innerHTML = `${showBack ? back : ""}${fwd}${search || `<div class="top-title">${esc(title || "")}</div>`}${narrow && v.name !== "search" ? this._chipHtml() : ""}`;
    this._onContentScroll();
  }

  _chipHtml() {
    const np = this._np();
    return `<button class="chip-player" data-sheet="speakers">${icon(np.groupCount ? "speakerMultiple" : "speaker")}<span>${esc(np.speakerLabel)}</span></button>`;
  }

  _renderTopChip() {
    const chip = this.$.top.querySelector(".chip-player");
    if (chip) chip.outerHTML = this._chipHtml();
  }

  _onContentScroll() {
    const top = this.$.content.scrollTop;
    this.$.top.classList.toggle("solid", top > (this._view.name === "detail" ? 220 : 24));
  }

  // ---------- Navigation ----------
  _navigate(entry, replace = false) {
    this._view.scroll = this.$.content.scrollTop;
    if (replace) this._hist[this._histIdx] = entry;
    else {
      this._hist = this._hist.slice(0, this._histIdx + 1);
      this._hist.push(entry);
      if (this._hist.length > 50) this._hist.shift();
      this._histIdx = this._hist.length - 1;
    }
    if (entry.name === "library") this._lastLib = entry.type;
    if (this._mode === "narrow") this._closeSheets();
    this._closeMenu();
    this._renderTop(); this._renderSide(); this._renderTabs();
    this._renderView(true);
    if (entry.name === "search" && !this._touch) this.$.top.querySelector("[data-search]")?.focus({ preventScroll: true });
  }

  _go(nav) {
    const [name, type] = nav.split(":");
    if (name === "library") {
      const prev = this._hist.findLast?.((h) => h.name === "library" && h.type === type);
      this._navigate({ name, type, sort: prev?.sort || defaultSort(type), fav: prev?.fav || false, filter: "" });
    } else if (name === "search") this._navigate({ name, query: this._lastQuery || "" });
    else this._navigate({ name });
  }

  _open(item) {
    if (!item) return;
    if (["track", "radio", "podcast_episode"].includes(item.media_type)) { this._play(item, "play"); return; }
    if (item.media_type === "folder") return;
    this._navigate({ name: "detail", item });
  }

  _back() { if (this._histIdx > 0) { this._view.scroll = this.$.content.scrollTop; this._histIdx -= 1; this._afterHistMove(); } }
  _fwd() { if (this._histIdx < this._hist.length - 1) { this._view.scroll = this.$.content.scrollTop; this._histIdx += 1; this._afterHistMove(); } }
  _afterHistMove() { this._renderTop(); this._renderSide(); this._renderTabs(); this._renderView(true); }

  // ---------- Views ----------
  _renderView(resetScroll = false) {
    const v = this._view;
    this._items.clear();
    this._libIo?.disconnect();
    let html = "";
    const ctx = this._ctx();
    this.$.content.style.removeProperty("--mc-hero-rgb");
    if (v.name === "home") { html = homeView(ctx, this._homeData()); }
    else if (v.name === "library") { html = libraryView(ctx, this._libState(v)); }
    else if (v.name === "search") { html = searchView(ctx, this._searchState(v)); }
    else if (v.name === "detail") { html = detailView(ctx, this._detailState(v)); }
    const content = this.$.content;
    const keep = content.scrollTop;
    keepScroll(this, () => { content.innerHTML = html; });
    content.scrollTop = resetScroll ? (v.scroll || 0) : keep;
    this._onContentScroll();
    if (v.name === "library") this._observeSentinel();
    if (v.name === "detail") this._sampleHero(v.item);
    this._renderSide();
  }

  _paintIf(check) { if (check()) this._renderView(false); }

  _homeData() {
    const d = this._data.home;
    if (!d || (Date.now() - d.t > 300000 && !d.loading)) this._loadHome();
    return this._data.home;
  }

  async _loadHome() {
    const d = { t: Date.now(), loading: true, recent: this._data.home?.recent || [], playlists: this._data.home?.playlists || [], sidePlaylists: this._data.home?.sidePlaylists || [] };
    this._data.home = d;
    try {
      const [rp, ra, rr, fp, podcasts, all] = await Promise.all([
        this.api.library("playlist", { order_by: "last_played_desc", limit: 12 }),
        this.api.library("album", { order_by: "last_played_desc", limit: 16 }),
        this.api.library("radio", { order_by: "last_played_desc", limit: 16 }),
        this.api.library("playlist", { favorite: true, order_by: "last_played_desc", limit: 30 }),
        this.api.library("podcast", { order_by: "last_played_desc", limit: 16 }).catch(() => []),
        this.api.library("playlist", { order_by: "last_played_desc", limit: SIDE_PLAYLIST_LIMIT }).catch(() => [])
      ]);
      const recent = [];
      for (let i = 0; recent.length < 8 && i < 8; i += 1) for (const list of [rp, ra, rr]) if (list[i] && recent.length < 8) recent.push(list[i]);
      Object.assign(d, { loading: false, recent, playlists: fp.length ? fp : rp, sidePlaylists: all, albums: ra, radio: rr, podcasts });
      this.api.recommendations(this._active).then((recs) => { d.recs = recs; this._paintIf(() => this._view.name === "home"); }).catch(() => {});
    } catch (e) {
      Object.assign(d, { loading: false, error: errText(e) });
    }
    this._paintIf(() => this._view.name === "home");
  }

  _libKey(v) { return `${v.type}|${v.sort}|${v.fav ? 1 : 0}|${v.filter || ""}`; }

  _libState(v) {
    const key = this._libKey(v);
    let st = this._data.lib.get(key);
    if (!st) {
      st = { type: v.type, sort: v.sort, fav: v.fav, filter: v.filter, items: [], offset: 0, done: false, loading: false };
      this._data.lib.set(key, st);
      this._loadLib(st);
    }
    return st;
  }

  async _loadLib(st) {
    if (st.loading || st.done) return;
    st.loading = true;
    const first = st.items.length === 0;
    try {
      const items = await this.api.library(st.type, { order_by: st.sort, favorite: st.fav, search: st.filter || undefined, limit: PAGE, offset: st.offset });
      st.offset += items.length;
      st.done = items.length < PAGE;
      st.loading = false;
      const v = this._view;
      if (v.name !== "library" || this._libKey(v) !== `${st.type}|${st.sort}|${st.fav ? 1 : 0}|${st.filter || ""}`) { st.items.push(...items); return; }
      const list = this.$.content.querySelector("[data-list]");
      const start = st.items.length;
      st.items.push(...items);
      if (first || !list) this._renderLibBody(st);
      else { list.insertAdjacentHTML("beforeend", libraryItems(this._ctx(), st.type, items, start)); this._updateSentinel(st); }
    } catch (e) {
      st.loading = false;
      st.error = errText(e);
      if (first) this._renderLibBody(st); else this._toast(`Kunne ikke hente flere: ${st.error}`, true);
    }
  }

  _renderLibBody(st) {
    if (this._view.name !== "library") return;
    const html = libraryView(this._ctx(), st);
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    const content = this.$.content;
    const view = content.querySelector(".view.lib");
    if (!view) { this._renderView(false); return; }
    // Keep the head (filter field with focus and caret) and swap everything after it.
    const top = content.scrollTop;
    const newView = tmp.firstElementChild;
    const head = view.querySelector(".lib-head");
    const newHead = newView.querySelector(".lib-head");
    head.querySelector(".chips").replaceWith(newHead.querySelector(".chips"));
    const favBtn = head.querySelector("[data-favfilter]");
    favBtn.replaceWith(newHead.querySelector("[data-favfilter]"));
    while (head.nextSibling) head.nextSibling.remove();
    let node = newHead.nextSibling;
    while (node) { const next = node.nextSibling; view.appendChild(node); node = next; }
    content.scrollTop = top;
    this._observeSentinel();
  }

  _updateSentinel(st) {
    const s = this.$.content.querySelector("[data-sentinel]");
    if (s) s.innerHTML = st.loading ? '<div class="sk" style="height:6px;width:120px;margin:16px auto"></div>' : "";
    this._observeSentinel();
  }

  _observeSentinel() {
    this._libIo?.disconnect();
    const s = this.$.content.querySelector("[data-sentinel]");
    if (!s) return;
    this._libIo = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      const v = this._view;
      if (v.name !== "library") return;
      const st = this._data.lib.get(this._libKey(v));
      if (st && !st.done && !st.loading && st.items.length) { this._loadLib(st); this._updateSentinel(st); }
    }, { root: this.$.content, rootMargin: "600px" });
    this._libIo.observe(s);
  }

  _searchState(v) {
    if (!v.query) return { query: "", recent: store.get(RECENT_KEY, []) };
    let st = this._data.search.get(v.query);
    if (!st) { st = { query: v.query, loading: true }; this._data.search.set(v.query, st); this._runSearch(st); }
    return st;
  }

  async _runSearch(st) {
    try { st.results = await this.api.search(st.query, 10); st.error = ""; }
    catch (e) { st.error = errText(e); }
    st.loading = false;
    this._paintIf(() => this._view.name === "search" && this._view.query === st.query);
  }

  _onSearchInput(value) {
    const q = value.trim();
    clearTimeout(this._searchTimer);
    this._timers.delete(this._searchTimer);
    this._searchTimer = this._later(() => {
      const v = this._view;
      if (v.name !== "search" || v.query === q) return;
      v.query = q;
      this._lastQuery = q;
      const clear = this.$.top.querySelector("[data-searchclear]");
      if (q && !clear) this.$.top.querySelector(".search-box")?.insertAdjacentHTML("beforeend", `<button data-searchclear aria-label="Ryd">${icon("close")}</button>`);
      if (!q && clear) clear.remove();
      if (q.length >= 2) this._rememberSearch(q);
      this._renderView(true);
    }, 350);
  }

  _rememberSearch(q) {
    clearTimeout(this._rememberTimer);
    this._timers.delete(this._rememberTimer);
    // Only remember what the user settled on, not every prefix typed on the way.
    this._rememberTimer = this._later(() => {
      const list = store.get(RECENT_KEY, []).filter((x) => x.toLowerCase() !== q.toLowerCase() && !q.toLowerCase().startsWith(x.toLowerCase()));
      store.set(RECENT_KEY, [q, ...list].slice(0, 10));
    }, 1500);
  }

  _detailState(v) {
    const uri = v.item.uri;
    let st = this._data.detail.get(uri);
    if (!st) {
      st = { item: v.item, loading: true, tracks: [], albums: [] };
      this._data.detail.set(uri, st);
      this._loadDetail(st);
    }
    return st;
  }

  async _loadDetail(st) {
    const item = st.item;
    const repaint = () => this._paintIf(() => this._view.name === "detail" && this._view.item?.uri === item.uri);
    if (this.api.hasMassQueue && /^[^:]+:\/\//.test(item.uri)) {
      this.api.item(item.uri).then((full) => {
        if (!full) return;
        st.item = { ...item, ...Object.fromEntries(Object.entries(full).filter(([, x]) => x !== "" && x != null && !(Array.isArray(x) && !x.length))),
          image: item.image || full.image, image_large: item.image_large || full.image_large };
        this._view.item = this._view.item?.uri === item.uri ? st.item : this._view.item;
        repaint();
      }).catch(() => {});
    }
    try {
      if (!this.api.hasMassQueue) throw new Error("Installer mass_queue-integrationen for at se indholdet");
      if (item.media_type === "artist") {
        let [tracks, albums] = await Promise.all([this.api.tracks(item).catch(() => []), this.api.artistAlbums(item).catch(() => [])]);
        if (!tracks.length && !albums.length) {
          // Library artists that only exist through a streaming provider have no local tracks; search finds them.
          const r = await this.api.search(item.name, 25);
          const by = (i) => (i.artists || []).some((a) => a.name?.toLowerCase() === item.name.toLowerCase());
          tracks = r.tracks.filter(by);
          albums = r.albums.filter(by);
        }
        st.tracks = tracks; st.albums = albums;
      } else if (["album", "playlist", "podcast"].includes(item.media_type)) {
        st.tracks = await this.api.tracks(item);
      }
      st.error = "";
    } catch (e) { st.error = errText(e); }
    st.loading = false;
    repaint();
  }

  async _sampleHero(item) {
    const url = item?.image_large || item?.image;
    if (!url) return;
    const rgb = await sampleColor(url);
    if (!rgb || this._view.item?.uri !== item.uri) return;
    const c = tone(rgb, { minS: 0.3, l: [0.3, 0.42] });
    this.$.content.style.setProperty("--mc-hero-rgb", c.join(","));
    const t = tone(rgb, { minS: 0.25, l: [0.14, 0.18] });
    this.$.top.style.setProperty("--mc-top-rgb", t.join(","));
  }

  // ---------- Panels & sheets ----------
  _renderPanels(force = false) {
    if (!this._hass || !this._built) return;
    const kind = this._panel;
    if (kind && this._mode !== "narrow") this._renderPanel(force);
    if (this._sheets.length && this._sheets.at(-1) !== "player") this._renderSheet(force);
  }

  _panelBody(kind) {
    const ctx = this._ctx();
    if (kind === "queue") return queuePanel(ctx, { entity: this._active, loading: this._queueLoading || !this._queue, items: this._queueItems, current: this._queue?.current, next: this._queue?.next });
    const players = this._playerIds().map((id) => this._player(id));
    const members = new Set(this._groupMembers());
    for (const p of players) p.groupedWithActive = members.has(p.entity_id) || p.entity_id === this._active && members.size > 0;
    const grouped = players.filter((p) => p.groupedWithActive);
    const groupVolume = grouped.length ? grouped.reduce((n, p) => n + p.volume, 0) / grouped.length : 0;
    const np = this._np();
    return speakersPanel(ctx, { players, active: this._active, groupVolume, canTransfer: Boolean(np.title) && ["playing", "paused"].includes(np.state) });
  }

  _renderPanel(force) {
    const kind = this._panel;
    if (!kind) { this.$.panel.innerHTML = ""; return; }
    const body = this._panelBody(kind);
    const sig = `${kind}|${body.replace(/data-(?:menu|open|track)="i\d+"/g, "")}`;
    if (!force && sig === this._panelSig) return;
    if (this._dragging && this.$.panel.contains(this._dragging)) return;
    this._panelSig = sig;
    const old = this.$.panel.querySelector(".panel-body");
    const top = old?.scrollTop || 0;
    if (!old || this.$.panel.dataset.kind !== kind) {
      this.$.panel.dataset.kind = kind;
      this.$.panel.innerHTML = `<div class="panel-h"><h3>${kind === "queue" ? "Kø" : "Højttalere"}</h3><button class="round" style="background:transparent" data-closepanel aria-label="Luk">${icon("close")}</button></div>
        <div class="panel-tabs"><button class="chip${kind === "queue" ? " on" : ""}" data-panel="queue">${icon("playlistPlay")}Kø</button><button class="chip${kind === "speakers" ? " on" : ""}" data-panel="speakers">${icon("speakerMultiple")}Højttalere</button></div>
        <div class="panel-body"></div>`;
    }
    const pb = this.$.panel.querySelector(".panel-body");
    keepScroll(this, () => { pb.innerHTML = body; });
    pb.scrollTop = top;
    this._syncAllRanges(pb);
  }

  _togglePanel(kind) {
    if (this._mode === "narrow") { this._openSheet(kind); return; }
    this._panel = this._panel === kind ? null : kind;
    this._applyPanelLayout();
    this._renderPanel(true);
    this._renderNowPlaying(true);
    if (kind === "queue" && this._panel) { this._queueItems = null; this._refreshQueue(); }
    this._later(() => this._onResize(), 30);
  }

  _openSheet(kind) {
    if (this._sheets.at(-1) === kind) return;
    this._sheets = this._sheets.filter((s) => s !== kind);
    this._sheets.push(kind);
    if (kind === "queue") { this._queueItems = null; this._refreshQueue(); }
    this._renderSheet(true);
    this.$.sheet.classList.add("open");
    this._renderTabs();
  }

  _closeSheet() {
    this._sheets.pop();
    if (this._sheets.length) this._renderSheet(true);
    else this.$.sheet.classList.remove("open");
    this._renderTabs();
  }

  _closeSheets() {
    if (!this._sheets.length) return;
    this._sheets = [];
    this.$.sheet.classList.remove("open");
    this._renderTabs();
  }

  _renderSheet(force = false) {
    const kind = this._sheets.at(-1);
    if (!kind) return;
    const sh = this.$.sheet;
    if (kind === "player") {
      const np = this._np();
      const bg = np.imageLarge || np.image;
      if (this._dragging && sh.contains(this._dragging)) return;
      sh.dataset.kind = kind;
      sh.innerHTML = `${bg ? `<div class="sheet-bg" style="background-image:url('${esc(bg).replace(/'/g, "%27")}')"></div>` : '<div class="sheet-bg" style="background:var(--mc-np-bg,#222)"></div>'}
        <div class="sheet-h"><span class="grab"></span><button class="round" style="background:transparent" data-closesheet aria-label="Luk">${icon("chevronDown")}</button>
        <div class="ttl"><small>Afspiller på</small>${esc(np.speakerLabel)}</div><button class="round" style="background:transparent" data-npmenu aria-label="Flere valg">${icon("dotsHorizontal")}</button></div>
        <div class="sheet-body">${fullPlayerHtml(np)}</div>`;
      this._syncRanges(np);
      return;
    }
    const body = this._panelBody(kind);
    const sig = `${kind}|${body.replace(/data-(?:menu|open|track)="i\d+"/g, "")}`;
    if (!force && sig === this._sheetSig) return;
    if (this._dragging && sh.contains(this._dragging)) return;
    this._sheetSig = sig;
    const old = sh.querySelector(".sheet-body");
    const top = sh.dataset.kind === kind ? (old?.scrollTop || 0) : 0;
    sh.dataset.kind = kind;
    sh.innerHTML = `<div class="sheet-h"><span class="grab"></span><button class="round" style="background:transparent" data-closesheet aria-label="Luk">${icon(this._sheets.length > 1 ? "chevronLeft" : "chevronDown")}</button>
      <div class="ttl" style="font-size:16px;color:#fff">${kind === "queue" ? "Kø" : "Højttalere"}</div><span style="width:34px"></span></div>
      <div class="sheet-body">${body}</div>`;
    const sb = sh.querySelector(".sheet-body");
    sb.scrollTop = top;
    this._syncAllRanges(sb);
  }

  _syncAllRanges(root) { for (const el of root.querySelectorAll(".rng")) setP(el); }

  _wireSheetSwipe() {
    const sh = this.$.sheet;
    let startY = null; let dy = 0;
    sh.addEventListener("touchstart", (e) => {
      if (e.target.closest("input, .rng")) { startY = null; return; }
      const body = sh.querySelector(".sheet-body");
      if (body && body.scrollTop > 0 && !e.target.closest(".sheet-h")) { startY = null; return; }
      startY = e.touches[0].clientY; dy = 0;
    }, { passive: true });
    sh.addEventListener("touchmove", (e) => {
      if (startY == null) return;
      dy = Math.max(0, e.touches[0].clientY - startY);
      if (dy > 6) { sh.classList.add("dragging"); sh.style.transform = `translateY(${dy}px)`; }
    }, { passive: true });
    const end = () => {
      if (startY == null) return;
      sh.classList.remove("dragging"); sh.style.transform = "";
      if (dy > 110) this._closeSheet();
      startY = null; dy = 0;
    };
    sh.addEventListener("touchend", end, { passive: true });
    sh.addEventListener("touchcancel", end, { passive: true });
  }

  // ---------- Menus ----------
  _openMenu(item, anchor, extra = {}) {
    if (!item) return;
    this._menuItem = item;
    const isContainer = ["album", "playlist", "artist", "radio", "podcast", "audiobook"].includes(item.media_type);
    const actions = [
      { id: "play", label: "Afspil nu", icon: "play" },
      { id: "next", label: "Afspil som næste", icon: "skipNextCircleOutline" },
      { id: "add", label: "Tilføj til kø", icon: "playlistPlus" },
      { id: "replace", label: "Erstat kø", icon: "playlistEdit" }
    ];
    if (!["radio", "podcast", "podcast_episode", "audiobook"].includes(item.media_type)) actions.push({ id: "radio", label: "Start radio", icon: "radioTower" });
    if (item.artists?.[0]?.uri && item.media_type !== "artist") actions.push({ id: "artist", label: "Gå til kunstner", icon: "accountMusic", sep: true });
    if (item.album?.uri && item.media_type === "track") actions.push({ id: "album", label: "Gå til album", icon: "album", sep: !actions.some((a) => a.sep) });
    if (isContainer && extra.openable !== false && this._view.item?.uri !== item.uri && item.media_type !== "radio") actions.push({ id: "open", label: "Åbn", icon: "chevronRight", sep: !actions.some((a) => a.sep) });
    if (this.api.hasMassQueue && /^[^:]+:\/\//.test(item.uri || "")) actions.push({ id: "fav", label: item.favorite ? "Fjern fra favoritter" : "Føj til favoritter", icon: item.favorite ? "heart" : "heartOutline", sep: !actions.some((a) => a.sep) });
    const layer = this.$.layer;
    const menu = this.$.menu;
    menu.innerHTML = menuHtml(item, actions);
    const sheetlike = this._mode === "narrow" || this._touch && !anchor;
    layer.classList.toggle("sheetlike", sheetlike);
    layer.classList.add("open");
    if (!sheetlike) {
      const box = this.$.shell.getBoundingClientRect();
      const r = anchor ? anchor.getBoundingClientRect() : { left: box.left + box.width / 2, bottom: box.top + box.height / 2, top: box.top + box.height / 2, right: box.left + box.width / 2 };
      const mw = menu.offsetWidth || 240;
      const mh = menu.offsetHeight || 300;
      let left = r.right - box.left - mw;
      if (left < 8) left = Math.min(r.left - box.left, box.width - mw - 8);
      let top = r.bottom - box.top + 4;
      if (top + mh > box.height - 8) top = Math.max(8, r.top - box.top - mh - 4);
      menu.style.left = `${Math.max(8, left)}px`;
      menu.style.top = `${top}px`;
    } else { menu.style.left = ""; menu.style.top = ""; }
  }

  _closeMenu() { this.$.layer?.classList.remove("open"); this._menuItem = null; }

  async _menuAction(id) {
    const item = this._menuItem;
    this._closeMenu();
    if (!item) return;
    switch (id) {
      case "play": return this._play(item, "play");
      case "next": return this._play(item, "next", false, "Afspilles som det næste");
      case "add": return this._play(item, "add", false, "Tilføjet til køen");
      case "replace": return this._play(item, "replace", false, "Køen er erstattet");
      case "radio": return this._play(item, "replace", true, "Radio startet");
      case "artist": return this._goUri(item.artists[0].uri, item.artists[0].name);
      case "album": return this._goUri(item.album.uri, item.album.name);
      case "open": return this._navigate({ name: "detail", item });
      case "fav": return this._toggleFav(item);
      default: return undefined;
    }
  }

  _goUri(uri, name) {
    if (!uri) return;
    if (this._mode === "narrow") this._closeSheets();
    if (this._mode !== "narrow" && this._panel && !this._dock) { this._panel = null; this._applyPanelLayout(); }
    this._navigate({ name: "detail", item: { media_type: mediaTypeFromUri(uri), uri, name: name || "", artists: [] } });
  }

  // ---------- Actions ----------
  async _svc(fn, ok) {
    try {
      await fn();
      if (ok) this._toast(ok);
      return true;
    } catch (e) {
      this._toast(`Det lykkedes ikke: ${errText(e)}`, true);
      return false;
    }
  }

  _play(item, enqueue = "play", radio = false, ok = "") {
    if (!this._active) { this._toast("Vælg en højttaler først", true); this._openSpeakers(); return Promise.resolve(false); }
    return this._svc(() => this.api.play(this._active, item, enqueue, radio), ok).then((done) => {
      if (done) { this._refreshQueue(); this._later(() => this._refreshQueue(), 1500); }
      return done;
    });
  }

  _openSpeakers() { if (this._mode === "narrow") this._openSheet("speakers"); else if (this._panel !== "speakers") this._togglePanel("speakers"); }

  _playFromList(row) {
    const item = this._items.get(row.dataset.track);
    if (!item) return;
    if (this._isCurrent(item) && !row.closest(".search")) { this._cmd("playpause"); return; }
    const v = this._view;
    let list = null;
    if (v.name === "detail") {
      const st = this._data.detail.get(v.item.uri);
      if (st?.tracks?.length && v.item.media_type !== "podcast") list = st.tracks;
    } else if (v.name === "library" && v.type === "track") list = this._data.lib.get(this._libKey(v))?.items;
    if (list) {
      const idx = list.findIndex((t) => t.uri === item.uri);
      if (idx >= 0) { this._play(list.slice(idx, idx + 100), "replace"); return; }
    }
    this._play(item, "play");
  }

  async _toggleFav(item) {
    const on = !item.favorite;
    const done = await this._svc(() => this.api.setFavorite(item, on), on ? "Føjet til dine favoritter" : "Fjernet fra dine favoritter");
    if (!done) return;
    item.favorite = on;
    this._favOverride.set(item.uri, on);
    this.api.clearCache();
    if (this._data.home) this._data.home.t = 0;
    if (this._view.name === "detail") this._renderView(false);
    this._renderNowPlaying(true);
  }

  async _toggleNpFav() {
    const np = this._np();
    if (!np.uri) return;
    const on = !np.favorite;
    const ok = on ? "Føjet til dine favoritter" : "Fjernet fra dine favoritter";
    const btn = this._favButton(this._active);
    const done = await this._svc(async () => {
      if (on) {
        if (this.api.hasMassQueue) await this.api.setFavorite({ uri: np.uri, media_type: np.item?.media_type || "track" }, true);
        else await this._hass.callService("button", "press", { entity_id: btn });
      } else {
        try { await this.api.setFavorite({ uri: np.uri, media_type: np.item?.media_type || "track" }, false); }
        catch (_e) { await this.api.queueAction("unfavorite_current_item", this._active); }
      }
    }, ok);
    if (done) { this._favOverride.set(np.uri, on); this.api.clearCache(); this._renderNowPlaying(true); }
  }

  _cmd(cmd) {
    const id = this._active;
    if (!id) { this._openSpeakers(); return; }
    const np = this._np();
    const call = (service, data = {}) => this._svc(() => this._hass.callService("media_player", service, { entity_id: id, ...data }));
    switch (cmd) {
      case "playpause": call(np.playing ? "media_pause" : "media_play"); break;
      case "next": call("media_next_track"); break;
      case "prev": call("media_previous_track"); break;
      case "shuffle": call("shuffle_set", { shuffle: !np.shuffle }); break;
      case "repeat": call("repeat_set", { repeat: np.repeat === "off" ? "all" : (np.repeat === "all" ? "one" : "off") }); break;
      case "mute": call("volume_mute", { is_volume_muted: !np.muted }); break;
      default: break;
    }
  }

  async _toggleGroup(id) {
    const p = this._player(id);
    const grouped = this._groupMembers().includes(id);
    const name = p.name;
    if (grouped) await this._svc(() => this._hass.callService("media_player", "unjoin", { entity_id: id }), `${name} spiller ikke længere med`);
    else await this._svc(() => this._hass.callService("media_player", "join", { entity_id: this._active, group_members: [id] }), `${name} spiller nu med`);
  }

  async _transfer(id) {
    const from = this._active;
    const name = this._playerName(id);
    const done = await this._svc(() => this.api.transfer(from, id), `Musikken spiller nu på ${name}`);
    if (done) this._setActive(id);
  }

  _setVolume(id, value) {
    return this._svc(() => this._hass.callService("media_player", "volume_set", { entity_id: id, volume_level: Math.max(0, Math.min(1, value / 100)) }));
  }

  _setGroupVolume(value) {
    if (this.api.hasMassQueue) return this._svc(() => this.api.call("mass_queue", "set_group_volume", { entity: this._active, volume_level: Math.max(1, Math.round(value)) }, undefined, false));
    const ids = [this._active, ...this._groupMembers()];
    return Promise.all(ids.map((id) => this._setVolume(id, value)));
  }

  _toast(msg, err = false) {
    const t = this.$?.toast;
    if (!t) return;
    t.textContent = msg;
    t.classList.toggle("err", err);
    t.classList.add("show");
    clearTimeout(this._toastTimer);
    this._timers.delete(this._toastTimer);
    this._toastTimer = this._later(() => t.classList.remove("show"), err ? 4500 : 2600);
  }

  // ---------- Events ----------
  _onClick(e) {
    if (this._suppressClick) { this._suppressClick = false; e.preventDefault(); e.stopPropagation(); return; }
    const t = e.target;
    const el = t.closest("[data-mact],[data-closemenu],[data-unrecent],[data-searchclear],[data-play],[data-shuffleplay],[data-menu],[data-fav],[data-goto],[data-qact],[data-qclear],[data-qplay],[data-group],[data-mute],[data-transfer],[data-select],[data-npfav],[data-npopen],[data-npmenu],[data-cmd],[data-panel],[data-closepanel],[data-sheet],[data-closesheet],[data-back],[data-fwd],[data-sidetoggle],[data-nav],[data-libtype],[data-favfilter],[data-recent],[data-retry],[data-showall],[data-open],[data-track]");
    if (!el) return;
    const d = el.dataset;
    if (el.disabled) return;
    if ("mact" in d) return void this._menuAction(d.mact);
    if ("closemenu" in d) return void this._closeMenu();
    if ("unrecent" in d) {
      e.stopPropagation();
      const list = store.get(RECENT_KEY, []);
      list.splice(Number(d.unrecent), 1);
      store.set(RECENT_KEY, list);
      return void this._renderView(false);
    }
    if ("searchclear" in d) {
      const input = this.$.top.querySelector("[data-search]");
      if (input) { input.value = ""; input.focus(); }
      this._view.query = ""; this._lastQuery = "";
      el.remove();
      return void this._renderView(true);
    }
    if ("play" in d) {
      const item = this._items.get(d.play);
      if (this._view.name === "detail" && item && this._view.item?.uri === item.uri && this._isCurrent(item)) return void this._cmd("playpause");
      return void this._play(item, item?.media_type === "track" ? "play" : "replace");
    }
    if ("shuffleplay" in d) {
      const item = this._items.get(d.shuffleplay);
      return void this._svc(() => this._hass.callService("media_player", "shuffle_set", { entity_id: this._active, shuffle: true })).then(() => this._play(item, "replace"));
    }
    if ("menu" in d) return void this._openMenu(this._items.get(d.menu), el);
    if ("fav" in d) return void this._toggleFav(this._items.get(d.fav));
    if ("goto" in d) return void this._goUri(d.goto, d.name);
    if ("qact" in d) {
      const labels = { move_queue_item_next: "Spilles som det næste", remove_queue_item: "Fjernet fra køen" };
      return void this._svc(() => this.api.queueAction(d.qact, this._active, d.qid), labels[d.qact]).then(() => this._refreshQueue());
    }
    if ("qclear" in d) return void this._svc(() => this.api.queueAction("clear_queue_from_here", this._active), "Resten af køen er ryddet").then(() => this._refreshQueue());
    if ("qplay" in d) {
      if (!d.qplay || el.classList.contains("on")) return;
      return void this._svc(() => this.api.queueAction("play_queue_item", this._active, d.qplay)).then(() => this._refreshQueue());
    }
    if ("group" in d) return void this._toggleGroup(d.group);
    if ("mute" in d) { const p = this._player(d.mute); return void this._svc(() => this._hass.callService("media_player", "volume_mute", { entity_id: d.mute, is_volume_muted: !p.muted })); }
    if ("transfer" in d) return void this._transfer(d.transfer);
    if ("select" in d) {
      this._setActive(d.select);
      if (this._mode === "narrow" && this._sheets.at(-1) === "speakers" && this._sheets.length > 1) this._closeSheet();
      return;
    }
    if ("npfav" in d) return void this._toggleNpFav();
    if ("npopen" in d) {
      const it = this._np().item;
      const target = d.npopen === "artist" ? it?.artists?.[0] : it?.album;
      if (target?.uri) this._goUri(target.uri, target.name);
      else if (this._mode === "narrow" && el.closest(".mini")) this._openSheet("player");
      return;
    }
    if ("npmenu" in d) { const it = this._np().item; if (it?.uri) this._openMenu({ ...it, name: it.name || this._np().title }, null); return; }
    if ("cmd" in d) return void this._cmd(d.cmd);
    if ("panel" in d) return void this._togglePanel(d.panel);
    if ("closepanel" in d) { this._panel = null; this._applyPanelLayout(); this._renderNowPlaying(true); this._later(() => this._onResize(), 30); return; }
    if ("sheet" in d) return void this._openSheet(d.sheet);
    if ("closesheet" in d) return void this._closeSheet();
    if ("back" in d) return void this._back();
    if ("fwd" in d) return void this._fwd();
    if ("sidetoggle" in d) { this.$.shell.classList.toggle("side-open"); this._later(() => this._onResize(), 250); return; }
    if ("nav" in d) return void this._go(d.nav);
    if ("libtype" in d) {
      const v = this._view;
      return void this._navigate({ ...v, type: d.libtype, sort: defaultSort(d.libtype), filter: "", scroll: 0 }, true);
    }
    if ("favfilter" in d) { const v = this._view; return void this._navigate({ ...v, fav: !v.fav, scroll: 0 }, true); }
    if ("recent" in d) {
      const q = d.recent;
      this._view.query = q; this._lastQuery = q;
      this._renderTop();
      return void this._renderView(true);
    }
    if ("retry" in d) {
      this.api.clearCache();
      const v = this._view;
      if (v.name === "home") this._data.home = null;
      if (v.name === "library") this._data.lib.delete(this._libKey(v));
      if (v.name === "detail") this._data.detail.delete(v.item.uri);
      return void this._renderView(false);
    }
    if ("showall" in d) {
      const st = this._data.detail.get(this._view.item.uri);
      if (st) { st.showAll = !st.showAll; this._renderView(false); }
      return;
    }
    if ("open" in d) return void this._open(this._items.get(d.open));
    if ("track" in d) return void this._playFromList(el);
  }

  _onInput(e) {
    const el = e.target;
    if (el.classList?.contains("rng")) {
      setP(el);
      if ("seek" in el.dataset) {
        const pos = el.closest(".seek, .fp-seek")?.querySelector("[data-pos]");
        if (pos) pos.textContent = fmtTime(el.value);
      }
      return;
    }
    if ("search" in el.dataset) return void this._onSearchInput(el.value);
    if ("filter" in el.dataset) {
      clearTimeout(this._filterTimer);
      this._timers.delete(this._filterTimer);
      this._filterTimer = this._later(() => {
        const v = this._view;
        if (v.name !== "library") return;
        v.filter = el.value.trim();
        const st = this._libState(v);
        if (!st.loading) this._renderLibBody(st);
      }, 350);
    }
  }

  _onChange(e) {
    const el = e.target;
    const d = el.dataset || {};
    if ("sort" in d) { const v = this._view; return void this._navigate({ ...v, sort: el.value, scroll: 0 }, true); }
    if ("seek" in d) { this._dragging = null; return void this._svc(() => this._hass.callService("media_player", "media_seek", { entity_id: this._active, seek_position: Number(el.value) })); }
    if ("npvol" in d) { this._dragging = null; return void this._setVolume(this._active, Number(el.value)); }
    if ("vol" in d) { this._dragging = null; return void this._setVolume(d.vol, Number(el.value)); }
    if ("gvol" in d) { this._dragging = null; return void this._setGroupVolume(Number(el.value)); }
  }

  _onKey(e) {
    if (e.key === "Escape") {
      if (this.$.layer.classList.contains("open")) { this._closeMenu(); return; }
      if (this._sheets.length) { this._closeSheet(); return; }
      if (this._panel && !this._dock) { this._panel = null; this._applyPanelLayout(); return; }
    }
    if ((e.key === "Enter" || e.key === " ") && e.target.matches?.('[role="button"]')) { e.preventDefault(); e.target.click(); }
    if (e.key === "Enter" && "search" in (e.target.dataset || {})) { clearTimeout(this._searchTimer); this._onSearchInput(e.target.value); }
  }

  // Long press (touch) opens the item menu; a drag on a range stops in-place updates of that range.
  _onPointerDown(e) {
    const t = e.target;
    if (t.classList?.contains("rng")) {
      this._dragging = t;
      const stop = () => { window.removeEventListener("pointerup", stop, true); window.removeEventListener("pointercancel", stop, true); this._later(() => { if (this._dragging === t) this._dragging = null; }, 400); };
      window.addEventListener("pointerup", stop, true);
      window.addEventListener("pointercancel", stop, true);
      return;
    }
    if (e.pointerType !== "touch") return;
    const el = t.closest("[data-open],[data-track],.qi");
    if (!el || t.closest("button.dots, button.more, .qa, button.fab")) return;
    this._lp = { x: e.clientX, y: e.clientY, el };
    clearTimeout(this._lpTimer);
    this._lpTimer = setTimeout(() => {
      const key = el.dataset.open || el.dataset.track || el.querySelector("[data-menu]")?.dataset.menu;
      const item = this._items.get(key);
      if (item) { this._suppressClick = true; this._openMenu(item, el); navigator.vibrate?.(10); this._later(() => { this._suppressClick = false; }, 800); }
      this._lp = null;
    }, 520);
  }

  _movePress(e) {
    if (!this._lp) return;
    if (Math.abs(e.clientX - this._lp.x) > 10 || Math.abs(e.clientY - this._lp.y) > 10) this._endPress();
  }

  _endPress() { clearTimeout(this._lpTimer); this._lp = null; }

  _onContextMenu(e) {
    const el = e.target.closest("[data-open],[data-track]");
    if (!el) return;
    e.preventDefault();
    if (this.$.layer.classList.contains("open")) return;
    this._openMenu(this._items.get(el.dataset.open || el.dataset.track), null);
    if (this._mode !== "narrow" && !this._touch) {
      const box = this.$.shell.getBoundingClientRect();
      const m = this.$.menu;
      m.style.left = `${Math.min(e.clientX - box.left, box.width - m.offsetWidth - 8)}px`;
      m.style.top = `${Math.min(e.clientY - box.top, box.height - m.offsetHeight - 8)}px`;
    }
  }

  _onImgError(e) {
    const img = e.target;
    if (img?.tagName !== "IMG" || !img.dataset.ph) return;
    const ph = document.createElement("div");
    ph.className = `${img.className} art-ph`;
    ph.innerHTML = icon(img.dataset.ph);
    img.replaceWith(ph);
  }
}

function defaultSort(type) {
  return ["playlist", "radio", "podcast", "audiobook"].includes(type) ? "last_played_desc" : "timestamp_added_desc";
}

function setP(el) {
  const min = Number(el.min) || 0;
  const max = Number(el.max) || 100;
  el.style.setProperty("--p", `${max > min ? ((Number(el.value) - min) / (max - min)) * 100 : 0}%`);
}

function errText(e) {
  const msg = e?.message || e?.error?.message || (typeof e === "string" ? e : "") || e?.code || "ukendt fejl";
  return String(msg).slice(0, 140);
}

if (!customElements.get("ha-music-card")) customElements.define("ha-music-card", HaMusicCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "ha-music-card")) {
  window.customCards.push({ type: "ha-music-card", name: "HA Music Card", description: "Musik-app til Music Assistant: bibliotek, søgning, kø og højttalere", preview: false });
}
export { HaMusicCard, VERSION };
