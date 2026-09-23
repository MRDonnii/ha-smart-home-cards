# HA Calefa Flow Card

`custom:ha-calefa-flow-card` is a responsive animated Home Assistant card for a Wavin Calefa II 40/40-style district-heating unit with separate heat exchangers for space heating and domestic hot water.

The card is intentionally built around the unit itself rather than a large dashboard header. The controller display is clickable and opens a read-only virtual display.

## Current design

- No large `Calefa II 40/40` title/header is rendered inside the card.
- Heating and domestic-hot-water activity are indicated on the physical controller drawing with a red heating LED and a blue DHW LED directly below the LCD.
- District-heating supply/return and heating supply/return are presented as compact pairs.
- Each supply/return pair has a centered `ΔT` indicator between the two values.
- Pump, heating-valve and DHW-valve values are small overlays next to the physical components instead of separate large sensor tiles.
- Hot and cold domestic-water values are compact overlays next to the unit.
- Active pipes use animated SVG flow. Inactive pipes stay visually quiet.

## Example

```yaml
type: custom:ha-calefa-flow-card

fjv_supply: sensor.calefa_fjernvarme_fremlob_temperatur
fjv_return: sensor.calefa_fjernvarme_retur_temperatur
heating_supply: sensor.calefa_cvv_fremlob_temperatur
heating_return: sensor.calefa_cvv_retur_temperatur
heating_setpoint: sensor.calefa_radiator_onsket_fremlob

dhw_temperature: sensor.calefa_brugsvand_ud_temperatur
dhw_setpoint: sensor.calefa_brugsvand_setpunkt
cold_water_temperature: sensor.calefa_koldtvandsfoler_ved_veksler

pump: sensor.calefa_heating_pump_status_itc
pump_speed: sensor.calefa_pump_speed
heating_valve: sensor.calefa_cvv_ventilposition
dhw_valve: sensor.calefa_ventilposition

heating_flow: sensor.calefa_heating_flow
water_flow: sensor.calefa_brugsvandsflow
heating_active: sensor.calefa_heating_state_ch
dhw_active: sensor.calefa_brugsvand_status

pressure: sensor.calefa_anlaegstryk
outdoor_temperature: sensor.calefa_udetemperatur_ut
room_temperature: sensor.living_room_temperature
power: sensor.calefa_effekt
```

All entities are optional. Missing, `unknown` and `unavailable` values are handled without throwing frontend errors.

## Responsive layout

Responsiveness follows the **card width** using CSS container queries.

### Mobile / Companion app (`<= 520 px`)

Mobile uses a dedicated compact composition:

- FJV forward and return are shown in one compact row with `ΔT` between them.
- Heating forward and return use a second compact row with `ΔT` between them.
- The unit is limited to roughly 300 px wide so it does not consume an entire mobile page.
- Pump and valve values remain attached to the unit drawing.
- Hot and cold water values remain attached to the unit drawing.
- The desktop footer is hidden to avoid unnecessary height.
- The card respects the device safe area.

### Medium widths

The physical unit stays central while the two temperature pairs sit on either side in a compact layout.

### Wide desktop

The unit remains the visual focus with the FJV pair on the left and heating pair on the right. Pump, valves and DHW values stay visually connected to the actual components.

## Delta temperatures

`ΔT` is calculated automatically when both values in a pair are available:

- FJV: `fjv_supply - fjv_return`
- Heating: `heating_supply - heating_return`

The result updates live with Home Assistant state changes.

## Activity rules

Explicit `heating_active` and `dhw_active` entities have priority. If they are not configured, the card derives activity from available flow, valve and pump states.

Danish Calefa states such as `Til`, `Fra`, `Opvarmning`, `Standby`, `Aktiv` and `Bypass` are understood.

## Virtual display

Tap the controller display on the unit to open the virtual read-only controller. It currently contains Status, Varme, Brugsvand and Anlæg pages using live Home Assistant data.

The menu structure is intentionally easy to replace when photos of the real Calefa menus are available. The display does not call Home Assistant services or write settings to the unit.

## Optional image background

```yaml
background_image: /local/calefa/calefa-front.webp
background_fit: contain
```

Without a background image the card uses the built-in SVG representation.

## Performance

The DOM is built on configuration changes. Normal Home Assistant state updates change existing text/classes instead of rebuilding the full card. Flow animation is CSS/SVG based with no polling or continuous JavaScript animation loop, and animation stops when the card is off-screen or when reduced motion is requested.
