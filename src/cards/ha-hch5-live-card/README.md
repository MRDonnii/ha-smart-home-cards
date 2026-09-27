# HCH5 Live Control Card

Animated Dantherm HCH5 unit with live temperatures, fan and bypass readbacks, and the Home Assistant controls of the HCH5 Control integration.

```yaml
type: custom:ha-hch5-live-card
afterheat_coil: water
entities:
  water_flow: sensor.example_afterheat_water_flow
  water_return: sensor.example_afterheat_water_return
  afterheat_active: binary_sensor.example_afterheat_active
  power: sensor.example_hch5_power
  attic_temperature: sensor.example_attic_temperature
  # … the other HCH5 entities
```

- `afterheat_coil`: how the external afterheater is drawn. `electric` (default) shows heating elements that glow while it heats. `water` shows a water coil: its flow and return pipes run to the water readings, are tinted by the `water_flow` and `water_return` temperatures, and the water moves while `afterheat_active` is on.
- `afterheat_outdoor_cutoff`: outdoor temperature (°C) from which HAC1 blocks the afterheat; 15 by default.
- `entities.power`: optional power meter for the unit (W), e.g. a smart plug or relay. Shown as "Forbrug" next to the status pills, and in the Smartdash header.
- `entities.attic_temperature`: optional loft/attic temperature, shown as "Loftrum" beside "Forbrug" and in the Smartdash header.
- `entities.supply_recovery`, `recovered_heat`, `afterheat_lift`, `afterheat_power`, `supply_airflow`: optional values the Pi computes from a measured T2 before the afterheat coil. Shown as "Beregnet fra målt T2" inside the afterheat thermostat card, and as a short line in Smartdash.
- `entities.diagnostics_status`, `diagnostics_alarm_text`, `frost_state`, `filter_power`, `sfp`, `recovered_today`, `recovery_factor`, `unit_energy_today`, `afterheat_today`: optional Pi diagnostics. Active alarms show as a strip at the top (and in the Smartdash line), the rest under "Diagnose og energi i dag".
- `entities.measured_energy_today`: optional daily HA Utility Meter from a physical Dantherm kWh meter. It takes priority over the Pi's estimated `unit_energy_today`.
- `entities.electricity_price` and `entities.heat_price`: optional current prices in DKK/kWh. Cost figures are approximate. Afterheat and recovered heat are air-side estimates; recovered heat × heat price is a theoretical replacement value, not measured bill savings.
- `entities.bonfire_control` and `entities.bonfire_remaining`: the integration's "Bål i haven" select and "Bål tid tilbage" sensor (HCH5 Control 0.8.1+). Adds a "Bål i haven" card under the fireplace controls: 30 min to 3 hours with the fans at minimum, stopping by itself.
- `entities.standby_control` and `standby_remaining`: optional "Sluk anlæg" select and remaining-off-time sensor of the integration (0.8.1-beta.3 or newer). Adds OFF to the level row, with a popup for 1, 4 or 8 hours, until tomorrow at 07:00 or permanently. Pressing a level switches the unit on again.
- `variant: smartdash`: the compact drawing and controls used by Smartdash.
