# Dantherm Live Card

Animated Dantherm ventilation unit with live temperatures, fan and bypass readbacks, and the Home Assistant controls of the [Dantherm Control](https://github.com/MRDonnii/dantherm-control-ha) integration (formerly HCH5 Control): an HCH5 MK1 with HAC1 and the Raspberry Pi controller, or an MKII/RCV/HCV unit over Modbus.

The card type is `custom:ha-dantherm-live-card`. The old type `custom:ha-hch5-live-card` is kept as an alias and renders the same card, so existing dashboards keep working; only the new name is listed in the card picker.

- `unit_name`: what the card's texts call the unit, e.g. `Dantherm RCV320 P2`. By default the model of the unit's Home Assistant device is used (taken from its temperature, fan, bypass or mode entities), prefixed "Dantherm" in sentences; without a known model the texts say "anlægget".

```yaml
type: custom:ha-dantherm-live-card
afterheat_coil: water
entities:
  water_flow: sensor.example_afterheat_water_flow
  water_return: sensor.example_afterheat_water_return
  afterheat_active: binary_sensor.example_afterheat_active
  power: sensor.example_unit_power
  attic_temperature: sensor.example_attic_temperature
  # … the other unit entities
```

The card only shows what it has entities for. An entity counts when it is configured and Home Assistant knows it; one that is unavailable still shows as "—" (a real outage), while a missing one leaves its part out and the layout closes the gap:

- Afterheat: the coil, HAC1 with its wiring, the "Ekstern eftervarme" readback and the "Eftervarme setpunkt" tile need an `afterheat_*` or `water_*` entity; the thermostat needs `afterheat_climate`; water readings need `water_flow`/`water_return`, the frost pin `afterheat_frost`.
- Raspberry Pi: the Pi on the RS485 cable, the "Master" pill and "Aktiv beslutning" need `active_master`, `effective_source` or `effective_reason`. Without HAC1 and Pi no wiring is drawn.
- Each status pill, temperature reading, fan and bypass readback, control (mode, levels, boost buttons, bypass, fireplace, bonfire, OFF, free cooling/Køl) and tile (indoor climate, diagnostics and energy, "Beregnet fra målt T2") is shown only with its own entity. Cost lines need the matching price entity.
- An MKII, RCV or HCV unit connected directly over Modbus works too: the mode buttons follow its operation-mode select, `bypass_control` may be its "Bypass (manuel)" switch, `effective_level` may read `level_3`, and an alarm sensor as `diagnostics_status` (without `diagnostics_alarm_text`) shows its alarm code.

```yaml
type: custom:ha-dantherm-live-card
entities:
  mode_control: select.example_unit_operation_mode
  level_control: select.example_unit_fan_step
  effective_level: sensor.example_unit_current_fan_step
  outdoor_temperature: sensor.example_unit_outdoor_temperature
  supply_temperature: sensor.example_unit_supply_temperature
  extract_temperature: sensor.example_unit_extract_temperature
  exhaust_temperature: sensor.example_unit_exhaust_temperature
  supply_fan_rpm: sensor.example_unit_supply_fan_speed
  extract_fan_rpm: sensor.example_unit_extract_fan_speed
  bypass: binary_sensor.example_unit_bypass_active
  bypass_control: switch.example_unit_bypass_manual
  diagnostics_status: sensor.example_unit_alarm
```

- `afterheat_coil`: how the external afterheater is drawn. `electric` (default) shows heating elements that glow while it heats. `water` shows a water coil: its flow and return pipes run to the water readings, are tinted by the `water_flow` and `water_return` temperatures, and the water moves while `afterheat_active` is on.
- `afterheat: false`: hides the afterheat everywhere (coil, HAC1 wiring, readback, setpoint tile, lift/power/water/frost values) even if `afterheat_*` or `water_*` entities are listed.
- `integration: dantherm`: for people using the standard Dantherm integration. Only entity keys that integration provides are used (temperatures, fan rpm/percent, `level_control`, `bypass`, `humidity`, `co2`, `filter_life`, `power`, outdoor air quality, prices); every HCH5 Control/Pi-only key (afterheat, water, frost, bus, diagnostics, boost/fireplace/cooling controls, modes) is ignored and its blocks are hidden. Implies no afterheat.
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
- `controls: false` (with `variant: smartdash`): the compact drawing and readings only, without the control rows — for a side panel that opens the full card elsewhere.
