const VERSION = "0.2.0";

const NEVER_YEAR = 2000;

class HAPoolSettingsCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._sig = "";
    this._tab = 0;
  }

  static getStubConfig() {
    return {
      title: "Pool-indstillinger",
      subtitle: "Sandfilter, automatik, vedligeholdelse og indsigt",
      back_path: "/hjem-overblik/pool",
      sections: [
        {
          title: "Sandfiltertider",
          icon: "mdi:timer-cog-outline",
          danger_action: {
            label: "Sluk helt — forbliv slukket",
            desc: "Automatikken rører intet, indtil du selv vælger Automatik igen",
            icon: "mdi:power-plug-off",
            entity: "input_select.pool_pumpe_manuel_override_varighed",
            service: "input_select.select_option",
            data: { option: "Fra (til jeg tænder)" },
            confirm: "Sluk poolpumpen helt og hold den slukket, indtil du selv vælger Automatik igen?",
          },
          rows: [
            { label: "Automatisk sandfilterstyring", entity: "input_boolean.pool_automation_aktiv" },
            { label: "Manuel pause varighed", entity: "input_select.pool_pumpe_manuel_override_varighed" },
            { label: "Minimum sandfiltertid pr. dag", entity: "input_number.pool_pumpe_minimum_timer_pr_dag" },
            { label: "Normal sandfiltertid pr. dag", entity: "input_number.pool_pumpe_normal_timer_pr_dag" },
            { label: "Sandfiltertid ved brug", entity: "input_number.pool_pumpe_hoj_brug_timer_pr_dag" },
            { label: "Efterbad i minutter", entity: "input_number.pool_pumpe_efterbad_minutter" },
            { label: "Interval længde", entity: "input_number.pool_pumpe_interval_minutter" },
            { label: "Pause mellem intervaller", entity: "input_number.pool_pumpe_interval_pause_minutter" },
            { label: "Sluk-hysterese ved badning", entity: "input_number.pool_pumpe_person_sluk_delay_minutter" },
            { label: "Maks pause for sandfilter", entity: "input_number.pool_pumpe_maks_pause_timer" },
          ],
        },
        {
          title: "Automatik & signaler",
          icon: "mdi:state-machine",
          rows: [
            { label: "Person i vandet", entity: "binary_sensor.pool_person_i_vandet" },
            { label: "Kameraanalyse ved pool", entity: "input_boolean.pool_kamera_analyse_aktiv" },
            { label: "Billig elpris nu", entity: "binary_sensor.poolpumpe_elpris_billig_nu" },
            { label: "Elpris gennemsnit i dag", entity: "sensor.poolpumpe_elpris_gennemsnit_i_dag" },
            { label: "Efterbad venter", entity: "input_boolean.pool_efterbad_venter" },
            { label: "Efterbad timer", entity: "timer.pool_pumpe_efterbad" },
            { label: "Manuel drift timer", entity: "timer.pool_pumpe_manuel_override" },
            { label: "Sluk-hysterese timer", entity: "timer.pool_pumpe_person_sluk_delay" },
            { label: "Sidste sandfilter controller-run", entity: "input_datetime.pool_pumpe_sidste_controller_run" },
            { label: "Sidst registreret person i poolen", entity: "input_datetime.pool_sidst_person_i_vandet" },
            { label: "Næste handling", entity: "sensor.pool_naeste_handling" },
            { label: "Bedste badetid", entity: "sensor.pool_bedste_badetid" },
            { label: "Pooladvarsel", entity: "sensor.pool_statusadvarsel" },
            { label: "Præcis pumpepris i dag", entity: "sensor.poolpumpe_pris_eksakt_i_dag" },
            { label: "Ollama covervurdering", entity: "sensor.poolcover_ollama_status" },
          ],
        },
        {
          title: "Poolkomfort",
          icon: "mdi:shield-sun",
          rows: [
            { label: "Coverstatus fra Ollama", entity: "sensor.poolcover_ollama_status" },
            { label: "Badeklar fra", entity: "input_number.pool_badeklar_temperatur" },
          ],
        },
        {
          title: "Vand & vedligeholdelse",
          icon: "mdi:test-tube",
          rows: [
            { label: "Vedligeholdelsesstatus", entity: "sensor.pool_vedligeholdelsesstatus" },
            { label: "Registrer klor tilsat nu", entity: "input_button.pool_registrer_klor_tilsat" },
            { label: "Sidst tilsat klor", entity: "sensor.pool_sidste_klor_visning" },
            { label: "Registrer returskylning nu", entity: "input_button.pool_registrer_returskyl" },
            { label: "Sidste returskylning", entity: "sensor.pool_sidste_returskyl_visning" },
            { label: "Registrer filterrens nu", entity: "input_button.pool_registrer_filterrens" },
            { label: "Sidste filterrens", entity: "sensor.pool_sidste_filterrens_visning" },
            { label: "Påmindelse: returskylning", entity: "input_number.pool_returskyl_interval_dage" },
            { label: "Påmindelse: filterrens", entity: "input_number.pool_filterrens_interval_dage" },
            { label: "BACKWASH varighed", entity: "input_number.pool_backwash_minutter" },
            { label: "RINSE varighed", entity: "input_number.pool_rinse_minutter" },
          ],
        },
        {
          title: "Indsigt & sikkerhed",
          icon: "mdi:chart-box-outline",
          rows: [
            { label: "Forecast-nøjagtighed", entity: "sensor.pool_forecast_nojagtighed" },
            { label: "Filtreringsmål i dag", entity: "sensor.pool_filterfremdrift" },
            { label: "Coverkontrol kl. 22", entity: "sensor.pool_aftenkontrol" },
            { label: "Kulde-, strøm- og sensorkontrol", entity: "sensor.pool_vinterbeskyttelse" },
          ],
        },
      ],
    };
  }

  setConfig(config) {
    const stub = HAPoolSettingsCard.getStubConfig();
    this._config = { ...stub, ...config };
    this._render();
  }

  _watchedIds() {
    return (this._config.sections || []).flatMap((s) => [
      ...(s.rows || []).map((r) => r.entity),
      s.danger_action?.entity,
    ]).filter(Boolean);
  }

  set hass(hass) {
    this._hass = hass;
    const ids = this._watchedIds();
    const sig = JSON.stringify(ids.map((id) => [id, hass?.states?.[id]?.state]));
    if (sig !== this._sig) {
      this._sig = sig;
      this._render();
    }
  }

  _s(id) {
    return id ? this._hass?.states?.[id] : undefined;
  }
  _domain(id) {
    return id ? id.split(".")[0] : "";
  }
  _esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  _more(id) {
    if (!id) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: id }, bubbles: true, composed: true }));
  }
  _call(service, entityId, data) {
    if (!this._hass || !entityId) return;
    const [domain, svc] = service.split(".");
    this._hass.callService(domain, svc, { entity_id: entityId, ...(data || {}) });
  }
  _confirmed(text) {
    return !text || window.confirm(text);
  }
  _fmtDate(raw) {
    const d = new Date(String(raw).replace(" ", "T"));
    if (Number.isNaN(d.getTime())) return this._esc(raw);
    if (d.getFullYear() <= NEVER_YEAR) return "Aldrig";
    return d.toLocaleString("da-DK", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  _rowControl(entity) {
    const s = this._s(entity);
    if (!s) return { control: `<span class="row-value muted">Ukendt</span>`, readonly: true };
    const domain = this._domain(entity);

    if (domain === "input_boolean") {
      const on = s.state === "on";
      return { control: `<button class="switch ${on ? "on" : ""}" data-toggle="${this._esc(entity)}"><i></i></button>`, readonly: false };
    }
    if (domain === "input_select") {
      const options = s.attributes?.options || [];
      return {
        control: `<select class="select" data-select="${this._esc(entity)}">${options
          .map((o) => `<option value="${this._esc(o)}" ${o === s.state ? "selected" : ""}>${this._esc(o)}</option>`)
          .join("")}</select>`,
        readonly: false,
      };
    }
    if (domain === "input_number") {
      const min = Number(s.attributes?.min ?? 0);
      const max = Number(s.attributes?.max ?? 100);
      const step = Number(s.attributes?.step ?? 1);
      const unit = s.attributes?.unit_of_measurement || "";
      const value = Number(s.state);
      return {
        control: `<div class="stepper">
          <button data-step="${this._esc(entity)}" data-delta="${-step}" data-min="${min}" data-max="${max}">−</button>
          <span>${Number.isFinite(value) ? value : "--"}${unit ? ` ${this._esc(unit)}` : ""}</span>
          <button data-step="${this._esc(entity)}" data-delta="${step}" data-min="${min}" data-max="${max}">+</button>
        </div>`,
        readonly: false,
      };
    }
    if (domain === "input_button") {
      return { control: `<button class="run-btn" data-press="${this._esc(entity)}"><ha-icon icon="mdi:play"></ha-icon>Kør</button>`, readonly: false };
    }
    if (domain === "timer") {
      const active = s.state === "active";
      return { control: `<span class="row-value ${active ? "accent" : "muted"}">${active ? "Aktiv" : "Inaktiv"}</span>`, readonly: true };
    }
    if (domain === "input_datetime") {
      return { control: `<span class="row-value muted">${this._fmtDate(s.state)}</span>`, readonly: true };
    }
    if (domain === "binary_sensor") {
      const on = s.state === "on";
      return { control: `<span class="row-value ${on ? "accent" : "muted"}">${on ? "Ja" : "Nej"}</span>`, readonly: true };
    }
    // plain sensor
    const val = s.state;
    const looksLikeDate = /^\d{4}-\d{2}-\d{2}/.test(String(val));
    return { control: `<span class="row-value muted">${looksLikeDate ? this._fmtDate(val) : this._esc(val)}${s.attributes?.unit_of_measurement ? ` ${this._esc(s.attributes.unit_of_measurement)}` : ""}</span>`, readonly: true };
  }

  _rowHtml(row) {
    const { control, readonly } = this._rowControl(row.entity);
    return `<div class="row ${readonly ? "" : "interactive"}" ${readonly ? `data-more="${this._esc(row.entity)}"` : ""}>
      <span class="row-label">${this._esc(row.label)}</span>
      ${control}
    </div>`;
  }

  _sectionBodyHtml(section) {
    const danger = section.danger_action
      ? `<button class="danger-btn" data-danger="1" data-entity="${this._esc(section.danger_action.entity)}" data-service="${this._esc(section.danger_action.service)}" data-payload='${this._esc(JSON.stringify(section.danger_action.data || {}))}' data-confirm="${this._esc(section.danger_action.confirm || "")}">
          <ha-icon icon="${section.danger_action.icon}"></ha-icon>
          <div><b>${this._esc(section.danger_action.label)}</b><small>${this._esc(section.danger_action.desc || "")}</small></div>
        </button>`
      : "";
    return `${danger}<div class="row-list">${(section.rows || []).map((r) => this._rowHtml(r)).join("")}</div>`;
  }

  _render() {
    if (!this.shadowRoot) return;
    const c = this._config;
    const sections = c.sections || [];
    const active = sections[this._tab] || sections[0];

    this.shadowRoot.innerHTML = `<style>
      :host{display:block;--good:var(--dashboard-success, var(--success-color, #20e3a2));--warn:var(--dashboard-warning, var(--warning-color, #f59e0b));--danger:var(--dashboard-danger, var(--error-color, #ef4444));--accent:#0891b2;--teal:#14b8a6;--edge:var(--dashboard-border-neutral, var(--divider-color, rgba(127,145,165,.2)));--muted:var(--dashboard-icon-muted, var(--disabled-text-color, #64748b))}
      *{box-sizing:border-box}
      ha-card{padding:20px;border-radius:22px;background:var(--ha-card-background,var(--card-background-color));border:var(--ha-card-border-width,1px) solid var(--ha-card-border-color,var(--edge));color:var(--primary-text-color);box-shadow:var(--ha-card-box-shadow)}
      .head{display:flex;align-items:center;gap:12px;margin-bottom:16px}
      .head ha-icon{--mdc-icon-size:24px;color:var(--accent)}
      .head strong{display:block;font-size:16px}
      .head span{display:block;color:var(--secondary-text-color);font-size:12px;margin-top:2px}
      .tabs{display:flex;gap:6px;margin-bottom:16px;overflow-x:auto;padding-bottom:2px}
      .tab{flex:0 0 auto;display:flex;align-items:center;gap:6px;padding:9px 12px;border-radius:11px;border:1px solid var(--edge);background:transparent;color:var(--secondary-text-color);font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap}
      .tab ha-icon{--mdc-icon-size:15px}
      .tab.active{color:#fff;background:var(--accent);border-color:var(--accent)}
      .danger-btn{display:flex;align-items:center;gap:10px;width:100%;margin-bottom:12px;padding:12px 14px;border-radius:14px;border:1px solid color-mix(in srgb,var(--danger) 35%,var(--edge));background:color-mix(in srgb,var(--danger) 8%,transparent);color:var(--primary-text-color);cursor:pointer;text-align:left}
      .danger-btn ha-icon{--mdc-icon-size:20px;color:var(--danger);flex:0 0 auto}
      .danger-btn b{display:block;font-size:12.5px}
      .danger-btn small{display:block;margin-top:2px;font-size:10.5px;color:var(--secondary-text-color)}
      .row-list{display:flex;flex-direction:column;gap:8px}
      .row{position:relative;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 13px;border:1px solid color-mix(in srgb,var(--accent) 16%,transparent);border-left:3px solid var(--accent);border-radius:12px;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 6%,transparent),transparent 60%),var(--ha-card-background,var(--card-background-color));box-shadow:0 4px 12px rgba(0,0,0,.1)}
      .row.interactive{cursor:pointer}
      .row-label{font-size:12.5px;color:var(--primary-text-color);min-width:0;flex:1}
      .row-value{font-size:12px;font-weight:700;text-align:right;color:var(--primary-text-color)}
      .row-value.muted{color:var(--secondary-text-color);font-weight:600}
      .row-value.accent{color:var(--accent)}
      .switch{flex:0 0 auto;width:42px;height:24px;border-radius:999px;border:none;background:color-mix(in srgb,var(--secondary-text-color) 25%,transparent);cursor:pointer;position:relative;padding:0}
      .switch i{position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .18s ease;display:block}
      .switch.on{background:var(--teal)}
      .switch.on i{transform:translateX(18px)}
      .select{flex:0 0 auto;max-width:55%;padding:6px 8px;border-radius:9px;border:1px solid var(--edge);background:var(--card-background-color);color:var(--primary-text-color);font-size:11.5px;font-weight:700}
      .stepper{flex:0 0 auto;display:flex;align-items:center;gap:8px}
      .stepper button{width:26px;height:26px;border-radius:8px;border:1px solid var(--edge);background:color-mix(in srgb,var(--accent) 10%,transparent);color:var(--accent);font-size:15px;font-weight:900;cursor:pointer;line-height:1}
      .stepper span{min-width:56px;text-align:center;font-size:12px;font-weight:800}
      .run-btn{flex:0 0 auto;display:flex;align-items:center;gap:5px;padding:6px 12px;border-radius:999px;border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent);font-size:11px;font-weight:800;cursor:pointer}
      .run-btn ha-icon{--mdc-icon-size:14px}
      .back-btn{display:flex;align-items:center;gap:10px;width:100%;margin-top:18px;padding:13px 14px;border-radius:15px;border:1px solid var(--edge);background:transparent;color:var(--primary-text-color);cursor:pointer;text-align:left}
      .back-btn ha-icon{--mdc-icon-size:20px;color:var(--accent)}
    </style>
    <ha-card>
      <div class="head">
        <ha-icon icon="mdi:tune-variant"></ha-icon>
        <div><strong>${this._esc(c.title)}</strong><span>${this._esc(c.subtitle)}</span></div>
      </div>
      <div class="tabs">${sections
        .map((s, i) => `<button class="tab ${i === this._tab ? "active" : ""}" data-tab="${i}"><ha-icon icon="${s.icon}"></ha-icon>${this._esc(s.title)}</button>`)
        .join("")}</div>

      ${active ? this._sectionBodyHtml(active) : ""}

      <button class="back-btn" data-nav="${this._esc(c.back_path)}">
        <ha-icon icon="mdi:arrow-left"></ha-icon>
        <div><b>Tilbage til Pool</b></div>
      </button>
    </ha-card>`;

    this.shadowRoot.querySelectorAll("[data-tab]").forEach((el) =>
      el.addEventListener("click", () => {
        this._tab = Number(el.dataset.tab);
        this._render();
      }),
    );
    this.shadowRoot.querySelectorAll("[data-more]").forEach((el) => el.addEventListener("click", () => this._more(el.dataset.more)));
    this.shadowRoot.querySelectorAll("[data-nav]").forEach((el) =>
      el.addEventListener("click", () => {
        history.pushState(null, "", el.dataset.nav);
        window.dispatchEvent(new Event("location-changed"));
      }),
    );
    this.shadowRoot.querySelectorAll("[data-toggle]").forEach((el) =>
      el.addEventListener("click", () => this._call("input_boolean.toggle", el.dataset.toggle)),
    );
    this.shadowRoot.querySelectorAll("[data-select]").forEach((el) =>
      el.addEventListener("change", () => this._call("input_select.select_option", el.dataset.select, { option: el.value })),
    );
    this.shadowRoot.querySelectorAll("[data-press]").forEach((el) =>
      el.addEventListener("click", () => this._call("input_button.press", el.dataset.press)),
    );
    this.shadowRoot.querySelectorAll("[data-step]").forEach((el) =>
      el.addEventListener("click", () => {
        const entity = el.dataset.step;
        const delta = Number(el.dataset.delta);
        const min = Number(el.dataset.min);
        const max = Number(el.dataset.max);
        const current = Number(this._s(entity)?.state) || 0;
        const next = Math.min(max, Math.max(min, current + delta));
        this._call("input_number.set_value", entity, { value: next });
      }),
    );
    this.shadowRoot.querySelector("[data-danger]")?.addEventListener("click", (e) => {
      const el = e.currentTarget;
      if (!this._confirmed(el.dataset.confirm)) return;
      let payload = {};
      try {
        payload = JSON.parse(el.dataset.payload || "{}");
      } catch {
        payload = {};
      }
      this._call(el.dataset.service, el.dataset.entity, payload);
    });
  }

  getCardSize() {
    return 22;
  }
}

if (!customElements.get("ha-pool-settings-card")) customElements.define("ha-pool-settings-card", HAPoolSettingsCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha-pool-settings-card",
  name: "HA Pool Settings Card",
  description: "Samlet pool-indstillinger i faner: sandfiltertider, automatik, komfort, vedligeholdelse og indsigt",
  preview: true,
});
console.info(
  `%c HA POOL SETTINGS CARD %c v${VERSION} `,
  "color:#fff;background:#0891b2;font-weight:700",
  "color:#0891b2;background:#161b22",
);
