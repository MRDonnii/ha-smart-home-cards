import "./ha-card-list-editor.js";
const VERSION = "0.4.7";

class HAHeatingDiagnosticsCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._signature = "";
    // Rum med åben forklaring overlever genrendering; historik for dør/vindue og anden varme caches pr. rum.
    this._openRooms = new Set();
    this._history = {};
  }

  static getStubConfig() { return { title: "Varmeoptimering", rooms: [] }; }
  static getConfigElement(){const e=document.createElement("ha-card-list-editor");e.definition={roots:[{key:"title",label:"Titel"},{key:"animation",label:"Animation",type:"boolean"},{key:"learning_hours",label:"Læringstimer",type:"entity"},{key:"total_demand",label:"Samlet varmebehov",type:"entity"},{key:"data_problem",label:"Dataproblem",type:"entity"}],collections:[{key:"rooms",label:"Rumdiagnose",itemLabel:"rum",defaults:{name:"Nyt rum",icon:"mdi:radiator"},fields:[{key:"name",label:"Navn"},{key:"icon",label:"Ikon"},{key:"climate",label:"Termostat",type:"entity"},{key:"valve",label:"Ventil",type:"entity"},{key:"output",label:"Output",type:"entity"},{key:"hours",label:"Læringstimer",type:"entity"},{key:"loss",label:"Varmetab",type:"entity"},{key:"heating_power",label:"Varmeeffekt",type:"entity"},{key:"utilisation",label:"Udnyttelse",type:"entity"},{key:"cost",label:"Pris",type:"entity"},{key:"share",label:"Varmeandel",type:"entity"},{key:"rated",label:"Radiatorstørrelse",type:"entity"},{key:"area",label:"Rumareal",type:"entity"},{key:"demand_status",label:"Behovsstatus",type:"entity"},{key:"stressed",label:"Belastning",type:"entity"},{key:"loop_note",label:"Slyngeposition (fritekst)"}]}]};return e;}

  setConfig(config) {
    if (!config || !Array.isArray(config.rooms)) throw new Error("Varmeoptimering kræver en rooms-liste");
    this._config = { title: "Varmeoptimering", animation: true, learning_hours: 48, ...config };
    this._signature = "";
    this._openRooms = new Set();
    this._history = {};
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const ids = [this._config.total_demand, this._config.data_problem];
    for (const room of this._config.rooms || []) {
      const linked = this._linked(room);
      ids.push(...Object.values(room), ...linked.openings, linked.externalHeat);
    }
    const signature = JSON.stringify(ids.filter((id) => typeof id === "string" && id.includes(".")).map((id) => {
      const entity = hass?.states?.[id];
      return [id, entity?.state, entity?.attributes?.current_temperature, entity?.attributes?.temperature,
        entity?.attributes?.hvac_action, entity?.attributes?.baseline_learning_hours,
        entity?.attributes?.baseline_ready, entity?.attributes?.deviation_percent,
        entity?.attributes?.current_w_per_degree, entity?.attributes?.learned_baseline_w_per_degree,
        entity?.attributes?.recent_observation_hours, entity?.attributes?.valid_days,
        entity?.attributes?.reason, entity?.attributes?.compared_days,
        JSON.stringify(entity?.attributes?.normal_range_w_per_degree ?? null)];
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
    // Room Energy Optimizer 1.9+ vurderer ud fra en energibalance og siger selv, hvorfor den stadig lærer.
    const signature = demand?.attributes?.method === "energy_signature";
    const validDays = Number.isFinite(Number(demand?.attributes?.valid_days)) ? Number(demand.attributes.valid_days) : 0;
    const requiredDays = Number.isFinite(Number(demand?.attributes?.required_days)) ? Number(demand.attributes.required_days) : 7;
    const learnReason = demand?.attributes?.reason || null;
    const deviationRaw = demand?.attributes?.deviation_percent;
    const deviation = deviationRaw !== null && deviationRaw !== undefined && Number.isFinite(Number(deviationRaw)) ? Number(deviationRaw) : undefined;
    const open = climate?.attributes?.window_open === true || climate?.attributes?.door_open === true;
    const noData = [valve, output, utilisation, loss].some((value) => value === undefined) || !climate || !demand;
    const coldUnderLoad = delta !== undefined && delta < -0.7 && valve !== undefined && valve >= 65;
    const notResponding = heatingPower !== undefined && loss !== undefined && valve !== undefined && valve >= 65 && heatingPower <= loss * 1.05;
    let level = "ok", reason = "ok", title = "Ser normal ud", detail = "Ingen tydelige varmeproblemer";
    if (noData) { level = "problem"; reason = "no-data"; title = "Manglende data"; detail = "En eller flere diagnosemålinger er utilgængelige"; }
    else if (open) { level = "info"; reason = "open"; title = "Åbning registreret"; detail = "Læring er normalt sat på pause, mens vindue eller dør er åben"; }
    else if (stressed) { level = "problem"; reason = "stressed"; title = "Radiator belastet"; detail = "Ventilen står fuldt åben, men rummet når ikke sit mål. Tjek om radiatoren er luftet, eller om den er for lille til rummet."; }
    else if (coldUnderLoad) { level = "problem"; reason = "cold"; title = "Koldt trods åben ventil"; detail = "Rummet er koldere end målet, selv om ventilen er højt åben. Tjek for kuldetræk fra vindue/dør, eller om ventilen sidder fast."; }
    else if (notResponding) { level = "problem"; reason = "no-effect"; title = "Ingen effekt fra varmen"; detail = "Lært varmeeffekt matcher næsten rummets varmetab - radiatoren giver muligvis ikke reel varme. Tjek fremløbet til rummet, og om ventilen faktisk åbner."; }
    else if (demandStatus === "deviating" && baselineReady) { level = "warn"; reason = "deviating"; title = "Afviger fra normalen"; const normal = signature ? "normalt i lignende vejr" : "vejrkorrigeret normalt"; detail = deviation === undefined ? "Vejrkorrigeret varmebehov ligger uden for rummets lærte mønster" : deviation > 0 ? `Bruger ${this._format(deviation,0)}% mere varme end ${normal}` : `Bruger ${this._format(Math.abs(deviation),0)}% mindre varme end ${normal}`; }
    else if (!baselineReady || demandStatus === "learning") { level = "learning"; reason = "learning"; title = "Indlærer rummet"; detail = signature ? this._learningText(learnReason, validDays, requiredDays) : `${this._format(Math.min(learningHours, this._config.learning_hours), 1)} af ${this._config.learning_hours} timer indsamlet`; }
    const active = (valve || 0) > 1 || (output || 0) > 1;
    return { climate, demand, current, target, delta, valve, output, utilisation, loss, heatingPower, hours, cost, share, rated, area, stressed, demandStatus, learningHours, baselineReady, deviation, open, level, reason, title, detail, active, signature, validDays, requiredDays, learnReason };
  }

  _learningText(reason, validDays, requiredDays) {
    if (reason === "collecting_days") return `${validDays} af ${requiredDays} døgn indsamlet`;
    if (reason === "recent_window_incomplete") return "Venter på et døgns rene målinger i de seneste 48 timer";
    if (reason === "too_mild") return "For mildt vejr til at vurdere varmebehovet";
    if (reason === "outside_learned_weather") return "Har ikke set lignende vejr endnu";
    return "Indsamler målinger";
  }

  // Dør/vindue- og ekstra-varme-sensorer, som Better Thermostat selv peger på fra rummets termostat.
  _linked(room) {
    const attributes = this._hass?.states?.[room.climate]?.attributes || {};
    const openings = [attributes.window_sensor_entity_id, attributes.door_sensor_entity_id]
      .filter((id, index, list) => typeof id === "string" && id.includes(".") && list.indexOf(id) === index);
    const externalHeat = typeof attributes.external_heat_entity_id === "string" && attributes.external_heat_entity_id.includes(".") ? attributes.external_heat_entity_id : undefined;
    return { openings, externalHeat };
  }

  _historyHours(room) {
    const attributes = this._entity(room.demand_status)?.attributes || {};
    // Med energibalancen (1.9+) dækker vurderingen et fast vindue; ellers de observerede timer.
    const observed = Number(attributes.method === "energy_signature" ? attributes.window_hours : attributes.recent_observation_hours);
    const hours = Number.isFinite(observed) && observed > 0 ? observed : Number(this._config.learning_hours) || 48;
    return Math.min(240, Math.max(6, hours));
  }

  _duration(ms) {
    const minutes = Math.round(ms / 60000);
    if (minutes < 1) return "under 1 min";
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60), rest = minutes % 60;
    return rest ? `${hours} t ${rest} min` : `${hours} t`;
  }

  // Tæller perioder med tilstanden "on" i historikken og deres samlede varighed inden for vinduet.
  _onPeriods(states, start, end) {
    let count = 0, onMs = 0, since;
    states.forEach((item, index) => {
      const at = Math.min(end, Math.max(start, (Number(item.lc ?? item.lu) || 0) * 1000));
      if (item.s === "on" && since === undefined) { since = at; if (index > 0) count += 1; }
      else if (item.s !== "on" && since !== undefined) { onMs += at - since; since = undefined; }
    });
    if (since !== undefined) onMs += end - since;
    return { count, onMs };
  }

  async _loadHistory(index) {
    const room = this._config.rooms?.[index];
    if (!room || !this._hass?.callWS) return;
    const linked = this._linked(room);
    const ids = [...linked.openings, linked.externalHeat].filter(Boolean);
    const cached = this._history[index];
    if (!ids.length || cached?.loading || (cached && Date.now() - cached.at < 300000)) return;
    const hours = this._historyHours(room);
    const end = Date.now(), start = end - hours * 3600000;
    this._history[index] = { loading: true, at: end, hours };
    try {
      const result = await this._hass.callWS({ type: "history/history_during_period", start_time: new Date(start).toISOString(), end_time: new Date(end).toISOString(), entity_ids: ids, minimal_response: true, no_attributes: true, significant_changes_only: false });
      const rows = {};
      for (const id of ids) rows[id] = this._onPeriods(Array.isArray(result?.[id]) ? result[id] : [], start, end);
      this._history[index] = { at: Date.now(), hours, rows };
    } catch (error) {
      this._history[index] = { at: Date.now(), hours, failed: true };
    }
    if (this._openRooms.has(index)) this._render();
  }

  // Forklaringen bag diagnosen: tallene den bygger på, hvad der kan ses lige nu, og hvad man kan tjekke.
  _explain(room, s, index) {
    const demand = s.demand?.attributes || {};
    const climate = s.climate?.attributes || {};
    const name = this._escape(room.name);
    const perDegree = Number(demand.current_w_per_degree);
    const baseline = Number(demand.learned_baseline_w_per_degree);
    const observed = Number(demand.recent_observation_hours);
    const history = this._history[index];
    const hoursLabel = `${this._format(history?.hours ?? this._historyHours(room), 0)} t`;
    const facts = [], checks = [];
    let lead = this._escape(s.detail), note = "", tips = [];
    const temperature = () => facts.push(["Temperatur", `${this._format(s.current, 1)}° · mål ${this._format(s.target, 1)}°`]);
    const valve = () => facts.push(["Ventil", `${this._format(s.valve)} %`]);
    const range = Array.isArray(demand.normal_range_w_per_degree) ? demand.normal_range_w_per_degree.map(Number) : null;
    const liftRange = Array.isArray(demand.compared_lift_range_c) ? demand.compared_lift_range_c.map(Number) : null;
    const windRange = Array.isArray(demand.compared_wind_range_ms) ? demand.compared_wind_range_ms.map(Number) : null;
    const span = (values, digits, unit) => `${this._format(values[0], digits)}–${this._format(values[1], digits)} ${unit}`;
    const perDegreeFacts = () => {
      if (s.signature) {
        if (Number.isFinite(perDegree)) facts.push(["Seneste 48 timer", `${this._format(perDegree, 2)} W/°C`]);
        if (Number.isFinite(baseline)) facts.push(["Normalt i lignende vejr", `${this._format(baseline, 2)} W/°C`]);
        if (range) facts.push(["Normalområde", span(range, 1, "W/°C")]);
        if (Number(demand.compared_days) > 0) facts.push(["Sammenlignet med", `${this._format(Number(demand.compared_days))} døgn`]);
        return;
      }
      if (Number.isFinite(perDegree)) facts.push(["Varmebehov nu", `${this._format(perDegree, 1)} W/°C`]);
      if (Number.isFinite(baseline)) facts.push(["Normalt for rummet", `${this._format(baseline, 1)} W/°C`]);
    };
    const signatureNote = () => {
      const weather = [liftRange ? `inde-ude-forskel ${span(liftRange, 1, "°C")}` : "", windRange ? `vind ${span(windRange, 1, "m/s")}` : ""].filter(Boolean).join(", ");
      return `Tallet er radiatorens estimerede varme de seneste 48 timer – også når den er lukket – delt med forskellen mellem inde- og udetemperatur. Det sammenlignes med de døgn, hvor vejret lignede mest${weather ? ` (${weather})` : ""}. Perioder med anden varmekilde eller åben dør/vindue tæller ikke med.`;
    };
    if (s.reason === "deviating") {
      const more = s.deviation === undefined || s.deviation > 0;
      if (s.deviation !== undefined) lead = s.signature
        ? `${name} har brugt ${this._format(Math.abs(s.deviation), 0)} % ${more ? "mere" : "mindre"} varme de seneste 48 timer end normalt i lignende vejr.`
        : `${name} bruger ${this._format(Math.abs(s.deviation), 0)} % ${more ? "mere" : "mindre"} varme, end rummet plejer, når der tages højde for udetemperaturen.`;
      perDegreeFacts();
      if (s.deviation !== undefined) facts.push(["Afvigelse", `${s.deviation > 0 ? "+" : "−"}${this._format(Math.abs(s.deviation), 0)} %`]);
      if (!s.signature && Number.isFinite(observed)) facts.push(["Målt over", `${this._format(observed, 1)} timer`]);
      note = s.signature ? signatureNote() : "W/°C er den varme, rummet bruger for hver grad, det er koldere ude end inde. Tallet for de seneste timer sammenlignes med det mønster, rummet har lært.";
      tips = more
        ? ["Har port, dør eller vindue stået åben længe eller været åbnet tit?", "Er måltemperaturen hævet, eller har rummet været holdt varmere end normalt?", "Er der kommet træk, udluftning eller ventilation, som rummet ikke plejer at have?", "Har en anden varmekilde, fx AC eller elvarme, været slukket, så radiatoren skulle levere mere?"]
        : ["Har en anden varmekilde, fx AC, sol eller maskiner, varmet rummet?", "Er måltemperaturen sænket, eller har varmen været slukket en del af tiden?", "Åbner ventilen, når termostaten kalder på varme?"];
    } else if (s.reason === "stressed") {
      const stress = this._entity(room.stressed)?.attributes || {};
      lead = "Ventilen står helt åben, men rummet når ikke sit mål.";
      valve(); temperature();
      if (Number.isFinite(Number(stress.temperature_deficit))) facts.push(["Mangler", `${this._format(Number(stress.temperature_deficit), 1)}°`]);
      if (Number.isFinite(Number(stress.flow_temperature))) facts.push(["Fremløb", `${this._format(Number(stress.flow_temperature), 1)}°`]);
      tips = ["Luft radiatoren.", "Tjek at ventilen åbner helt, når termostaten kalder på varme.", "Tjek at fremløbet er varmt nok.", "Radiatoren kan være for lille til rummet."];
    } else if (s.reason === "cold") {
      lead = `Rummet er ${this._format(Math.abs(s.delta), 1)}° under målet, selv om ventilen er ${this._format(s.valve)} % åben.`;
      temperature(); valve();
      tips = ["Tjek for kuldetræk fra vindue, dør eller port.", "Tjek om ventilen sidder fast.", "Luft radiatoren."];
    } else if (s.reason === "no-effect") {
      lead = `Radiatoren varmer næsten ikke mere, end rummet taber, selv om ventilen er ${this._format(s.valve)} % åben. Den giver muligvis ikke reel varme.`;
      facts.push(["Varmeevne", `${this._format(s.heatingPower, 4)} K/min`], ["Varmetab", `${this._format(s.loss, 4)} K/min`]);
      valve();
      tips = ["Tjek fremløbet til rummet.", "Tjek om ventilen faktisk åbner.", "Luft radiatoren."];
    } else if (s.reason === "no-data") {
      lead = "Diagnosen kan ikke beregnes, fordi en eller flere målinger mangler.";
      for (const [key, label] of [["climate", "Termostat"], ["demand_status", "Behovsstatus"], ["valve", "Ventilåbning"], ["output", "Varmeafgivelse"], ["utilisation", "Kapacitetsudnyttelse"], ["loss", "Lært varmetab"]]) {
        const id = room[key];
        const raw = id ? this._hass?.states?.[id] : undefined;
        const problem = !id ? "Ikke sat op" : !raw ? "Findes ikke" : raw.state === "unavailable" ? "Utilgængelig" : ["unknown", ""].includes(raw.state) ? "Ukendt" : "";
        if (problem) checks.push({ flag: true, icon: "mdi:alert-circle-outline", label, value: problem, sub: id || "" });
      }
      tips = ["Tjek at enhederne er online og har batteri.", "Genindlæs integrationen, hvis målingerne bliver ved med at mangle."];
    } else if (s.reason === "open") {
      lead = "Et vindue eller en dør står åben, så læringen holder pause, indtil den lukkes igen.";
      temperature();
    } else if (s.reason === "learning" && s.signature) {
      const lift = Number(demand.recent_mean_lift_c);
      lead = s.learnReason === "collecting_days"
        ? `Rummet er ved at blive lært at kende: ${s.validDays} af ${s.requiredDays} døgn med gyldige målinger er samlet. Derefter sammenlignes de seneste 48 timer med døgn med lignende vejr.`
        : s.learnReason === "recent_window_incomplete"
          ? "De seneste 48 timer har for få rene målinger – fx fordi en anden varmekilde har kørt, en dør eller et vindue har stået åbent, eller data har manglet. Status vurderes igen, når der er mindst et døgns målinger."
          : s.learnReason === "too_mild"
            ? "Det er så mildt, at forskellen mellem inde og ude er under 3 °C. Så er tallet for usikkert til at sige noget om rummet."
            : s.learnReason === "outside_learned_weather"
              ? `Vejret de seneste 48 timer${Number.isFinite(lift) ? ` (inde-ude-forskel ${this._format(lift, 1)} °C)` : ""} ligner ikke de døgn, der er lært endnu. Status vurderes, når der er mindst 5 døgn med lignende vejr.`
              : "Integrationen samler stadig målinger.";
      facts.push(["Gyldige døgn", `${s.validDays} af ${s.requiredDays}`]);
      if (Number.isFinite(observed)) facts.push(["Rene timer (48 t)", `${this._format(observed, 1)} t`]);
      if (Number.isFinite(lift)) facts.push(["Inde-ude-forskel", `${this._format(lift, 1)} °C`]);
    } else if (s.reason === "learning") {
      lead = `Rummet er ved at blive lært at kende: ${this._format(Math.min(s.learningHours, this._config.learning_hours), 1)} af ${this._config.learning_hours} timer er samlet. Derefter sammenligner diagnosen varmebehovet med rummets normale mønster.`;
    } else {
      lead = s.signature
        ? "Rummets varmebehov de seneste 48 timer ligger inden for det normale i lignende vejr, og der er ingen tegn på problemer."
        : "Rummets varmebehov ligger inden for det mønster, det har lært, og der er ingen tegn på problemer.";
      perDegreeFacts();
      if (s.signature) note = signatureNote();
    }
    for (const id of this._linked(room).openings) {
      const entity = this._hass?.states?.[id];
      if (!entity) continue;
      const open = entity.state === "on";
      const row = history?.rows?.[id];
      const sub = row ? (row.count ? `Åbnet ${row.count} ${row.count === 1 ? "gang" : "gange"} de seneste ${hoursLabel} · åben i alt ${this._duration(row.onMs)}` : row.onMs ? `Åben i ${this._duration(row.onMs)} de seneste ${hoursLabel}` : `Ikke åbnet de seneste ${hoursLabel}`) : history?.loading ? "Henter historik …" : "";
      checks.push({ flag: open, hint: !!row?.count, icon: open ? "mdi:door-open" : "mdi:door-closed", label: entity.attributes?.friendly_name || id, value: open ? "Åben nu" : "Lukket nu", sub });
    }
    const externalHeat = this._linked(room).externalHeat;
    const heatEntity = externalHeat ? this._hass?.states?.[externalHeat] : undefined;
    if (heatEntity) {
      const row = history?.rows?.[externalHeat];
      const sub = row ? (row.onMs ? `Aktiv i ${this._duration(row.onMs)} de seneste ${hoursLabel}` : `Ikke aktiv de seneste ${hoursLabel}`) : history?.loading ? "Henter historik …" : "";
      checks.push({ flag: heatEntity.state === "on", hint: !!row?.onMs, icon: "mdi:heat-wave", label: "Anden varmekilde", value: heatEntity.state === "on" ? "Aktiv nu" : "Ikke aktiv nu", sub });
    }
    if (s.climate && !["no-data"].includes(s.reason)) checks.push({ flag: false, icon: "mdi:radiator", label: "Radiator", value: climate.hvac_action === "heating" ? "Varmer nu" : "Varmer ikke nu", sub: `Ventil ${this._format(s.valve)} %` });
    if (climate.thermal_learning_paused === true) checks.push({ flag: true, icon: "mdi:pause-circle-outline", label: "Læring", value: "På pause", sub: "" });
    if (Array.isArray(climate.unavailable_sensors) && climate.unavailable_sensors.length) checks.push({ flag: true, icon: "mdi:lan-disconnect", label: "Utilgængelige sensorer", value: String(climate.unavailable_sensors.length), sub: climate.unavailable_sensors.join(", ") });
    if (history?.failed) checks.push({ flag: false, icon: "mdi:history", label: "Historik", value: "Kunne ikke hentes", sub: "" });
    const actions = [room.demand_status ? `<button type="button" data-more-info="${this._escape(room.demand_status)}"><ha-icon icon="mdi:chart-timeline-variant"></ha-icon>Vis historik</button>` : "", room.climate ? `<button type="button" data-more-info="${this._escape(room.climate)}"><ha-icon icon="mdi:thermostat"></ha-icon>Åbn termostat</button>` : ""].join("");
    return `<section class="explain" id="explain-${index}">
      <h4><ha-icon icon="mdi:stethoscope"></ha-icon>Hvorfor: ${this._escape(s.title)}</h4>
      <p>${lead}</p>
      ${facts.length ? `<div class="explain-facts">${facts.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("")}</div>` : ""}
      ${note ? `<p class="explain-note">${note}</p>` : ""}
      ${checks.length ? `<div class="explain-checks"><b>Lige nu</b>${checks.map((check) => `<div class="explain-check${check.flag ? " flag" : check.hint ? " hint" : ""}"><ha-icon icon="${check.icon}"></ha-icon><div><span>${this._escape(check.label)}</span>${check.sub ? `<small>${this._escape(check.sub)}</small>` : ""}</div><strong>${this._escape(check.value)}</strong></div>`).join("")}</div>` : ""}
      ${tips.length ? `<div class="explain-tips"><b>Det kan du tjekke</b><ul>${tips.map((tip) => `<li>${tip}</li>`).join("")}</ul></div>` : ""}
      ${actions ? `<div class="explain-actions">${actions}</div>` : ""}
    </section>`;
  }

  _metric(label, value, icon = "") {
    return `<div class="metric">${icon ? `<ha-icon icon="${icon}"></ha-icon>` : ""}<div><span>${label}</span><strong>${value}</strong></div></div>`;
  }

  _room(room, index, compact) {
    const s = this._state(room);
    const valve = Math.max(0, Math.min(100, s.valve || 0));
    const capacity = Math.max(0, Math.min(100, s.utilisation || 0));
    const learning = Math.max(0, Math.min(100, s.signature ? s.validDays / s.requiredDays * 100 : s.learningHours / this._config.learning_hours * 100));
    const showLearning = s.level === "learning" && (!s.signature || s.learnReason === "collecting_days");
    const balanceMax = Math.max(s.heatingPower || 0, s.loss || 0, .001);
    const gainWidth = Math.min(100, (s.heatingPower || 0) / balanceMax * 100);
    const lossWidth = Math.min(100, (s.loss || 0) / balanceMax * 100);
    const open = this._openRooms.has(index);
    const flagged = s.level === "problem" || s.level === "warn";
    return `<article class="room ${compact ? "compact" : ""} ${s.level} ${s.active ? "active" : ""} ${open ? "open" : ""}" data-index="${index}">
      <div class="room-ambient"></div>
      <div class="room-header">
        <div class="identity"><ha-icon icon="${this._escape(room.icon || "mdi:radiator")}"></ha-icon><div><h3>${this._escape(room.name)}</h3><span class="diagnosis"><i></i>${s.title}</span>${room.loop_note ? `<span class="loop-note"><ha-icon icon="mdi:pipe"></ha-icon>${this._escape(room.loop_note)}</span>` : ""}</div></div>
        <div class="temp"><strong>${this._format(s.current,1)}°</strong><span>Mål ${this._format(s.target,1)}°</span></div>
      </div>
      <div class="diagnostic-note"><ha-icon icon="${s.level === "problem" ? "mdi:alert-circle" : s.level === "warn" ? "mdi:alert" : s.level === "learning" ? "mdi:brain" : s.level === "info" ? "mdi:information" : "mdi:check-decagram"}"></ha-icon><span>${s.detail}</span>${flagged ? `<span class="why">${open ? "Skjul" : "Se hvorfor"}<ha-icon icon="${open ? "mdi:chevron-up" : "mdi:chevron-down"}"></ha-icon></span>` : ""}</div>
      ${open ? this._explain(room, s, index) : ""}
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
      ${showLearning ? `<div class="learning-bar"><div><span>Læringsmodel</span><strong>${this._format(learning)}%</strong></div><div class="track"><i style="width:${learning}%"></i></div></div>` : ""}
      <div class="metrics">
        ${this._metric("Effekt nu",`${this._format(s.output)} W`,"mdi:heat-wave")}
        ${this._metric("Denne måned",`${this._format(s.hours,1)} t`,"mdi:timer-outline")}
        ${this._metric("Varmeandel",`${this._format(s.share,1)}%`,"mdi:chart-donut")}
        ${this._metric("Est. pris",`${this._format(s.cost,2)} kr.`,"mdi:cash")}
        ${this._metric("Radiator",`${this._format(s.rated)} W`,"mdi:radiator")}
        ${this._metric("Rumareal",`${this._format(s.area,1)} m²`,"mdi:set-square")}
      </div>
      <div class="deviation ${s.deviation === undefined ? "empty" : s.deviation > 0 ? "over" : "under"}"><span>${s.signature ? "Afvigelse fra normal i lignende vejr" : "Afvigelse fra lært normal"}</span><strong>${s.deviation === undefined ? "Afventer data" : `<ha-icon icon="${s.deviation > 0 ? "mdi:arrow-up-bold" : "mdi:arrow-down-bold"}"></ha-icon>${s.deviation > 0 ? "+" : ""}${this._format(s.deviation,0)}%`}</strong></div>
      <button type="button" class="details" data-index="${index}" aria-expanded="${open}" aria-controls="explain-${index}">${open ? "Skjul diagnosedata" : "Se diagnosedata"} <ha-icon icon="${open ? "mdi:chevron-up" : "mdi:chevron-down"}"></ha-icon></button>
    </article>`;
  }

  _toggle(index, open = !this._openRooms.has(index)) {
    if (!Number.isInteger(index) || !this._config.rooms?.[index]) return;
    if (open) this._openRooms.add(index); else this._openRooms.delete(index);
    this._render();
    if (!open) return;
    this._loadHistory(index);
    const explain = this.shadowRoot.getElementById(`explain-${index}`);
    explain?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    explain?.animate([{ boxShadow: "0 0 0 3px var(--tone)" }, { boxShadow: "0 0 0 0 transparent" }], { duration: 1100, easing: "ease-out" });
  }

  _open(entityId) {
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId } }));
  }

  _render() {
    const rooms = this._config.rooms || [];
    const states = rooms.map((room) => this._state(room));
    const attentionRooms = rooms
      .map((room, index) => ({ room, state: states[index] }))
      .filter(({ state }) => state.level === "problem" || state.level === "warn")
      .sort((a, b) => (a.state.level === b.state.level ? 0 : a.state.level === "problem" ? -1 : 1));
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
      .overview{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.overview>div{min-width:88px;padding:9px 12px;border:1px solid color-mix(in srgb,var(--accent) 16%,transparent);border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--accent);border-radius:14px;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 7%,transparent),transparent 55%),rgba(0,0,0,.08);box-shadow:0 4px 12px rgba(0,0,0,.1)}.overview span{display:block;color:var(--secondary-text-color);font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.overview strong{display:block;margin-top:3px;font-size:16px}.overview .health strong{color:${problems || globalProblem ? "var(--bad)" : learning ? "var(--learn)" : "var(--good)"}}
      .attention-list{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:16px;padding:11px 14px;border:1px solid color-mix(in srgb,var(--bad) 24%,var(--edge));border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--bad);border-radius:14px;background:linear-gradient(145deg,color-mix(in srgb,var(--bad) 8%,transparent),transparent 60%)}.attention-label{display:flex;align-items:center;gap:7px;color:var(--bad);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}.attention-label ha-icon{flex:0 0 16px;width:16px;height:16px;--mdc-icon-size:16px}.attention-items{display:flex;flex-wrap:wrap;gap:8px;flex:1}.attention-chip{display:flex;flex-direction:column;gap:1px;padding:6px 11px;border:0;border-radius:10px;background:var(--ha-card-background);box-shadow:0 3px 8px rgba(0,0,0,.12);font:inherit;text-align:left;cursor:pointer;transition:transform .15s ease}.attention-chip:hover{transform:translateY(-1px)}.attention-chip strong{font-size:11px;line-height:1.2}.attention-chip span{font-size:9px;color:var(--secondary-text-color);line-height:1.2;white-space:nowrap}.attention-chip.problem strong{color:var(--bad)}.attention-chip.warn strong{color:var(--warn)}
      .flow{position:relative;height:70px;margin-bottom:16px;border:1px solid color-mix(in srgb,var(--accent) 18%,var(--edge));border-radius:18px;background:linear-gradient(90deg,rgba(255,138,61,.09),rgba(100,169,255,.05));overflow:hidden}.flow-line{position:absolute;left:7%;right:7%;top:50%;height:3px;border-radius:9px;background:linear-gradient(90deg,var(--heat),var(--warn),var(--learn));box-shadow:0 0 18px rgba(255,138,61,.3)}.flow-line:after{content:"";position:absolute;width:60px;inset:-2px auto -2px -60px;background:linear-gradient(90deg,transparent,#fff,transparent);animation:flow 3s linear infinite}.flow-node{position:absolute;top:50%;transform:translateY(-50%);display:flex;align-items:center;gap:10px;padding:8px 11px;border:1px solid color-mix(in srgb,currentColor 35%,var(--edge));border-radius:12px;background:var(--ha-card-background);box-shadow:0 8px 22px rgba(0,0,0,.2)}.flow-node ha-icon{flex:0 0 25px;width:25px;height:25px;--mdc-icon-size:25px}.flow-node>div{min-width:0}.flow-node strong{display:block;font-size:12px;white-space:nowrap}.flow-node small{display:block;margin-bottom:2px;color:var(--secondary-text-color);font-size:9px;text-transform:uppercase;letter-spacing:.08em}.flow-node.source{left:3%;color:var(--heat)}.flow-node.model{left:50%;transform:translate(-50%,-50%);color:var(--learn)}.flow-node.rooms{right:3%;color:var(--good)}
      .room-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,430px),1fr));gap:12px}.room{--tone:var(--good);position:relative;display:flex;flex-direction:column;overflow:hidden;min-width:0;padding:16px;border:1px solid color-mix(in srgb,var(--tone) 24%,var(--edge));border-left:calc(var(--dashboard-left-accent-width, 1) * 4px) solid var(--tone);border-radius:19px;background:linear-gradient(145deg,color-mix(in srgb,var(--tone) 5%,transparent),rgba(0,0,0,.035));box-shadow:0 8px 25px rgba(0,0,0,.08);transition:transform .2s ease,box-shadow .2s ease}.room.learning{--tone:var(--learn)}.room.warn{--tone:var(--warn)}.room.problem{--tone:var(--bad)}.room.info{--tone:var(--learn)}.room:hover{transform:translateY(-2px);box-shadow:0 13px 30px rgba(0,0,0,.15),0 0 0 1px color-mix(in srgb,var(--tone) 18%,transparent)}.room-ambient{position:absolute;right:-60px;top:-80px;width:180px;height:180px;border-radius:50%;background:var(--tone);opacity:.08;filter:blur(28px);pointer-events:none}.room.problem .room-ambient,.room.active .room-ambient{animation:breathe 2.4s ease-in-out infinite}
      .room-header{display:flex;justify-content:space-between;gap:12px}.identity{display:flex;gap:11px;align-items:flex-start;min-width:0}.identity>ha-icon{flex:0 0 43px;width:43px;height:43px;padding:9px;border-radius:11px;--mdc-icon-size:25px;color:var(--tone);background:color-mix(in srgb,var(--tone) 12%,transparent)}.identity>div{min-width:0}h3{margin:4px 0;font-size:16px}.diagnosis{display:flex;align-items:center;gap:7px;color:var(--secondary-text-color);font-size:11px;font-weight:700}.diagnosis i{flex:0 0 7px;width:7px;height:7px;border-radius:50%;background:var(--tone);box-shadow:0 0 8px var(--tone)}.loop-note{display:flex;align-items:center;gap:5px;margin-top:3px;color:var(--secondary-text-color);font-size:10px;font-weight:600;opacity:.8}.loop-note ha-icon{flex:0 0 12px;width:12px;height:12px;--mdc-icon-size:12px}.temp{text-align:right}.temp strong{display:block;font-size:23px;line-height:1}.temp span{display:block;margin-top:5px;color:var(--secondary-text-color);font-size:10px}
      .diagnostic-note{display:flex;align-items:center;gap:10px;min-height:42px;margin:12px 0;padding:9px 11px;border-radius:10px;color:color-mix(in srgb,var(--tone) 80%,var(--primary-text-color));background:color-mix(in srgb,var(--tone) 9%,transparent);font-size:11px;line-height:1.4}.diagnostic-note ha-icon{flex:0 0 19px;width:19px;height:19px;--mdc-icon-size:19px;color:var(--tone)}.diagnostic-note span{min-width:0}
      .live-panel{display:grid;grid-template-columns:102px 1fr;gap:16px;align-items:center}.valve-wrap{position:relative;height:94px;display:grid;place-items:center}.valve-gauge{width:82px;height:82px;padding:7px;border-radius:50%;background:conic-gradient(var(--tone) var(--valve),rgba(255,255,255,.08) 0);box-shadow:0 0 18px color-mix(in srgb,var(--tone) 15%,transparent)}.valve-gauge>div{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;border-radius:50%;background:var(--ha-card-background)}.valve-gauge strong{display:block;font-size:19px;line-height:1.1}.valve-gauge span{display:block;margin-top:4px;font-size:9px;line-height:1;color:var(--secondary-text-color);text-transform:uppercase;letter-spacing:.06em}.heat-particles{position:absolute;inset:0;pointer-events:none}.heat-particles b{display:none;position:absolute;bottom:8px;left:50%;width:4px;height:4px;border-radius:50%;background:var(--heat);box-shadow:0 0 8px var(--heat)}.active .heat-particles b{display:block;animation:particle 2.2s ease-out infinite}.heat-particles b:nth-child(2){left:38%;animation-delay:.5s}.heat-particles b:nth-child(3){left:62%;animation-delay:1s}.heat-particles b:nth-child(4){left:45%;animation-delay:1.5s}
      .thermal-head{display:flex;justify-content:space-between;margin-bottom:7px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--secondary-text-color)}.thermal-head strong{color:var(--primary-text-color)}.bar,.track{height:7px;overflow:hidden;border-radius:9px;background:rgba(255,255,255,.09)}.bar span,.track i{display:block;height:100%;border-radius:inherit;transition:width .6s ease}.bar.gain span{background:linear-gradient(90deg,var(--heat),var(--warn))}.bar.loss{margin-top:9px}.bar.loss span{background:linear-gradient(90deg,var(--learn),#8876ff)}.thermal small{display:block;margin-top:4px;color:var(--secondary-text-color);font-size:9px}
      .capacity,.learning-bar{margin-top:12px}.capacity>div:first-child,.learning-bar>div:first-child{display:flex;justify-content:space-between;margin-bottom:5px;color:var(--secondary-text-color);font-size:10px}.capacity strong,.learning-bar strong{color:var(--primary-text-color)}.capacity .track i{background:linear-gradient(90deg,var(--good),var(--heat))}.learning-bar .track i{background:linear-gradient(90deg,#6967ff,var(--learn));position:relative}.learning-bar .track i:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.7),transparent);animation:scan 2s linear infinite}
      .metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:13px}.metric{position:relative;display:flex;align-items:center;gap:9px;min-width:0;min-height:54px;padding:9px 10px;border:1px solid color-mix(in srgb,var(--tone) 18%,var(--edge));border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--tone);border-radius:10px;background:linear-gradient(145deg,color-mix(in srgb,var(--tone) 8%,transparent),rgba(0,0,0,.03));box-shadow:0 3px 10px rgba(0,0,0,.08)}.metric ha-icon{flex:0 0 21px;width:21px;height:21px;--mdc-icon-size:21px;color:var(--tone)}.metric>div{min-width:0}.metric span{display:block;overflow:hidden;text-overflow:ellipsis;color:var(--secondary-text-color);font-size:9px;text-transform:uppercase;white-space:nowrap}.metric strong{display:block;margin-top:3px;font-size:12px;line-height:1.1;white-space:nowrap}.deviation{display:flex;justify-content:space-between;gap:12px;margin-top:11px;padding:9px 11px;border-radius:9px;background:color-mix(in srgb,var(--tone) 9%,transparent);font-size:10px}.deviation strong{display:flex;align-items:center;gap:4px;color:var(--tone);white-space:nowrap}.deviation strong ha-icon{width:13px;height:13px;--mdc-icon-size:13px}.deviation.empty strong{color:var(--secondary-text-color);font-weight:600}.deviation.over strong{color:var(--bad)}.deviation.under strong{color:var(--accent)}
      .details{display:flex;align-items:center;justify-content:flex-end;width:100%;margin-top:auto;padding:14px 0 1px;border:0;background:none;color:var(--secondary-text-color);font:inherit;font-size:10px;cursor:pointer}.details:hover{color:var(--tone)}.details ha-icon{flex:0 0 17px;width:17px;height:17px;--mdc-icon-size:17px;margin-left:5px}.no-animation *{animation:none!important}
      .room{cursor:pointer}.why{display:inline-flex;align-items:center;gap:2px;margin-left:auto;padding-left:8px;color:var(--tone);font-size:10px;font-weight:800;white-space:nowrap}.why ha-icon{flex:0 0 16px;width:16px;height:16px;--mdc-icon-size:16px}.diagnostic-note span:not(.why){flex:1}
      .attention-list{cursor:pointer}.attention-chip{flex-direction:row;align-items:center;gap:8px;color:var(--primary-text-color)}.attention-chip .chip-text{display:flex;flex-direction:column;gap:1px;font-size:inherit;color:inherit;white-space:normal}.attention-chip>ha-icon{flex:0 0 16px;width:16px;height:16px;--mdc-icon-size:16px;color:var(--secondary-text-color)}
      .explain{margin:0 0 12px;padding:13px 14px;border:1px solid color-mix(in srgb,var(--tone) 30%,var(--edge));border-radius:14px;background:color-mix(in srgb,var(--tone) 7%,transparent);cursor:auto;font-size:11px;line-height:1.45}.explain h4{display:flex;align-items:center;gap:7px;margin:0 0 6px;color:var(--tone);font-size:12px}.explain h4 ha-icon{flex:0 0 17px;width:17px;height:17px;--mdc-icon-size:17px}.explain p{margin:0 0 10px}.explain .explain-note{color:var(--secondary-text-color);font-size:10px}
      .explain-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:6px;margin-bottom:10px}.explain-facts div{padding:7px 9px;border:1px solid color-mix(in srgb,var(--tone) 16%,var(--edge));border-radius:10px}.explain-facts span{display:block;color:var(--secondary-text-color);font-size:9px;text-transform:uppercase;letter-spacing:.06em}.explain-facts strong{display:block;margin-top:2px;font-size:13px;white-space:nowrap}
      .explain-checks,.explain-tips{margin-bottom:10px}.explain-checks>b,.explain-tips>b{display:block;margin-bottom:4px;color:var(--secondary-text-color);font-size:9px;text-transform:uppercase;letter-spacing:.08em}.explain-check{display:flex;align-items:center;gap:9px;padding:6px 0;border-top:1px solid var(--edge)}.explain-check:first-of-type{border-top:0}.explain-check ha-icon{flex:0 0 18px;width:18px;height:18px;--mdc-icon-size:18px;color:var(--secondary-text-color)}.explain-check.flag ha-icon,.explain-check.flag strong,.explain-check.hint ha-icon{color:var(--tone)}.explain-check>div{flex:1;min-width:0}.explain-check span,.explain-check small{display:block}.explain-check small{color:var(--secondary-text-color);font-size:10px}.explain-check strong{font-size:11px;white-space:nowrap}
      .explain-tips ul{margin:0;padding-left:17px}.explain-tips li{margin:2px 0}.explain-actions{display:flex;flex-wrap:wrap;gap:6px}.explain-actions button{display:inline-flex;align-items:center;gap:6px;padding:8px 11px;border:1px solid color-mix(in srgb,var(--tone) 30%,var(--edge));border-radius:10px;background:transparent;color:var(--primary-text-color);font:inherit;font-size:10px;font-weight:700;cursor:pointer}.explain-actions button:hover{border-color:var(--tone)}.explain-actions ha-icon{flex:0 0 16px;width:16px;height:16px;--mdc-icon-size:16px;color:var(--tone)}
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
      ${attentionRooms.length ? `<div class="attention-list">
        <div class="attention-label"><ha-icon icon="mdi:alert-decagram-outline"></ha-icon>Kræver et kig</div>
        <div class="attention-items">${attentionRooms.map(({ room, state }) => `<button type="button" class="attention-chip ${state.level}" data-jump="${rooms.indexOf(room)}"><span class="chip-text"><strong>${this._escape(room.name)}</strong><span>${state.title}</span></span><ha-icon icon="mdi:chevron-right"></ha-icon></button>`).join("")}</div>
      </div>` : ""}
      <div class="flow"><div class="flow-line"></div><div class="flow-node source"><ha-icon icon="mdi:radiator"></ha-icon><div><small>Målinger</small><strong>${active} aktive</strong></div></div><div class="flow-node model"><ha-icon icon="mdi:brain"></ha-icon><div><small>Læringsmodel</small><strong>${learning} lærer</strong></div></div><div class="flow-node rooms"><ha-icon icon="mdi:shield-check"></ha-icon><div><small>Diagnose</small><strong>${problems || globalProblem ? "Kræver blik" : "Overvåger"}</strong></div></div></div>
      <div class="room-grid ${compact ? "compact" : ""}" style="${compact ? `--compact-cols:${compactCols}` : ""}">${rooms.map((room,index)=>this._room(room,index,compact)).join("")}</div>
    </div></ha-card>`;
    // Knappen, advarslen og selve rummet viser forklaringen; banneret og dets chips åbner den og ruller frem til den.
    this.shadowRoot.querySelectorAll(".details").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); this._toggle(Number(button.dataset.index)); }));
    this.shadowRoot.querySelectorAll("[data-more-info]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); this._open(button.dataset.moreInfo); }));
    this.shadowRoot.querySelectorAll(".attention-chip").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); this._toggle(Number(button.dataset.jump), true); }));
    this.shadowRoot.querySelector(".attention-list")?.addEventListener("click", () => { if (attentionRooms.length) this._toggle(rooms.indexOf(attentionRooms[0].room), true); });
    this.shadowRoot.querySelectorAll("article.room").forEach((article) => article.addEventListener("click", (event) => {
      if (event.composedPath().some((node) => node.classList?.contains("explain"))) return;
      this._toggle(Number(article.dataset.index));
    }));
    for (const index of this._openRooms) if (!this._history[index]) this._loadHistory(index);
  }
}

if (!customElements.get("ha-heating-diagnostics-card")) customElements.define("ha-heating-diagnostics-card", HAHeatingDiagnosticsCard);
window.customCards = window.customCards || [];
window.customCards.push({ type:"ha-heating-diagnostics-card", name:"HA Heating Diagnostics Card", description:"Animeret rumdiagnose til Room Energy Optimizer", preview:true });
console.info(`%c HA HEATING DIAGNOSTICS %c v${VERSION} `,"color:white;background:#5d77ed;font-weight:700","color:#8fa6ff;background:#161b22");
