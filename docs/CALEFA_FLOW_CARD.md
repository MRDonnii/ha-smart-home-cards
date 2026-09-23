# HA Calefa Flow Card

`custom:ha-calefa-flow-card` is an animated Home Assistant dashboard card for a Wavin Calefa II 40/40-style district-heating unit with two heat exchangers: one for domestic hot water (DHW) and one for space heating.

The card shows a drawing of the unit with animated supply/return flow, the circulation pump, both PICV valves, temperatures and a tappable controller display. The virtual display is **read-only** in this version.

## Drawing

The built-in drawing is modelled on photos of the unit, without using product photos or logos:

- Black EPP cabinet with a textured top hood, the white controller panel (LCD, status LEDs, touch keys) and molded channels below the hood.
- Stainless pipes with brass fittings, a Y-strainer, ball valves, the energy meter pass piece, a safety valve and an expansion vessel.
- Two copper plate heat exchangers, **Varme** behind and **Brugsvand** in front, with a zigzag that glows from hot to cold when that exchanger is in use.
- The circulation pump with a rotating ring while it runs, and both PICV valves with actuator, status LED and position bar.
- The six bottom connections in the real order: FF, FR, VR, VF, BV, KV.

Active pipes glow in their circuit colour (orange/red for supply and hot water, blue for return and cold water) with direction arrows and a moving light. Inactive pipes stay plain steel.

## Example

```yaml
type: custom:ha-calefa-flow-card
title: Calefa II 40/40
subtitle: Fjernvarmeunit

fjv_supply: sensor.calefa_fjernvarme_fremlob_temperatur
fjv_return: sensor.calefa_fjernvarme_retur_temperatur
heating_supply: sensor.calefa_cvv_fremlob_temperatur
heating_return: sensor.calefa_cvv_retur_temperatur
heating_setpoint: sensor.calefa_radiator_onsket_fremlob
dhw_temperature: sensor.calefa_brugsvand_ud_temperatur
dhw_setpoint: sensor.calefa_brugsvand_setpunkt
cold_water_temperature: sensor.calefa_koldtvandsfoler_ved_veksler

pump: sensor.calefa_heating_pump_status_itc
heating_valve: sensor.calefa_cvv_ventilposition
dhw_valve: sensor.calefa_ventilposition
water_flow: sensor.calefa_brugsvandsflow
heating_active: sensor.calefa_heating_state_ch
dhw_active: sensor.calefa_brugsvand_status

pressure: sensor.calefa_anlaegstryk
outdoor_temperature: sensor.calefa_udetemperatur_ut
room_temperature: sensor.living_room_temperature
power: sensor.calefa_effekt
```

When the card is added from the card picker it pre-fills entities from the Wavin Calefa integration if they exist in your installation.

## Entities

Every entity is optional. Tiles, display rows and connection labels only appear for configured entities, and missing, `unknown` or `unavailable` entities are shown as `–` without errors.

| Key | Meaning |
|---|---|
| `fjv_supply`, `fjv_return` | District heating supply/return temperature (FF/FR) |
| `fjv_flow` | District heating flow (optional, sets primary animation speed) |
| `heating_supply`, `heating_return` | Heating circuit supply/return temperature (VF/VR) |
| `heating_setpoint` | Desired heating supply temperature |
| `heating_flow` | Heating circuit flow |
| `dhw_temperature`, `dhw_setpoint` | Hot water temperature and setpoint (BV) |
| `cold_water_temperature` | Cold water temperature (KV) |
| `water_flow` | Hot water flow |
| `pump` | Pump state (`on`/`off`, `Til`/`Fra`, numeric) |
| `pump_speed` | Pump speed in % |
| `heating_valve`, `dhw_valve` | Valve position in %, a position attribute, or an open/closed state |
| `heating_active`, `dhw_active` | Explicit activity state, takes priority over derived activity |
| `power`, `pressure` | Power and system pressure |
| `room_temperature`, `outdoor_temperature` | Shown in the footer and on the display |

Tap a tile, a header pill or a footer value to open Home Assistant's more-info dialog for that entity. The footer always shows the Home Assistant connection (Online/Offline), and on wider cards a **⋮** button also opens the virtual display.

### Activity rules

- If `heating_active` / `dhw_active` are configured and report a known state, they decide the activity.
- Otherwise heating is active when heating flow is above `flow_threshold`, the heating valve is above `valve_threshold`, or the pump runs. Hot water is active when water flow is above the threshold, or, without a flow sensor, when the DHW valve is open.
- Danish text states used by Calefa integrations are understood: `Til`, `Fra`, `Opvarmning`, `Standby`, `Idle`, `Aktiv`, `Bypass`, and combined states such as `Varmt vand + radiator`.
- `Bypass` on `dhw_active` animates only the district-heating side of the DHW exchanger (circulation keeps the pipe warm). Tap water does not animate.
- The heating loop (VR/VF) also animates when only the pump runs.

Animation speed follows `fjv_flow`, `heating_flow`, `water_flow` (L/h, L/min, m³/h, …), `pump_speed` or valve position, in that order of availability.

## Options

| Option | Default | Description |
|---|---|---|
| `title`, `subtitle` | `Calefa II 40/40`, `Fjernvarmeunit` | Header text |
| `flow_threshold` | `0.05` | Flow above this value counts as active |
| `valve_threshold` | `1` | Valve position (%) above this value counts as open |
| `show_footer` | `true` | Show outdoor/room/power/cooling/pressure footer |
| `show_labels` | `true` | Show labels and connection temperatures in the drawing |
| `animations` | `true` | Set to `false` to disable all flow animation |
| `background_image` | – | Photo of the unit placed under the flow overlay |
| `background_fit` | `contain` | `contain` or `cover` |

## Optional photo background

```yaml
background_image: /local/calefa/calefa-front.webp
background_fit: contain
```

The photo is drawn inside the same SVG coordinate system (600 × 1000, 3:5) as the flow lines, so the image and the pipes always scale together. The built-in cabinet is hidden and the components are dimmed in photo mode. A photo with a 3:5 aspect ratio lines up best.

## Responsive layout

The layout follows the **card's own width** (CSS container queries), not the browser viewport, so it behaves the same in a wide dashboard, a sections column, a tablet and the Companion app.

| Card width | Layout |
|---|---|
| ≥ 940 px | Unit in the middle, metrics in a column on each side with callout lines to the pipe or component they measure |
| 640–939 px | Unit on the left, metrics in two compact 2-column groups on the right |
| < 640 px | Unit on top, metrics in a 2-column grid below |
| < 400 px | Tighter spacing and smaller tiles |

The drawing keeps a fixed 3:5 aspect ratio. When the drawing itself is rendered narrower than 380 px, its labels are enlarged and minor labels are hidden so text stays readable. Buttons and tiles are at least 44 px high, and the card never overflows horizontally.

## Virtual display

Tap the controller display on the unit to open the virtual Calefa display inside the card. It has the unit's five status LEDs (Strøm, Advarsel, Mode, LAN, Perifer) and the three touch keys:

- **▲ / ▼** move the selection in the list (arrow keys on a keyboard).
- **⏎** steps to the next front menu, like a short press on the real unit.
- Tabs: **Forside**, **Varme**, **Brugsvand**, **Status**.
- Close with **×**, by tapping outside, or with **Escape**.

The Mode LED follows the manual: red for heating, cyan for hot water, slow cyan blink for bypass. The warning LED turns yellow when a configured entity is unavailable.

The menu is defined as data (`CALEFA_DISPLAY_MENU` in the card source): pages with a title, icon, hero value and rows. Labels, icons and rows can be replaced to match the real controller menus without changing the renderer. **The display is read-only.** It never calls services or writes to the controller.

## Performance

- The DOM is built once per configuration. State updates only change the text, classes and CSS variables that actually changed, and states that are not configured are ignored.
- Flow is animated with CSS on SVG strokes. There are no timers, polling or `requestAnimationFrame` loops.
- Only active circuits animate. Animations pause while the card is off-screen or the display is open, and stop completely with `prefers-reduced-motion: reduce`.
- The keyboard listener for Escape is only attached while the display is open.
