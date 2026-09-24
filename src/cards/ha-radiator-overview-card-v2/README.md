# HA Radiator Overview Card V2

Responsive room climate overview for Home Assistant. Use `custom:ha-radiator-overview-card-v2` with the same `rooms` configuration as the original radiator overview card.

The outdoor room appears first in the thermostat grid. Sensor-only rooms follow the thermostat rooms. The indoor average and status summary appear at the bottom.

The card updates existing DOM nodes for ordinary Home Assistant state changes; it rebuilds the layout only when its configuration changes.
