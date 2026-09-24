import { Section } from "./base.js";
import { HistoryPanel } from "../components/history.js";
import { tile } from "./heat.js";
import { escapeHtml, fmt, fmtEnergy, fmtPower, icon } from "../utils/format.js";

export class EvSection extends Section {
  constructor(card) {
    super(card);
    // Dag-/månedssensorerne nulstilles hver periode, så deres slut-state er periodens forbrug.
    // (Totaltællerens statistik har et falsk spring på ~4.300 kWh i juni 2026 og bruges derfor ikke.)
    const base = { tone: "ev", kind: "energy", icon: "mdi:chart-bar", delta: "reset" };
    this.panels = [
      new HistoryPanel(card, { ...base, key: "ev-day", stat: "ev_energy_today", title: "Billader pr. dag", periods: ["month"], captions: { month: "Seneste 30 dage" } }),
      new HistoryPanel(card, { ...base, key: "ev-month", stat: "ev_energy_month", title: "Billader pr. måned", periods: ["year"], captions: { year: "Seneste 12 måneder" } }),
    ];
  }

  ids() {
    return ["ev_power", "ev_energy_today", "ev_energy_month", "ev_energy_total", "ev_session", "ev_cost_today", "ev_mode"]
      .map((k) => this.card.id(k))
      .filter(Boolean);
  }

  html() {
    const c = this.card;
    return `
<div class="layout">
  <section class="card utility tone-ev a-full">
    <div class="hero-head"><div class="card-head">${icon("mdi:ev-station")}<div><h3>Billader</h3><small>Ladeboks · live</small></div></div><span class="chip" data-ref="chip">—</span></div>
    <div class="util-body">
      <div class="util-main clickable" data-entity="${escapeHtml(c.id("ev_power") || "")}" tabindex="0" role="button">
        <small>Aktuel ladeeffekt</small>
        <div class="mega num"><b data-ref="powV">—</b><small data-ref="powU">kW</small></div>
        <span class="status" data-ref="status">—</span>
      </div>
      <div class="tiles four">
        ${tile("today", "Energi i dag", c.id("ev_energy_today"))}
        ${tile("month", "Energi denne måned", c.id("ev_energy_month"))}
        ${tile("cost", "Pris i dag", c.id("ev_cost_today"))}
        ${tile("session", "Seneste session", c.id("ev_session"))}
      </div>
    </div>
  </section>
  ${this.panels[0].html("a-half tall")}
  ${this.panels[1].html("a-half tall")}
</div>`;
  }

  update() {
    const c = this.card;
    const w = c.watts("ev_power");
    this.value("pow", fmtPower(w), true);
    const st = c.evStatus();
    this.text("chip", st.charging ? "OPLADER" : "KLAR / IKKE AKTIV");
    this.tone("chip", st.charging ? "ok" : "");
    this.text("status", st.label);
    this.tone("status", st.charging ? "ok" : "");
    this.value("today", fmtEnergy(c.kwh("ev_energy_today")));
    this.value("month", fmtEnergy(c.kwh("ev_energy_month")));
    this.value("session", fmtEnergy(c.kwh("ev_session")));
    const cost = c.num("ev_cost_today");
    this.text("costV", Number.isFinite(cost) ? fmt(cost, 2) : "—");
    this.text("costU", "kr");
  }
}
