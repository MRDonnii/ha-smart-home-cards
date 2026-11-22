// ha-dashboard-kiosk-card: the invisible switch for the dashboard kiosk mode (src/shared/dashboard-kiosk.js). Put it
// once anywhere on a dashboard; on that dashboard Home Assistant's top bar and docked sidebar are hidden. Other
// dashboards are not touched. It renders nothing outside edit mode.
//
//   type: custom:ha-dashboard-kiosk-card
//   hide_header: true      # hide the top bar (always shown in edit mode)
//   hide_sidebar: true     # sidebar as a drawer on this dashboard, restored when you leave
//   header_toggle: true    # long press on a header card's menu button shows/hides the top bar on this device
//   header_cards: [ha-home-header-card-front, ha-home-header-card]
//   hold_ms: 600
//   storage_key: ha-dashboard-kiosk-topbar
import { activatorCardClass } from "../../shared/dashboard-activation.js";
import { startKioskModule, KIOSK_VERSION } from "../../shared/dashboard-kiosk.js";

const TAG = "ha-dashboard-kiosk-card";
startKioskModule();

const HaDashboardKioskCard = activatorCardClass({
  title: "Kiosk-tilstand er slået til på dette dashboard",
  lines: ["Usynligt kort: skjuler topbjælken og den faste sidemenu på alle visninger af dette dashboard.", "Hold menuknappen (☰) i header-kortet nede for at vise/skjule topbjælken på denne enhed.", "Vises kun i redigeringstilstand."],
  stub: { hide_header: true, hide_sidebar: true, header_toggle: true },
});

if (!customElements.get(TAG)) customElements.define(TAG, HaDashboardKioskCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === TAG)) {
  window.customCards.push({ type: TAG, name: "HA Dashboard Kiosk", description: `Usynligt kort der skjuler topbjælke og sidemenu på dette dashboard (v${KIOSK_VERSION}).`, preview: false });
}
