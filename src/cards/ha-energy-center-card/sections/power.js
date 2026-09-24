import { Section } from "./base.js";
import { HistoryPanel } from "../components/history.js";
import { escapeHtml, fmt, fmtEnergy, fmtKr, fmtPower, icon } from "../utils/format.js";

const TODAY_KEYS = [
  ["grid_energy", "energy"],
  ["grid_cost", "monetary"],
];

/** Summerer en gruppe; manglende/ugyldige sensorer ignoreres men tælles. */
export function groupSum(card, group) {
  let sum = 0;
  let valid = 0;
  let missing = 0;
  for (const m of group.entities) {
    const w = card.wattsOf(m.entity);
    if (Number.isFinite(w)) {
      sum += Math.max(w, 0);
      valid += 1;
    } else missing += 1;
  }
  return { sum: valid ? sum : undefined, missing, total: group.entities.length };
}

/** Fasebalance ud fra strømmen (A). Små belastninger vurderes ikke som skæve. */
export function phaseBalance(currents, moderateA, highA) {
  const vals = currents.filter(Number.isFinite);
  if (vals.length < 2) return { label: "Ingen data", tone: "", flagged: [] };
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const devs = currents.map((v) => (Number.isFinite(v) ? v - mean : 0));
  const worst = Math.max(...devs.map(Math.abs));
  const flagged = devs.map((d) => Math.abs(d) >= moderateA && Math.abs(d) === worst);
  if (worst >= highA) return { label: "Skæv", tone: "bad", flagged, worst };
  if (worst >= moderateA) return { label: "Moderat", tone: "warn", flagged, worst };
  return { label: "God", tone: "ok", flagged: flagged.map(() => false), worst };
}

export class PowerSection extends Section {
  constructor(card) {
    super(card);
    this.panels = [
      new HistoryPanel(card, { key: "pw-hist", title: "Historik – elforbrug", icon: "mdi:chart-bar", tone: "el", stat: "grid_energy", cost: "grid_cost", kind: "energy", periods: ["day", "week", "month", "year"], period: "day" }),
    ];
  }

  ids() {
    const c = this.card;
    const keys = ["grid_power", "grid_apparent", "meter_temperature", "grid_price", "grid_returned", "measured_power", "unmeasured_power", ...TODAY_KEYS.map(([k]) => k)];
    const ids = keys.map((k) => c.id(k));
    for (const g of c.config.groups) for (const m of g.entities) ids.push(m.entity);
    for (const p of c.config.phases) ids.push(p.power, p.apparent, p.power_factor, p.current, p.voltage, p.frequency);
    return ids.filter(Boolean);
  }

  html() {
    const c = this.card;
    const ent = (k) => escapeHtml(c.id(k) || "");
    const groups = c.config.groups
      .map(
        (g, i) => `
      <button type="button" class="grow clickable" data-group="${i}" data-ref="g${i}">
        <span class="badge sm">${icon(g.icon || "mdi:flash")}</span>
        <span class="gname">${escapeHtml(g.name)}<i class="gwarn" data-ref="g${i}Warn" hidden></i></span>
        <span class="gbar"><i data-ref="g${i}Bar"></i></span>
        <span class="gval num" data-ref="g${i}Val">—</span>
        <span class="gshare num" data-ref="g${i}Share">—</span>
      </button>`,
      )
      .join("");
    const phases = c.config.phases
      .map(
        (p, i) => `
      <div class="phase clickable" data-ref="ph${i}" data-entity="${escapeHtml(p.power || p.current || "")}" tabindex="0" role="button">
        <div class="ph-head"><span class="ph-name">Fase ${escapeHtml(p.name)}</span><span class="ph-flag" data-ref="ph${i}Flag" hidden>Afviger</span></div>
        <div class="ph-val num"><b data-ref="ph${i}V">—</b><small data-ref="ph${i}U">W</small></div>
        <div class="meter"><i data-ref="ph${i}Bar"></i></div>
        <dl>
          <div><dt>Strøm</dt><dd class="num" data-ref="ph${i}A">—</dd></div>
          <div><dt>Spænding</dt><dd class="num" data-ref="ph${i}Vo">—</dd></div>
          <div><dt>Frekvens</dt><dd class="num" data-ref="ph${i}Hz">—</dd></div>
          <div><dt>PF</dt><dd class="num" data-ref="ph${i}Pf">—</dd></div>
          <div><dt>Tilsyneladende</dt><dd class="num" data-ref="ph${i}Va">—</dd></div>
        </dl>
      </div>`,
      )
      .join("");
    const mini = (ref, label, ic, key, extra = "") => `
      <div class="card mini tone-el ${key ? "clickable" : ""}" ${key ? `data-entity="${ent(key)}" tabindex="0" role="button"` : ""}>
        <div class="card-head">${icon(ic)}<h3>${label}</h3></div>
        <div class="mini-val num"><b data-ref="${ref}V">—</b><small data-ref="${ref}U"></small></div>
        ${extra}
      </div>`;
    return `
<div class="layout pw">
  <section class="card hero-main tone-el a-half clickable" data-entity="${ent("grid_power")}" tabindex="0" role="button">
    <div class="hero-head"><div class="card-head">${icon("mdi:flash")}<h3>Strøm lige nu</h3></div><span class="live"><i></i>Live</span></div>
    <div class="mega num"><b data-ref="mainV">—</b><small data-ref="mainU">W</small></div>
    <div class="facts">
      <div><small>Tilsyneladende</small><b class="num" data-ref="mainVa">—</b></div>
      <div><small>Pris nu</small><b class="num" data-ref="mainPrice">—</b></div>
      <div><small>Målertemperatur</small><b class="num" data-ref="mainTemp">—</b></div>
      <div><small>Returneret i alt</small><b class="num" data-ref="mainRet">—</b></div>
    </div>
  </section>
  <div class="quad a-half">
    ${mini("mMain", "Hovedmåler", "mdi:meter-electric-outline", "grid_energy", `<div class="mini-sub"><span class="num" data-ref="mMainCost">—</span><span>i dag</span></div>`)}
    ${mini("mMeas", "Målt total", "mdi:chart-donut", "measured_power", `<div class="mini-sub"><span class="num" data-ref="mMeasPct">—</span><span>af hovedmåler</span></div>`)}
    ${mini("mUnm", "Umålt", "mdi:help-circle-outline", "unmeasured_power", `<div class="mini-sub"><span class="num" data-ref="mUnmPct">—</span><span>af hovedmåler</span></div>`)}
    <div class="card mini acct" data-ref="acct">
      <div class="card-head">${icon("mdi:scale-balance")}<h3>Strømregnskab</h3></div>
      <div class="stack"><i class="s-meas" data-ref="acctMeas"></i><i class="s-unm" data-ref="acctUnm"></i></div>
      <div class="acct-rows">
        <span><i class="dot el"></i>Målt <b class="num" data-ref="acctMeasPct">—</b></span>
        <span><i class="dot muted"></i>Umålt <b class="num" data-ref="acctUnmPct">—</b></span>
        <span>Difference <b class="num" data-ref="acctDiff">—</b></span>
      </div>
      <div class="acct-msg" data-ref="acctMsg">—</div>
    </div>
  </div>
  <section class="card a-full">
    <div class="sect-head">
      <div class="card-head">${icon("mdi:chart-bar-stacked")}<div><h3>Fordeling pr. gruppe</h3><small data-ref="grpSum">—</small></div></div>
      <span class="hint">Tryk på en gruppe for detaljer</span>
    </div>
    <div class="groups">${groups}</div>
  </section>
  <section class="card a-full">
    <div class="sect-head">
      <div class="card-head">${icon("mdi:sine-wave")}<div><h3>3-faset måling</h3><small>Effekt, strøm, spænding og frekvens pr. fase</small></div></div>
      <span class="chip" data-ref="bal">Balance —</span>
    </div>
    <div class="phases">${phases}</div>
  </section>
  ${this.panels[0].html("a-full")}
</div>`;
  }

  mount(root) {
    super.mount(root);
    this.groupState = this.card.config.groups.map(() => ({}));
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
    const grid = c.watts("grid_power");
    const meas = c.watts("measured_power");
    const unm = c.watts("unmeasured_power");

    // Hero
    this.value("main", fmtPower(grid), true);
    const va = c.num("grid_apparent");
    this.text("mainVa", Number.isFinite(va) ? `${fmt(va, 0)} VA` : "—");
    const price = c.num("grid_price");
    this.text("mainPrice", Number.isFinite(price) ? `${fmt(price, 2)} kr/kWh` : "—");
    const temp = c.num("meter_temperature");
    this.text("mainTemp", Number.isFinite(temp) ? `${fmt(temp, 1)} °C` : "—");
    const ret = fmtEnergy(c.kwh("grid_returned"));
    this.text("mainRet", `${ret.v} ${ret.u}`);

    // Målt / umålt / regnskab
    this.value("mMeas", fmtPower(meas));
    this.value("mUnm", fmtPower(unm));
    const pct = (v) => (Number.isFinite(v) && grid > 0 ? (v / grid) * 100 : undefined);
    const measPct = pct(meas);
    const unmPct = pct(unm);
    this.text("mMeasPct", Number.isFinite(measPct) ? `${fmt(measPct, 0)} %` : "—");
    this.text("mUnmPct", Number.isFinite(unmPct) ? `${fmt(unmPct, 0)} %` : "—");
    this.text("acctMeasPct", Number.isFinite(measPct) ? `${fmt(measPct, 0)} %` : "—");
    this.text("acctUnmPct", Number.isFinite(unmPct) ? `${fmt(unmPct, 0)} %` : "—");
    this.bar("acctMeas", grid > 0 && Number.isFinite(meas) ? Math.min(meas / grid, 1) : 0);
    this.bar("acctUnm", grid > 0 && Number.isFinite(unm) ? Math.min(unm / grid, 1) : 0);
    const tol = c.config.accounting_tolerance_w;
    if (Number.isFinite(grid) && Number.isFinite(meas)) {
      const diff = (meas + (Number.isFinite(unm) ? unm : 0)) - grid;
      this.text("acctDiff", `${diff > 0 ? "+" : ""}${fmt(diff, 0)} W`);
      const off = meas - grid > tol;
      this.text("acctMsg", off ? `Kortlagt forbrug er ${fmt(meas - grid, 0)} W højere end hovedmåleren` : "Regnskabet stemmer");
      this.tone("acct", off ? "warn" : "");
    } else {
      this.text("acctDiff", "—");
      this.text("acctMsg", "Kan ikke kontrollere: mangler data");
      this.tone("acct", "");
    }

    this._updateGroups(grid);
    this._updatePhases();
    this._updateToday();
  }

  _updateToday() {
    const c = this.card;
    this.value("mMain", fmtEnergy(c.today("grid_energy", "energy")));
    this.text("mMainCost", fmtKr(c.today("grid_cost", "monetary")));
  }

  _updateGroups(grid) {
    const c = this.card;
    const sums = c.config.groups.map((g) => groupSum(c, g));
    const max = Math.max(1, ...sums.map((s) => s.sum || 0));
    const order = sums.map((s, i) => [s.sum ?? -1, i]).sort((a, b) => b[0] - a[0]);
    order.forEach(([, i], rank) => this.style(`g${i}`, "order", String(rank)));
    let total = 0;
    sums.forEach((s, i) => {
      total += s.sum || 0;
      const p = fmtPower(s.sum);
      this.text(`g${i}Val`, `${p.v} ${p.u}`);
      this.text(`g${i}Share`, Number.isFinite(s.sum) && grid > 0 ? `${fmt((s.sum / grid) * 100, 0)} %` : "—");
      this.bar(`g${i}Bar`, (s.sum || 0) / max);
      const warn = this.refs[`g${i}Warn`];
      this.show(warn, s.missing > 0);
      if (s.missing > 0 && warn.__t !== s.missing) {
        warn.__t = s.missing;
        warn.title = `${s.missing} af ${s.total} sensorer mangler data`;
      }
    });
    const p = fmtPower(total);
    this.text("grpSum", `${p.v} ${p.u} målt i ${sums.length} grupper${Number.isFinite(grid) && grid > 0 ? ` · ${fmt((total / grid) * 100, 0)} % af hovedmåler` : ""}`);
  }

  _updatePhases() {
    const c = this.card;
    const phases = c.config.phases;
    const currents = phases.map((p) => c.numOf(p.current));
    const maxI = Math.max(1, ...currents.filter(Number.isFinite));
    const bal = phaseBalance(currents, c.config.phase_moderate_a, c.config.phase_high_a);
    this.text("bal", `Balance: ${bal.label}`);
    this.tone("bal", bal.tone);
    phases.forEach((p, i) => {
      this.value(`ph${i}`, fmtPower(c.wattsOf(p.power)), true);
      const cur = currents[i];
      this.text(`ph${i}A`, Number.isFinite(cur) ? `${fmt(cur, 2)} A` : "—");
      const v = c.numOf(p.voltage);
      this.text(`ph${i}Vo`, Number.isFinite(v) ? `${fmt(v, 1)} V` : "—");
      const hz = c.numOf(p.frequency);
      this.text(`ph${i}Hz`, Number.isFinite(hz) ? `${fmt(hz, 2)} Hz` : "—");
      const pf = c.numOf(p.power_factor);
      this.text(`ph${i}Pf`, Number.isFinite(pf) ? fmt(pf, 2) : "—");
      const va = c.numOf(p.apparent);
      this.text(`ph${i}Va`, Number.isFinite(va) ? `${fmt(va, 0)} VA` : "—");
      this.bar(`ph${i}Bar`, Number.isFinite(cur) ? cur / maxI : 0);
      this.show(`ph${i}Flag`, Boolean(bal.flagged[i]));
      this.tone(`ph${i}`, bal.flagged[i] ? bal.tone : "");
    });
  }
}
