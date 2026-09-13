const VERSION = "0.4.0";

const HISTORY_REFRESH_MS = 5 * 60 * 1000;
const TICK_MS = 30 * 1000;
const LONG_OPEN_MS = 30 * 60 * 1000;
const HISTORY_LOOKBACK_DAYS = 10;

class HADoorWindowCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._sig = "";
    this._history = {};
    this._historyDay = "";
    this._fetching = false;
  }

  static getStubConfig() {
    return {
      title: "Døre og vinduer",
      subtitle: "Alle åbninger, altid synlige",
      items: [
        { name: "Garagen", entity: "binary_sensor.garagedor_contact", type: "door", battery_entity: "sensor.garagedor_battery" },
        { name: "Kontor", entity: "binary_sensor.kontor_vindue", type: "window" },
      ],
    };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.items)) throw new Error("Kortet kræver en items-liste");
    this._config = { title: "Døre og vinduer", subtitle: "Alle åbninger, altid synlige", long_open_minutes: 30, ...config };
    this._render();
  }

  connectedCallback() {
    this._fetchHistory();
    if (!this._historyTimer) this._historyTimer = setInterval(() => this._fetchHistory(), HISTORY_REFRESH_MS);
    if (!this._tickTimer) this._tickTimer = setInterval(() => this._tick(), TICK_MS);
  }
  disconnectedCallback() {
    clearInterval(this._historyTimer);
    clearInterval(this._tickTimer);
    this._historyTimer = undefined;
    this._tickTimer = undefined;
  }

  _tick() {
    const anyOpen = (this._config.items || []).some((item) => this._s(item.entity)?.state === "on");
    if (anyOpen) this._render();
  }

  _watchedIds() {
    const c = this._config;
    return (c.items || []).flatMap((item) => [item.entity, item.battery_entity]).filter(Boolean);
  }

  set hass(hass) {
    this._hass = hass;
    const ids = this._watchedIds();
    const sig = JSON.stringify(ids.map((id) => [id, hass?.states?.[id]?.state, hass?.states?.[id]?.last_changed]));
    if (sig !== this._sig) {
      this._sig = sig;
      this._render();
    }
    const today = new Date().toDateString();
    if (today !== this._historyDay) this._fetchHistory();
  }

  async _fetchHistory() {
    const ids = (this._config.items || []).map((item) => item.entity).filter(Boolean);
    if (!ids.length || !this._hass?.callApi || this._fetching) return;
    this._fetching = true;
    const today = new Date().toDateString();
    try {
      // Looks back several days (not just "since midnight") so the true start of an
      // in-progress open period can be recovered from recorder history after an HA
      // restart, when the entity's own last_changed resets to the restart time.
      const start = new Date(Date.now() - HISTORY_LOOKBACK_DAYS * 86400000);
      const path = `history/period/${encodeURIComponent(start.toISOString())}?filter_entity_id=${encodeURIComponent(ids.join(","))}&minimal_response&no_attributes`;
      const result = await this._hass.callApi("GET", path);
      const history = {};
      // Match series to entities by position, not by an `entity_id` field on each row: in
      // minimal_response mode (used here to keep the payload small for many entities) rows
      // generally don't carry entity_id at all, so searching for it silently produced an
      // always-empty history. The history/period endpoint guarantees the outer array's order
      // matches the filter_entity_id list we requested.
      if (Array.isArray(result)) {
        result.forEach((series, index) => {
          const id = ids[index];
          if (id && Array.isArray(series)) history[id] = series;
        });
      }
      this._history = history;
      this._historyDay = today;
      this._render();
    } catch (error) {
      console.warn("HA Door/Window Card: history could not be loaded", error);
    } finally {
      this._fetching = false;
    }
  }

  _s(id) {
    return id ? this._hass?.states?.[id] : undefined;
  }
  _esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  _num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  _more(id) {
    if (!id) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: id }, bubbles: true, composed: true }));
  }
  _fmtDuration(ms) {
    if (!Number.isFinite(ms) || ms < 0) return "—";
    const totalMin = Math.round(ms / 60000);
    if (totalMin < 1) return "< 1 min";
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h <= 0) return `${m} min`;
    if (m === 0) return `${h} t`;
    return `${h} t ${m} min`;
  }
  _fmtClock(ts) {
    if (!Number.isFinite(ts)) return "—";
    return new Date(ts).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
  }

  _statsFor(item) {
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();
    const series = this._history[item.entity] || [];
    const live = this._s(item.entity);
    const isOpen = live?.state === "on";

    // "Opened since" must survive HA Core restarts, so live.last_changed (which resets on
    // every restart, even without a real state change) is only used as a last resort.
    // Priority 1: the integration's own last_tripped_time attribute, when present — this is
    // reported by the device/integration itself (not HA's state machine), so it is generally
    // unaffected by HA restarts and is the most trustworthy source when available.
    // Priority 2: the recorder history's last state-change row, but only when the fetched
    // window actually contains the transition into "on" (a preceding row with a different
    // state) — if the whole lookback window was already "on", that row's timestamp is just
    // an artifact of where the query happened to start, not a real event.
    // Priority 3: live.last_changed, which may read as "just now" right after a restart.
    let openSinceTs;
    const trippedRaw = live?.attributes?.last_tripped_time;
    if (trippedRaw) {
      const t = new Date(trippedRaw).getTime();
      if (Number.isFinite(t) && t <= now) openSinceTs = t;
    }
    if (openSinceTs === undefined) {
      const lastIdx = series.length - 1;
      if (lastIdx >= 0 && series[lastIdx].state === "on" && lastIdx > 0) {
        const t = new Date(series[lastIdx].last_changed || series[lastIdx].last_updated).getTime();
        if (Number.isFinite(t)) openSinceTs = t;
      }
    }
    if (openSinceTs === undefined && live?.last_changed) {
      const t = new Date(live.last_changed).getTime();
      if (Number.isFinite(t)) openSinceTs = t;
    }

    // Today-only counters: walk the (multi-day) series but clamp to todayStartMs, so history
    // from earlier days only establishes whether the sensor was already open going into today.
    let openCount = 0;
    let lastOpenedTs;
    let totalOpenMs = 0;
    let prevState;
    let prevTime = todayStartMs;
    series.forEach((row) => {
      const time = new Date(row.last_changed || row.last_updated).getTime();
      if (!Number.isFinite(time)) return;
      if (time < todayStartMs) {
        prevState = row.state;
        prevTime = todayStartMs;
        return;
      }
      if (prevState === "on") totalOpenMs += Math.max(0, time - prevTime);
      if (row.state === "on" && prevState !== "on") {
        lastOpenedTs = time;
        openCount += 1;
      }
      prevState = row.state;
      prevTime = time;
    });
    if (isOpen) {
      totalOpenMs += Math.max(0, now - prevTime);
      if (lastOpenedTs === undefined && Number.isFinite(openSinceTs) && openSinceTs >= todayStartMs) lastOpenedTs = openSinceTs;
    }

    const openSinceMs = isOpen && Number.isFinite(openSinceTs) ? now - openSinceTs : undefined;
    return { isOpen, openCount, lastOpenedTs, totalOpenMs, openSinceMs, hasHistory: series.length > 0 };
  }

  _iconFor(item, isOpen) {
    if (isOpen && item.icon_open) return item.icon_open;
    if (!isOpen && item.icon_closed) return item.icon_closed;
    const defaults = {
      door: ["mdi:door-closed", "mdi:door-open"],
      sliding: ["mdi:door-sliding", "mdi:door-sliding-open"],
      garage: ["mdi:garage-variant", "mdi:garage-open-variant"],
      lock: ["mdi:lock", "mdi:lock-open-variant"],
      window: ["mdi:window-closed-variant", "mdi:window-open-variant"],
    };
    const pair = defaults[item.icon_set || item.type] || defaults.window;
    return isOpen ? pair[1] : pair[0];
  }

  _tile(item) {
    const stats = this._statsFor(item);
    const icon = this._iconFor(item, stats.isOpen);
    const longThreshold = (this._config.long_open_minutes ?? 30) * 60000;
    const isLongOpen = stats.isOpen && Number.isFinite(stats.openSinceMs) && stats.openSinceMs >= longThreshold;
    const battery = this._num(this._s(item.battery_entity)?.state);
    const batteryChip =
      Number.isFinite(battery)
        ? `<span class="chip"><ha-icon icon="${battery <= 20 ? "mdi:battery-alert-variant-outline" : "mdi:battery"}"></ha-icon>${battery}%</span>`
        : "";
    return `<div class="tile ${stats.isOpen ? "open" : "closed"} ${isLongOpen ? "long-open" : ""}" data-more="${this._esc(item.entity)}">
      <div class="tile-top">
        <div class="tile-icon"><ha-icon icon="${icon}"></ha-icon></div>
        <div class="tile-name">
          <b>${this._esc(item.name)}</b>
          <span class="state-pill">${stats.isOpen ? "Åben" : "Lukket"}</span>
        </div>
      </div>
      <div class="tile-stats">
        <div class="stat"><span>Åbnet i dag</span><b>${stats.openCount}&times;</b></div>
        <div class="stat"><span>Sidste åbning</span><b>${stats.lastOpenedTs ? this._fmtClock(stats.lastOpenedTs) : "Ingen"}</b></div>
        <div class="stat"><span>${stats.isOpen ? "Åben i" : "Åben i alt i dag"}</span><b>${stats.isOpen ? this._fmtDuration(stats.openSinceMs) : this._fmtDuration(stats.totalOpenMs)}</b></div>
      </div>
      ${batteryChip ? `<div class="tile-foot">${batteryChip}</div>` : ""}
    </div>`;
  }

  _section(title, icon, items) {
    if (!items.length) return "";
    const sorted = [...items].sort((a, b) => {
      const sa = this._statsFor(a);
      const sb = this._statsFor(b);
      if (sa.isOpen !== sb.isOpen) return sa.isOpen ? -1 : 1;
      if (sa.isOpen && sb.isOpen) return (sb.openSinceMs ?? 0) - (sa.openSinceMs ?? 0);
      return (sb.lastOpenedTs ?? 0) - (sa.lastOpenedTs ?? 0);
    });
    return `<div class="section-heading"><ha-icon icon="${icon}"></ha-icon><span>${this._esc(title)}</span></div>
      <div class="grid">${sorted.map((item) => this._tile(item)).join("")}</div>`;
  }

  _render() {
    if (!this.shadowRoot) return;
    const c = this._config;
    const items = c.items || [];
    const doors = items.filter((i) => i.type !== "window");
    const windows = items.filter((i) => i.type === "window");
    const allStats = items.map((item) => this._statsFor(item));
    const openNow = allStats.filter((s) => s.isOpen).length;
    const totalOpensToday = allStats.reduce((sum, s) => sum + s.openCount, 0);
    const longestOpenMs = allStats.reduce((max, s) => (s.isOpen && Number.isFinite(s.openSinceMs) ? Math.max(max, s.openSinceMs) : max), 0);

    this.shadowRoot.innerHTML = `<style>
      :host{display:block;--good:var(--dashboard-success, var(--success-color, #20e3a2));--warn:var(--dashboard-warning, var(--warning-color, #f59e0b));--danger:var(--dashboard-danger, var(--error-color, #ef4444));--accent:var(--dashboard-accent, var(--info-color, #38bdf8));--edge:var(--dashboard-border-neutral, var(--divider-color, rgba(127,145,165,.2)));--muted:var(--dashboard-icon-muted, var(--disabled-text-color, #64748b))}
      *{box-sizing:border-box}
      ha-card{padding:16px;border-radius:22px;background:var(--ha-card-background,var(--card-background-color));border:var(--ha-card-border-width,1px) solid var(--ha-card-border-color,var(--edge));color:var(--primary-text-color);box-shadow:var(--ha-card-box-shadow)}
      .head{display:flex;align-items:center;gap:12px;margin-bottom:18px}
      .head ha-icon{--mdc-icon-size:26px;color:var(--accent)}
      .head strong{display:block;font-size:16px}
      .head span{display:block;color:var(--secondary-text-color);font-size:12px;margin-top:2px}
      .summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:22px}
      .summary .stat{padding:12px 14px;border:1px solid color-mix(in srgb,var(--accent) 16%,transparent);border-left:3px solid var(--accent);border-radius:14px;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 6%,transparent),transparent 60%),var(--ha-card-background,var(--card-background-color));box-shadow:0 4px 14px rgba(0,0,0,.1);text-align:center}
      .summary .stat.warn{border-left-color:var(--warn)}
      .summary .stat span{display:block;font-size:10px;color:var(--secondary-text-color);text-transform:uppercase;font-weight:800;letter-spacing:.04em}
      .summary .stat b{display:block;margin-top:5px;font-size:19px;font-weight:800}
      .summary .stat.warn b{color:var(--warn)}
      .section-heading{display:flex;align-items:center;gap:8px;margin:22px 0 12px;color:var(--secondary-text-color);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}
      .section-heading:first-of-type{margin-top:0}
      .section-heading ha-icon{--mdc-icon-size:16px;color:var(--accent)}
      .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px}
      .tile{position:relative;padding:14px;border:1px solid color-mix(in srgb,var(--accent) 16%,transparent);border-left:4px solid var(--accent);border-radius:16px;cursor:pointer;overflow:hidden;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 7%,transparent),transparent 55%),var(--ha-card-background,var(--card-background-color));box-shadow:0 6px 18px rgba(0,0,0,.12);transition:border-color .25s ease,background .25s ease,box-shadow .25s ease}
      .tile.open{border-color:color-mix(in srgb,var(--warn) 35%,transparent);border-left-color:var(--warn);background:linear-gradient(145deg,color-mix(in srgb,var(--warn) 13%,transparent),transparent 55%),var(--ha-card-background,var(--card-background-color))}
      .tile.long-open{border-left-color:var(--danger);animation:long-open-pulse 2.4s ease-in-out infinite}
      @keyframes long-open-pulse{0%,100%{box-shadow:0 6px 18px rgba(0,0,0,.12),0 0 0 0 color-mix(in srgb,var(--danger) 0%,transparent)}50%{box-shadow:0 6px 18px rgba(0,0,0,.12),0 0 0 4px color-mix(in srgb,var(--danger) 25%,transparent)}}
      .tile-top{display:flex;align-items:center;gap:10px}
      .tile-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:color-mix(in srgb,var(--muted) 14%,transparent);color:var(--muted);flex:0 0 auto}
      .tile.open .tile-icon{background:color-mix(in srgb,var(--warn) 18%,transparent);color:var(--warn);animation:door-wobble 2.6s ease-in-out infinite}
      .tile-icon ha-icon{--mdc-icon-size:20px}
      @keyframes door-wobble{0%,100%{transform:rotate(0deg)}25%{transform:rotate(-7deg)}75%{transform:rotate(4deg)}}
      .tile-name{min-width:0;display:flex;flex-direction:column;gap:3px}
      .tile-name b{font-size:13px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .state-pill{align-self:flex-start;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;background:color-mix(in srgb,var(--good) 16%,transparent);color:var(--good)}
      .tile.open .state-pill{background:color-mix(in srgb,var(--warn) 18%,transparent);color:var(--warn)}
      .tile-stats{display:flex;flex-direction:column;gap:6px;margin-top:12px;padding-top:10px;border-top:1px solid var(--edge)}
      .stat{display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--secondary-text-color)}
      .stat b{color:var(--primary-text-color);font-weight:800;font-size:12px}
      .tile-foot{display:flex;justify-content:flex-end;margin-top:8px}
      .chip{display:inline-flex;align-items:center;gap:4px;font-size:10px;color:var(--secondary-text-color);font-weight:700}
      .chip ha-icon{--mdc-icon-size:13px}
      @media(max-width:560px){.summary{grid-template-columns:1fr 1fr}.summary .stat:last-child{grid-column:1 / -1}.grid{grid-template-columns:repeat(2,1fr)}}
    </style>
    <ha-card>
      <div class="head">
        <ha-icon icon="mdi:door-open"></ha-icon>
        <div><strong>${this._esc(c.title)}</strong><span>${this._esc(c.subtitle)}</span></div>
      </div>
      <div class="summary">
        <div class="stat ${openNow ? "warn" : ""}"><span>Åbne nu</span><b>${openNow} / ${items.length}</b></div>
        <div class="stat"><span>Åbninger i dag</span><b>${totalOpensToday}</b></div>
        <div class="stat ${longestOpenMs >= (c.long_open_minutes ?? 30) * 60000 ? "warn" : ""}"><span>Længst åben nu</span><b>${longestOpenMs ? this._fmtDuration(longestOpenMs) : "—"}</b></div>
      </div>
      ${this._section("Døre", "mdi:door", doors)}
      ${this._section("Vinduer", "mdi:window-open-variant", windows)}
    </ha-card>`;

    this.shadowRoot.querySelectorAll("[data-more]").forEach((el) => el.addEventListener("click", () => this._more(el.dataset.more)));
  }

  getCardSize() {
    return 26;
  }
}

if (!customElements.get("ha-door-window-card")) customElements.define("ha-door-window-card", HADoorWindowCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha-door-window-card",
  name: "HA Door/Window Card",
  description: "Alle døre og vinduer altid synlige, med status, åbningstæller, sidste åbning og åben-varighed",
  preview: true,
});
console.info(
  `%c HA DOOR/WINDOW CARD %c v${VERSION} `,
  "color:#fff;background:#f59e0b;font-weight:700",
  "color:#f59e0b;background:#161b22",
);
