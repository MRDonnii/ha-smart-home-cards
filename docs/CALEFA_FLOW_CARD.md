# HA Calefa Flow Card

`custom:ha-calefa-flow-card` is part of the `ha-smart-home-cards.js` HACS bundle. The card shows a Calefa II V-style unit, live temperatures, two calculated temperature differences, working status LEDs on the display and animated flow only when the corresponding measured flow is above the threshold. The bundled unit artwork is an original generated illustration based on the user's visual brief; it is **not** a technical drawing of the installed pipework. The SVG flow layer and image use one coordinate system. The side callout endpoints follow the component diagram: domestic hot water exchanger above the heating exchanger; the pump and heating valve sit in the lower heating circuit. Their lines are positioned from the rendered card geometry and update on resize. The two ΔT connectors calculate supply minus return and show °C only while both sensors are valid. Active flow uses moving directional markers only when its measured `fjv_flow`, `heating_flow` or `water_flow` is positive. Bypass can tint the domestic hot water exchanger and light its status LED without showing a tap flow. The exchanger gradient follows measured inlet and return temperatures, with a soft temperature wash instead of zigzag lines. Use `unit_image` to replace the illustration with an installation photo; check overlay alignment after replacing it.

The display status LEDs use a green standby, red heating, warm domestic hot water, and amber bypass UI mapping. The documented [Sentio LED table](https://mediahub.wavin.com/m/1c25a4f50d6de036/original/Sentio-Quick-reference-guide-for-users.pdf) defines green idle, red heating, blue cooling and yellow warning for Sentio; the Calefa II V manual shows status symbols without that color code. The card does not present blue as domestic hot water or invent a cooling state.

The virtual controller follows the front-menu and submenu layout in [Wavin's Calefa II V installation guide, pages 8–20](https://promo.wavin.com/hubfs/Denmark/Download%20files/Calefa_II_V_Vejledning_Web_20230502.pdf). It opens only when the unit display is tapped. Escape, the backdrop and the close button dismiss it. Short ENTER cycles BV, VARME, INDSTIL. and ALARM on the front screen. Long ENTER opens a submenu or returns. OP/NED navigates; the controls are displayed in the physical order NED, ENTER, OP. Menu branches appear only when a configured Home Assistant state exists for a leaf or a verified writable entity is explicitly mapped. Unsupported schedule, registration, date/time and motorservice branches are hidden.

## Minimal YAML

```yaml
type: custom:ha-calefa-flow-card
```

## Example for the current Wavin integration

Sensor names follow a verified Wavin integration instance; entity IDs vary by installation. The `number`/`select` IDs below are explicit placeholders and must be replaced with your own verified entities.

```yaml
type: custom:ha-calefa-flow-card
title: Calefa II 40/40
subtitle: Fjernvarmeunit
fjv_supply: sensor.wavin_calefa_2_fjernvarme_fremlob_temperatur
fjv_return: sensor.wavin_calefa_2_fjernvarme_retur_temperatur
heating_supply: sensor.wavin_calefa_2_cvv_fremlob_temperatur
heating_return: sensor.wavin_calefa_2_cvv_retur_temperatur
heating_setpoint: sensor.wavin_calefa_2_radiator_onsket_fremlob_ovf
dhw_temperature: sensor.wavin_calefa_2_brugsvand_ud_temperatur
dhw_setpoint: sensor.wavin_calefa_2_brugsvand_setpunkt
cold_water_temperature: sensor.wavin_calefa_2_koldtvandsfoler_ved_veksler
water_flow: sensor.wavin_calefa_2_brugsvandsflow
pump: sensor.wavin_calefa_2_heating_pump_status_itc
heating_valve: sensor.wavin_calefa_2_cvv_ventilposition
dhw_valve: sensor.wavin_calefa_2_ventilposition
heating_active: sensor.wavin_calefa_2_heating_state_ch
dhw_active: sensor.wavin_calefa_2_brugsvand_status
pressure: sensor.wavin_calefa_2_anlaegstryk
outdoor_temperature: sensor.wavin_calefa_2_udetemperatur_ut
# Optional, verified writable entities. Every actual change needs a second ENTER.
display_entities:
  dhw_setpoint: number.REPLACE_WITH_DHW_SETPOINT
  parallel_shift: number.REPLACE_WITH_PARALLEL_SHIFT
  heat_curve_type: select.REPLACE_WITH_CURVE_TYPE
  heat_curve_slope: number.REPLACE_WITH_CURVE_SLOPE
  heat_min_supply: number.REPLACE_WITH_MIN_SUPPLY
  heat_max_supply: number.REPLACE_WITH_MAX_SUPPLY
  heat_max_return: number.REPLACE_WITH_MAX_RETURN
  return_limiter_mode: select.REPLACE_WITH_RETURN_MODE
  return_limiter_gain: number.REPLACE_WITH_RETURN_GAIN
  summer_shutdown: number.REPLACE_WITH_SUMMER_SHUTDOWN
  bypass_temperature: number.REPLACE_WITH_BYPASS_TEMPERATURE
  auto_standby: switch.REPLACE_WITH_AUTO_STANDBY
  return_enabled: switch.REPLACE_WITH_RETURN_ENABLED
  standby: switch.REPLACE_WITH_STANDBY
  circulation_pump: switch.REPLACE_WITH_CIRCULATION_PUMP
  room_profile: select.REPLACE_WITH_ROOM_PROFILE
  room_schedule: switch.REPLACE_WITH_ROOM_SCHEDULE
  room_temporary_mode: switch.REPLACE_WITH_ROOM_TEMPORARY_MODE
  eco_temperature: number.REPLACE_WITH_ECO_TEMPERATURE
  comfort_temperature: number.REPLACE_WITH_COMFORT_TEMPERATURE
  extra_comfort_temperature: number.REPLACE_WITH_EXTRA_COMFORT_TEMPERATURE
  temporary_temperature: number.REPLACE_WITH_TEMPORARY_TEMPERATURE
  temporary_duration: number.REPLACE_WITH_TEMPORARY_DURATION
```

All ordinary entity fields are optional: `fjv_supply`, `fjv_return`, `fjv_flow`, `heating_supply`, `heating_return`, `heating_setpoint`, `heating_flow`, `dhw_temperature`, `dhw_setpoint`, `cold_water_temperature`, `water_flow`, `pump`, `pump_speed`, `heating_valve`, `dhw_valve`, `heating_active`, `dhw_active`, `power`, `pressure`, `room_temperature`, `outdoor_temperature`. `alarm_entities` accepts a list of existing `binary_sensor` entities. Missing, unknown and unavailable entities show a dash or hide an optional metric; no service is called by tapping an unavailable metric.

## Controller menu specification

| Parent | Child | Data / binding | Behavior |
| --- | --- | --- | --- |
| BV front | Temperature | `dhw_setpoint` / `display_entities.dhw_setpoint` | Live; writable only with a mapped `number` |
| BV | Temperatur, Status, Bypass | BV temperatures, flow, valve | Status values read-only |
| Bypass | Mode | AUTO, PLANLÆG, KOMFORT, ØKO | Read-only unless a select has exactly these options |
| Bypass | Planlæg → Ugeplan / weekday | No HA mapping | Hidden |
| Bypass | Temperatur → Type / Ønsket temperatur | `bypass_temperature_mode`, `bypass_temperature` | Number writable only when explicitly mapped; type requires matching select options |
| VARME front | Parallelforskydning | `parallel_shift` | Validated `number`, if mapped |
| ITC | Status, Varmekurve, Returbegrænser | Live heat data | Status read-only |
| Varmekurve | Type & værdi, Paral-forskyd, Min Varme F., Maks Varme F. | `heat_curve_type`, `heat_curve_slope`, `parallel_shift`, `heat_min_supply`, `heat_max_supply` | Live or read-only unless mapped |
| Returbegrænser | Mode, Maks. retur, Forstærkning | `return_limiter_mode`, `heat_max_return`, `return_limiter_gain` | Live or read-only unless mapped |
| INDSTIL. | BV, ITC, Rum, Programmer, Avanceret, Dato og tid, Føler, Exit | Menu navigation | Read-only by default |
| Programmer | Temperaturer → Udkobl. temp. | `summer_shutdown` | Number writable if mapped |
| Avanceret | Komponenter → Tilmeld / Fjern → Udendørsføler / Termostat | No HA mapping | Hidden |
| Avanceret | BV motorservice / CV motorservice | No HA mapping | Hidden |
| Dato og tid | År, Måned, Dag, Timer, Minutter, Sekunder | No HA mapping | Hidden |
| Føler | Available temperatures, flow and pressure | Configured sensor entities | Read-only |
| ALARM | Aktuelle alarmer | `alarm_entities` with existing binary sensors | Hidden when no alarm entities are configured; no invented faults |

The installed `wavin_calefa` integration exposes verified `number` and `select` controls. The card sends only `number.set_value`, `select.select_option`, or `switch.turn_on`/`turn_off`, after a separate confirmation, and only to an explicitly mapped entity of that domain. It checks the current number range or select options from Home Assistant state attributes. The INDSTIL. menus also expose the verified HA room profile, scheduled and temporary modes, Eco/Comfort temperatures, automatic standby, return limiter enablement, Calefa standby and circulation pump controls when their mapped entities exist. The integration's DHW mode (`Skema`, `Adaptivt skema`, `Øko`, `Komfort`) is **not** treated as the manual's bypass mode (`AUTO`, `PLANLÆG`, `KOMFORT`, `ØKO`), since those controls are not equivalent. There is no automatic component registration or motorservice action. The ALARM front is hidden until an actual configured `alarm_entities` state is available. Empty menu groups are pruned automatically.

## Appearance and activity

The card uses container queries. At 900 px and wider, the unit is centered between compact side callouts. The card has no decorative header or separate top status cards; the original display carries heating and domestic hot water status LEDs. The pump has a rotating indicator over its housing when on and a quiet static indicator when off. Small valve readouts sit next to their physical positions, including on mobile. A button to the right of the display opens the existing Fjernvarme card popup, with Styring and Forbrug tabs; all eight existing Forbrug cards stay in that card-owned popup. At 521–899 px, the unit precedes two-column metric rows. At 520 px and below, temperature pairs lead, followed by the unit and a compact component grid. The layout includes safe-area bottom padding, avoids horizontal scrolling, and supports card widths 360, 390, 430, 600, 900 and 1200 px.

The optional `unit_image` (or legacy `background_image`) accepts a Home Assistant-accessible URL. `background_fit: contain` is retained for compatibility. The bundled illustration is encoded in the HACS JavaScript bundle; no additional HACS resource is needed. If a custom image fails, the card falls back to its SVG unit. `animations: false` disables motion. CSS also respects `prefers-reduced-motion`, and an off-screen observer pauses animation.

`flow_threshold` defaults to `0.05`; `valve_threshold` defaults to `1`. Explicit `heating_active` / `dhw_active` entities take precedence over flow, pump and valve fallbacks. `show_footer: false` hides the footer. FJV ΔT equals FJV supply minus FJV return; heating ΔT equals heating supply minus heating return. Each pair shares a circular ΔT badge: green means at or above its configured cooling target, red means below, and neutral means a reading is missing. Defaults are `fjv_good_delta: 20` and `heating_good_delta: 5` °C; both can be adjusted in card configuration.

The DOM is built when configuration changes. Normal Home Assistant updates compare relevant state object references and update existing text/classes. No polling or JavaScript animation loop is used.
