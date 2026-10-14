// HA Trueguard Status Card – `custom:ha-trueguard-status-card`: the security status tile (ha-home-status-card,
// preset security) for one Trueguard alarm: only the first alarm, without its picture. Same config as the status card,
// incl. style / style_entity for the new look. Moved into the package from a dashboard resource (Claude AI, 2026-10-14).
import "../ha-home-status-grid-card/ha-home-status-grid-card.js";

customElements.whenDefined("ha-home-status-card").then(() => {
  if (customElements.get("ha-trueguard-status-card")) return;
  const Base = customElements.get("ha-home-status-card");
  class HaTrueguardStatusCard extends Base {
    render() {
      super.render();
      const row = this.shadowRoot?.querySelector(".security-row");
      if (!row) return;
      const alarm = row.children[0];
      row.children[1]?.remove();
      alarm?.querySelector("img")?.remove();
      alarm?.setAttribute("title", "Trueguard");
      alarm?.setAttribute("aria-label", "Trueguard");
    }
  }
  customElements.define("ha-trueguard-status-card", HaTrueguardStatusCard);
  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === "ha-trueguard-status-card")) {
    window.customCards.push({ type: "ha-trueguard-status-card", name: "HA Trueguard Status Card", description: "Sikkerhedsflisen for én Trueguard-alarm (statuskort, preset security)." });
  }
});
