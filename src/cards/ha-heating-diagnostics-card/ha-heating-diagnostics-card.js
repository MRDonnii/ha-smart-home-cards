import "./ha-card-list-editor.js";
const VERSION = "0.4.3";

class HAHeatingDiagnosticsCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._signature = "";
  }

  static getStubConfig() { return { title: "Varmeoptimering", rooms: [] }; }
  static getConfigElement(){const e=document.createElement("ha-card-list-editor");e.definition={roots:[{key:"title",label:"Titel"},{key:"animation",label:"Animation",type:"boolean"},{key:"learning_hours",label:"Læringstimer",type:"entity"},{key:"total_demand",label:"Samlet varmebehov",type:"entity"},{key:"data_problem",label:"Dataproblem",type:"entity"}],collections:[{key:"rooms",label:"Rumdiagnose",itemLabel:"rum",defaults:{name:"Nyt rum",icon:"mdi:radiator"},fields:[{key:"name",label:"Navn"},{key:"icon",label:"Ikon"},{key:"climate",label:"Termostat",type:"entity"},{key:"valve",label:"Ventil",type:"entity"},{key:"output",label:"Output",type:"entity"},{key:"hours",label:"Læringstimer",type:"entity"},{key:"loss",label:"Varmetab",type:"entity"},{key:"heating_power",label:"Varmeeffekt",type:"entity"},{key:"utilisation",label:"Udnyttelse",type:"entity"},{key:"cost",label:"Pris",type:"entity"},{key:"share",label:"Varmeandel",type:"entity"},{key:"rated",label:"Radiatorstørrelse",type:"entity"},{key:"area",label:"Rumareal",type:"entity"},{key:"demand_status",label:"Behovsstatus",type:"entity"},{key:"stressed",label:"Belastning",type:"entity"}]}]};return e;}

  setConfig(config) {
    if (!config || !Array.isArray(config.rooms)) throw new Error("Varmeoptimering kræver en rooms-liste");
    this._config = { title: "Varmeoptimering", animation: true, learning_hours: 48, ...config };
    this._signature = "";
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const ids = [this._config.total_demand, this._config.data_problem];
    for (const room of this._config.rooms || []) ids.push(...Object.values(room));
    const signature = JSON.stringify(ids.filter((id) => typeof id === "string" && id.includes(".")).map((id) => {
      const entity = hass?.states?.[id];
      return [id, entity?.state, entity?.attributes?.current_temperature, entity?.attributes?.temperature,
        entity?.attributes?.hvac_action, entity?.attributes?.baseline_learning_hours,
        entity?.attributes?.baseline_ready, entity?.attributes?.deviation_percent];
    }));
    if (signature === this._signature) return;
    this._signature = signature;
    this._render();
  }

  getCardSize() { return this._config.compact ? 13 : 14; }
  getGridOptions() { return { rows: "auto", columns: 12, min_columns: 6 }; }

  _entity(id) {
    const entity = id ? this._hass?.states?.[id] : undefined;
    return entity && !["unknown", "unavailable", ""].includes(entity.state) ? entity : undefined;
  }

  _number(id, attribute) {
    const entity = this._entity(id);
    const value = attribute ? entity?.attributes?.[attribute] : entity?.state;
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }

  _format(value, digits = 0) {
    if (value === undefined) return "—";
    const language = this._hass?.locale?.language || this._hass?.language || "da";
    return value.toLocaleString(language, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  _escape(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  _state(room) {
    const climate = this._entity(room.climate);
    const demand = this._entity(room.demand_status);
    const current = Number.isFinite(Number(climate?.attributes?.current_temperature)) ? Number(climate.attributes.current_temperature) : undefined;
    const target = Number.isFinite(Number(climate?.attributes?.temperature)) ? Number(climate.attributes.temperature) : undefined;
    const delta = current !== undefined && target !== undefined ? current - target : undefined;
    const valve = this._number(room.valve);
    const output = this._number(room.output);
    const utilisation = this._number(room.utilisation);
    const loss = this._number(room.loss);
    const heatingPower = this._number(room.heating_power);
    const hours = this._number(room.hours);
    const cost = this._number(room.cost);
    const share = this._number(room.share);
    const rated = this._number(room.rated);
    const area = this._number(room.area);
    const stressed = this._entity(room.stressed)?.state === "on";
    const demandStatus = String(demand?.state || "unknown").toLowerCase();
    const learningHours = Number.isFinite(Number(demand?.attributes?.baseline_learning_hours)) ? Number(demand.attributes.baseline_learning_hours) : 0;
    const baselineReady = demand?.attributes?.baseline_ready === true;
    const deviationRaw = demand?.attributes?.deviation_percent;
    const deviation = deviationRaw !== null && deviationRaw !== undefined && Number.isFinite(Number(deviationRaw)) ? Number(deviationRaw) : undefined;
    const open = climate?.attributes?.window_open === true || climate?.attributes?.door_open === true;
    const noData = [valve, output, utilisation, loss].some((value) => value === undefined) || !climate || !demand;
    const coldUnderLoad = delta !== undefined && delta < -0.7 && valve !== undefined && valve >= 65;
    const notResponding = heatingPower !== undefined && loss !== undefined && valve !== undefined && valve >= 65 && heatingPower <= loss * 1.05;
    let level = "ok", title = "Ser normal ud", detail = "Ingen tydelige varmeproblemer";
    if (noData) { level = "problem"; title = "Manglende data"; detail = "En eller flere diagnosemålinger er utilgængelige"; }
    else if (open) { level = "info"; title = "Åbning registreret"; detail = "Læring er normalt sat på pause, mens vindue eller dør er åben"; }
    else if (stressed || coldUnderLoad || notResponding) { level = "problem"; title = "Kontrollér opvarmning"; detail = stressed ? "Radiatoren er belastet og kan have svært ved at følge med" : coldUnderLoad ? "Rummet er koldt, selv om ventilen står højt" : "Lært varmeeffekt matcher næsten ikke rummets varmetab"; }
    else if (demandStatus === "deviating" && baselineReady) { level = "warn"; title = "Afviger fra normalen"; detail = "Vejrkorrigeret varmebehov ligger uden for rummets lærte mønster"; }
    else if (!baselineReady || demandStatus === "learning") { level = "learning"; title = "Indlærer rummet"; detail = `${this._format(Math.min(learningHours, this._config.learning_hours), 1)} af ${this._config.learning_hours} timer indsamlet`; }
    const active = (valve || 0) > 1 || (output || 0) > 1;
    return { climate, demand, current, target, delta, valve, output, utilisation, loss, heatingPower, hours, cost, share, rated, area, stressed, demandStatus, learningHours, baselineReady, deviation, open, level, title, detail, active };
  }

  _metric(label, value, icon = "") {
    return `<div class="metric">${icon ? `<ha-icon icon="${icon}"></ha-icon>` : ""}<div><span>${label}</span><strong>${value}</strong></div></div>`;
  }

  _room(room, index, compact) {
    const s = this._state(room);
    const valve = Math.max(0, Math.min(100, s.valve || 0));
    const capacity = Math.max(0, Math.min(100, s.utilisation || 0));
    const learning = Math.max(0, Math.min(100, s.learningHours / this._config.learning_hours * 100));
    const balanceMax = Math.max(s.heatingPower || 0, s.loss || 0, .001);
    const gainWidth = Math.min(100, (s.heatingPower || 0) / balanceMax * 100);
    const lossWidth = Math.min(100, (s.loss || 0) / balanceMax * 100);
    const diagnosticEntity = room.demand_status || room.climate;
    return `<article class="room ${compact ? "compact" : ""} ${s.level} ${s.active ? "active" : ""}" data-index="${index}" tabindex="0" role="button" aria-label="Diagnose for ${this._escape(room.name)}">
      <div class="room-ambient"></div>
      <div class="room-header">
        <div class="identity"><ha-icon icon="${this._escape(room.icon || "mdi:radiator")}"></ha-icon><div><h3>${this._escape(room.name)}</h3><span class="diagnosis"><i></i>${s.title}</span></div></div>
        <div class="temp"><strong>${this._format(s.current,1)}°</strong><span>Mål ${this._format(s.target,1)}°</span></div>
      </div>
      <div class="diagnostic-note"><ha-icon icon="${s.level === "problem" ? "mdi:alert-circle" : s.level === "warn" ? "mdi:alert" : s.level === "learning" ? "mdi:brain" : s.level === "info" ? "mdi:information" : "mdi:check-decagram"}"></ha-icon><span>${s.detail}</span></div>
      <div class="live-panel">
        <div class="valve-wrap">
          <div class="valve-gauge" style="--valve:${valve * 3.6}deg"><div><strong>${this._format(s.valve)}%</strong><span>Ventil</span></div></div>
          <div class="heat-particles"><b></b><b></b><b></b><b></b></div>
        </div>
        <div class="thermal">
          <div class="thermal-head"><span>Termisk balance</span><strong>${s.heatingPower !== undefined && s.loss !== undefined ? (s.heatingPower > s.loss ? "Overskud" : "Underskud") : "—"}</strong></div>
          <div class="bar gain"><span style="width:${gainWidth}%"></span></div><small>Varmeevne ${this._format(s.heatingPower,4)} K/min</small>
          <div class="bar loss"><span style="width:${lossWidth}%"></span></div><small>Varmetab ${this._format(s.loss,4)} K/min</small>
        </div>
      </div>
      <div class="capacity"><div><span>Kapacitetsudnyttelse</span><strong>${this._format(s.utilisation,1)}%</strong></div><div class="track"><i style="width:${capacity}%"></i></div></div>
      ${s.level === "learning" ? `<div class="learning-bar"><div><span>Læringsmodel</span><strong>${this._format(learning)}%</strong></div><div class="track"><i style="width:${learning}%"></i></div></div>` : ""}
      <div class="metrics">
        ${this._metric("Effekt nu",`${this._format(s.output)} W`,"mdi:heat-wave")}
        ${this._metric("Denne måned",`${this._format(s.hours,1)} t`,"mdi:timer-outline")}
        ${this._metric("Varmeandel",`${this._format(s.share,1)}%`,"mdi:chart-donut")}
        ${this._metric("Est. pris",`${this._format(s.cost,2)} kr.`,"mdi:cash")}
        ${this._metric("Radiator",`${this._format(s.rated)} W`,"mdi:radiator")}
        ${this._metric("Rumareal",`${this._format(s.area,1)} m²`,"mdi:set-square")}
      </div>
      <div class="deviation ${s.deviation === undefined ? "empty" : ""}"><span>Afvigelse fra lært normal</span><strong>${s.deviation === undefined ? "Afventer data" : `${s.deviation > 0 ? "+" : ""}${this._format(s.deviation,0)}%`}</strong></div>
      <button class="details" data-entity="${this._escape(diagnosticEntity)}">Se diagnosedata <ha-icon icon="mdi:chevron-right"></ha-icon></button>
    </article>`;
  }

  _open(entityId) {
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId } }));
  }

  _render() {
    const rooms = this._config.rooms || [];
    const states = rooms.map((room) => this._state(room));
    const problems = states.filter((state) => state.level === "problem" || state.level === "warn").length;
    const learning = states.filter((state) => state.level === "learning").length;
    const active = states.filter((state) => state.active).length;
    const total = this._number(this._config.total_demand);
    const globalProblem = this._entity(this._config.data_problem)?.state === "on";
    const health = globalProblem ? "Dataproblem" : problems ? `${problems} bør ses efter` : learning ? "Systemet lærer" : "Alle rum normale";
    const noAnimation = this._config.animation === false ? "no-animation" : "";
    const compact = this._config.compact === true;
    const compactCols = Math.max(1, Math.ceil(rooms.length / 3));
    this.shadowRoot.innerHTML = `<style>
      :host{display:block;--good:var(--dashboard-success, var(--success-color, #54d29b));--learn:#64a9ff;--warn:var(--dashboard-warning, var(--warning-color, #ffc45c));--bad:var(--dashboard-danger, var(--error-color, #ff667a));--heat:#ff8a3d;--accent:var(--dashboard-accent, var(--info-color, #38bdf8));--edge:var(--dashboard-border-neutral, var(--divider-color, rgba(255,255,255,.11)));--card-surface:var(--dashboard-card-bg,var(--surface,var(--ha-card-background,var(--card-background-color,#111820))))}*{box-sizing:border-box}
      ha-card{overflow:hidden;border-radius:24px;background:var(--card-surface);color:var(--primary-text-color);box-shadow:var(--ha-card-box-shadow)}
      .shell{position:relative;padding:22px;isolation:isolate}.backdrop{position:absolute;inset:-15%;z-index:-1;background:radial-gradient(circle at 8% 0,rgba(100,169,255,.17),transparent 26%),radial-gradient(circle at 95% 8%,rgba(255,138,61,.16),transparent 28%);pointer-events:none}
      header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:16px}.eyebrow{display:flex;align-items:center;gap:8px;color:var(--secondary-text-color);font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}.eyebrow i{width:7px;height:7px;border-radius:50%;background:${problems || globalProblem ? "var(--bad)" : learning ? "var(--learn)" : "var(--good)"};box-shadow:0 0 13px currentColor;animation:pulse 1.8s ease-in-out infinite}h2{margin:5px 0 0;font-size:25px;line-height:1.08;letter-spacing:-.035em}
      .overview{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.overview>div{min-width:88px;padding:9px 12px;border:1px solid color-mix(in srgb,var(--accent) 16%,transparent);border-left:3px solid var(--accent);border-radius:14px;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 7%,transparent),transparent 55%),rgba(0,0,0,.08);box-shadow:0 4px 12px rgba(0,0,0,.1)}.overview span{display:block;color:var(--secondary-text-color);font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.overview strong{display:block;margin-top:3px;font-size:16px}.overview .health strong{color:${problems || globalProblem ? "var(--bad)" : learning ? "var(--learn)" : "var(--good)"}}
      .flow{position:relative;height:70px;margin-bottom:16px;border:1px solid color-mix(in srgb,var(--accent) 18%,var(--edge));border-radius:18px;background:linear-gradient(90deg,rgba(255,138,61,.09),rgba(100,169,255,.05));overflow:hidden}.flow-line{position:absolute;left:7%;right:7%;top:50%;height:3px;border-radius:9px;background:linear-gradient(90deg,var(--heat),var(--warn),var(--learn));box-shadow:0 0 18px rgba(255,138,61,.3)}.flow-line:after{content:"";position:absolute;width:60px;inset:-2px auto -2px -60px;background:linear-gradient(90deg,transparent,#fff,transparent);animation:flow 3s linear infinite}.flow-node{position:absolute;top:50%;transform:translateY(-50%);display:flex;align-items:center;gap:10px;padding:8px 11px;border:1px solid color-mix(in srgb,currentColor 35%,var(--edge));border-radius:12px;background:var(--ha-card-background);box-shadow:0 8px 22px rgba(0,0,0,.2)}.flow-node ha-icon{flex:0 0 25px;width:25px;height:25px;--mdc-icon-size:25px}.flow-node>div{min-width:0}.flow-node strong{display:block;font-size:12px;white-space:nowrap}.flow-node small{display:block;margin-bottom:2px;color:var(--secondary-text-color);font-size:9px;text-transform:uppercase;letter-spacing:.08em}.flow-node.source{left:3%;color:var(--heat)}.flow-node.model{left:50%;transform:translate(-50%,-50%);color:var(--learn)}.flow-node.rooms{right:3%;color:var(--good)}
      .room-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,430px),1fr));gap:12px}.room{--tone:var(--good);position:relative;display:flex;flex-direction:column;overflow:hidden;min-width:0;padding:16px;border:1px solid color-mix(in srgb,var(--tone) 24%,var(--edge));border-left:4px solid var(--tone);border-radius:19px;background:linear-gradient(145deg,color-mix(in srgb,var(--tone) 5%,transparent),rgba(0,0,0,.035));box-shadow:0 8px 25px rgba(0,0,0,.08);transition:transform .2s ease,box-shadow .2s ease}.room.learning{--tone:var(--learn)}.room.warn{--tone:var(--warn)}.room.problem{--tone:var(--bad)}.room.info{--tone:var(--learn)}.room:hover{transform:translateY(-2px);box-shadow:0 13px 30px rgba(0,0,0,.15),0 0 0 1px color-mix(in srgb,var(--tone) 18%,transparent)}.room-ambient{position:absolute;right:-60px;top:-80px;width:180px;height:180px;border-radius:50%;background:var(--tone);opacity:.08;filter:blur(28px);pointer-events:none}.room.problem .room-ambient,.room.active .room-ambient{animation:breathe 2.4s ease-in-out infinite}
      .room-header{display:flex;justify-content:space-between;gap:12px}.identity{display:flex;gap:11px;align-items:flex-start;min-width:0}.identity>ha-icon{flex:0 0 43px;width:43px;height:43px;padding:9px;border-radius:11px;--mdc-icon-size:25px;color:var(--tone);background:color-mix(in srgb,var(--tone) 12%,transparent)}.identity>div{min-width:0}h3{margin:4px 0;font-size:16px}.diagnosis{display:flex;align-items:center;gap:7px;color:var(--secondary-text-color);font-size:11px;font-weight:700}.diagnosis i{flex:0 0 7px;width:7px;height:7px;border-radius:50%;background:var(--tone);box-shadow:0 0 8px var(--tone)}.temp{text-align:right}.temp strong{display:block;font-size:23px;line-height:1}.temp span{display:block;margin-top:5px;color:var(--secondary-text-color);font-size:10px}
      .diagnostic-note{display:flex;align-items:center;gap:10px;min-height:42px;margin:12px 0;padding:9px 11px;border-radius:10px;color:color-mix(in srgb,var(--tone) 80%,var(--primary-text-color));background:color-mix(in srgb,var(--tone) 9%,transparent);font-size:11px;line-height:1.4}.diagnostic-note ha-icon{flex:0 0 19px;width:19px;height:19px;--mdc-icon-size:19px;color:var(--tone)}.diagnostic-note span{min-width:0}
      .live-panel{display:grid;grid-template-columns:102px 1fr;gap:16px;align-items:center}.valve-wrap{position:relative;height:94px;display:grid;place-items:center}.valve-gauge{width:82px;height:82px;padding:7px;border-radius:50%;background:conic-gradient(var(--tone) var(--valve),rgba(255,255,255,.08) 0);box-shadow:0 0 18px color-mix(in srgb,var(--tone) 15%,transparent)}.valve-gauge>div{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;border-radius:50%;background:var(--ha-card-background)}.valve-gauge strong{display:block;font-size:19px;line-height:1.1}.valve-gauge span{display:block;margin-top:4px;font-size:9px;line-height:1;color:var(--secondary-text-color);text-transform:uppercase;letter-spacing:.06em}.heat-particles{position:absolute;inset:0;pointer-events:none}.heat-particles b{display:none;position:absolute;bottom:8px;left:50%;width:4px;height:4px;border-radius:50%;background:var(--heat);box-shadow:0 0 8px var(--heat)}.active .heat-particles b{display:block;animation:particle 2.2s ease-out infinite}.heat-particles b:nth-child(2){left:38%;animation-delay:.5s}.heat-particles b:nth-child(3){left:62%;animation-delay:1s}.heat-particles b:nth-child(4){left:45%;animation-delay:1.5s}
      .thermal-head{display:flex;justify-content:space-between;margin-bottom:7px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--secondary-text-color)}.thermal-head strong{color:var(--primary-text-color)}.bar,.track{height:7px;overflow:hidden;border-radius:9px;background:rgba(255,255,255,.09)}.bar span,.track i{display:block;height:100%;border-radius:inherit;transition:width .6s ease}.bar.gain span{background:linear-gradient(90deg,var(--heat),var(--warn))}.bar.loss{margin-top:9px}.bar.loss span{background:linear-gradient(90deg,var(--learn),#8876ff)}.thermal small{display:block;margin-top:4px;color:var(--secondary-text-color);font-size:9px}
      .capacity,.learning-bar{margin-top:12px}.capacity>div:first-child,.learning-bar>div:first-child{display:flex;justify-content:space-between;margin-bottom:5px;color:var(--secondary-text-color);font-size:10px}.capacity strong,.learning-bar strong{color:var(--primary-text-color)}.capacity .track i{background:linear-gradient(90deg,var(--good),var(--heat))}.learning-bar .track i{background:linear-gradient(90deg,#6967ff,var(--learn));position:relative}.learning-bar .track i:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.7),transparent);animation:scan 2s linear infinite}
      .metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:13px}.metric{position:relative;display:flex;align-items:center;gap:9px;min-width:0;min-height:54px;padding:9px 10px;border:1px solid color-mix(in srgb,var(--tone) 18%,var(--edge));border-left:3px solid var(--tone);border-radius:10px;background:linear-gradient(145deg,color-mix(in srgb,var(--tone) 8%,transparent),rgba(0,0,0,.03));box-shadow:0 3px 10px rgba(0,0,0,.08)}.metric ha-icon{flex:0 0 21px;width:21px;height:21px;--mdc-icon-size:21px;color:var(--tone)}.metric>div{min-width:0}.metric span{display:block;overflow:hidden;text-overflow:ellipsis;color:var(--secondary-text-color);font-size:9px;text-transform:uppercase;white-space:nowrap}.metric strong{display:block;margin-top:3px;font-size:12px;line-height:1.1;white-space:nowrap}.deviation{display:flex;justify-content:space-between;gap:12px;margin-top:11px;padding:9px 11px;border-radius:9px;background:color-mix(in srgb,var(--tone) 9%,transparent);font-size:10px}.deviation strong{color:var(--tone);white-space:nowrap}.deviation.empty strong{color:var(--secondary-text-color);font-weight:600}
      .details{display:flex;align-items:center;justify-content:flex-end;width:100%;margin-top:auto;padding:14px 0 1px;border:0;background:none;color:var(--secondary-text-color);font:inherit;font-size:10px;cursor:pointer}.details:hover{color:var(--tone)}.details ha-icon{flex:0 0 17px;width:17px;height:17px;--mdc-icon-size:17px;margin-left:5px}.no-animation *{animation:none!important}
      @keyframes pulse{50%{opacity:.35;transform:scale(1.5)}}@keyframes flow{to{transform:translateX(calc(100vw + 80px))}}@keyframes breathe{50%{opacity:.17;transform:scale(1.15)}}@keyframes particle{0%{opacity:0;transform:translateY(0) scale(.6)}25%{opacity:.9}100%{opacity:0;transform:translateY(-70px) translateX(10px) scale(1.6)}}@keyframes scan{from{transform:translateX(-100%)}to{transform:translateX(100%)}}
      @media(max-width:760px){.shell{padding:15px}header{display:block}.overview{justify-content:flex-start;margin-top:12px}.overview>div{flex:1}.room-grid{grid-template-columns:1fr}.flow-node small{display:none}.metrics{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media(max-width:420px){.flow-node.model{display:none}.live-panel{grid-template-columns:82px 1fr}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(prefers-reduced-motion:reduce){*{animation:none!important}}
      .room-grid.compact{grid-template-columns:repeat(var(--compact-cols,4),minmax(0,1fr));align-items:start}
      .room.compact{zoom:.8}
      @media(max-width:900px){.room-grid.compact{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}}
    </style><ha-card class="${noAnimation}"><div class="shell"><div class="backdrop"></div>
      <header><div><div class="eyebrow"><i></i>Rumdiagnose i realtid</div><h2>${this._escape(this._config.title)}</h2></div><div class="overview">
        <div class="health"><span>Systemstatus</span><strong>${health}</strong></div><div><span>Aktive rum</span><strong>${active} / ${rooms.length}</strong></div><div><span>Varmebehov</span><strong>${this._format(total)} W</strong></div>
      </div></header>
      <div class="flow"><div class="flow-line"></div><div class="flow-node source"><ha-icon icon="mdi:radiator"></ha-icon><div><small>Målinger</small><strong>${active} aktive</strong></div></div><div class="flow-node model"><ha-icon icon="mdi:brain"></ha-icon><div><small>Læringsmodel</small><strong>${learning} lærer</strong></div></div><div class="flow-node rooms"><ha-icon icon="mdi:shield-check"></ha-icon><div><small>Diagnose</small><strong>${problems || globalProblem ? "Kræver blik" : "Overvåger"}</strong></div></div></div>
      <div class="room-grid ${compact ? "compact" : ""}" style="${compact ? `--compact-cols:${compactCols}` : ""}">${rooms.map((room,index)=>this._room(room,index,compact)).join("")}</div>
    </div></ha-card>`;
    this.shadowRoot.querySelectorAll(".details").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); this._open(button.dataset.entity); }));
    this.shadowRoot.querySelectorAll("article.room").forEach((article) => {
      const open = () => this._open(rooms[Number(article.dataset.index)]?.climate);
      article.addEventListener("click", open);
      article.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } });
    });
  }
}

if (!customElements.get("ha-heating-diagnostics-card")) customElements.define("ha-heating-diagnostics-card", HAHeatingDiagnosticsCard);
window.customCards = window.customCards || [];
window.customCards.push({ type:"ha-heating-diagnostics-card", name:"HA Heating Diagnostics Card", description:"Animeret rumdiagnose til Room Energy Optimizer", preview:true });
console.info(`%c HA HEATING DIAGNOSTICS %c v${VERSION} `,"color:white;background:#5d77ed;font-weight:700","color:#8fa6ff;background:#161b22");
