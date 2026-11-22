// th-theme-card: the invisible switch for the TH theme (src/shared/th-theme.js). Put it once anywhere on a dashboard;
// every view of that dashboard then gets the glass navbar and the dark glass card surface. Other dashboards are not
// touched. It renders nothing outside edit mode.
//
//   type: custom:th-theme-card
//   navbar: true   # glass look for ha-navbar-card (default true)
//   cards: true    # dark glass surface, corners and gold accent for standard cards (default true)
import { activatorCardClass } from "../../shared/dashboard-activation.js";
import { startThemeModule, TH_THEME_VERSION } from "../../shared/th-theme.js";

const TAG = "th-theme-card";
startThemeModule();

const ThThemeCard = activatorCardClass({
  title: "TH-tema er slået til på dette dashboard",
  lines: ["Usynligt kort: giver bundmenuen og standardkortene på alle visninger TH-glasudtrykket.", "Vises kun i redigeringstilstand."],
  stub: { navbar: true, cards: true },
});

if (!customElements.get(TAG)) customElements.define(TAG, ThThemeCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === TAG)) {
  window.customCards.push({ type: TAG, name: "TH Theme", description: `Usynligt kort der slår TH-temaet til på dette dashboard (v${TH_THEME_VERSION}).`, preview: false });
}
