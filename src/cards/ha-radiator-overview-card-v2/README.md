# HA Radiator Overview Card V2

Responsive room climate overview for Home Assistant. Use `custom:ha-radiator-overview-card-v2` with the same `rooms` configuration as the original radiator overview card.

The outdoor room appears first in the thermostat grid. Sensor-only rooms fill the empty cells after the last thermostat card as small cards, two stacked per cell (four when only one cell is free). When the last row is full, they get a row of their own. The indoor average and status summary appear at the bottom.

The card updates existing DOM nodes for ordinary Home Assistant state changes; it rebuilds the layout only when its configuration changes.

## Air quality

A room with air quality sensors shows its level on the room card and gets a "Luftkvalitet" tab in its popup with 24-hour curves (`ha-air-quality-card`):

```yaml
rooms:
  - name: Bedroom
    temperature: sensor.bedroom_temperature
    co2: sensor.bedroom_carbon_dioxide
    pm25: sensor.bedroom_pm2_5
    air_quality: sensor.bedroom_air_quality
```

All three keys are optional; one is enough. See [HA Air Quality Card](../ha-air-quality-card) for the levels.
