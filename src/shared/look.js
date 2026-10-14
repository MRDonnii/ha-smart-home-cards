// New or classic look, the same way in every card that has both (Claude AI, 2026-10-14; user: "versionerne er i pakken
// og kan skiftes imellem som standard … en beskrivelse af hvilken helper der skal til … ellers en skifte knap i
// opsætning af kort").
//   style: new | classic        chosen in the card's editor ("v2" also means new)
//   style_entity: input_boolean  a helper switch, on = new, off = classic; wins over `style` while it exists
// Cards with more than one switchable part name their keys themselves (e.g. room_tiles / room_tiles_entity).

export function isNewLook(hass, config, { entity = "style_entity", key = "style", fallback = false } = {}) {
  const id = config?.[entity];
  const state = id ? hass?.states?.[id]?.state : undefined;
  if (state === "on" || state === "off") return state === "on";
  const value = config?.[key];
  if (value === "new" || value === "v2") return true;
  if (value === "classic") return false;
  return fallback;
}

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** The two settings for a card editor written by hand: a Ny/Klassisk choice and the helper. */
export function lookEditorHtml(config, { entity = "style_entity", key = "style", fallback = false, label = "Udseende" } = {}) {
  const value = config?.[key] === "v2" ? "new" : config?.[key] || (fallback ? "new" : "classic");
  return `<div class="look-editor" style="margin:12px 0;padding:10px;border:1px solid var(--divider-color);border-radius:10px">
    <label style="display:block;font-weight:600;margin:0 0 4px">${esc(label)}</label>
    <select data-look-key="${esc(key)}" style="box-sizing:border-box;width:100%;padding:9px">
      <option value="new"${value === "new" ? " selected" : ""}>Ny</option><option value="classic"${value === "classic" ? " selected" : ""}>Klassisk</option></select>
    <label style="display:block;font-weight:600;margin:10px 0 4px">Skifteknap (valgfri input_boolean)</label>
    <input data-look-key="${esc(entity)}" value="${esc(config?.[entity] || "")}" placeholder="input_boolean.dashboard_…" style="box-sizing:border-box;width:100%;padding:9px">
    <div style="margin-top:5px;font-size:12px;color:var(--secondary-text-color)">Til = ny, fra = klassisk. Så længe hjælperen findes, styrer den udseendet.</div></div>`;
}

/** Wire the controls from lookEditorHtml: each change sends config-changed with the key set (empty = removed). */
export function wireLookEditor(root, editor, getConfig) {
  root.querySelectorAll("[data-look-key]").forEach((el) => el.addEventListener("change", () => {
    const config = { ...getConfig() };
    const value = el.value.trim();
    if (value) config[el.dataset.lookKey] = value; else delete config[el.dataset.lookKey];
    editor.dispatchEvent(new CustomEvent("config-changed", { bubbles: true, composed: true, detail: { config } }));
  }));
}

/** The same two settings for cards with getConfigForm. */
export function lookFormSchema({ entity = "style_entity", key = "style" } = {}) {
  return [
    { name: key, selector: { select: { mode: "dropdown", options: [{ value: "new", label: "Ny" }, { value: "classic", label: "Klassisk" }] } } },
    { name: entity, selector: { entity: { domain: "input_boolean" } } },
  ];
}
export const LOOK_LABELS = { style: "Udseende", style_entity: "Skifteknap (input_boolean: til = ny, fra = klassisk)" };
