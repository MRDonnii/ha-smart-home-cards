/*
 * Statistik-store oven på recorder/statistics_during_period.
 *
 *  - Batching:  kald i samme tick med samme periode/tidsrum samles i ét WebSocket-request.
 *  - Dedupe:    et id der allerede er på vej hentes ikke igen.
 *  - Cache:     afsluttede tidsrum caches for altid (i sessionen); tidsrum der rækker ind i
 *               "nu" udløber kort efter næste hele time, når HA har kompileret timestatistikken.
 *  - Fejl:      et fejlet request caches ikke, men giver tom række — kortet viser "Ingen data".
 */

import { HOUR_MS, MINUTE_MS, statTime } from "./format.js";

/** HA kompilerer timestatistik lidt efter hel time; vent 3 min før cachen for "nu" fornyes. */
const COMPILE_GRACE_MS = 3 * MINUTE_MS;
const UNITS = { energy: "kWh", volume: "m³" };

function openExpiry(now) {
  const hourStart = Math.floor(now / HOUR_MS) * HOUR_MS;
  const thisHour = hourStart + COMPILE_GRACE_MS;
  return now < thisHour ? thisHour : thisHour + HOUR_MS;
}

export class StatsStore {
  constructor(getHass, onWarn) {
    this._getHass = getHass;
    this._warn = onWarn;
    this._cache = new Map(); // `${id}|${period}|${start}|${end}` → { rows, expires }
    this._inflight = new Map(); // samme nøgle → Promise<rows>
    this._queue = new Map(); // `${period}|${start}|${end}` → { period, start, end, ids: Map<id, {resolve}> }
    this._flushTimer = undefined;
    this.requestCount = 0;
  }

  /** Henter rækker for flere ids. Resolver til Map<id, rows[]> med { start, end, change, state }. */
  async get(ids, period, start, end) {
    const now = Date.now();
    const result = new Map();
    const waits = [];
    for (const id of new Set(ids.filter(Boolean))) {
      const key = `${id}|${period}|${start}|${end}`;
      const cached = this._cache.get(key);
      if (cached && (cached.expires === Infinity || cached.expires > now)) {
        result.set(id, cached.rows);
        continue;
      }
      let p = this._inflight.get(key);
      if (!p) {
        p = this._enqueue(id, period, start, end).finally(() => this._inflight.delete(key));
        this._inflight.set(key, p);
      }
      waits.push(p.then((rows) => result.set(id, rows)));
    }
    await Promise.all(waits);
    return result;
  }

  _enqueue(id, period, start, end) {
    return new Promise((resolve) => {
      const qk = `${period}|${start}|${end}`;
      let batch = this._queue.get(qk);
      if (!batch) {
        batch = { period, start, end, ids: new Map() };
        this._queue.set(qk, batch);
      }
      batch.ids.set(id, resolve);
      if (!this._flushTimer) this._flushTimer = setTimeout(() => this._flush(), 0);
    });
  }

  _flush() {
    this._flushTimer = undefined;
    const batches = [...this._queue.values()];
    this._queue.clear();
    for (const batch of batches) this._run(batch);
  }

  async _run({ period, start, end, ids }) {
    const hass = this._getHass();
    const idList = [...ids.keys()];
    let data;
    let ok = false;
    if (hass?.callWS) {
      try {
        this.requestCount += 1;
        data = await hass.callWS({
          type: "recorder/statistics_during_period",
          start_time: new Date(start).toISOString(),
          end_time: new Date(end).toISOString(),
          statistic_ids: idList,
          period,
          types: ["change", "state"],
          units: UNITS,
        });
        ok = true;
      } catch (err) {
        this._warn?.("stats", "Statistik kunne ikke hentes – graferne viser 'Ingen data'", err?.message || err);
      }
    }
    const now = Date.now();
    const expires = end <= now - COMPILE_GRACE_MS ? Infinity : openExpiry(now);
    for (const [id, resolve] of ids) {
      const rows = (data?.[id] || [])
        .map((r) => ({ start: statTime(r.start), end: statTime(r.end), change: r.change, state: r.state }))
        .filter((r) => Number.isFinite(r.start));
      if (ok) this._cache.set(`${id}|${period}|${start}|${end}`, { rows, expires });
      resolve(rows);
    }
  }

  clear() {
    this._cache.clear();
  }
}

/**
 * Løbende total for "nu": summen af afsluttede statistikrækker fra `from` + det live-stykke
 * der endnu ikke er kompileret (live state − sidste kompilerede state).
 * Tåler at kilden nulstilles (fx cost-sensorer efter genstart).
 */
export function liveTail(rows, live) {
  if (!Number.isFinite(live) || !rows?.length) return 0;
  const last = rows[rows.length - 1];
  if (!Number.isFinite(last.state)) return 0;
  const diff = live - last.state;
  if (diff >= 0) return diff;
  // Faldende værdi: stor nedgang = nulstilling (tæl hele live-værdien), ellers støj.
  return live < last.state * 0.5 ? live : 0;
}

export function sumSince(rows, from, live) {
  if (!rows?.length) return undefined;
  let sum = 0;
  for (const r of rows) if (r.start >= from && Number.isFinite(r.change)) sum += r.change;
  return sum + liveTail(rows, live);
}
