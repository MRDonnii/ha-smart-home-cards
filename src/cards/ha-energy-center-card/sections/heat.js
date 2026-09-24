import { Section } from "./base.js";
import { HistoryPanel } from "../components/history.js";
import { escapeHtml, fmt, fmtEnergy, fmtKr, fmtPower, icon } from "../utils/format.js";

const TODAY_KEYS = [
  ["heat_energy", "energy"],
  ["heat_cost", "monetary"],
];

/** Fælles markup for et nøgletal i en sektions-header. */
export const tile = (ref, label, entity = "") => `
  <div class="tile ${entity ? "clickable" : ""}" ${entity ? `data-entity="${escapeHtml(entity)}" tabindex="0" role="button"` : ""} data-ref="${ref}Tile">
    <small>${label}</small><b class="num"><span data-ref="${ref}V">—</span> <span class="u" data-ref="${ref}U"></span></b>
  </div>`;

export class HeatSection extends Section {
  constructor(card) {
    super(card);
    this.panels = [
      new HistoryPanel(card, { key: "ht-hist", title: "Fjernvarmeforbrug", icon: "mdi:chart-bar", tone: "heat", stat: "heat_energy", cost: "heat_cost", kind: "energy", periods: ["day", "week", "month", "year"], period: "week" }),
    ];
  }

  ids() {
    return ["heat_power", "heat_price", "heat_flow", "heat_supply", "heat_return", "heat_cooling", ...TODAY_KEYS.map(([k]) => k)]
      .map((k) => this.card.id(k))
      .filter(Boolean);
  }

  html() {
    const c = this.card;
    const opt = (k) => (c.stateObj(k) ? "" : "hidden");
    return `
<div class="layout">
  <section class="card utility tone-heat a-full">
    <div class="hero-head"><div class="card-head">${icon("mdi:radiator")}<div><h3>Fjernvarme</h3><small>Kamstrup MULTICAL · live</small></div></div><span class="live"><i></i>Live</span></div>
    <div class="util-body">
      <div class="util-main clickable" data-entity="${escapeHtml(c.id("heat_power") || "")}" tabindex="0" role="button">
        <small>Aktuel effekt</small>
        <div class="mega num"><b data-ref="powV">—</b><small data-ref="powU">kW</small></div>
        <span class="status" data-ref="status">—</span>
      </div>
      <div class="tiles">
        ${tile("today", "Forbrug i dag", c.id("heat_energy"))}
        ${tile("cost", "Pris i dag", c.id("heat_cost"))}
        ${tile("price", "Aktuel pris", c.id("heat_price"))}
      </div>
    </div>
    <div class="subtiles">
      <div class="subtile" ${opt("heat_supply")}><small>Fremløb</small><b class="num" data-ref="sup">—</b></div>
      <div class="subtile" ${opt("heat_return")}><small>Retur</small><b class="num" data-ref="ret">—</b></div>
      <div class="subtile" ${opt("heat_cooling")}><small>Afkøling (ΔT)</small><b class="num" data-ref="cool">—</b></div>
      <div class="subtile" ${opt("heat_flow")}><small>Flow</small><b class="num" data-ref="flow">—</b></div>
    </div>
  </section>
  ${this.panels[0].html("a-full tall")}
</div>`;
  }

  shown() {
    super.shown();
    this.card.loadToday(TODAY_KEYS, () => this._updateToday());
  }

  hourTick() {
    super.hourTick();
    this.card.loadToday(TODAY_KEYS, () => this._updateToday());
  }

  update() {
    const c = this.card;
    const w = c.watts("heat_power");
    this.value("pow", fmtPower(w), true);
    this.text("status", !Number.isFinite(w) ? "Ingen data" : w > 0 ? "Varmer" : "Ingen varmeeffekt");
    this.tone("status", w > 0 ? "heat" : "");
    const price = c.num("heat_price");
    this.text("priceV", Number.isFinite(price) ? fmt(price, 2) : "—");
    this.text("priceU", "kr/kWh");
    const deg = (k) => (Number.isFinite(c.num(k)) ? `${fmt(c.num(k), 1)} °C` : "—");
    this.text("sup", deg("heat_supply"));
    this.text("ret", deg("heat_return"));
    this.text("cool", deg("heat_cooling"));
    const flow = c.num("heat_flow");
    const unit = c.stateObj("heat_flow")?.attributes?.unit_of_measurement || "";
    this.text("flow", Number.isFinite(flow) ? `${fmt(flow, 0)} ${unit}` : "—");
    this._updateToday();
  }

  _updateToday() {
    const c = this.card;
    this.value("today", fmtEnergy(c.today("heat_energy", "energy")));
    const cost = c.today("heat_cost", "monetary");
    this.text("costV", Number.isFinite(cost) ? fmt(cost, 2) : "—");
    this.text("costU", "kr");
  }
}
