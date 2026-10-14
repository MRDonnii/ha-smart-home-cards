// Dashboard-wide settings from helpers, as CSS custom properties on <html> (they inherit through shadow DOM), so every
// card and theme can read them without knowing hass. Part of the package since 2026-10-14 (Claude AI; was the /local
// resources ha-dashboard-accent-bridge.js and fonts/load-fonts.js on each HA).
//   input_boolean.dashboard_venstre_accent → --dashboard-left-accent-width (1 = the left accent stripe, 0 = none)
//   input_boolean.dashboard_kort_highlight → --dashboard-card-highlight (1 = hover highlight, 0 = off)
//   input_select.dashboard_font           → the dashboard font, from /local/fonts/<Name>.ttf (only when the helper exists)
// A missing helper leaves the default (on / the theme's font).
(() => {
  if (window.__smartHomeDashboardGlobals) return;
  window.__smartHomeDashboardGlobals = true;
  const SWITCHES = [
    ["input_boolean.dashboard_venstre_accent", "--dashboard-left-accent-width"],
    ["input_boolean.dashboard_kort_highlight", "--dashboard-card-highlight"],
  ];
  const FONTS = ["Montserrat", "Inter", "Poppins", "DM Sans", "Nunito", "Outfit", "Figtree"];
  const FONT_VARS = ["--dashboard-font-family", "--ha-font-family", "--primary-font-family", "--mdc-typography-font-family",
    "--paper-font-common-base_-_font-family", "--paper-font-common-code_-_font-family", "--paper-font-body1_-_font-family",
    "--paper-font-body2_-_font-family", "--paper-font-caption_-_font-family", "--paper-font-title_-_font-family",
    "--paper-font-headline_-_font-family", "--paper-font-subhead_-_font-family", "--paper-font-button_-_font-family"];
  const root = document.documentElement;
  const last = {};
  let fontsAdded = false; let fontNow = ""; let fontGen = 0;
  const set = (name, value) => { if (last[name] === value) return; last[name] = value; root.style.setProperty(name, value); };
  async function font(name) {
    if (!fontsAdded) {
      fontsAdded = true;
      const style = document.createElement("style");
      style.textContent = FONTS.map((n) => `@font-face{font-family:"${n}";src:url("/local/fonts/${n.replaceAll(" ", "")}.ttf") format("truetype");font-weight:${n === "Poppins" ? "400" : "100 900"};font-style:normal;font-display:swap}`).join("\n")
        + "\n:root,html,body,home-assistant{font-family:var(--dashboard-font-family,system-ui,sans-serif)}";
      document.head.append(style);
    }
    const gen = ++fontGen; let family = "system-ui,sans-serif";
    try { const loaded = await document.fonts.load(`16px "${name}"`); if (loaded.length) family = `"${name}",system-ui,sans-serif`; } catch { /* keep system font */ }
    if (gen !== fontGen) return;
    for (const key of FONT_VARS) root.style.setProperty(key, family);
    root.style.fontFamily = family;
  }
  function tick() {
    const hass = document.querySelector("home-assistant")?.hass;
    if (!hass?.states) return;
    for (const [entity, varName] of SWITCHES) set(varName, (hass.states[entity]?.state ?? "on") === "off" ? "0" : "1");
    const wanted = hass.states["input_select.dashboard_font"]?.state;
    if (FONTS.includes(wanted) && wanted !== fontNow) { fontNow = wanted; font(wanted); }
  }
  let timer = setInterval(tick, 1000); tick();
  addEventListener("pagehide", () => { clearInterval(timer); timer = null; });
  addEventListener("pageshow", () => { if (!timer) { timer = setInterval(tick, 1000); tick(); } });
})();
