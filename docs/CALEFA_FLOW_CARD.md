# HA Calefa Flow Card

`custom:ha-calefa-flow-card` is an animated Home Assistant dashboard card for a Wavin Calefa II-style district-heating unit with separate heating and domestic-hot-water heat exchangers.

The first version focuses on live visualization: animated supply/return flow, pump status, valve status, temperatures and an interactive virtual front display. The virtual display is intentionally generic until the real menu structure has been photographed and mapped.

## Example

```yaml
type: custom:ha-calefa-flow-card
title: Calefa II 40/40
subtitle: Fjernvarmeunit

fjv_supply: sensor.calefa_fjv_frem
fjv_return: sensor.calefa_fjv_retur
heating_supply: sensor.calefa_varme_frem
heating_return: sensor.calefa_varme_retur
dhw_temperature: sensor.calefa_varmt_vand
cold_water_temperature: sensor.calefa_koldt_vand

pump: binary_sensor.calefa_pumpe
pump_speed: sensor.calefa_pumpe_procent
heating_valve: sensor.calefa_varmeventil
dhw_valve: sensor.calefa_brugsvandsventil
heating_flow: sensor.calefa_varme_flow
water_flow: sensor.calefa_brugsvand_flow
heating_active: binary_sensor.calefa_varme_aktiv
dhw_active: binary_sensor.calefa_brugsvand_aktiv

power: sensor.calefa_effekt
room_temperature: sensor.room_temperature
outdoor_temperature: sensor.outdoor_temperature
```

Every entity is optional. The card derives activity from the available active-state, flow, valve and pump entities. Explicit `heating_active` and `dhw_active` entities take priority when configured.

## Optional photo background

```yaml
background_image: /local/calefa/calefa-front.webp
```

Without a background image the card uses its built-in schematic unit. A custom photo can be added later; the flow paths are drawn as an SVG overlay and can be calibrated to the exact unit photograph in a future revision.

## Interaction

- Tap a value tile to open Home Assistant more-info for that entity.
- Tap the Calefa display in the center of the card to open the virtual display.
- The virtual display currently has **Varme**, **Brugsvand** and **Status** pages using live entity values.
- The menu can be expanded to reproduce the real Calefa display once reference photos of the real menus are available.

## Flow detection

The default thresholds are:

```yaml
flow_threshold: 0.05
valve_threshold: 1
```

They can be overridden if the source sensors use different scales.

## Notes

The card is frontend-only. It does not write to the Calefa controller in this first version. Any later control actions should be mapped only to confirmed Home Assistant services/entities.
