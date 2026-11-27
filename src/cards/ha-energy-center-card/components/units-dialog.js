/*
 * "Pr. enhed"-popup (Claude AI, 2026-11-27): alle målte enheder samlet i kortets grupper.
 *  - Hver gruppe har en overskrift med samlet effekt og kan foldes sammen.
 *  - En samlesensor (fx en sensorgruppe med `entity_id`-liste over mange lamper) vises som én linje,
 *    der kan foldes ud; kun de enheder der bruger strøm vises, resten bag "Vis alle".
 *  - Effekt opdateres live; "i dag" (kWh og kr) kommer fra Strøm-fanens timestatistik, når den er hentet.
 */
import { escapeHtml, fmt, fmtPower, icon } from "../utils/format.js";

const ON_W = 0.5;

const pw = (w) => {
  if (!Number.isFinite(w)) return "Ingen data";
  const p = fmtPower(w);
  return `${p.v} ${p.u}`;
};

export class UnitsDialog {
  constructor(card) {
    this.card = card;
  }

  _members(id) {
    const ids = this.card._hass?.states?.[id]?.attributes?.entity_id;
    return Array.isArray(ids) && ids.length > 1 ? ids.filter((x) => typeof x === "string") : null;
  }

  _name(id, fallback) {
    return fallback || this.card._hass?.states?.[id]?.attributes?.friendly_name || id;
  }

  _today(id) {
    return this.card._powerDetail?.()?.todayMap?.get(id);
  }

  _groupColor(g) {
    const pd = this.card._powerDetail?.();
    const col = pd?.col;
    if (!col) return "var(--c-el)";
    if (pd.evIds?.length && g.entities.some((m) => pd.evIds.includes(m.entity))) return col.Billader || "var(--c-el)";
    const series = pd.series?.find((s) => g.entities.some((m) => s.entities.includes(m.entity)));
    return (series && col[series.name]) || "var(--c-el)";
  }

  open(dlg) {
    const c = this.card;
    this.dlg = dlg;
    this.open_ = new Set();
    dlg.classList.add("wide");
    dlg.querySelector("[data-dlg-icon]").innerHTML = icon("mdi:format-list-bulleted");
    dlg.querySelector("[data-dlg-title]").textContent = "Alle målte enheder";
    this.sumEl = dlg.querySelector("[data-dlg-sum]");
    const rows = dlg.querySelector("[data-dlg-rows]");
    rows.classList.add("u-wrap");
    rows.innerHTML = c.config.groups
      .map(
        (g, gi) => `
      <section class="u-grp" data-gi="${gi}" style="--gc:${this._groupColor(g)}">
        <button type="button" class="u-gh" data-u="grp" data-gi="${gi}" aria-expanded="true">
          <span class="u-dot"></span><span class="u-gn">${escapeHtml(g.name)}</span>
          <span class="u-gv num" data-gv>—</span>${icon("mdi:chevron-down", "u-chev")}
        </button>
        <div class="u-list">${g.entities.map((m) => this._row(m.entity, m.name)).join("")}</div>
      </section>`,
      )
      .join("");
    this.rows = rows;
    this.seen = new Map();
    this.update(true);
  }

  _row(id, name) {
    const members = this._members(id);
    const t = this._today(id);
    const today = t ? `i dag ${fmt(t.kwh, 2)} kWh${Number.isFinite(t.kr) && t.kr > 0 ? ` · ${fmt(t.kr, 2)} kr` : ""}` : "";
    if (!members) {
      return `<button type="button" class="u-row" data-entity="${escapeHtml(id)}" data-w="${escapeHtml(id)}"><span class="u-n">${escapeHtml(this._name(id, name))}</span><span class="u-v num">—</span><small class="u-t">${today}</small></button>`;
    }
    return `<div class="u-agg" data-agg="${escapeHtml(id)}">
      <button type="button" class="u-row agg" data-u="agg" data-id="${escapeHtml(id)}" data-w="${escapeHtml(id)}" aria-expanded="false">
        <span class="u-n">${icon("mdi:chevron-right", "u-chev")}${escapeHtml(this._name(id, name))}<em data-cnt></em></span><span class="u-v num">—</span><small class="u-t">${today}</small>
      </button>
      <div class="u-sub" hidden></div>
    </div>`;
  }

  /** Visningsnavn for en del-enhed: enhedens navn (uden " power"), ellers sensorens navn. */
  _memberName(id) {
    const h = this.card._hass;
    const dev = h?.devices?.[h?.entities?.[id]?.device_id];
    const n = dev?.name_by_user || dev?.name || h?.states?.[id]?.attributes?.friendly_name || id;
    return n.replace(/\s+(power|effekt)$/i, "");
  }

  _area(id) {
    const h = this.card._hass;
    const e = h?.entities?.[id];
    const a = e?.area_id || h?.devices?.[e?.device_id]?.area_id;
    return (a && h?.areas?.[a]?.name) || "Uden rum";
  }

  _renderSub(agg) {
    const id = agg.dataset.agg;
    const sub = agg.querySelector(".u-sub");
    const all = agg.dataset.all === "1";
    const members = (this._members(id) || []).map((m) => ({ id: m, w: this.card.wattsOf(m) }));
    const byW = (a, b) => (Number.isFinite(b.w) ? b.w : -1) - (Number.isFinite(a.w) ? a.w : -1);
    members.sort(byW);
    const row = (m) => `<button type="button" class="u-row sub${m.w >= ON_W ? "" : " off"}" data-entity="${escapeHtml(m.id)}"><span class="u-n">${escapeHtml(this._memberName(m.id))}</span><span class="u-v num">${pw(m.w)}</span></button>`;
    const on = members.filter((m) => m.w >= ON_W).length;
    const rest = members.length - on;
    const more = rest > 0 ? `<button type="button" class="u-more" data-u="all">${all ? "Skjul det der er slukket" : `Vis alle ${members.length} (${rest} slukket)`}</button>` : "";
    // Mange enheder: saml dem pr. rum, så listen ikke bliver for lang.
    if (members.length > 10) {
      const areas = new Map();
      for (const m of members) {
        const a = this._area(m.id);
        if (!areas.has(a)) areas.set(a, []);
        areas.get(a).push(m);
      }
      const openSet = (this.openAreas ||= new Map()).get(id) || new Set();
      const list = [...areas].map(([name, ms]) => ({ name, ms, w: ms.reduce((s, m) => s + (m.w >= 0 ? m.w : 0), 0), on: ms.filter((m) => m.w >= ON_W).length })).sort((a, b) => b.w - a.w);
      const shown = all ? list : list.filter((a) => a.on > 0);
      sub.innerHTML =
        shown
          .map((a) => {
            const open = openSet.has(a.name);
            const ms = all ? a.ms : a.ms.filter((m) => m.w >= ON_W);
            return `<div class="u-area${open ? " open" : ""}"><button type="button" class="u-row area${a.on ? "" : " off"}" data-u="area" data-area="${escapeHtml(a.name)}" aria-expanded="${open}"><span class="u-n">${icon("mdi:chevron-right", "u-chev")}${escapeHtml(a.name)}<em>${a.on} af ${a.ms.length} tændt</em></span><span class="u-v num">${pw(a.w)}</span></button>${open ? `<div class="u-sub2">${ms.map(row).join("")}</div>` : ""}</div>`;
          })
          .join("") +
        (shown.length ? "" : `<div class="u-none">Ingen bruger strøm lige nu</div>`) +
        (list.length > shown.length || all ? `<button type="button" class="u-more" data-u="all">${all ? "Skjul rum uden forbrug" : `Vis alle ${list.length} rum`}</button>` : "");
      return;
    }
    const shown = all ? members : members.filter((m) => m.w >= ON_W);
    sub.innerHTML = shown.map(row).join("") + (shown.length ? "" : `<div class="u-none">Ingen bruger strøm lige nu</div>`) + more;
  }

  click(el) {
    const kind = el.dataset.u;
    if (kind === "grp") {
      const sec = el.closest(".u-grp");
      const open = sec.classList.toggle("closed");
      el.setAttribute("aria-expanded", String(!open));
      return;
    }
    const agg = el.closest(".u-agg");
    if (kind === "agg" && agg) {
      const sub = agg.querySelector(".u-sub");
      sub.hidden = !sub.hidden;
      el.setAttribute("aria-expanded", String(!sub.hidden));
      agg.classList.toggle("open", !sub.hidden);
      if (!sub.hidden) this._renderSub(agg);
      return;
    }
    if (kind === "area" && agg) {
      const map = (this.openAreas ||= new Map());
      const set = map.get(agg.dataset.agg) || new Set();
      const name = el.dataset.area;
      if (set.has(name)) set.delete(name);
      else set.add(name);
      map.set(agg.dataset.agg, set);
      this._renderSub(agg);
      return;
    }
    if (kind === "all" && agg) {
      agg.dataset.all = agg.dataset.all === "1" ? "0" : "1";
      this._renderSub(agg);
    }
  }

  update(force = false) {
    const c = this.card;
    if (!this.rows?.isConnected) return;
    let changed = force;
    for (const el of this.rows.querySelectorAll("[data-w]")) {
      const id = el.dataset.w;
      const obj = c._hass?.states?.[id];
      if (this.seen.get(id) !== obj) {
        this.seen.set(id, obj);
        changed = true;
      }
    }
    if (!changed) return;
    let total = 0;
    let n = 0;
    let kwh = 0;
    let kr = 0;
    c.config.groups.forEach((g, gi) => {
      const sec = this.rows.querySelector(`.u-grp[data-gi="${gi}"]`);
      if (!sec) return;
      let gs = 0;
      const items = [];
      for (const m of g.entities) {
        const w = c.wattsOf(m.entity);
        if (Number.isFinite(w)) gs += Math.max(w, 0);
        items.push([m.entity, w]);
        const t = this._today(m.entity);
        if (t) {
          kwh += t.kwh;
          kr += Number.isFinite(t.kr) ? t.kr : 0;
        }
        n += this._members(m.entity)?.length || 1;
      }
      total += gs;
      sec.querySelector("[data-gv]").textContent = pw(gs);
      sec.style.order = String(Math.round(-gs * 10));
      // Rækkerne i gruppen sorteres efter effekt.
      const list = sec.querySelector(".u-list");
      items.forEach(([id, w]) => {
        const row = list.querySelector(`:scope > [data-w="${CSS.escape(id)}"], :scope > .u-agg[data-agg="${CSS.escape(id)}"]`);
        if (!row) return;
        const btn = row.matches("[data-w]") ? row : row.querySelector("[data-w]");
        btn.querySelector(".u-v").textContent = pw(w);
        btn.classList.toggle("off", !(w >= ON_W));
        row.style.order = String(Number.isFinite(w) ? Math.round(-w * 10) : 1e9);
        if (row.classList.contains("u-agg")) {
          const mem = this._members(id) || [];
          const on = mem.filter((x) => c.wattsOf(x) >= ON_W).length;
          row.querySelector("[data-cnt]").textContent = `${on} af ${mem.length} tændt`;
          if (!row.querySelector(".u-sub").hidden) this._renderSub(row);
        }
      });
    });
    const today = kwh > 0 ? ` · i dag ${fmt(kwh, 1)} kWh${kr > 0 ? ` / ${fmt(kr, 2)} kr` : ""}` : "";
    this.sumEl.textContent = `${pw(total)} målt lige nu · ${n} enheder i ${c.config.groups.length} grupper${today}`;
  }

  close() {
    this.dlg?.classList.remove("wide");
    this.rows?.classList.remove("u-wrap");
    this.rows = null;
  }
}

export const UNITS_STYLE = `
dialog.detail.wide{width:min(1000px,calc(100vw - 24px));max-height:min(86vh,900px)}
.dlg-rows.u-wrap{display:block;columns:2 330px;column-gap:14px;padding:12px 14px 16px}
.u-grp{break-inside:avoid;display:flex;flex-direction:column;margin:0 0 12px;padding:6px;border-radius:14px;background:var(--ec-surface-2);border:1px solid var(--ec-border);border-left:3px solid var(--gc)}
.u-gh{display:grid;grid-template-columns:10px minmax(0,1fr) auto 18px;gap:10px;align-items:center;padding:8px 8px;border-radius:10px;font-size:14px;font-weight:650;text-align:left}
.u-gh:hover{background:var(--ec-surface-2)}
.u-dot{width:10px;height:10px;border-radius:3px;background:var(--gc)}
.u-gn{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.u-gv{font-weight:700}
.u-chev{--mdc-icon-size:18px;color:var(--ec-muted);transition:transform .15s ease}
.u-grp.closed .u-gh .u-chev{transform:rotate(-90deg)}
.u-grp.closed .u-list{display:none}
.u-list{display:flex;flex-direction:column;padding:0 2px 2px}
.u-row{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"n v" "t t";gap:0 10px;align-items:center;padding:7px 8px 7px 28px;border-radius:9px;text-align:left;font-size:13px}
.u-row:hover{background:var(--ec-surface-2)}
.u-row .u-n{grid-area:n;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;align-items:center;gap:4px}
.u-row .u-v{grid-area:v;font-weight:650;text-align:right;white-space:nowrap}
.u-row .u-t{grid-area:t;font-size:11.5px;color:var(--ec-muted)}.u-row .u-t:empty{display:none}
.u-row.off .u-v{color:var(--ec-faint)}
.u-row.agg{padding-left:8px}.u-row.agg .u-chev{margin-right:2px}
.u-row.agg em{font-style:normal;font-size:11.5px;color:var(--ec-muted);margin-left:6px;font-weight:500}
.u-agg{display:flex;flex-direction:column}
.u-agg.open > .u-row .u-chev{transform:rotate(90deg)}
.u-sub{display:flex;flex-direction:column;margin:2px 0 6px 18px;padding-left:8px;border-left:1px dashed var(--ec-border-strong)}
.u-sub[hidden]{display:none}
.u-row.sub{padding:5px 8px;font-size:12.5px;grid-template-areas:"n v"}
.u-row.area{padding:6px 8px;font-size:12.5px;font-weight:600}.u-row.area em{font-style:normal;font-size:11px;color:var(--ec-muted);margin-left:6px;font-weight:500}
.u-area{display:flex;flex-direction:column}
.u-area.open > .u-row .u-chev{transform:rotate(90deg)}
.u-sub2{display:flex;flex-direction:column;margin:0 0 4px 16px;padding-left:6px;border-left:1px dashed var(--ec-border)}
.u-more{align-self:flex-start;margin:4px 8px;padding:5px 10px;border-radius:8px;font-size:12px;font-weight:600;color:var(--ec-accent);background:color-mix(in srgb,var(--ec-accent) 10%,transparent)}
.u-none{font-size:12px;color:var(--ec-muted);padding:6px 8px}
.pd-units{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:10px;font-size:12.5px;font-weight:650;color:var(--ec-text);background:color-mix(in srgb,var(--ec-accent) 12%,transparent);border:1px solid color-mix(in srgb,var(--ec-accent) 40%,transparent)}
.pd-units:hover{background:color-mix(in srgb,var(--ec-accent) 20%,transparent)}
.pd-units .ic{--mdc-icon-size:16px;color:var(--ec-accent)}
@media (max-width:640px){.dlg-rows.u-wrap{columns:1;padding:10px}}
`;
