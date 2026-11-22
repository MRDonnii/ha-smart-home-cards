import "./ha-card-list-editor.js";
const VERSION = "0.4.1";

class HAAIUsageCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._signature = "";
  }

  static getStubConfig() {
    return { title: "AI-forbrug", accounts: [] };
  }
  static getConfigElement() {
    const editor = document.createElement("ha-card-list-editor");
    editor.definition = { roots: [{ key: "title", label: "Titel" }, { key: "subtitle", label: "Undertitel" }, { key: "animation", label: "Animation", type: "boolean" }], collections: [{ key: "accounts", label: "AI-konti", itemLabel: "konto", defaults: { name: "Ny konto" }, fields: [{ key: "name", label: "Navn" }, { key: "provider", label: "Udbyder" }, { key: "icon", label: "Ikon" }, { key: "connected", label: "Forbundet", type: "entity" }, { key: "limit_reached", label: "Grænse nået", type: "entity" }, { key: "plan", label: "Plan", type: "entity" }, { key: "session_remaining", label: "5 timer tilbage", type: "entity" }, { key: "session_reset", label: "5 timer nulstilling", type: "entity" }, { key: "weekly_remaining", label: "Uge tilbage", type: "entity" }, { key: "weekly_reset", label: "Uge nulstilling", type: "entity" }, { key: "last_update", label: "Senest opdateret", type: "entity" }, { key: "credits", label: "Credits", type: "entity" }, { key: "extra_spent", label: "Ekstraforbrug", type: "entity" }, { key: "refresh", label: "Opdatér-knap", type: "entity" }, { key: "session_unit", label: "5t enhed (tom=%)" }, { key: "weekly_unit", label: "Uge enhed (tom=%)" }, { key: "session_max", label: "5t maks (til ring)" }, { key: "weekly_max", label: "Uge maks (til ring)" }, { key: "session_label", label: "5t etiket (tom=5 timer)" }, { key: "weekly_label", label: "Uge etiket (tom=Uge)" }, { key: "hide_session", label: "Skjul 5t-vindue", type: "boolean" }, { key: "hide_weekly", label: "Skjul Uge-vindue", type: "boolean" }, { key: "credits_unit", label: "Credits enhed (tom=credits)" }] }] };
    return editor;
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.accounts)) throw new Error("AI-forbrugskortet kræver en accounts-liste");
    this._config = { title: "AI-forbrug", subtitle: "Kvoter og kapacitet samlet ét sted", animation: true, ...config };
    this._signature = "";
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const ids = (this._config.accounts || []).flatMap((account) => Object.values(account)).filter((value) => typeof value === "string" && value.includes("."));
    const signature = JSON.stringify(ids.map((id) => {
      const entity = hass?.states?.[id];
      return [id, entity?.state, entity?.last_updated];
    }));
    if (signature === this._signature) return;
    this._signature = signature;
    this._render();
  }

  getCardSize() { return 6; }
  getGridOptions() { return { rows: "auto", columns: 12, min_columns: 6 }; }

  _entity(id) { return id ? this._hass?.states?.[id] : undefined; }
  _escape(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
  _number(id) {
    const value = Number(this._entity(id)?.state);
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : undefined;
  }
  _raw(id) {
    const value = Number(this._entity(id)?.state);
    return Number.isFinite(value) ? value : undefined;
  }
  _unitLabel(unit) {
    if (!unit) return "%";
    return String(unit);
  }
  _unitDigits(unit) {
    if (unit === "USD") return 3;
    if (unit === "requests") return 0;
    return 0;
  }
  _unitValueOf(account, key, unitKey) {
    const unit = account[unitKey];
    if (!unit) return this._number(account[key]);
    return this._raw(account[key]);
  }
  _unitMaxOf(account, key, unitKey, maxKey) {
    const unit = account[unitKey];
    if (!unit) return undefined;
    const max = Number(account[maxKey]);
    return Number.isFinite(max) && max > 0 ? max : undefined;
  }
  _state(id) { return this._entity(id)?.state; }
  _on(id) { return this._state(id) === "on"; }
  _format(value, digits = 0) {
    if (value === undefined) return "—";
    const language = this._hass?.locale?.language || this._hass?.language || "da";
    return value.toLocaleString(language, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  _relative(id) {
    const state = this._state(id);
    if (!state || ["unknown", "unavailable"].includes(state)) return "Ingen nulstillingstid";
    const difference = new Date(state).getTime() - Date.now();
    if (!Number.isFinite(difference) || difference <= 0) return "Nulstiller snart";
    const minutes = Math.ceil(difference / 60000);
    if (minutes < 60) return `Om ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours < 24) return `Om ${hours} t${rest ? ` ${rest} min` : ""}`;
    const days = Math.floor(hours / 24);
    return `Om ${days} d ${hours % 24} t`;
  }
  _age(id) {
    const state = this._state(id);
    if (!state || ["unknown", "unavailable"].includes(state)) return "Ukendt";
    const minutes = Math.max(0, Math.round((Date.now() - new Date(state).getTime()) / 60000));
    if (!Number.isFinite(minutes)) return "Ukendt";
    if (minutes < 1) return "Lige nu";
    if (minutes < 60) return `${minutes} min siden`;
    return `${Math.floor(minutes / 60)} t siden`;
  }
  _tone(remaining, connected, reached, unit, max) {
    if (!connected || reached) return "danger";
    if (remaining === undefined) return "muted";
    if (!unit) {
      if (remaining <= 10) return "danger";
      if (remaining <= 30) return "warning";
      return "good";
    }
    if (max !== undefined) {
      const ratio = remaining / max;
      if (ratio >= 0.9) return "danger";
      if (ratio >= 0.6) return "warning";
      return "good";
    }
    return "good";
  }
  _account(account, index) {
    const connected = this._on(account.connected);
    const reached = this._on(account.limit_reached);
    const sUnit = account.session_unit;
    const wUnit = account.weekly_unit;
    const session = this._unitValueOf(account, "session_remaining", "session_unit");
    const weekly = this._unitValueOf(account, "weekly_remaining", "weekly_unit");
    const sMax = this._unitMaxOf(account, "session_remaining", "session_unit", "session_max");
    const wMax = this._unitMaxOf(account, "weekly_remaining", "weekly_unit", "weekly_max");
    const sTone = account.hide_session ? "muted" : this._tone(session, connected, reached, sUnit, sMax);
    const wTone = account.hide_weekly ? "muted" : this._tone(weekly, connected, reached, wUnit, wMax);
    const lowest = !sUnit && !wUnit && !account.hide_session && !account.hide_weekly ? Math.min(session ?? 100, weekly ?? 100) : undefined;
    const tone = lowest !== undefined ? this._tone(lowest, connected, reached) : (sTone === "danger" || wTone === "danger" ? "danger" : sTone === "warning" || wTone === "warning" ? "warning" : connected ? "good" : "muted");
    const plan = this._state(account.plan);
    const credit = this._state(account.credits);
    const extra = this._state(account.extra_spent);
    const creditUnit = account.credits_unit || "credits";
    const creditValue = account.credits_unit && !["unknown", "unavailable"].includes(credit) ? this._format(Number(credit), 2) : credit;
    const secondary = extra && !["unknown", "unavailable"].includes(extra) ? `${extra} EUR ekstra` : credit && !["unknown", "unavailable"].includes(credit) ? `${creditValue} ${creditUnit}` : "Ingen ekstraforbrug";
    return `<article class="account ${tone}" style="--delay:${index * 70}ms">
      <div class="account-head">
        <div class="identity"><span class="service-icon"><ha-icon icon="${this._escape(account.icon || "mdi:robot-outline")}"></ha-icon></span><div><h3>${this._escape(account.name)}</h3><span>${this._escape(account.provider || "AI-tjeneste")}</span></div></div>
        <span class="connection"><i></i>${connected ? "Forbundet" : "Afbrudt"}</span>
      </div>
      <div class="plan-row"><span>Plan</span><strong>${this._escape(plan && !["unknown", "unavailable"].includes(plan) ? plan : "Ukendt")}</strong><span class="capacity ${tone}">${reached ? "Grænse nået" : lowest !== undefined ? `${this._format(lowest)}% laveste reserve` : !account.hide_session && !sUnit ? `${this._format(session)}% tilbage` : !account.hide_session && sUnit ? `${this._format(session, this._unitDigits(sUnit))} ${sUnit}` : !account.hide_weekly && wUnit ? `${this._format(weekly, this._unitDigits(wUnit))} ${wUnit}` : "Aktiv"}</span></div>
      <div class="windows">
        ${account.hide_session ? "" : this._window(account.session_label || "5 timer", "mdi:clock-fast", session, this._relative(account.session_reset), sTone, sUnit, sMax)}
        ${account.hide_weekly ? "" : this._window(account.weekly_label || "Uge", "mdi:calendar-week", weekly, this._relative(account.weekly_reset), wTone, wUnit, wMax)}
      </div>
      <div class="account-foot"><div><span>Senest opdateret</span><strong>${this._age(account.last_update)}</strong></div><div><span>Ekstra kapacitet</span><strong>${this._escape(secondary)}</strong></div><button data-refresh="${this._escape(account.refresh)}" aria-label="Genopfrisk ${this._escape(account.name)}"><ha-icon icon="mdi:refresh"></ha-icon><span>Opdatér</span></button></div>
    </article>`;
  }
  _window(label, icon, remaining, reset, tone, unit, max) {
    const unitLabel = this._unitLabel(unit);
    const digits = this._unitDigits(unit);
    let value;
    if (!unit) {
      value = remaining ?? 0;
    } else if (max !== undefined && max > 0) {
      value = Math.max(0, Math.min(100, (remaining / max) * 100));
    } else {
      value = remaining !== undefined ? Math.min(100, Math.log10(Math.max(1, remaining)) * 33) : 0;
    }
    const display = unit ? `${this._format(remaining, digits)}` : this._format(remaining);
    return `<div class="window ${tone}" style="--value:${value}">
      <div class="ring"><svg viewBox="0 0 44 44"><circle class="track" cx="22" cy="22" r="18"></circle><circle class="progress" cx="22" cy="22" r="18"></circle></svg><strong>${display}<small>${unitLabel}</small></strong></div>
      <div class="window-copy"><span><ha-icon icon="${icon}"></ha-icon>${label}${unit ? "" : " tilbage"}</span><strong>${reset}</strong><div class="bar"><i></i></div></div>
    </div>`;
  }

  async _refresh(entityId, button) {
    if (!entityId || !this._hass) return;
    button.classList.add("loading");
    try { await this._hass.callService("button", "press", { entity_id: entityId }); }
    catch (error) { console.warn("HA AI Usage Card refresh failed", error); }
    finally { setTimeout(() => button.classList.remove("loading"), 700); }
  }

  _render() {
    const accounts = this._config.accounts || [];
    const states = accounts.map((account) => {
      const connected = this._on(account.connected);
      const reached = this._on(account.limit_reached);
      const sUnit = account.session_unit;
      const wUnit = account.weekly_unit;
      const session = this._unitValueOf(account, "session_remaining", "session_unit");
      const weekly = this._unitValueOf(account, "weekly_remaining", "weekly_unit");
      const sMax = this._unitMaxOf(account, "session_remaining", "session_unit", "session_max");
      const wMax = this._unitMaxOf(account, "weekly_remaining", "weekly_unit", "weekly_max");
      const sTone = account.hide_session ? "muted" : this._tone(session, connected, reached, sUnit, sMax);
      const wTone = account.hide_weekly ? "muted" : this._tone(weekly, connected, reached, wUnit, wMax);
      const lowest = !sUnit && !wUnit && !account.hide_session && !account.hide_weekly ? Math.min(session ?? 100, weekly ?? 100) : undefined;
      const tone = lowest !== undefined ? this._tone(lowest, connected, reached) : (sTone === "danger" || wTone === "danger" ? "danger" : sTone === "warning" || wTone === "warning" ? "warning" : connected ? "good" : "muted");
      return { connected, reached, lowest: lowest ?? 100, tone };
    });
    const online = states.filter((state) => state.connected).length;
    const warnings = states.filter((state) => state.reached || state.lowest <= 30).length;
    const reserve = states.length ? Math.min(...states.map((state) => state.lowest)) : 0;
    const globalTone = states.some((state) => state.reached || !state.connected) ? "danger" : warnings ? "warning" : "good";
    const noAnimation = this._config.animation === false ? "no-animation" : "";
    this.shadowRoot.innerHTML = `<style>
      :host{display:block;--good:var(--dashboard-success, var(--success-color, #54d9aa));--warning:var(--dashboard-warning, var(--warning-color, #ffbd59));--danger:var(--dashboard-danger, var(--error-color, #ff667a));--muted:var(--dashboard-icon-muted, var(--disabled-text-color, #8390a2));--accent:var(--dashboard-accent, var(--primary-color, #62b5ff));--edge:var(--dashboard-border-neutral, var(--divider-color, rgba(255,255,255,.11)))}*{box-sizing:border-box}ha-card{overflow:hidden;border-radius:26px;background:linear-gradient(145deg,color-mix(in srgb,var(--surface,var(--ha-card-background)) 96%,var(--accent) 4%),var(--surface,var(--ha-card-background)));color:var(--primary-text-color);box-shadow:var(--ha-card-box-shadow)}.shell{position:relative;padding:24px;isolation:isolate}.ambient{position:absolute;inset:-20%;z-index:-1;pointer-events:none;background:radial-gradient(circle at 8% 0,color-mix(in srgb,var(--accent) 15%,transparent),transparent 25%),radial-gradient(circle at 95% 8%,color-mix(in srgb,var(--good) 11%,transparent),transparent 28%)}
      header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:18px}.eyebrow{display:flex;align-items:center;gap:8px;color:var(--accent);font-size:10px;font-weight:800;letter-spacing:.17em;text-transform:uppercase}.eyebrow i{width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 12px currentColor;animation:pulse 2.4s ease-in-out infinite}h2{margin:6px 0 3px;font-size:clamp(24px,3vw,34px);letter-spacing:-.045em}.subtitle{color:var(--secondary-text-color);font-size:12px}.overview{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.overview>div{min-width:92px;padding:10px 13px;border:1px solid color-mix(in srgb,var(--accent) 16%,transparent);border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--accent);border-radius:14px;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 7%,transparent),transparent 55%),color-mix(in srgb,var(--surface,var(--ha-card-background)) 88%,transparent);box-shadow:0 4px 12px rgba(0,0,0,.1)}.overview span{display:block;color:var(--secondary-text-color);font-size:8px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.overview strong{display:block;margin-top:3px;font-size:17px}.overview .${globalTone} strong{color:var(--${globalTone})}
      .accounts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr));gap:12px}.account{--tone:var(--muted);position:relative;min-width:0;padding:16px;border:1px solid color-mix(in srgb,var(--tone) 28%,var(--edge));border-left:calc(var(--dashboard-left-accent-width, 1) * 4px) solid var(--tone);border-radius:20px;background:linear-gradient(150deg,color-mix(in srgb,var(--tone) 7%,transparent),rgba(0,0,0,.045));box-shadow:0 10px 28px rgba(0,0,0,.09);animation:cardIn .35s both;animation-delay:var(--delay)}.account.good,.window.good{--tone:var(--good)}.account.warning,.window.warning{--tone:var(--warning)}.account.danger,.window.danger{--tone:var(--danger)}.account.muted,.window.muted{--tone:var(--muted)}.account-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.identity{display:flex;align-items:center;min-width:0;gap:10px}.service-icon{display:grid;place-items:center;flex:0 0 42px;width:42px;height:42px;border:1px solid color-mix(in srgb,var(--tone) 36%,transparent);border-radius:13px;background:color-mix(in srgb,var(--tone) 13%,transparent);color:var(--tone)}.service-icon ha-icon{width:23px;height:23px;--mdc-icon-size:23px}.identity h3{overflow:hidden;margin:0;font-size:16px;text-overflow:ellipsis;white-space:nowrap}.identity div>span{display:block;margin-top:3px;color:var(--secondary-text-color);font-size:9px}.connection{display:flex;align-items:center;gap:6px;color:var(--tone);font-size:9px;font-weight:800;text-transform:uppercase}.connection i{width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 9px currentColor}.plan-row{display:grid;grid-template-columns:auto auto 1fr;align-items:center;gap:6px;margin:14px 0 11px;padding:9px 10px;border:1px solid color-mix(in srgb,var(--tone) 18%,var(--edge));border-radius:11px;background:rgba(0,0,0,.045);font-size:9px}.plan-row>span:first-child{color:var(--secondary-text-color);text-transform:uppercase}.plan-row>strong{text-transform:capitalize}.capacity{justify-self:end;color:var(--tone);font-weight:800}
      .windows{display:grid;gap:8px}.window{--tone:var(--muted);display:grid;grid-template-columns:58px 1fr;align-items:center;gap:11px;padding:10px;border:1px solid color-mix(in srgb,var(--tone) 20%,var(--edge));border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--tone);border-radius:13px;background:rgba(0,0,0,.035)}.ring{position:relative;width:52px;height:52px}.ring svg{display:block;width:100%;height:100%;transform:rotate(-90deg)}.ring circle{fill:none;stroke-width:4}.ring .track{stroke:color-mix(in srgb,var(--secondary-text-color) 18%,transparent)}.ring .progress{stroke:var(--tone);stroke-linecap:round;stroke-dasharray:113.1;stroke-dashoffset:calc(113.1 - 1.131 * var(--value));filter:drop-shadow(0 0 4px color-mix(in srgb,var(--tone) 55%,transparent));transition:stroke-dashoffset .8s ease}.ring>strong{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:1px;padding-top:1px;font-size:14px;line-height:1;text-align:center}.ring small{align-self:center;margin:2px 0 0;font-size:7px;line-height:1}.window-copy{min-width:0}.window-copy>span{display:flex;align-items:center;gap:5px;color:var(--secondary-text-color);font-size:8px;font-weight:800;text-transform:uppercase}.window-copy ha-icon{width:14px;height:14px;--mdc-icon-size:14px;color:var(--tone)}.window-copy>strong{display:block;margin:4px 0 7px;font-size:10px}.bar{height:4px;overflow:hidden;border-radius:5px;background:color-mix(in srgb,var(--secondary-text-color) 16%,transparent)}.bar i{display:block;width:calc(var(--value) * 1%);height:100%;border-radius:inherit;background:linear-gradient(90deg,color-mix(in srgb,var(--tone) 60%,var(--accent)),var(--tone));box-shadow:0 0 7px var(--tone);transition:width .8s ease}
      .account-foot{display:grid;grid-template-columns:1fr 1fr auto;align-items:center;gap:8px;margin-top:11px}.account-foot>div{min-width:0}.account-foot span{display:block;color:var(--secondary-text-color);font-size:7px;text-transform:uppercase}.account-foot strong{display:block;overflow:hidden;margin-top:3px;font-size:9px;text-overflow:ellipsis;white-space:nowrap}.account-foot button{display:flex;align-items:center;gap:5px;min-height:36px;padding:0 10px;border:1px solid color-mix(in srgb,var(--tone) 32%,var(--edge));border-radius:10px;background:color-mix(in srgb,var(--tone) 9%,transparent);color:var(--tone);font:inherit;font-size:9px;font-weight:800;cursor:pointer}.account-foot button:hover{background:color-mix(in srgb,var(--tone) 16%,transparent)}.account-foot button ha-icon{width:16px;height:16px;--mdc-icon-size:16px}.account-foot button.loading ha-icon{animation:spin .7s linear infinite}.no-animation *{animation:none!important;transition:none!important}
      @keyframes pulse{50%{opacity:.45;transform:scale(1.4)}}@keyframes cardIn{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}@keyframes spin{to{transform:rotate(360deg)}}@media(min-width:1001px){.accounts{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:720px){.shell{padding:15px}header{display:block}.overview{justify-content:flex-start;margin-top:13px}.overview>div{flex:1}.account-foot{grid-template-columns:1fr 1fr}.account-foot button{grid-column:1/-1;justify-content:center}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
    </style><ha-card class="${noAnimation}"><div class="shell"><div class="ambient"></div><header><div><div class="eyebrow"><i></i>Kapacitetsmonitor</div><h2>${this._escape(this._config.title)}</h2><div class="subtitle">${this._escape(this._config.subtitle)}</div></div><div class="overview"><div><span>Forbundet</span><strong>${online} / ${accounts.length}</strong></div><div class="${globalTone}"><span>Laveste reserve</span><strong>${this._format(reserve)}%</strong></div><div class="${warnings ? "warning" : "good"}"><span>Kræver fokus</span><strong>${warnings}</strong></div></div></header><div class="accounts">${accounts.map((account, index) => this._account(account, index)).join("")}</div></div></ha-card>`;
    this.shadowRoot.querySelectorAll("[data-refresh]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); this._refresh(button.dataset.refresh, button); }));
  }
}

if (!customElements.get("ha-ai-usage-card")) customElements.define("ha-ai-usage-card", HAAIUsageCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "ha-ai-usage-card", name: "HA AI Usage Card", description: "Samlet og animeret overblik over AI-forbrugsgrænser", preview: true });
console.info(`%c HA AI USAGE CARD %c v${VERSION} `, "color:white;background:#357fc4;font-weight:700", "color:#69c4ff;background:#161b22");
