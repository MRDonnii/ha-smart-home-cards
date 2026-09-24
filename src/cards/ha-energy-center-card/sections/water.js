import { Section } from "./base.js";
import { HistoryPanel } from "../components/history.js";
import { tile } from "./heat.js";
import { escapeHtml, fmt, fmtVolume, icon } from "../utils/format.js";

const TODAY_KEYS = [["water_total", "volume"]];

export class WaterSection extends Section {
  constructor(card) {
    super(card);
    this.panels = [
      new HistoryPanel(card, { key: "wt-hist", title: "Vandforbrug", icon: "mdi:chart-bar", tone: "water", stat: "water_total", kind: "volume", periods: ["day", "week", "month", "year"], period: "day" }),
    ];
  }

  ids() {
    return ["water_flow", "water_price", "water_cost_today", ...TODAY_KEYS.map(([k]) => k)].map((k) => this.card.id(k)).filter(Boolean);
  }

  html() {
    const c = this.card;
    return `
<div class="layout">
  <section class="card utility tone-water a-full">
    <div class="hero-head"><div class="card-head">${icon("mdi:water")}<div><h3>Vand</h3><small>Vandmåler · live</small></div></div><span class="live"><i></i>Live</span></div>
    <div class="util-body">
      <div class="util-main clickable" data-entity="${escapeHtml(c.id("water_flow") || "")}" tabindex="0" role="button">
        <small>Flow lige nu</small>
        <div class="mega num"><b data-ref="flowV">—</b><small>L/min</small></div>
        <span class="status" data-ref="status">—</span>
      </div>
      <div class="tiles">
        ${tile("today", "Forbrug i dag", c.id("water_total"))}
        ${tile("cost", "Pris i dag", c.id("water_cost_today"))}
        ${tile("price", "Pris pr. m³", c.id("water_price"))}
      </div>
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
    const lpm = c.flowLpm("water_flow");
    this.text("flowV", Number.isFinite(lpm) ? fmt(lpm, lpm < 10 ? 1 : 0) : "—", true);
    const st = c.waterFlowState(lpm);
    this.text("status", st.label);
    this.tone("status", st.tone);
    const cost = c.num("water_cost_today");
    this.text("costV", Number.isFinite(cost) ? fmt(cost, 2) : "—");
    this.text("costU", "kr");
    const price = c.num("water_price");
    this.text("priceV", Number.isFinite(price) ? fmt(price, 2) : "—");
    this.text("priceU", "kr/m³");
    this._updateToday();
  }

  _updateToday() {
    this.value("today", fmtVolume(this.card.today("water_total", "volume")));
  }
}
