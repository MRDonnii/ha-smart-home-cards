import { Section } from "./base.js";
import { EnergyFlow } from "../components/flow.js";
import { HistoryPanel } from "../components/history.js";
import { escapeHtml, fmt, fmtEnergy, fmtKr, fmtPower, fmtVolume, icon, toNumber } from "../utils/format.js";

const TODAY_KEYS = [
  ["grid_energy", "energy"],
  ["grid_cost", "monetary"],
  ["heat_energy", "energy"],
  ["heat_cost", "monetary"],
  ["water_total", "volume"],
];

/** Gennemsnitlig timepris pr. bucket ud fra Strømlignings `prices`-attribut (time- eller kvarterpriser). */
export function hourlyPrices(stateObj, buckets) {
  const raw = stateObj?.attributes?.prices;
  if (!Array.isArray(raw)) return buckets.map(() => undefined);
  const entries = [];
  for (const p of raw) {
    const price = toNumber(p?.price);
    const start = Date.parse(p?.start);
    if (price !== undefined && Number.isFinite(start)) entries.push({ start, price });
  }
  return buckets.map((b) => {
    let sum = 0;
    let n = 0;
    for (const e of entries) {
      if (e.start >= b.start && e.start < b.end) {
        sum += e.price;
        n += 1;
      }
    }
    return n ? sum / n : undefined;
  });
}

export class OverviewSection extends Section {
  constructor(card) {
    super(card);
    this.panels = [
      new HistoryPanel(card, {
        key: "ov-price",
        title: "Dagspris & elforbrug",
        icon: "mdi:chart-timeline-variant",
        tone: "el",
        stat: "grid_energy",
        cost: "grid_cost",
        kind: "energy",
        periods: ["day"],
        captions: { day: "Forbrug pr. time og timepris i dag" },
        line: {
          key: "grid_price",
          label: "Timepris (kr/kWh)",
          values: (range) => hourlyPrices(card.stateObj("grid_price"), range.buckets),
          format: (v) => `${fmt(v, 2)} kr/kWh`,
        },
      }),
      new HistoryPanel(card, { key: "ov-el", title: "Elforbrug", icon: "mdi:flash", tone: "el", stat: "grid_energy", cost: "grid_cost", kind: "energy", periods: ["day", "week", "month", "year"], period: "week" }),
      new HistoryPanel(card, { key: "ov-heat", title: "Fjernvarme", icon: "mdi:radiator", tone: "heat", stat: "heat_energy", cost: "heat_cost", kind: "energy", periods: ["day", "week", "month", "year"], period: "week" }),
      new HistoryPanel(card, { key: "ov-water", title: "Vand", icon: "mdi:water", tone: "water", stat: "water_total", kind: "volume", periods: ["day", "week", "month", "year"], period: "week" }),
    ];
  }

  ids() {
    return [
      "grid_power", "heat_power", "water_flow", "ev_power", "grid_price", "heat_supply", "heat_return",
      "measured_power", "unmeasured_power", "ev_mode", "water_cost_today", "ev_energy_today", "ev_cost_today",
      ...TODAY_KEYS.map(([k]) => k),
    ].map((k) => this.card.id(k)).filter(Boolean);
  }

  html() {
    const c = this.card;
    const heroItem = (ref, tone, ic, label, key) => `
      <button type="button" class="hero-item tone-${tone} clickable" data-entity="${escapeHtml(c.id(key) || "")}">
        <span class="badge">${icon(ic)}</span>
        <span class="hi-label">${label}</span>
        <span class="hi-val num"><b data-ref="${ref}V">—</b><small data-ref="${ref}U"></small></span>
        <span class="hi-sub" data-ref="${ref}Sub">—</span>
      </button>`;
    const kpi = (ref, tone, ic, label, tab) => `
      <button type="button" class="card kpi tone-${tone} clickable" data-goto="${tab}">
        <span class="kpi-top"><span class="badge sm">${icon(ic)}</span><span class="kpi-label">${label}</span>${icon("mdi:chevron-right", "chev")}</span>
        <span class="kpi-val num"><b data-ref="${ref}V">—</b><small data-ref="${ref}U"></small></span>
        <span class="kpi-foot"><span class="num" data-ref="${ref}Cost">—</span><span data-ref="${ref}Note">i dag</span></span>
      </button>`;
    return `
<div class="layout ov">
  <section class="card hero a-full">
    <div class="hero-head"><div class="card-head">${icon("mdi:pulse")}<h3>Aktuel status lige nu</h3></div><span class="live"><i></i>Live</span></div>
    <div class="hero-grid">
      ${heroItem("hEl", "el", "mdi:flash", "Strøm", "grid_power")}
      ${heroItem("hHeat", "heat", "mdi:radiator", "Fjernvarme", "heat_power")}
      ${heroItem("hWater", "water", "mdi:water", "Vand", "water_flow")}
      ${heroItem("hEv", "ev", "mdi:car-electric", "Billader", "ev_power")}
    </div>
  </section>
  <div class="kpis a-full">
    ${kpi("kEl", "el", "mdi:flash", "Strøm i dag", "power")}
    ${kpi("kHeat", "heat", "mdi:radiator", "Varme i dag", "heat")}
    ${kpi("kWater", "water", "mdi:water", "Vand i dag", "water")}
    ${kpi("kEv", "ev", "mdi:car-electric", "Billader i dag", "ev")}
  </div>
  <section class="card a-half">
    <div class="card-head">${icon("mdi:transit-connection-variant")}<div><h3>Energiflow</h3><small>Live effekt gennem huset</small></div></div>
    <div data-ref="flow"></div>
  </section>
  ${this.panels[0].html("a-half")}
  ${this.panels[1].html("a-third")}
  ${this.panels[2].html("a-third")}
  ${this.panels[3].html("a-third")}
</div>`;
  }

  mount(root) {
    super.mount(root);
    const c = this.card;
    this.flow = new EnergyFlow(this.refs.flow, {
      grid: c.id("grid_power"),
      heat: c.id("heat_power"),
      home: c.id("grid_power"),
      measured: c.id("measured_power"),
      ev: c.id("ev_power"),
      unmeasured: c.id("unmeasured_power"),
    });
    this.flow.connect();
  }

  shown() {
    super.shown();
    this.flow?.connect();
    this.card.loadToday(TODAY_KEYS, () => this._updateToday());
  }

  hidden() {
    this.flow?.disconnect();
  }

  hourTick() {
    super.hourTick();
    this.card.loadToday(TODAY_KEYS, () => this._updateToday());
  }

  update() {
    const c = this.card;
    // Hero
    const grid = c.watts("grid_power");
    const heat = c.watts("heat_power");
    const ev = c.watts("ev_power");
    const flowLpm = c.flowLpm("water_flow");
    this.value("hEl", fmtPower(grid), true);
    this.value("hHeat", fmtPower(heat), true);
    this.value("hEv", fmtPower(ev), true);
    this.text("hWaterV", Number.isFinite(flowLpm) ? fmt(flowLpm, flowLpm < 10 ? 1 : 0) : "—", true);
    this.text("hWaterU", "L/min");
    const price = c.num("grid_price");
    this.text("hElSub", Number.isFinite(price) ? `Pris nu ${fmt(price, 2)} kr/kWh` : "Ingen prisdata");
    const sup = c.num("heat_supply");
    const ret = c.num("heat_return");
    this.text("hHeatSub", Number.isFinite(sup) && Number.isFinite(ret) ? `Frem ${fmt(sup, 0)}° · retur ${fmt(ret, 0)}°` : heat > 0 ? "Varmer" : "Ingen varmeeffekt");
    const wf = c.waterFlowState(flowLpm);
    this.text("hWaterSub", wf.label);
    this.tone(this.refs.hWaterSub, wf.tone);
    const evs = c.evStatus();
    this.text("hEvSub", evs.label);
    this.tone(this.refs.hEvSub, evs.charging ? "ok" : "");

    // Flow
    const measured = c.watts("measured_power");
    this.flow?.update({
      grid,
      heat,
      home: grid,
      measured: Number.isFinite(measured) ? Math.max(measured - (ev || 0), 0) : undefined,
      ev,
      unmeasured: c.watts("unmeasured_power"),
    });

    this._updateToday();
  }

  _updateToday() {
    const c = this.card;
    const el = c.today("grid_energy", "energy");
    const elCost = c.today("grid_cost", "monetary");
    const heatE = c.today("heat_energy", "energy");
    const heatCost = c.today("heat_cost", "monetary");
    const water = c.today("water_total", "volume");
    this.value("kEl", fmtEnergy(el));
    this.text("kElCost", fmtKr(elCost));
    this.value("kHeat", fmtEnergy(heatE));
    this.text("kHeatCost", fmtKr(heatCost));
    this.value("kWater", fmtVolume(water));
    this.text("kWaterCost", fmtKr(c.num("water_cost_today")));
    this.value("kEv", fmtEnergy(c.kwh("ev_energy_today")));
    this.text("kEvCost", fmtKr(c.num("ev_cost_today")));
  }
}
