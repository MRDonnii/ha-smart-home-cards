# HA Calefa Flow Card

`custom:ha-calefa-flow-card` is part of the `ha-smart-home-cards.js` HACS bundle. The card shows a Calefa II V-style unit, live temperatures, two calculated temperature differences, working status LEDs on the display and animated flow only when the corresponding measured flow is above the threshold. The bundled unit artwork is an original generated illustration based on the user's visual brief; it is **not** a technical drawing of the installed pipework. The SVG flow layer and image use one coordinate system. The side callout endpoints follow Wavin's component drawing and principle diagram for the Calefa II V 40/40 (installation guide, October 2025): the two plate exchangers sit one behind the other, the rear heating exchanger (02) shows as the copper strip above the front domestic hot water exchanger (01); the pump and heating valve sit in the heating circuit. Their lines are positioned from the rendered card geometry and update on resize. The two ΔT connectors calculate supply minus return and show °C only while both sensors are valid. Active flow uses moving directional arrows only when its measured `fjv_flow`, `heating_flow` or `water_flow` is positive. Bypass can tint the domestic hot water exchanger and light its status LED without showing a tap flow. The exchanger faces carry a fog layer that runs from the hot end to the cooled end (see below). Use `unit_image` to replace the illustration with an installation photo; check overlay alignment after replacing it.

The five status LEDs below the LCD follow the [Calefa II V installation guide, page 11](https://mediahub.wavin.com/asset/e8a83f16-98ba-40d9-b1f7-36f48de9e858/Calefa-II-V-Installer-Guide-UK.pdf): power (green when unit data is available), fault (yellow warning or red error from configured alarm entities), mode (red heating, steady cyan hot water, slow cyan blink bypass), LAN, and peripheral. The peripheral LED uses the configured outdoor temperature sensor and its fault alarm: green when available and slow green blink on fault. LAN needs an optional `lan_status` entity; without a Calefa LAN/cloud entity it stays neutral. `peripheral_status` can override the outdoor sensor proxy. The card does not claim to read USB power, boot/update, or wireless enrollment directly from Modbus.

Tapping the unit display opens a controller popup that reproduces the physical Wavin Calefa II V / DHW 212 V ITC controller: light-grey fascia, Wavin logo, USB flap, a monochrome pixel LCD, the five status indicators (mirroring the LEDs on the unit illustration) and the recessed DOWN / ENTER / UP touch strip. Screens and navigation follow [Wavin's Calefa II V installation guide, pages 10–24](https://promo.wavin.com/hubfs/Denmark/Download%20files/Calefa_II_V_Vejledning_Web_20230502.pdf): a short ENTER selects or switches front menu (BV, VARME, INDSTIL. and ALARM while an alarm is active), a held ENTER (0.6 s) opens the front's menu or goes back one level, and UP/DOWN move the black selection bar or change values. Menus end with an Exit row, show a position counter such as `2/5` and a scrollbar; values use the controller's numeric editor (`– Behold/Sæt +`) or option editor (`◀ Behold/Sæt ▶`). Escape, the backdrop and the close button dismiss the popup; on a keyboard, arrows move, Enter is a short press and Shift+Enter or Backspace a long press.

## Minimal YAML

```yaml
type: custom:ha-calefa-flow-card
```

## Example for the current Wavin integration

For a new card, only `type: custom:ha-calefa-flow-card` is required. The card reads Home Assistant's entity registry and binds the sensors, supported controls and alarms belonging to the single Wavin Calefa integration automatically. If several Calefa integrations exist, select the desired one in the card editor; the choice is stored as `calefa_entry`. The selected integration's native bindings replace old manual bindings. Manually added controls are retained only when the entity registry confirms that they belong to the selected integration. Entity renames are supported because discovery uses registry unique IDs rather than visible entity IDs. Existing manually configured cards keep their explicit bindings until an integration is selected.

`fjv_flow`, `heating_flow`, `power` and `room_temperature` may come from separate helpers or other integrations and are still optional manual bindings. The card does not guess writable controls whose meaning cannot be verified from the Calefa registry. All side tiles use the same width on both sides, including the `V-ventil` and `BV-ventil` tiles.

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
# Optional. Normally bound automatically from the entity registry; only needed for manual cards.
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
  return_priority: switch.REPLACE_WITH_RETURN_PRIORITY
  summer_shutdown: number.REPLACE_WITH_SUMMER_SHUTDOWN
  bypass_mode: select.REPLACE_WITH_BYPASS_MODE
  bypass_temperature: number.REPLACE_WITH_BYPASS_TEMPERATURE
  circulation_temperature: number.REPLACE_WITH_CIRCULATION_TEMPERATURE
  auto_standby: switch.REPLACE_WITH_AUTO_STANDBY
  standby: switch.REPLACE_WITH_STANDBY
  vacation: switch.REPLACE_WITH_VACATION
  vacation_dhw: switch.REPLACE_WITH_VACATION_DHW
  vacation_ch: switch.REPLACE_WITH_VACATION_CH
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

`🔒` marks rows that are display-only: the controller function exists, but the `wavin_calefa` integration exposes no control for it. Opening one shows "Kun på enheden" and never calls a service. A writable row whose entity is missing or unavailable is shown as `[--]` with the same lock.

| Menu | Rows | Binding (integration unique ID) | Behaviour |
| --- | --- | --- | --- |
| BV front | `– 52° +` | `dhw_setpoint` (`dhw_temperature_setpoint_control`) | UP/DOWN edit, ENTER sets, held ENTER cancels |
| VARME front | `+0.0°` with thermometer | `parallel_shift` (`heat_curve_parallel_shift`) | Same as BV front, ±9 °C |
| INDSTIL. front | gear | – | Held ENTER opens INDSTIL. |
| ALARM front | warning and count | `alarm_entities` | Only while an alarm is active; alarm list and details are read-only |
| BV | Temperatur, Status, Bypass, Cirkulation, Exit | `dhw_setpoint`, `circulation_temperature` (`circulation_temperature_control`) | Status shows BV/KV/FJF/FJR/FLW/BVV, then status, bypass, blocking, regulator and circulation |
| Bypass | Mode, Se tidsplaner 🔒, Temperatur | `bypass_mode` (`dhw_mode_control`), `bypass_temperature` (`dhw_bypass_temperature_control`) | Mode shows Auto / Planlæg / Komfort / Øko, written as the entity's own `Adaptivt skema` / `Skema` / `Komfort` / `Øko` |
| ITC | Status, Varmekurve, Returbegrænser, Exit | `heating_active` | Status shows VF/VR/UT/ØVF/CVV/PUM, then status, blocking and regulator |
| Varmekurve | Type, Hældning, Paral-forskyd, Min. Varme F., Maks. Varme F. | `heat_curve_type`, `heat_curve_slope`, `parallel_shift`, `heat_min_supply`, `heat_max_supply` | Manuel / Gulvvarme / Radiator |
| Returbegrænser | Mode, Maks. retur, Forstærkning, Prioritet | `return_limiter_mode`, `heat_max_return`, `return_limiter_gain`, `return_priority` (`return_limiter_priority_over_supply`) | Fra / Maksimum |
| INDSTIL. | BV, ITC, Rum, Programmer, Avanceret, Dato og tid 🔒, Føler, Exit | – | BV and ITC are shortcuts to the same menus |
| Rum | Komfortniveau, Øko, Komfort, Ekstra komfort, Skema, Midl. mode, Midl. temp., Midl. varighed | `room_profile`, `eco_temperature`, `comfort_temperature`, `extra_comfort_temperature`, `room_schedule`, `room_temporary_mode`, `temporary_temperature`, `temporary_duration` | |
| Programmer | Temperaturer → Udkobl. temp., Standby, Aut. standby, Ferie, Ferie BV, Ferie CV | `summer_shutdown`, `standby`, `auto_standby`, `vacation`, `vacation_dhw`, `vacation_ch` | |
| Avanceret | CV manl. ventil, BV motorservice, CH motorservice, Komponenter, Kopier opsætning | – | All 🔒 |
| Føler | FJF, BV, FJR, KV, PRE, FLW, VF, VR, UT, ØVF, CVV, BVV, PUM, BYP | Configured sensors | Read-only, six values per page |

Writes use only `number.set_value`, `select.select_option` or `switch.turn_on`/`turn_off` on the bound entity of that domain. Numbers are stepped with the entity's own `step` and kept within its `min`/`max`; selects only offer options that the entity lists; a value is sent only when ENTER is pressed on `Sæt`. If Home Assistant rejects the call, the LCD shows "Ikke gemt" with the reason. The integration names the `dhw_mode_control` select "Bypass-mode" with the same four modes as the guide's bypass menu (Auto = adaptive schedule, Planlæg = fixed schedule, Komfort = always on, Øko = off), so the card binds it there. Older manual `display_entities` keys `return_enabled` and `circulation_pump` are no longer used; the registry binds `return_priority` and the vacation switches by unique ID instead.

## Appearance and activity

The card is one composition at every width: compact tiles on the left, the unit in the middle and compact tiles on the right, scaled with the card's own width (container queries). The phone layout is the same as the desktop layout. Tiles are only as wide as their content, sit next to the part they describe and a thin callout line points to that pipe or component; overlapping tiles are pushed apart automatically on resize. Text has minimum sizes (labels 10 px, values 15 px) and every tile is at least 44 px high.

- **Left:** BV-ventil, FJV frem / FJV retur with the ΔT ring between them, Varmeventil and Pumpe.
- **Right:** Varmt vand, Varme frem / Varme retur with the ΔT ring between them, and Koldt vand.
- **Below the unit:** the connection codes FF, FR, VR, VF, BV and KV (left-handed order from Wavin's connection sketch), coloured like their pipes.
- **Footer:** Bolig, Ude, Effekt and Tryk when configured.

Component positions follow Wavin's component drawing for the Calefa II V: 37 DHW control valve at the top centre, 22/34 heating valve at the centre left, 40 pump at the bottom centre, the rear heating exchanger (02) with the air vent (49) on its upper port and the front DHW exchanger (01) on the right. The overlay uses the illustration's own pixel coordinates (775 × 1295), so the picture is never stretched and every glowing track follows a pipe in the drawing. Where a pipe passes behind another part, its glow and arrows are clipped there:

| Track | Colour | Animates when |
| --- | --- | --- |
| FF: outer left riser and supply line to the supply tee | orange | `fjv_flow` above the threshold |
| Supply tee → up behind the manifold → diagonal into the heating exchanger's upper port | orange | FJV flow and heating valve open (or heating active) |
| Supply tee → outer U-bend → DHW exchanger's lower port | orange | FJV flow and DHW valve open, tapping or bypass |
| Heating exchanger's lower port → heating valve (22) → return manifold | blue | FJV flow and heating valve open (or heating active) |
| DHW exchanger's upper port → 37 control valve → return manifold | blue | FJV flow and DHW valve open, tapping or bypass |
| FR: return manifold and second riser | blue | `fjv_flow` above the threshold |
| VR through the pump (40) and strainer (53), over the inner U-bend into the heating exchanger's lower port | light blue | `heating_flow` above the threshold |
| VF from the heating exchanger's upper port, behind the valves and U-bends, through the safety valve (25) | orange | `heating_flow` above the threshold |
| KV → check valve (28A); flow meter (36) riser into the DHW exchanger's upper port / BV from its lower port | cyan / red | `water_flow` above the threshold |

Moving arrows run along active tracks; their speed follows the measured flow in four steps. Each exchanger face carries a soft fog layer clipped to its measured outline, coloured from the live temperatures (blue when cold, pale in between, orange to red when hot) with slow wisps that follow the district heating flow. The front DHW exchanger is hot at the bottom and cold at the top while tapping and glows only at the bottom during bypass; the heating exchanger's visible top strip is its hot end and fades from FJV supply towards FJV return while heating flows.

The pump has a thin rim on its housing edge and three long arrows with fading tails running in the bezel band of the pump head: blue and turning while the pump runs (faster with `pump_speed`), red and still when it is off. Each valve has a ring whose arc length is the opening in percent; while the valve is open a light dot travels through the open part of the ring, faster the more open the valve is, and the percentage is written next to it. A closed valve shows a grey ring, and callout lines to stopped components turn grey.

The square **Info** button is centred in the black hood to the right of the display. The matching warning triangle appears to the left only while a configured Calefa fault or warning is active. It opens a popup listing the active alarm names and descriptions; tapping one opens its Home Assistant entity details. The display on the unit shows the live front temperature and opens the virtual controller.

`popup_card` can hold the previous Fjernvarme card configuration as a hidden popup owner inside Calefa Flow. This keeps its full Styring and eight Forbrug cards available from Info after removing the old card from the dashboard view. The older card resource must remain registered while this popup configuration is used; the old card is created only when Info is opened and is not shown as a second dashboard card.

The optional `unit_image` (or legacy `background_image`) accepts a Home Assistant-accessible URL. `background_fit: contain` is retained for compatibility. The bundled illustration is encoded in the HACS JavaScript bundle; no additional HACS resource is needed. If a custom image fails, the card falls back to its SVG unit. `animations: false` disables motion. CSS also respects `prefers-reduced-motion`, and an off-screen observer pauses animation.

`flow_threshold` defaults to `0.05`; `valve_threshold` defaults to `1`. Explicit `heating_active` / `dhw_active` entities take precedence over flow, pump and valve fallbacks. `show_footer: false` hides the footer. FJV ΔT equals FJV supply minus FJV return; heating ΔT equals heating supply minus heating return. Each pair shares a circular ΔT badge: green means at or above its configured cooling target, red means below, and neutral means a reading is missing. Defaults are `fjv_good_delta: 20` and `heating_good_delta: 5` °C; both can be adjusted in card configuration.

The DOM is built when configuration changes. Normal Home Assistant updates compare relevant state object references and update existing text/classes; the arrow set of a circuit is only rebuilt when its flow speed step changes. Arrows use SVG animation and are paused while the card is off-screen, while the controller is open, when nothing flows and with `prefers-reduced-motion` (then they stay visible as still arrows). The pump arrows, exchanger fog and valve dots use CSS animation; the pump arrows and fog wisps only move composited transforms. No polling or JavaScript animation loop is used.
