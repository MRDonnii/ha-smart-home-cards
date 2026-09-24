const VERSION = "0.1.5";
const TAG = "ha-roborock-room-map-card";

/*
 * Interactive room map for the core Home Assistant Roborock integration.
 *
 * The integration renders its map image with vacuum-map-parser-roborock, which paints every
 * room in a fixed palette colour keyed by the room's segment id (ids above 32 wrap). The card
 * reads the real image, recognises each room by that colour, and redraws the map in the active
 * theme's colours so rooms can be selected directly on the floor plan. Segment ids and names
 * come from `roborock.get_maps`; nothing is hard-coded or guessed.
 */

const ROOM_PALETTE = {
  1: [240, 178, 122], 2: [133, 193, 233], 3: [217, 136, 128], 4: [52, 152, 219],
  5: [205, 97, 85], 6: [243, 156, 18], 7: [88, 214, 141], 8: [245, 176, 65],
  9: [252, 212, 81], 10: [72, 201, 176], 11: [84, 153, 199], 12: [133, 193, 233],
  13: [245, 176, 65], 14: [82, 190, 128], 15: [72, 201, 176], 16: [165, 105, 189],
  17: [240, 178, 122], 18: [133, 193, 233], 19: [217, 136, 128], 20: [52, 152, 219],
  21: [205, 97, 85], 22: [243, 156, 18], 23: [88, 214, 141], 24: [245, 176, 65],
  25: [252, 212, 81], 26: [72, 201, 176], 27: [84, 153, 199], 28: [133, 193, 233],
  29: [245, 176, 65], 30: [82, 190, 128], 31: [72, 201, 176], 32: [165, 105, 189],
};
const roomColor = (id) => {
  let n = Number(id);
  if (n > 32) n = ((n - 1) % 32) + 1;
  return ROOM_PALETTE[n];
};
const key3 = (r, g, b) => (r << 16) | (g << 8) | b;

const MAP = {
  walls: [[100, 196, 254], [93, 109, 126]],
  floor: [[32, 115, 185], [223, 223, 223]],
  background: [19, 87, 148],
  carpet: [169, 247, 169],
  path: [147, 194, 238],
  // Semi-transparent layers the parser composites on top of rooms.
  overlays: [
    { rgb: [255, 255, 255], a: 0x48 / 255, kind: "path" }, // mop path
    { rgb: [127, 127, 127], a: 127 / 255, kind: "path" }, // cleaned area
    { rgb: [0, 0, 0], a: 128 / 255, kind: "obstacle" },
    { rgb: [102, 254, 218], a: 127 / 255, kind: "dock" },
    { rgb: [173, 216, 255], a: 0x8f / 255, kind: "path" }, // zones
    { rgb: [255, 33, 55], a: 127 / 255, kind: "keep" }, // no-go
    { rgb: [163, 130, 211], a: 127 / 255, kind: "keep" }, // no-mop
  ],
};

const PATH_PX = (255 << 24 | MAP.path[2] << 16 | MAP.path[1] << 8 | MAP.path[0]) >>> 0;
const K_OUT = 0, K_WALL = 1, K_FLOOR = 2, K_PATH = 3, K_OBST = 4, K_KEEP = 5;

const FEATURE = { PAUSE: 4, STOP: 8, RETURN_HOME: 16, FAN_SPEED: 32, SEND_COMMAND: 256, LOCATE: 512, START: 8192 };

const STATUS_LABELS = {
  starting: "Starter", charger_disconnected: "Frakoblet dock", idle: "Klar", remote_control_active: "Fjernstyring",
  cleaning: "Rengør", returning_home: "På vej hjem", manual_mode: "Manuel styring", charging: "Oplader",
  charging_problem: "Opladningsproblem", paused: "Sat på pause", spot_cleaning: "Spotrengøring", error: "Fejl",
  shutting_down: "Slukker", updating: "Opdaterer", docking: "Parkerer i dock", going_to_target: "Kører til punkt",
  zoned_cleaning: "Zonerengøring", segment_cleaning: "Rengør valgte rum", emptying_the_bin: "Tømmer støvbeholder",
  mapping: "Kortlægger", charging_complete: "Fuldt opladet", device_offline: "Offline", locked: "Låst",
  robot_status_mopping: "Mopper", segment_mopping: "Mopper valgte rum", zoned_mopping: "Mopper zone",
  docked: "I dock", returning: "På vej hjem", unavailable: "Utilgængelig", unknown: "Ukendt",
};
const ACTIVE = new Set(["cleaning", "segment_cleaning", "zoned_cleaning", "spot_cleaning", "robot_status_mopping", "segment_mopping", "zoned_mopping", "going_to_target", "starting", "mapping"]);
const ERRORS = {
  lidar_blocked: "Lidar er blokeret", bumper_stuck: "Kofanger sidder fast", wheels_suspended: "Hjul hænger frit",
  cliff_sensor_error: "Faldsensor fejl", main_brush_jammed: "Hovedbørste sidder fast", side_brush_jammed: "Sidebørste sidder fast",
  wheels_jammed: "Hjul sidder fast", robot_trapped: "Robotten sidder fast", no_dustbin: "Støvbeholder mangler",
  low_battery: "Lavt batteri", charging_error: "Opladningsfejl", battery_error: "Batterifejl", robot_tilted: "Robotten står skævt",
  side_brush_error: "Sidebørste fejl", fan_error: "Blæserfejl", filter_blocked: "Filteret er tilstoppet",
  return_to_dock_fail: "Kunne ikke finde hjem til dock", vibrarise_jammed: "Moppemodul sidder fast",
  cannot_cross_carpet: "Kan ikke krydse tæppe", internal_error: "Intern fejl", wall_sensor_dirty: "Vægsensor er snavset",
  optical_flow_sensor_dirt: "Bundsensor er snavset", dock_locator_error: "Kan ikke finde dock",
  auto_empty_dock_fan_error: "Blæserfejl i dock", duct_blockage: "Tilstoppet sugekanal i dock",
  auto_empty_dock_voltage_error: "Spændingsfejl i dock", no_dustbin_or_filter: "Støvbeholder eller filter mangler",
};
const FAN = {
  off: ["Fra", "mdi:fan-off"], gentle: ["Mild", "mdi:fan-minus"], quiet: ["Stille", "mdi:fan-speed-1"],
  balanced: ["Standard", "mdi:fan-speed-2"], standard: ["Standard", "mdi:fan-speed-2"], turbo: ["Turbo", "mdi:fan-speed-3"],
  strong: ["Kraftig", "mdi:fan-speed-3"], max: ["Maks", "mdi:fan-plus"], max_plus: ["Maks+", "mdi:weather-windy"],
};
const WATER = {
  off: ["Fra", "mdi:water-off-outline"], mild: ["Lav", "mdi:water-outline"], low: ["Lav", "mdi:water-outline"],
  moderate: ["Middel", "mdi:water"], medium: ["Middel", "mdi:water"], standard: ["Middel", "mdi:water"],
  intense: ["Høj", "mdi:water-plus"], high: ["Høj", "mdi:water-plus"],
};
const EMPTY_MODE = { smart: "Smart", light: "Let", balanced: "Balanceret", max: "Maks" };

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const human = (v) => { const s = String(v ?? "").replace(/_/g, " ").trim(); return s ? s[0].toUpperCase() + s.slice(1) : ""; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// Icons render inside their own shadow roots, so walk the composed path instead of closest().
const inPath = (e, sel) => e.composedPath().find((n) => n instanceof Element && n.matches(sel));

/** Classify the integration's map image into walls, floor and rooms. Pure function; no DOM. */
function analyseMap(img, rooms, scale) {
  const { width: FW, height: FH, data } = img;
  const px = new Uint32Array(data.buffer, data.byteOffset, FW * FH);
  // Content bounds from the alpha channel, snapped to the parser's cell grid.
  let minX = FW, minY = FH, maxX = -1, maxY = -1;
  for (let y = 0; y < FH; y++) {
    const row = y * FW;
    for (let x = 0; x < FW; x++) {
      if (data[(row + x) * 4 + 3]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const margin = scale * 3;
  const x0 = Math.max(0, Math.floor((minX - margin) / scale) * scale);
  const y0 = Math.max(0, Math.floor((minY - margin) / scale) * scale);
  const x1 = Math.min(FW, Math.ceil((maxX + 1 + margin) / scale) * scale);
  const y1 = Math.min(FH, Math.ceil((maxY + 1 + margin) / scale) * scale);
  const W = x1 - x0, H = y1 - y0;
  const CW = Math.ceil(W / scale), CH = Math.ceil(H / scale);

  const roomByColor = new Map();
  rooms.forEach((room, i) => {
    if (!room.mappable) return;
    roomByColor.set(key3(...room.color), i + 1);
  });
  const near = (c, ref, tol = 4) => Math.abs(c[0] - ref[0]) <= tol && Math.abs(c[1] - ref[1]) <= tol && Math.abs(c[2] - ref[2]) <= tol;
  const roomNear = (c) => {
    for (const [k, idx] of roomByColor) if (near(c, [(k >> 16) & 255, (k >> 8) & 255, k & 255])) return idx;
    return 0;
  };
  const cache = new Map();
  const classify = (r, g, b, a) => {
    if (!a) return [K_OUT, 0, 0];
    if (a < 255) return near([r, g, b], MAP.overlays[3].rgb, 6) ? [K_KEEP, 0, 1] : [K_KEEP, 0, 0];
    const k = key3(r, g, b);
    if (roomByColor.has(k)) return [K_FLOOR, roomByColor.get(k), 0];
    if (MAP.walls.some((w) => w[0] === r && w[1] === g && w[2] === b)) return [K_WALL, 0, 0];
    if (r === MAP.background[0] && g === MAP.background[1] && b === MAP.background[2]) return [K_OUT, 0, 0];
    if (MAP.floor.some((f) => f[0] === r && f[1] === g && f[2] === b)) return [K_FLOOR, 0, 0];
    if (r === MAP.carpet[0] && g === MAP.carpet[1] && b === MAP.carpet[2]) return [K_PATH, 0, 2];
    if (r === MAP.path[0] && g === MAP.path[1] && b === MAP.path[2]) return [K_PATH, 0, 0];
    if ((r === 255 && g === 255 && b === 255) || (r === 0 && g === 0 && b === 0)) return [K_FLOOR, 0, 3];
    for (const o of MAP.overlays) {
      const base = [0, 1, 2].map((i) => ([r, g, b][i] - o.a * o.rgb[i]) / (1 - o.a));
      if (base.some((v) => v < -6 || v > 261)) continue;
      const idx = roomNear(base);
      const onKnown = idx || near(base, MAP.path) || MAP.walls.some((w) => near(base, w)) || MAP.floor.some((f) => near(base, f));
      if (!onKnown) continue;
      if (o.kind === "dock") return [K_KEEP, idx, 1];
      if (o.kind === "obstacle") return [K_OBST, idx, 0];
      if (o.kind === "path") return [K_PATH, idx, 0];
      return [K_KEEP, idx, 0];
    }
    return [K_KEEP, 0, 0];
  };

  const kind = new Uint8Array(W * H);
  const orig = new Uint32Array(W * H);
  const label = new Uint8Array(CW * CH);
  const fillable = new Uint8Array(CW * CH);
  let robotX = 0, robotY = 0, robotN = 0, dockX = 0, dockY = 0, dockN = 0;
  let lastPx = -1, last = null;
  for (let y = 0; y < H; y++) {
    const srcRow = (y + y0) * FW + x0;
    const cellRow = ((y / scale) | 0) * CW;
    for (let x = 0; x < W; x++) {
      const p = px[srcRow + x];
      const i = y * W + x;
      orig[i] = p;
      let res;
      if (p === lastPx) res = last;
      else {
        const o = (srcRow + x) * 4;
        res = cache.get(p);
        if (!res) {
          res = classify(data[o], data[o + 1], data[o + 2], data[o + 3]);
          cache.set(p, res);
        }
        lastPx = p;
        last = res;
      }
      const [k, room, flag] = res;
      kind[i] = k;
      const c = cellRow + ((x / scale) | 0);
      if (room && k !== K_WALL) label[c] = room;
      else if (k === K_PATH || k === K_KEEP || k === K_OBST || flag === 3) fillable[c] = 1;
      if (flag === 1) { dockX += x; dockY += y; dockN++; }
      else if (flag === 3 && p >>> 24 === 255 && (p & 0xffffff) === 0xffffff) { robotX += x; robotY += y; robotN++; }
    }
  }
  // Path lines, carpets, robot and obstacles hide the room colour underneath; grow the
  // surrounding room into those cells so they still belong to the right room.
  for (let pass = 0; pass < 10; pass++) {
    const snap = label.slice();
    let changed = 0;
    for (let cy = 0; cy < CH; cy++) {
      for (let cx = 0; cx < CW; cx++) {
        const c = cy * CW + cx;
        if (snap[c] || !fillable[c]) continue;
        const n = (cx > 0 && snap[c - 1]) || (cx < CW - 1 && snap[c + 1]) || (cy > 0 && snap[c - CW]) || (cy < CH - 1 && snap[c + CW]);
        if (n) { label[c] = n; changed++; }
      }
    }
    if (!changed) break;
  }
  const visited = new Uint8Array(CW * CH);
  for (let y = 0; y < H; y += 2) {
    const row = y * W, cellRow = ((y / scale) | 0) * CW;
    for (let x = 0; x < W; x += 2) if (kind[row + x] === K_PATH && orig[row + x] === PATH_PX) visited[cellRow + ((x / scale) | 0)] = 1;
  }
  // Chamfer distance to the room's own border gives a label point well inside each room.
  const dist = new Float32Array(CW * CH);
  const D = 1, D2 = 1.414;
  for (let c = 0; c < dist.length; c++) dist[c] = label[c] ? 1e6 : 0;
  const relax = (c, n, w) => { const v = (label[n] === label[c] ? dist[n] : 0) + w; if (v < dist[c]) dist[c] = v; };
  for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx < CW; cx++) {
    const c = cy * CW + cx;
    if (!label[c]) continue;
    if (cx === 0 || cy === 0) { dist[c] = D; continue; }
    relax(c, c - 1, D); relax(c, c - CW, D); relax(c, c - CW - 1, D2);
    if (cx < CW - 1) relax(c, c - CW + 1, D2); else dist[c] = D;
  }
  for (let cy = CH - 1; cy >= 0; cy--) for (let cx = CW - 1; cx >= 0; cx--) {
    const c = cy * CW + cx;
    if (!label[c]) continue;
    if (cx === CW - 1 || cy === CH - 1) { dist[c] = D; continue; }
    relax(c, c + 1, D); relax(c, c + CW, D); relax(c, c + CW + 1, D2);
    if (cx > 0) relax(c, c + CW - 1, D2); else dist[c] = D;
  }
  // Two-cell outline ring along each room's border.
  const edge = new Uint8Array(CW * CH);
  for (let c = 0; c < edge.length; c++) if (label[c] && dist[c] < 2.5) edge[c] = 1;
  // Lidar also paints areas seen through windows. Prefer label points near where the robot has
  // actually driven (path cells), falling back to the whole room when no path is drawn.
  let driven = visited;
  for (let pass = 0; pass < 12; pass++) {
    const next = driven.slice();
    for (let c = 0; c < driven.length; c++) {
      if (driven[c]) continue;
      const cx = c % CW;
      if ((cx > 0 && driven[c - 1]) || (cx < CW - 1 && driven[c + 1]) || driven[c - CW] || driven[c + CW]) next[c] = 1;
    }
    driven = next;
  }
  const stats = rooms.map(() => ({ best: -1, bx: 0, by: 0, cells: 0, nbest: -1, nx: 0, ny: 0 }));
  for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx < CW; cx++) {
    const c = cy * CW + cx, L = label[c];
    if (!L) continue;
    const s = stats[L - 1];
    s.cells++;
    if (dist[c] > s.best) { s.best = dist[c]; s.bx = cx; s.by = cy; }
    if (driven[c] && dist[c] > s.nbest) { s.nbest = dist[c]; s.nx = cx; s.ny = cy; }
  }
  for (const s of stats) if (s.nbest >= 3 && s.nbest >= s.best * 0.55) { s.best = s.nbest; s.bx = s.nx; s.by = s.ny; }
  return {
    W, H, CW, CH, scale, kind, orig, label, edge,
    rooms: stats.map((s) => (s.cells ? { x: ((s.bx + 0.5) * scale) / W, y: ((s.by + 0.5) * scale) / H, cells: s.cells, depth: s.best } : null)),
    robot: robotN > 12 ? { x: robotX / robotN / W, y: robotY / robotN / H } : null,
    dock: dockN > 12 ? { x: dockX / dockN / W, y: dockY / dockN / H } : null,
  };
}

class HARoborockRoomMapCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = {};
    this._rooms = [];
    this._sel = [];
    this._repeat = 1;
    this._map = null;
    this._mapUrl = "";
    this._mapState = "idle";
    this._roomsState = "idle";
    this._hover = 0;
    this._zoom = { z: 1, x: 0, y: 0 };
    this._pointers = new Map();
    this._sig = "";
    this._flash = null;
  }

  static getStubConfig(hass) {
    const vacuum = Object.keys(hass?.entities || {}).find((id) => id.startsWith("vacuum.") && hass.entities[id].platform === "roborock");
    return { entity: vacuum || "vacuum.robot_vacuum" };
  }

  setConfig(config) {
    if (!config?.entity || !String(config.entity).startsWith("vacuum.")) throw new Error("Kortet kræver entity: vacuum.<navn>");
    const changed = this._config.entity !== config.entity;
    this._config = { title: undefined, subtitle: undefined, map_scale: 4, max_repeat: 3, ...config };
    if (changed) {
      this._rooms = [];
      this._map = null;
      this._mapUrl = "";
      this._roomsState = "idle";
      this._restore();
    }
    this._built = false;
    this._build();
  }

  set hass(hass) {
    // Parent cards (e.g. robot fleet) may pass hass before it exists.
    if (!hass) return;
    this._hass = hass;
    if (!this._built) this._build();
    this._ensureEntities();
    if (this._roomsState === "idle") this._loadRooms();
    const mapState = this._state(this._ent.map);
    const pic = mapState?.attributes?.entity_picture;
    if (pic && this._roomsState === "ready") {
      // The integration re-renders the image (~30 s while cleaning) under the same URL/token;
      // only the entity state (last render time) changes.
      const key = `${pic}|${mapState.state}`;
      if (key !== this._mapUrl) {
        if (document.hidden) this._pendingMap = true;
        else this._loadMap(pic, key);
      }
    }
    const ids = Object.values(this._ent).flat().filter(Boolean);
    const sig = ids.map((id) => { const s = hass.states[id]; return s ? `${s.state}|${s.attributes.fan_speed ?? ""}` : "-"; }).join(",");
    if (sig !== this._sig) {
      this._sig = sig;
      this._renderPanel();
      this._renderMarkers();
    }
    if (this._moreCard) this._moreCard.hass = hass;
  }

  getCardSize() { return 12; }
  getGridOptions() { return { columns: 12, min_columns: 6, rows: "auto" }; }

  connectedCallback() {
    if (!this._ro) {
      this._ro = new ResizeObserver(() => { this._resetZoom(); this._layoutLabels(); });
    }
    const vp = this.shadowRoot.querySelector(".viewport");
    if (vp) this._ro.observe(vp);
    this._onVisible ||= () => { if (!document.hidden && this._pendingMap && this._hass) this.hass = this._hass; };
    document.addEventListener("visibilitychange", this._onVisible);
  }
  disconnectedCallback() {
    this._ro?.disconnect();
    clearTimeout(this._flashTimer);
    document.removeEventListener("visibilitychange", this._onVisible);
  }

  /* ---------- entities ---------- */

  _state(id) { return id ? this._hass?.states?.[id] : undefined; }
  _s(id) { return this._state(id)?.state; }
  _num(id) { const v = parseFloat(this._s(id)); return Number.isFinite(v) ? v : undefined; }
  _supports(bit) { return ((this._state(this._config.entity)?.attributes?.supported_features || 0) & bit) === bit; }

  /** Find the vacuum's sibling entities through the device registry; explicit config wins. */
  _ensureEntities() {
    if (this._ent && this._entFor === this._config.entity) return;
    const hass = this._hass, cfg = this._config;
    const all = hass.entities || {}, devices = hass.devices || {};
    const vacDev = devices[all[cfg.entity]?.device_id];
    const devIds = new Set(vacDev ? [vacDev.id] : []);
    if (vacDev) {
      for (const d of Object.values(devices)) {
        if (d.id !== vacDev.id && d.via_device_id === vacDev.id) devIds.add(d.id);
        const sameEntry = d.config_entries?.some((e) => vacDev.config_entries?.includes(e));
        const name = d.name_by_user || d.name || "", vname = vacDev.name_by_user || vacDev.name || "";
        if (sameEntry && vname && d.id !== vacDev.id && name.startsWith(vname)) devIds.add(d.id);
      }
    }
    const related = Object.values(all).filter((e) => devIds.has(e.device_id) && !e.hidden);
    const find = (domain, test) => related.find((e) => e.entity_id.startsWith(`${domain}.`) && test(e))?.entity_id;
    const tk = (domain, key) => find(domain, (e) => e.translation_key === key);
    const pick = (name, auto) => (cfg[name] === false ? undefined : cfg[name] || auto);
    const mapName = this._s(tk("select", "selected_map"));
    const images = related.filter((e) => e.entity_id.startsWith("image."));
    const autoMap = (images.find((e) => mapName && (hass.states[e.entity_id]?.attributes?.friendly_name || "").endsWith(mapName)) || images[0])?.entity_id;
    this._ent = {
      map: pick("map", autoMap),
      selected_map: pick("selected_map", tk("select", "selected_map")),
      battery: pick("battery", find("sensor", (e) => hass.states[e.entity_id]?.attributes?.device_class === "battery")),
      status: pick("status", tk("sensor", "status")),
      current_room: pick("current_room", tk("sensor", "current_room")),
      last_clean_start: pick("last_clean_start", tk("sensor", "last_clean_start")),
      last_clean_end: pick("last_clean_end", tk("sensor", "last_clean_end")),
      cleaning_area: pick("cleaning_area", tk("sensor", "cleaning_area")),
      cleaning_time: pick("cleaning_time", tk("sensor", "cleaning_time")),
      cleaning_progress: pick("cleaning_progress", tk("sensor", "clean_percent")),
      vacuum_error: pick("vacuum_error", tk("sensor", "vacuum_error")),
      dock_error: pick("dock_error", tk("sensor", "dock_error")),
      water_box: pick("water_box", tk("binary_sensor", "water_box_attached")),
      mop_attached: pick("mop_attached", tk("binary_sensor", "mop_attached")),
      water_shortage: pick("water_shortage", tk("binary_sensor", "water_shortage")),
      water_amount: pick("water_amount", tk("select", "mop_intensity")),
      empty_mode: pick("empty_mode", tk("select", "dust_collection_mode")),
      empty_dust: pick("empty_dust", tk("switch", "dust_emptying")),
      routines: cfg.routines === false ? [] : cfg.routines || related
        .filter((e) => e.entity_id.startsWith("button.") && !e.translation_key && !e.entity_category && e.device_id === vacDev?.id)
        .map((e) => e.entity_id),
      vacuum: cfg.entity,
    };
    this._entFor = cfg.entity;
    this._deviceName = vacDev?.name_by_user || vacDev?.name || "";
  }

  /* ---------- rooms & map ---------- */

  async _loadRooms() {
    this._roomsState = "loading";
    try {
      let list;
      if (Array.isArray(this._config.rooms) && this._config.rooms.every((r) => typeof r === "object" && r.id && r.name)) {
        list = this._config.rooms.map((r) => ({ id: Number(r.id), name: String(r.name) }));
      } else {
        const res = await this._hass.callWS({
          type: "call_service", domain: "roborock", service: "get_maps",
          target: { entity_id: this._config.entity }, return_response: true,
        });
        const maps = res?.response?.[this._config.entity]?.maps || [];
        const wanted = this._s(this._ent.selected_map);
        const map = maps.find((m) => m.name === wanted) || maps.find((m) => m.flag === 0) || maps[0];
        if (!map) throw new Error("Integrationen returnerede ingen kort");
        list = Object.entries(map.rooms || {}).map(([id, name]) => ({ id: Number(id), name: name || `Rum ${id}` }));
        if (Array.isArray(this._config.rooms)) {
          const only = this._config.rooms.map(Number);
          list = list.filter((r) => only.includes(r.id));
        }
      }
      const byColor = new Map();
      list.forEach((r) => { const k = key3(...roomColor(r.id)); byColor.set(k, (byColor.get(k) || 0) + 1); });
      this._rooms = list.map((r) => ({ ...r, color: roomColor(r.id), mappable: byColor.get(key3(...roomColor(r.id))) === 1 }));
      const ids = new Set(this._rooms.map((r) => r.id));
      this._sel = this._sel.filter((id) => ids.has(id));
      this._roomsState = "ready";
      this._mapUrl = "";
      this._roomsError = "";
    } catch (err) {
      this._roomsState = "error";
      this._roomsError = err?.message || String(err);
    }
    this._renderPanel();
    this._renderLabels();
    if (this._hass) this.hass = this._hass;
  }

  _loadMap(pic, key = pic) {
    this._mapUrl = key;
    this._pendingMap = false;
    if (!this._map) this._mapState = "loading";
    this._renderMapMessage();
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (this._mapUrl !== key) return;
      try {
        const cv = document.createElement("canvas");
        cv.width = img.naturalWidth;
        cv.height = img.naturalHeight;
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, cv.width, cv.height);
        const map = analyseMap(data, this._rooms, Number(this._config.map_scale) || 4);
        if (!map) throw new Error("Kortbilledet er tomt");
        const now = Date.now();
        this._glide = this._map && this._lastMapAt ? clamp((now - this._lastMapAt) / 1000, 1, 35) : 0;
        this._lastMapAt = now;
        this._map = map;
        this._mapState = "ready";
        this._mapError = "";
        const canvas = this.shadowRoot.querySelector("canvas.floor");
        if (canvas.width !== map.W || canvas.height !== map.H) {
          canvas.width = map.W;
          canvas.height = map.H;
        }
        if (!this._out || this._out.width !== map.W || this._out.height !== map.H) this._out = new ImageData(map.W, map.H);
        this.shadowRoot.querySelector(".viewport").style.setProperty("--ar", String(map.W / map.H));
        this._drawMap();
        this._renderLabels();
        this._renderMarkers();
      } catch (err) {
        this._mapState = "error";
        this._mapError = err?.message || String(err);
      }
      this._renderMapMessage();
    };
    img.onerror = () => {
      if (this._mapUrl !== key) return;
      this._mapState = "error";
      this._mapError = "Kortbilledet kunne ikke hentes";
      this._renderMapMessage();
    };
    const url = `${pic}${pic.includes("?") ? "&" : "?"}_=${encodeURIComponent(key.split("|")[1] || Date.now())}`;
    img.src = this._hass.hassUrl ? this._hass.hassUrl(url) : url;
  }

  _themeRGBA(varName, fallback) {
    const probe = this.shadowRoot.querySelector(".probe");
    probe.style.color = `var(${varName}, ${fallback})`;
    const color = getComputedStyle(probe).color;
    if (!this._pcx) {
      const c = document.createElement("canvas");
      c.width = c.height = 1;
      this._pcx = c.getContext("2d", { willReadFrequently: true });
    }
    this._pcx.clearRect(0, 0, 1, 1);
    this._pcx.fillStyle = "#000";
    this._pcx.fillStyle = color;
    this._pcx.fillRect(0, 0, 1, 1);
    return Array.from(this._pcx.getImageData(0, 0, 1, 1).data);
  }

  _drawMap() {
    const map = this._map;
    if (!map) return;
    const accent = this._themeRGBA("--rr-accent", "#35c6c0");
    const ink = this._themeRGBA("--primary-text-color", "#e8edf2");
    const pack = (c, a) => ((Math.round(clamp(a, 0, 1) * 255) << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
    const lighten = (c, f) => c.map((v, i) => (i < 3 ? Math.round(v + (255 - v) * f) : v));
    const selected = new Set(this._sel.map((id) => this._rooms.findIndex((r) => r.id === id) + 1));
    // Unselected rooms keep a muted version of their own map colour; selected rooms use the theme accent.
    const own = this._rooms.map((room) => room.color.map((v, i) => Math.round(v * 0.75 + ink[i] * 0.25)));
    const table = new Uint32Array(512);
    for (let k = 0; k < 6; k++) for (let r = 0; r < 32; r++) for (let e = 0; e < 2; e++) {
      const sel = r && selected.has(r), hov = r && r === this._hover, rc = r && own[r - 1];
      let col;
      if (k === K_WALL) col = pack(ink, 0.5);
      else if (k === K_OBST) col = pack(ink, 0.55);
      else if (sel) col = k === K_PATH ? pack(lighten(accent, 0.45), 0.9) : e ? pack(accent, 1) : pack(accent, 0.72);
      else if (rc) col = k === K_PATH ? pack(lighten(rc, 0.3), hov ? 0.7 : 0.55) : pack(rc, e ? (hov ? 0.95 : 0.8) : (hov ? 0.5 : 0.34));
      else col = pack(ink, k === K_PATH ? 0.13 : 0.07);
      table[(k << 6) | (e << 5) | r] = col;
    }
    const out = new Uint32Array(this._out.data.buffer);
    const { W, H, CW, scale, kind, orig, label, edge } = map;
    for (let y = 0; y < H; y++) {
      const cellRow = ((y / scale) | 0) * CW, row = y * W;
      for (let x = 0; x < W; x++) {
        const i = row + x, k = kind[i];
        if (k === K_OUT) { out[i] = 0; continue; }
        if (k === K_KEEP) { out[i] = orig[i]; continue; }
        const c = cellRow + ((x / scale) | 0);
        out[i] = table[(k << 6) | (edge[c] << 5) | (label[c] & 31)];
      }
    }
    this.shadowRoot.querySelector("canvas.floor").getContext("2d").putImageData(this._out, 0, 0);
  }

  /* ---------- selection ---------- */

  _storeKey() { return `${TAG}:${this._config.entity}`; }
  _restore() {
    try {
      const v = JSON.parse(localStorage.getItem(this._storeKey()) || "{}");
      this._sel = Array.isArray(v.sel) ? v.sel.map(Number) : [];
      this._repeat = clamp(Number(v.repeat) || 1, 1, 3);
    } catch { this._sel = []; }
  }
  _persist() {
    try { localStorage.setItem(this._storeKey(), JSON.stringify({ sel: this._sel, repeat: this._repeat })); } catch { /* private mode */ }
  }
  _toggle(id) {
    id = Number(id);
    if (!this._rooms.some((r) => r.id === id)) return;
    this._sel = this._sel.includes(id) ? this._sel.filter((s) => s !== id) : [...this._sel, id];
    this._selectionChanged();
  }
  _move(id, delta) {
    const i = this._sel.indexOf(Number(id)), j = i + delta;
    if (i < 0 || j < 0 || j >= this._sel.length) return;
    const next = [...this._sel];
    [next[i], next[j]] = [next[j], next[i]];
    this._sel = next;
    this._selectionChanged();
  }
  _selectionChanged() {
    this._persist();
    this._drawMap();
    this._renderLabels();
    this._renderPanel();
  }

  _roomAt(clientX, clientY) {
    const map = this._map;
    if (!map) return 0;
    const rect = this.shadowRoot.querySelector("canvas.floor").getBoundingClientRect();
    const cx = Math.floor(((clientX - rect.left) / rect.width) * map.W / map.scale);
    const cy = Math.floor(((clientY - rect.top) / rect.height) * map.H / map.scale);
    for (let r = 0; r <= 4; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= map.CW || y >= map.CH) continue;
        const L = map.label[y * map.CW + x];
        if (L) return L;
      }
    }
    return 0;
  }

  /* ---------- services ---------- */

  async _call(domain, service, data, okText) {
    try {
      await this._hass.callService(domain, service, data);
      if (okText) this._toast(okText, "ok");
    } catch (err) {
      this._toast(`Fejl: ${err?.message || err}`, "error");
    }
  }
  _toast(text, kind) {
    this._flash = { text, kind };
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => { this._flash = null; this._renderPanel(); }, 5000);
    this._renderPanel();
  }
  _cleanSelected() {
    if (!this._sel.length) return;
    const names = this._sel.map((id) => this._rooms.find((r) => r.id === id)?.name).join(" → ");
    this._call("vacuum", "send_command", {
      entity_id: this._config.entity,
      command: "app_segment_clean",
      params: [{ segments: [...this._sel], repeat: this._repeat }],
    }, `Sendt: ${names}${this._repeat > 1 ? ` (${this._repeat}×)` : ""}`);
  }
  _action(a, value) {
    const vac = { entity_id: this._config.entity };
    switch (a) {
      case "clean": return this._cleanSelected();
      case "all": return this._call("vacuum", "start", vac, "Rengøring af hele hjemmet startet");
      case "pause": return this._call("vacuum", "pause", vac, "Sat på pause");
      case "resume": return this._call("vacuum", "start", vac, "Fortsætter");
      case "stop": return this._call("vacuum", "stop", vac, "Stoppet");
      case "home": return this._call("vacuum", "return_to_base", vac, "Sendt hjem til dock");
      case "locate": return this._call("vacuum", "locate", vac, "Robotten siger til");
      case "empty": return this._call("switch", "turn_on", { entity_id: this._ent.empty_dust }, "Tømning af støvbeholder startet");
      case "fan": return this._call("vacuum", "set_fan_speed", { ...vac, fan_speed: value });
      case "water": return this._call("select", "select_option", { entity_id: this._ent.water_amount, option: value });
      case "empty-mode": return this._call("select", "select_option", { entity_id: this._ent.empty_mode, option: value });
      case "routine": return this._call("button", "press", { entity_id: value }, "Rutine startet");
      case "repeat": this._repeat = clamp(Number(value), 1, 3); this._persist(); return this._renderPanel();
      case "toggle": return this._toggle(value);
      case "up": return this._move(value, -1);
      case "down": return this._move(value, 1);
      case "clear": this._sel = []; return this._selectionChanged();
      case "zoom-in": return this._zoomBy(1.4);
      case "zoom-out": return this._zoomBy(1 / 1.4);
      case "zoom-robot": return this._zoomToRobot();
      default: return undefined;
    }
  }

  /* ---------- zoom & pointer ---------- */

  _applyZoom() {
    const stage = this.shadowRoot.querySelector(".stage");
    const { z, x, y } = this._zoom;
    stage.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
    stage.style.setProperty("--inv", String(1 / z));
    const vp = this.shadowRoot.querySelector(".viewport");
    vp.style.touchAction = z > 1.01 ? "none" : "pan-y";
    vp.classList.toggle("zoomed", z > 1.01);
    cancelAnimationFrame(this._lraf);
    this._lraf = requestAnimationFrame(() => this._layoutLabels());
    const pct = this.shadowRoot.querySelector(".zoom-pct");
    if (pct) pct.textContent = `${Math.round(z * 100)}%`;
  }
  _clampZoom() {
    const vp = this.shadowRoot.querySelector(".viewport");
    const w = vp.clientWidth, h = vp.clientHeight, zz = this._zoom;
    zz.z = clamp(zz.z, 1, 4);
    zz.x = clamp(zz.x, w - w * zz.z, 0);
    zz.y = clamp(zz.y, h - h * zz.z, 0);
  }
  _zoomAt(factor, cx, cy) {
    const zz = this._zoom, nz = clamp(zz.z * factor, 1, 4);
    zz.x = cx - (cx - zz.x) * (nz / zz.z);
    zz.y = cy - (cy - zz.y) * (nz / zz.z);
    zz.z = nz;
    this._clampZoom();
    this._applyZoom();
  }
  _zoomBy(f) {
    const vp = this.shadowRoot.querySelector(".viewport");
    this._zoomAt(f, vp.clientWidth / 2, vp.clientHeight / 2);
  }
  _zoomToRobot() {
    const p = this._map?.robot || this._map?.dock;
    const vp = this.shadowRoot.querySelector(".viewport");
    if (!p) return this._resetZoom();
    const z = Math.max(this._zoom.z, 2.2);
    this._zoom = { z, x: vp.clientWidth / 2 - p.x * vp.clientWidth * z, y: vp.clientHeight / 2 - p.y * vp.clientHeight * z };
    this._clampZoom();
    this._applyZoom();
    return undefined;
  }
  _resetZoom() {
    this._zoom = { z: 1, x: 0, y: 0 };
    if (this.shadowRoot.querySelector(".stage")) this._applyZoom();
  }

  _bindPointer(vp) {
    const local = (e) => { const r = vp.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    vp.addEventListener("pointerdown", (e) => {
      if (e.button > 0) return;
      this._pointers.set(e.pointerId, local(e));
      if (this._pointers.size === 1) this._gesture = { moved: false, start: local(e), seg: inPath(e, "[data-seg]")?.dataset.seg };
      else this._gesture.moved = true;
    });
    vp.addEventListener("pointermove", (e) => {
      if (!this._pointers.has(e.pointerId)) {
        if (e.pointerType === "mouse" && this._map) {
          const r = this._roomAt(e.clientX, e.clientY);
          if (r !== this._hover) { this._hover = r; vp.style.cursor = r ? "pointer" : ""; cancelAnimationFrame(this._raf); this._raf = requestAnimationFrame(() => this._drawMap()); }
        }
        return;
      }
      const prev = this._pointers.get(e.pointerId), cur = local(e);
      const g = this._gesture;
      if (this._pointers.size === 2) {
        const [a, b] = [...this._pointers.values()];
        const other = a === prev ? b : a;
        const d0 = Math.hypot(prev[0] - other[0], prev[1] - other[1]) || 1;
        const d1 = Math.hypot(cur[0] - other[0], cur[1] - other[1]) || 1;
        this._zoomAt(d1 / d0, (cur[0] + other[0]) / 2, (cur[1] + other[1]) / 2);
        e.preventDefault();
      } else if (g) {
        if (!g.moved && Math.hypot(cur[0] - g.start[0], cur[1] - g.start[1]) > 8) g.moved = true;
        if (g.moved && this._zoom.z > 1.01) {
          this._zoom.x += cur[0] - prev[0];
          this._zoom.y += cur[1] - prev[1];
          this._clampZoom();
          this._applyZoom();
        }
      }
      this._pointers.set(e.pointerId, cur);
    });
    const end = (e, cancelled) => {
      if (!this._pointers.has(e.pointerId)) return;
      this._pointers.delete(e.pointerId);
      const g = this._gesture;
      if (!cancelled && g && !g.moved && this._pointers.size === 0) {
        const idx = g.seg ? this._rooms.findIndex((r) => r.id === Number(g.seg)) + 1 : this._roomAt(e.clientX, e.clientY);
        if (idx) this._toggle(this._rooms[idx - 1].id);
      }
      if (this._pointers.size === 0) this._gesture = null;
    };
    vp.addEventListener("pointerup", (e) => end(e, false));
    vp.addEventListener("pointercancel", (e) => end(e, true));
    vp.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse" && this._hover) { this._hover = 0; this._drawMap(); }
    });
    // Label buttons stay keyboard accessible; pointer taps are handled above.
    vp.addEventListener("click", (e) => {
      const b = inPath(e, "[data-seg]");
      if (b && e.detail === 0) this._toggle(b.dataset.seg);
    });
  }

  /* ---------- rendering ---------- */

  _build() {
    if (!this.shadowRoot || this._built) return;
    this._built = true;
    this.shadowRoot.innerHTML = `<style>${this._css()}</style>
      <ha-card>
        <div class="grid">
          <section class="map-col">
            <div class="viewport">
              <div class="stage"><canvas class="floor"></canvas><div class="markers"></div><div class="labels"></div></div>
              <div class="map-msg"></div>
            </div>
            <div class="map-bar">
              <div class="legend"><span><i class="sw on"></i>Valgt</span><span><i class="sw"></i>Ikke valgt</span><span class="hint">Tryk på et rum for at vælge eller fravælge</span></div>
              <div class="map-tools">
                <div class="zoom">
                  <button data-a="zoom-out" aria-label="Zoom ud"><ha-icon icon="mdi:minus"></ha-icon></button>
                  <span class="zoom-pct">100%</span>
                  <button data-a="zoom-in" aria-label="Zoom ind"><ha-icon icon="mdi:plus"></ha-icon></button>
                </div>
                <button class="round" data-a="zoom-robot" aria-label="Find robotten på kortet"><ha-icon icon="mdi:crosshairs-gps"></ha-icon></button>
              </div>
            </div>
          </section>
          <aside class="panel"></aside>
          <section class="acts"></section>
        </div>
        ${this._config.more_card ? `<details class="more"><summary><ha-icon icon="mdi:tune-variant"></ha-icon>Vedligehold og flere indstillinger<ha-icon class="chev" icon="mdi:chevron-down"></ha-icon></summary><div class="more-body"></div></details>` : ""}
        <span class="probe"></span>
      </ha-card>`;
    const root = this.shadowRoot;
    root.addEventListener("click", (e) => {
      const b = inPath(e, "[data-a]");
      if (!b || b.disabled) return;
      this._action(b.dataset.a, b.dataset.v);
    });
    this._bindPointer(root.querySelector(".viewport"));
    const more = root.querySelector("details.more");
    if (more) more.addEventListener("toggle", () => { if (more.open) this._mountMore(); });
    if (this.isConnected) this.connectedCallback();
    if (this._map) {
      const canvas = root.querySelector("canvas.floor");
      canvas.width = this._map.W;
      canvas.height = this._map.H;
      root.querySelector(".viewport").style.setProperty("--ar", String(this._map.W / this._map.H));
      this._drawMap();
    }
    this._sig = "";
    this._applyZoom();
    this._renderMapMessage();
    this._renderLabels();
  }

  async _mountMore() {
    if (this._moreCard) return;
    const body = this.shadowRoot.querySelector(".more-body");
    try {
      const helpers = await window.loadCardHelpers?.();
      const el = helpers ? helpers.createCardElement(this._config.more_card) : document.createElement(this._config.more_card.type.replace("custom:", ""));
      if (!helpers) el.setConfig(this._config.more_card);
      el.hass = this._hass;
      body.replaceChildren(el);
      this._moreCard = el;
    } catch (err) {
      body.textContent = `Kunne ikke vise kortet: ${err?.message || err}`;
    }
  }

  _renderMapMessage() {
    const el = this.shadowRoot.querySelector(".map-msg");
    if (!el) return;
    let html = "";
    if (this._roomsState === "error") html = `<ha-icon icon="mdi:map-marker-alert-outline"></ha-icon><b>Rummene kunne ikke hentes</b><span>${esc(this._roomsError)}</span>`;
    else if (this._mapState === "error") html = `<ha-icon icon="mdi:map-marker-alert-outline"></ha-icon><b>Kortet kunne ikke vises</b><span>${esc(this._mapError)}</span>`;
    else if (!this._map && this._ent && !this._ent.map) html = `<ha-icon icon="mdi:map-outline"></ha-icon><b>Ingen kortentitet fundet</b><span>Angiv map: image.… i kortets konfiguration.</span>`;
    else if (!this._map) html = `<ha-icon icon="mdi:loading" class="spin"></ha-icon><b>Henter kort …</b>`;
    el.innerHTML = html;
    el.hidden = !html;
  }

  _renderLabels() {
    const wrap = this.shadowRoot.querySelector(".labels");
    if (!wrap) return;
    const map = this._map;
    if (!map) { wrap.innerHTML = ""; return; }
    wrap.innerHTML = this._rooms.map((room, i) => {
      const p = map.rooms[i];
      if (!p || !room.mappable) return "";
      const n = this._sel.indexOf(room.id) + 1;
      const small = p.depth < 5 ? " small" : "";
      return `<button class="lbl${n ? " on" : ""}${small}" data-seg="${room.id}" style="left:${(p.x * 100).toFixed(3)}%;top:${(p.y * 100).toFixed(3)}%" aria-pressed="${n ? "true" : "false"}" aria-label="${esc(room.name)}${n ? `, valgt som nummer ${n}` : ""}">
        <span class="badge">${n ? `<b>${n}</b>` : `<ha-icon icon="mdi:plus"></ha-icon>`}</span><span class="name">${esc(room.name)}</span></button>`;
    }).join("");
    requestAnimationFrame(() => this._layoutLabels());
  }

  _renderMarkers() {
    const wrap = this.shadowRoot.querySelector(".markers");
    if (!wrap || !this._map) return;
    const { robot, dock } = this._map;
    const active = ACTIVE.has(this._statusKey());
    const away = robot && dock && Math.hypot(robot.x - dock.x, robot.y - dock.y) > 0.04;
    if (!wrap.firstElementChild) {
      wrap.innerHTML = `<span class="dock" title="Dock" hidden><ha-icon icon="mdi:home-lightning-bolt-outline"></ha-icon></span><span class="robot" title="Robot" hidden><ha-icon icon="mdi:robot-vacuum"></ha-icon></span>`;
    }
    const [dockEl, robotEl] = wrap.children;
    dockEl.hidden = !(dock && (away || !robot));
    if (dock) { dockEl.style.left = `${dock.x * 100}%`; dockEl.style.top = `${dock.y * 100}%`; }
    robotEl.hidden = !robot;
    robotEl.classList.toggle("live", active);
    if (robot) {
      // Glide over the time between two map renders so movement looks continuous.
      robotEl.style.transitionDuration = `${active ? this._glide || 0 : 0.6}s`;
      robotEl.style.left = `${robot.x * 100}%`;
      robotEl.style.top = `${robot.y * 100}%`;
    }
  }
  /** Hide the name (not the button) of the smaller room when two labels collide. */
  _layoutLabels() {
    const labels = [...(this.shadowRoot.querySelectorAll(".lbl") || [])];
    labels.forEach((l) => l.classList.remove("compact"));
    const depth = (l) => this._map?.rooms[this._rooms.findIndex((r) => r.id === Number(l.dataset.seg))]?.depth || 0;
    const sorted = labels.sort((a, b) => depth(b) - depth(a));
    // Compare the visible content (badge + name), not the padded 44 px touch target.
    const box = (l) => {
      const a = l.querySelector(".badge").getBoundingClientRect(), n = l.querySelector(".name").getBoundingClientRect();
      return l.classList.contains("compact") || !n.width ? a : { left: Math.min(a.left, n.left), right: Math.max(a.right, n.right), top: a.top, bottom: n.bottom };
    };
    const placed = [];
    for (const l of sorted) {
      if (!l.getBoundingClientRect().width) return;
      const r = box(l);
      if (placed.some((p) => r.left < p.right - 2 && r.right > p.left + 2 && r.top < p.bottom - 2 && r.bottom > p.top + 2)) {
        l.classList.add("compact");
        placed.push(box(l));
      } else placed.push(r);
    }
  }

  _statusKey() {
    const raw = this._s(this._ent?.status);
    if (raw && raw !== "unknown" && raw !== "unavailable") return raw;
    return this._s(this._config.entity) || "unknown";
  }

  _lastClean() {
    const s = new Date(this._s(this._ent.last_clean_start));
    const e = new Date(this._s(this._ent.last_clean_end));
    if (Number.isNaN(s.getTime())) return "";
    const day = (d) => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const dd = new Date(d); dd.setHours(0, 0, 0, 0);
      const diff = Math.round((today - dd) / 864e5);
      if (diff === 0) return "I dag";
      if (diff === 1) return "I går";
      return d.toLocaleDateString("da-DK", { day: "numeric", month: "short" });
    };
    const t = (d) => d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
    return `${day(s)} ${t(s)}${Number.isNaN(e.getTime()) || e < s ? "" : `–${t(e)}`}`;
  }
  _duration(min) {
    if (!Number.isFinite(min)) return "";
    const h = Math.floor(min / 60), m = Math.round(min % 60);
    return h ? `${h} t ${m} min` : `${m} min`;
  }

  _seg(action, options, current, labels, disabled) {
    return `<div class="seg" role="group">${options.map((o) => {
      const [label, icon] = labels[o] || [human(o)];
      return `<button data-a="${action}" data-v="${esc(o)}" class="${o === current ? "on" : ""}" ${disabled ? "disabled" : ""} aria-pressed="${o === current}">${icon ? `<ha-icon icon="${icon}"></ha-icon>` : ""}<span>${esc(label)}</span></button>`;
    }).join("")}</div>`;
  }

  _renderPanel() {
    const panel = this.shadowRoot.querySelector(".panel");
    if (!panel || !this._hass || !this._ent) return;
    const E = this._ent, vac = this._state(this._config.entity);
    const vstate = vac?.state || "unavailable";
    const key = this._statusKey();
    const active = ACTIVE.has(key) || vstate === "cleaning";
    const paused = key === "paused" || vstate === "paused";
    const docked = vstate === "docked" || ["charging", "charging_complete", "emptying_the_bin"].includes(key);
    const offline = vstate === "unavailable" || key === "device_offline";
    const battery = this._num(E.battery);
    const errV = this._s(E.vacuum_error), errD = this._s(E.dock_error);
    const hasErr = vstate === "error" || (errV && !["none", "unknown", "unavailable"].includes(errV));
    const hasDockErr = errD && !["ok", "unknown", "unavailable"].includes(errD);
    const title = this._config.title || vac?.attributes?.friendly_name || this._deviceName || "Robotstøvsuger";
    const subtitle = this._config.subtitle ?? `Robotstøvsuger${E.empty_dust ? " med auto-tømning" : ""}`;
    const room = this._s(E.current_room);
    let detail;
    if (offline) detail = "Robotten svarer ikke";
    else if (hasErr) detail = ERRORS[errV] || human(errV) || "Se robotten";
    else if (active) detail = room && room !== "unknown" ? `Arbejder i ${room}` : "Arbejder";
    else if (docked && battery >= 100) detail = "Opladet og klar til rengøring";
    else if (docked) detail = "Oplader i dock";
    else detail = room && room !== "unknown" ? `Står i ${room}` : "";
    const dot = hasErr || offline ? "bad" : active ? "live" : paused ? "warn" : "ok";

    const fanList = (vac?.attributes?.fan_speed_list || []).filter((f) => !["off", "custom"].includes(f));
    const waterState = this._state(E.water_amount);
    const waterList = (waterState?.attributes?.options || []).filter((o) => !["custom", "unknown"].includes(o));
    const waterBoxOff = E.water_box && this._s(E.water_box) === "off";
    const mopOff = E.mop_attached && this._s(E.mop_attached) === "off";
    const waterOn = waterState && waterState.state !== "off";
    const shortage = E.water_shortage && this._s(E.water_shortage) === "on" && waterOn && !waterBoxOff;
    const emptyState = this._state(E.empty_mode);
    const emptyList = (emptyState?.attributes?.options || []).filter((o) => o !== "unknown");
    const canSegments = this._supports(FEATURE.SEND_COMMAND);
    const emptying = key === "emptying_the_bin" || this._s(E.empty_dust) === "on";

    const selRooms = this._sel.map((id) => this._rooms.find((r) => r.id === id)).filter(Boolean);
    const rest = this._rooms.filter((r) => !this._sel.includes(r.id));
    const n = selRooms.length;

    const alerts = [];
    if (offline) alerts.push(["bad", "mdi:wifi-off", "Robotten er offline", "Handlinger er slået fra, indtil den er online igen."]);
    if (hasErr && !offline) alerts.push(["bad", "mdi:robot-vacuum-alert", ERRORS[errV] || human(errV) || "Fejl", "Ret fejlen på robotten, og prøv igen."]);
    if (hasDockErr) alerts.push(["bad", "mdi:home-alert-outline", ERRORS[errD] || human(errD), "Fejl i dock"]);
    if (shortage) alerts.push(["warn", "mdi:water-alert-outline", "Moppebeholderen mangler vand", "Fyld robottens egen beholder manuelt, eller sæt vandmængde til Fra."]);
    if (this._roomsState === "error") alerts.push(["bad", "mdi:alert-circle-outline", "Rum kunne ikke hentes", this._roomsError]);
    const unmappable = this._rooms.filter((r) => !r.mappable || (this._map && !this._map.rooms[this._rooms.indexOf(r)]));
    if (this._map && unmappable.length) alerts.push(["info", "mdi:information-outline", `${unmappable.map((r) => r.name).join(", ")} kan ikke placeres på kortet`, "Vælg dem i listen i stedet."]);

    const info = [];
    if (active || paused) {
      const pct = this._num(E.cleaning_progress), area = this._num(E.cleaning_area), time = this._num(E.cleaning_time);
      if (Number.isFinite(pct)) info.push(["mdi:progress-check", "Fremdrift", `${Math.round(pct)} %`]);
      if (Number.isFinite(area)) info.push(["mdi:texture-box", "Areal", `${area.toLocaleString("da-DK", { maximumFractionDigits: 1 })} m²`]);
      if (Number.isFinite(time)) info.push(["mdi:timer-outline", "Tid", this._duration(time)]);
    } else {
      const last = this._lastClean();
      if (last) {
        const area = this._num(E.cleaning_area), time = this._num(E.cleaning_time);
        const extra = [Number.isFinite(area) ? `${Math.round(area)} m²` : "", Number.isFinite(time) ? this._duration(time) : ""].filter(Boolean).join(" · ");
        info.push(["mdi:history", "Seneste rengøring", last, extra]);
      }
    }
    if (room && room !== "unknown" && room !== "unavailable") info.push(["mdi:map-marker-radius-outline", "Robotten er i", room]);

    const primary = active
      ? `<button class="primary" data-a="pause" ${offline ? "disabled" : ""}><ha-icon icon="mdi:pause"></ha-icon><span>Pause</span></button>`
      : paused
        ? `<button class="primary" data-a="resume" ${offline ? "disabled" : ""}><ha-icon icon="mdi:play"></ha-icon><span>Fortsæt</span></button>`
        : `<button class="primary" data-a="clean" ${!n || offline || !canSegments ? "disabled" : ""}><ha-icon icon="mdi:play"></ha-icon><span>${n ? `Rengør ${n} rum${this._repeat > 1 ? ` · ${this._repeat}×` : ""}` : "Vælg rum på kortet"}</span></button>`;

    const act = (a, icon, label, enabled, v) => `<button class="act" data-a="${a}" ${v ? `data-v="${esc(v)}"` : ""} ${enabled ? "" : "disabled"}><ha-icon icon="${icon}"></ha-icon><span>${label}</span></button>`;
    const actions = [
      this._supports(FEATURE.START) && act("all", "mdi:home-outline", "Hele hjemmet", !offline && !active && !paused),
      this._supports(FEATURE.PAUSE) && (paused ? act("resume", "mdi:play", "Fortsæt", !offline) : act("pause", "mdi:pause", "Pause", !offline && active)),
      this._supports(FEATURE.STOP) && act("stop", "mdi:stop", "Stop", !offline && (active || paused || key === "returning_home")),
      this._supports(FEATURE.RETURN_HOME) && act("home", "mdi:home-import-outline", "Send hjem", !offline && !docked),
      E.empty_dust && act("empty", "mdi:delete-empty-outline", emptying ? "Tømmer …" : "Tøm støv", !offline && docked && !emptying),
      this._supports(FEATURE.LOCATE) && act("locate", "mdi:map-marker-question-outline", "Find", !offline),
    ].filter(Boolean);

    const routines = (E.routines || []).map((id) => {
      const st = this._state(id);
      if (!st) return "";
      let name = st.attributes.friendly_name || id;
      const dn = vac?.attributes?.friendly_name || this._deviceName;
      if (dn && name.startsWith(dn)) name = name.slice(dn.length).trim();
      return `<button class="chip" data-a="routine" data-v="${esc(id)}" ${offline || active ? "disabled" : ""}><ha-icon icon="mdi:playlist-play"></ha-icon>${esc(name)}</button>`;
    }).join("");

    panel.innerHTML = `
      <header class="head">
        <div class="id">
          <span class="bot ${dot}"><ha-icon icon="mdi:robot-vacuum"></ha-icon></span>
          <div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div>
        </div>
        ${Number.isFinite(battery) ? `<div class="batt ${battery < 20 ? "low" : ""}" title="Batteri"><ha-icon icon="${this._s(E.battery) && docked ? "mdi:battery-charging" : "mdi:battery"}"></ha-icon><b>${Math.round(battery)} %</b></div>` : ""}
      </header>
      <div class="status"><i class="dot ${dot}"></i><b>${esc(STATUS_LABELS[key] || human(key))}</b>${detail ? `<span>${esc(detail)}</span>` : ""}</div>
      ${alerts.map(([k, icon, t, s]) => `<div class="alert ${k}"><ha-icon icon="${icon}"></ha-icon><div><b>${esc(t)}</b>${s ? `<span>${esc(s)}</span>` : ""}</div></div>`).join("")}
      ${info.length ? `<div class="info">${info.map(([icon, l, v, x]) => `<div><ha-icon icon="${icon}"></ha-icon><span>${esc(l)}</span><b>${esc(v)}</b>${x ? `<small>${esc(x)}</small>` : ""}</div>`).join("")}</div>` : ""}

      <section class="box">
        <div class="box-head"><h3>Valgte rum (${n})</h3>${n ? `<button class="link" data-a="clear">Ryd valg</button>` : ""}</div>
        ${n ? `<ol class="order">${selRooms.map((r, i) => `<li>
            <span class="num">${i + 1}</span><span class="rn">${esc(r.name)}</span>
            <button class="ic" data-a="up" data-v="${r.id}" ${i === 0 ? "disabled" : ""} aria-label="Flyt ${esc(r.name)} op"><ha-icon icon="mdi:chevron-up"></ha-icon></button>
            <button class="ic" data-a="down" data-v="${r.id}" ${i === n - 1 ? "disabled" : ""} aria-label="Flyt ${esc(r.name)} ned"><ha-icon icon="mdi:chevron-down"></ha-icon></button>
            <button class="ic" data-a="toggle" data-v="${r.id}" aria-label="Fravælg ${esc(r.name)}"><ha-icon icon="mdi:close"></ha-icon></button>
          </li>`).join("")}</ol>`
          : `<p class="empty">Tryk på rummene på kortet – eller herunder – i den rækkefølge, de skal rengøres.</p>`}
        ${rest.length ? `<div class="chips">${rest.map((r) => `<button class="chip add" data-a="toggle" data-v="${r.id}"><ha-icon icon="mdi:plus"></ha-icon>${esc(r.name)}</button>`).join("")}</div>` : ""}
      </section>

      <section class="box">
        <h3>Rengøringsindstillinger</h3>
        <div class="set-grid">
          ${canSegments ? `<div class="set"><label>Gentag</label>${this._seg("repeat", Array.from({ length: clamp(Number(this._config.max_repeat) || 3, 1, 3) }, (_, i) => String(i + 1)), String(this._repeat), { 1: ["1×"], 2: ["2×"], 3: ["3×"] }, false)}</div>` : ""}
          ${fanList.length && this._supports(FEATURE.FAN_SPEED) ? `<div class="set wide"><label>Sugeevne</label>${this._seg("fan", fanList, vac?.attributes?.fan_speed, FAN, offline)}</div>` : ""}
          ${waterList.length ? `<div class="set wide"><label>Vandmængde <small>robottens moppebeholder · fyldes manuelt</small></label>${this._seg("water", waterList, waterState.state, WATER, offline || waterBoxOff)}
            ${waterBoxOff ? `<p class="note">Moppebeholderen er ikke monteret på robotten.</p>` : mopOff && waterOn ? `<p class="note">Moppemodulet er ikke monteret – robotten støvsuger kun.</p>` : ""}</div>` : ""}
          ${emptyList.length ? `<div class="set wide"><label>Auto-tømning i dock</label>${this._seg("empty-mode", emptyList, emptyState.state, Object.fromEntries(Object.entries(EMPTY_MODE).map(([k, v]) => [k, [v]])), offline)}</div>` : ""}
        </div>
        ${primary}
        ${!canSegments ? `<p class="note">Robotten understøtter ikke rumrengøring via send_command.</p>` : ""}
        ${this._flash ? `<div class="toast ${this._flash.kind}" role="status">${esc(this._flash.text)}</div>` : ""}
      </section>`;
    this.shadowRoot.querySelector(".acts").innerHTML = `
      <div class="actions">${actions.join("")}</div>
      ${routines ? `<div class="routines"><h3>Rutiner fra Roborock-appen</h3><div class="chips">${routines}</div></div>` : ""}`;
  }

  _css() {
    return `
      :host{display:block;--rr-accent:var(--dashboard-accent,var(--primary-color,#35c6c0));--rr-good:var(--dashboard-success,var(--success-color,#3ad29f));--rr-warn:var(--dashboard-warning,var(--warning-color,#ffb547));--rr-bad:var(--dashboard-danger,var(--error-color,#ff5a6e));--rr-edge:var(--dashboard-border-neutral,var(--divider-color,rgba(255,255,255,.12)));--rr-soft:color-mix(in srgb,var(--primary-text-color) 5%,transparent);--rr-btn:var(--dashboard-button-neutral-bg,color-mix(in srgb,var(--primary-text-color) 6%,transparent));color:var(--primary-text-color)}
      *{box-sizing:border-box}
      ha-card{container-type:inline-size;overflow:hidden;padding:12px;border-radius:var(--ha-card-border-radius,22px)}
      button{font:inherit;color:inherit;-webkit-tap-highlight-color:transparent}
      .probe{position:absolute;width:0;height:0;overflow:hidden}
      .grid{display:grid;gap:12px;grid-template-columns:1fr;grid-template-areas:"map" "panel" "acts"}
      .map-col{grid-area:map}.panel{grid-area:panel}.acts{grid-area:acts;display:flex;flex-direction:column;gap:10px;min-width:0}
      @container (min-width:820px){.grid{grid-template-columns:minmax(0,1.55fr) minmax(330px,1fr);grid-template-rows:auto 1fr;grid-template-areas:"map panel" "acts panel";align-items:start}}
      .map-col{min-width:0;display:flex;flex-direction:column;gap:8px}
      .viewport{--ar:1.2;position:relative;width:min(100%,calc(76vh * var(--ar)));margin-inline:auto;aspect-ratio:var(--ar);overflow:hidden;border-radius:18px;border:1px solid var(--rr-edge);background:radial-gradient(circle at 30% 20%,color-mix(in srgb,var(--rr-accent) 6%,transparent),transparent 60%),color-mix(in srgb,var(--primary-text-color) 3%,rgba(0,0,0,.18));touch-action:pan-y;user-select:none;-webkit-user-select:none}
      .viewport.zoomed{cursor:grab}
      .stage{position:absolute;inset:0;transform-origin:0 0;--inv:1}
      canvas.floor{position:absolute;inset:0;width:100%;height:100%;display:block}
      .labels,.markers{position:absolute;inset:0;pointer-events:none}
      .lbl{position:absolute;display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px;border:0;background:none;cursor:pointer;pointer-events:auto;transform:translate(-50%,-50%) scale(var(--inv));min-width:44px;min-height:44px}
      .lbl .badge{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;border:2px solid color-mix(in srgb,var(--primary-text-color) 75%,transparent);background:color-mix(in srgb,var(--card-background-color,#111) 55%,transparent);backdrop-filter:blur(4px);box-shadow:0 4px 12px rgba(0,0,0,.35);transition:transform .15s ease,background .15s ease}
      .lbl .badge ha-icon{--mdc-icon-size:20px}
      .lbl .badge b{font-size:16px;font-weight:800}
      .lbl .name{font-size:13px;font-weight:750;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,.85),0 0 8px rgba(0,0,0,.6);color:#fff}
      .lbl.on .badge{background:var(--rr-accent);border-color:color-mix(in srgb,var(--rr-accent) 60%,white);color:var(--text-primary-color,#fff);box-shadow:0 0 0 4px color-mix(in srgb,var(--rr-accent) 30%,transparent),0 6px 16px rgba(0,0,0,.35)}
      .lbl:hover .badge{transform:scale(1.08)}
      .lbl:focus-visible{outline:2px solid var(--rr-accent);outline-offset:2px;border-radius:12px}
      .lbl.small .name{font-size:11px}
      .lbl.compact .name{display:none}
      .lbl.small .badge{width:28px;height:28px}
      .robot{position:absolute;display:grid;place-items:center;width:30px;height:30px;transform:translate(-50%,-50%) scale(var(--inv));border-radius:50%;background:var(--card-background-color,#111);color:var(--rr-accent);border:2px solid var(--rr-accent);box-shadow:0 2px 8px rgba(0,0,0,.45);transition-property:left,top;transition-timing-function:linear;z-index:1}
      .robot ha-icon{--mdc-icon-size:20px}
      .robot[hidden],.dock[hidden]{display:none}
      .robot.live{animation:ping 1.6s ease-out infinite}
      @keyframes ping{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--rr-accent) 60%,transparent)}100%{box-shadow:0 0 0 16px transparent}}
      .dock{position:absolute;display:grid;place-items:center;width:28px;height:28px;transform:translate(-50%,-50%) scale(var(--inv));border-radius:9px;background:var(--card-background-color,#111);border:1px solid var(--rr-edge);color:var(--rr-accent)}
      .dock ha-icon{--mdc-icon-size:18px}
      .map-msg{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:20px;text-align:center;color:var(--secondary-text-color)}
      .map-msg[hidden]{display:none}
      .map-msg ha-icon{--mdc-icon-size:34px}
      .map-msg span{font-size:12px}
      .spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
      .map-bar{display:flex;align-items:center;justify-content:space-between;gap:8px 12px;flex-wrap:wrap}
      .map-tools{display:flex;gap:8px;margin-left:auto}
      .zoom{display:flex;align-items:center;border-radius:14px;background:color-mix(in srgb,var(--card-background-color,#111) 82%,transparent);border:1px solid var(--rr-edge);backdrop-filter:blur(6px)}
      .zoom button,.map-tools .round{display:grid;place-items:center;width:44px;height:44px;border:0;background:none;cursor:pointer}
      .map-tools .round{border-radius:14px;background:color-mix(in srgb,var(--card-background-color,#111) 82%,transparent);border:1px solid var(--rr-edge);backdrop-filter:blur(6px)}
      .zoom-pct{min-width:48px;text-align:center;font-size:12px;font-weight:700;color:var(--secondary-text-color)}
      .legend{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;padding:0 4px;color:var(--secondary-text-color);font-size:12px}
      .legend span{display:flex;align-items:center;gap:6px}
      .legend .hint{flex-basis:100%}
      .sw{width:14px;height:14px;border-radius:4px;background:linear-gradient(135deg,rgba(217,136,128,.6) 0 33%,rgba(88,214,141,.6) 33% 66%,rgba(165,105,189,.6) 66%);border:1px solid color-mix(in srgb,var(--primary-text-color) 35%,transparent)}
      .sw.on{background:color-mix(in srgb,var(--rr-accent) 55%,transparent);border-color:var(--rr-accent)}
      .panel{display:flex;flex-direction:column;gap:10px;min-width:0}
      .head{display:flex;align-items:center;justify-content:space-between;gap:10px}
      .id{display:flex;align-items:center;gap:12px;min-width:0}
      .id h2{margin:0;font-size:20px;line-height:1.2;font-weight:750;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .id p{margin:2px 0 0;color:var(--secondary-text-color);font-size:13px}
      .bot{display:grid;place-items:center;flex:0 0 48px;height:48px;border-radius:16px;color:var(--rr-accent);background:radial-gradient(circle at 35% 25%,color-mix(in srgb,var(--rr-accent) 30%,transparent),color-mix(in srgb,var(--rr-accent) 8%,transparent) 70%);border:1px solid color-mix(in srgb,var(--rr-accent) 35%,transparent)}
      .bot ha-icon{--mdc-icon-size:28px}
      .bot.bad{color:var(--rr-bad);border-color:color-mix(in srgb,var(--rr-bad) 45%,transparent)}
      .batt{display:flex;align-items:center;gap:6px;padding:8px 12px;border-radius:12px;background:var(--rr-soft);border:1px solid var(--rr-edge);white-space:nowrap}
      .batt ha-icon{color:var(--rr-good);--mdc-icon-size:20px}
      .batt.low ha-icon{color:var(--rr-bad)}
      .status{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;font-size:14px}
      .status span{color:var(--secondary-text-color)}
      .dot{width:10px;height:10px;border-radius:50%;background:var(--rr-good);box-shadow:0 0 8px var(--rr-good)}
      .dot.live{background:var(--rr-accent);box-shadow:0 0 10px var(--rr-accent);animation:blink 1.4s ease-in-out infinite}
      .dot.warn{background:var(--rr-warn);box-shadow:0 0 8px var(--rr-warn)}
      .dot.bad{background:var(--rr-bad);box-shadow:0 0 8px var(--rr-bad)}
      @keyframes blink{50%{opacity:.4}}
      .alert{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:14px;border:1px solid;font-size:13px}
      .alert div{display:flex;flex-direction:column;gap:2px}
      .alert span{color:var(--secondary-text-color);font-size:12px}
      .alert.bad{border-color:color-mix(in srgb,var(--rr-bad) 45%,transparent);background:color-mix(in srgb,var(--rr-bad) 10%,transparent)}
      .alert.bad ha-icon{color:var(--rr-bad)}
      .alert.warn{border-color:color-mix(in srgb,var(--rr-warn) 45%,transparent);background:color-mix(in srgb,var(--rr-warn) 10%,transparent)}
      .alert.warn ha-icon{color:var(--rr-warn)}
      .alert.info{border-color:var(--rr-edge);background:var(--rr-soft)}
      .info{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}
      .info>div{display:grid;grid-template-columns:auto 1fr;column-gap:8px;align-items:center;padding:10px 12px;border-radius:14px;background:var(--rr-soft);border:1px solid var(--rr-edge)}
      .info ha-icon{grid-row:span 3;color:var(--rr-accent);--mdc-icon-size:20px}
      .info span{font-size:11px;color:var(--secondary-text-color)}
      .info b{font-size:14px}
      .info small{font-size:11px;color:var(--secondary-text-color)}
      .box{display:flex;flex-direction:column;gap:10px;padding:14px;border-radius:18px;border:1px solid var(--rr-edge);background:var(--rr-soft)}
      .box-head{display:flex;align-items:center;justify-content:space-between}
      h3{margin:0;font-size:15px;font-weight:700}
      .link{border:0;background:none;color:var(--rr-accent);font-weight:600;cursor:pointer;min-height:44px;padding:0 4px}
      .order{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
      .order li{display:flex;align-items:center;gap:6px;padding:4px 4px 4px 6px;border-radius:14px;border:1px solid color-mix(in srgb,var(--rr-accent) 55%,transparent);background:color-mix(in srgb,var(--rr-accent) 12%,transparent)}
      .num{display:grid;place-items:center;flex:0 0 32px;height:32px;border-radius:50%;border:2px solid var(--rr-accent);font-weight:800}
      .rn{flex:1;min-width:0;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .ic{display:grid;place-items:center;width:44px;height:44px;border:0;border-radius:12px;background:none;cursor:pointer;color:var(--secondary-text-color)}
      .ic:hover:not(:disabled){background:var(--rr-soft);color:var(--primary-text-color)}
      .ic:disabled{opacity:.3;cursor:default}
      .empty{margin:0;color:var(--secondary-text-color);font-size:13px}
      .chips{display:flex;flex-wrap:wrap;gap:6px}
      .chip{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 12px;border-radius:999px;border:1px solid var(--rr-edge);background:var(--rr-btn);cursor:pointer;font-size:13px;font-weight:600}
      .chip ha-icon{--mdc-icon-size:18px;color:var(--rr-accent)}
      .chip:hover:not(:disabled){border-color:var(--rr-accent)}
      .chip:disabled{opacity:.45;cursor:default}
      .set-grid{display:grid;gap:12px;grid-template-columns:1fr}
      .set label{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px;margin-bottom:6px;font-size:12px;font-weight:600;color:var(--secondary-text-color)}
      .set label small{font-weight:500;opacity:.85}
      .seg{display:flex;gap:4px;padding:4px;border-radius:14px;background:color-mix(in srgb,var(--primary-text-color) 4%,transparent);border:1px solid var(--rr-edge)}
      .seg button{flex:1 1 0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:0;min-height:48px;padding:4px 2px;border:0;border-radius:11px;background:none;cursor:pointer;font-size:12px;font-weight:600;color:var(--secondary-text-color)}
      .seg button span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .seg button ha-icon{--mdc-icon-size:18px}
      .seg button.on{background:var(--rr-accent);color:var(--text-primary-color,#fff);box-shadow:0 4px 14px color-mix(in srgb,var(--rr-accent) 35%,transparent)}
      .seg button:disabled{opacity:.45;cursor:default}
      .note{margin:6px 0 0;font-size:12px;color:var(--secondary-text-color)}
      .primary{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:56px;border:0;border-radius:16px;background:var(--rr-accent);color:var(--text-primary-color,#fff);font-size:17px;font-weight:750;cursor:pointer;box-shadow:0 8px 22px color-mix(in srgb,var(--rr-accent) 35%,transparent);transition:transform .12s ease,filter .12s ease}
      .primary ha-icon{--mdc-icon-size:24px}
      .primary:hover:not(:disabled){filter:brightness(1.07)}
      .primary:active:not(:disabled){transform:scale(.985)}
      .primary:disabled{background:color-mix(in srgb,var(--primary-text-color) 10%,transparent);color:var(--secondary-text-color);box-shadow:none;cursor:default}
      .actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(86px,1fr));gap:8px}
      .act{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:68px;padding:8px 4px;border-radius:16px;border:1px solid var(--rr-edge);background:var(--rr-btn);cursor:pointer;font-size:12px;font-weight:600}
      .act ha-icon{--mdc-icon-size:24px}
      .act:hover:not(:disabled){border-color:var(--rr-accent)}
      .act:disabled{opacity:.4;cursor:default}
      .routines{display:flex;flex-direction:column;gap:8px}
      .routines h3{font-size:13px;color:var(--secondary-text-color);font-weight:600}
      .toast{padding:10px 12px;border-radius:12px;font-size:13px;background:color-mix(in srgb,var(--rr-good) 14%,transparent);border:1px solid color-mix(in srgb,var(--rr-good) 40%,transparent)}
      .toast.error{background:color-mix(in srgb,var(--rr-bad) 14%,transparent);border-color:color-mix(in srgb,var(--rr-bad) 45%,transparent)}
      .more{margin-top:12px;border-radius:16px;border:1px solid var(--rr-edge);background:var(--rr-soft)}
      .more summary{display:flex;align-items:center;gap:10px;min-height:52px;padding:0 14px;cursor:pointer;font-weight:650;list-style:none}
      .more summary::-webkit-details-marker{display:none}
      .more summary .chev{margin-left:auto;transition:transform .2s ease}
      .more[open] summary .chev{transform:rotate(180deg)}
      .more-body{padding:0 8px 8px}
      @container (min-width:560px){.set-grid{grid-template-columns:auto 1fr}.set.wide{grid-column:1/-1}}
      @container (min-width:820px){.set-grid{grid-template-columns:1fr}}
      @container (max-width:520px){
        ha-card{padding:8px}
        .lbl .badge{width:26px;height:26px}.lbl .badge b{font-size:13px}.lbl .badge ha-icon{--mdc-icon-size:16px}
        .lbl .name{font-size:10px}
        
        .actions{grid-template-columns:repeat(3,1fr)}
        .id h2{font-size:18px}
      }
      @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
    `;
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, HARoborockRoomMapCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === TAG)) {
  window.customCards.push({ type: TAG, name: "HA Roborock Room Map Card", description: "Vælg rum direkte på Roborock-kortet og rengør dem i valgt rækkefølge", preview: false });
}
console.info(`%c HA ROBOROCK ROOM MAP %c v${VERSION} `, "color:white;background:#138a86;font-weight:700", "color:#5fe3dc;background:#111827");
