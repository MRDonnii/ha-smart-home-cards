# HCH5 Live Control Card

Animated Dantherm HCH5 unit with live temperatures, fan and bypass readbacks, and the Home Assistant controls of the HCH PassiveLink integration.

```yaml
type: custom:ha-hch5-live-card
afterheat_coil: water
entities:
  water_flow: sensor.example_afterheat_water_flow
  water_return: sensor.example_afterheat_water_return
  afterheat_active: binary_sensor.example_afterheat_active
  # … the other HCH5 entities
```

- `afterheat_coil`: how the external afterheater is drawn. `electric` (default) shows heating elements that glow while it heats. `water` shows a water coil: its flow and return pipes run to the water readings, are tinted by the `water_flow` and `water_return` temperatures, and the water moves while `afterheat_active` is on.
- `afterheat_outdoor_cutoff`: outdoor temperature (°C) from which HAC1 blocks the afterheat; 15 by default.
- `variant: smartdash`: the compact drawing and controls used by Smartdash.
