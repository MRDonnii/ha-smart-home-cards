import { Section } from "./base.js";
import "../../ha-electricity-bill-card/ha-electricity-bill-card.js";

export class BillSection extends Section {
  html() {
    return '<div data-ref="billHost"></div>';
  }

  mount(root) {
    super.mount(root);
    this.bill = document.createElement("ha-electricity-bill-card");
    this.config = { ...customElements.get("ha-electricity-bill-card").getStubConfig(), ...this.card.config.bill_card };
    this.bill.setConfig(this.config);
    this.refs.billHost.append(this.bill);
  }

  ids() {
    const config = this.config;
    return [config.forecast_entity, config.bills_entity, config.provider_entity, config.agreement_entity].filter(Boolean);
  }

  update() {
    this.bill.hass = this.card.hass;
  }
}
