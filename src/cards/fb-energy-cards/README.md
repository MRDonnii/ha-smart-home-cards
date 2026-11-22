# FB Energy Cards

Three calm, read-only cards for a **Huawei Solar** installation (EMMA + inverter + LUNA battery), written for people who
just want to know what the system is doing: large Danish text, plain-language explanations, gentle animations that can
be switched off, and every value opens Home Assistant's more-info dialog when tapped.

| Element | What it shows |
| --- | --- |
| `custom:fb-energy-flow-card` | "Hvor går strømmen hen?" – solar, house, grid and battery with animated arrows for the direction of the power, a one-line summary and a help section |
| `custom:fb-energy-battery-card` | "Jeres batteri" – battery illustration with the state of charge, charging/discharging now, kWh stored and used today |
| `custom:fb-energy-today-card` | "Dagens strøm i tal" – solar yield, house consumption, bought from and sold to the grid today, with comparison bars |

```yaml
type: custom:fb-energy-flow-card
# everything is optional – by default the Huawei Solar integration's own entity names are used
title: Hvor går strømmen hen?
grid_import_positive: true      # false if your grid sensor is positive when exporting
battery_charge_positive: true   # false if your battery sensor is positive when discharging
huawei:                         # device part of the entity ids, if you renamed the devices
  emma: emma
  inverter: inverter
entities:                       # override single values with any entity id (null hides it)
  soc: sensor.example_battery_soc
```

## Options

| Option | Default | Cards | Description |
| --- | --- | --- | --- |
| `title` | per card (see above) | all | Heading of the card |
| `grid_import_positive` | `true` | flow | Sign of the `grid` sensor: positive = import (EMMA's feed-in power is negative when buying) |
| `battery_charge_positive` | `true` | flow, battery | Sign of the `battery` sensor: positive = charging |
| `huawei` | integration names | all | Device names used to build the entity ids (`emma`, `inverter`, …); `huawei: false` builds none, so only `entities` is used. See `src/cards/shared/huawei-solar-entities.js` |
| `entities` | – | all | Map of the keys below to entity ids; overrides the derived ids one by one |

## Entity keys

Default id = `<domain>.<device>_<suffix>` from the Huawei Solar integration.

| Key | Default (device · suffix) | Used by | Unit |
| --- | --- | --- | --- |
| `solar` | emma · `pv_output_power` | flow | W / kW |
| `home` | emma · `load_power` | flow | W / kW |
| `grid` | emma · `feed_in_power` | flow | W / kW |
| `battery` | emma · `battery_charge_discharge_power` | flow, battery | W / kW |
| `soc` | emma · `state_of_capacity` | flow, battery | % |
| `solar_today` | emma · `pv_yield_today` | today | kWh / Wh |
| `home_today` | emma · `consumption_today` | today | kWh / Wh |
| `bought_today` | emma · `supply_from_grid_today` | today | kWh / Wh |
| `sold_today` | emma · `feed_in_to_grid_today` | today | kWh / Wh |
| `charged_today` | emma · `energy_charged_today` | battery | kWh / Wh |
| `discharged_today` | emma · `energy_discharged_today` | battery | kWh / Wh |
| `alarm` | inverter · `alarms` | – (refresh trigger only) | – |

Values with a unit the cards do not understand, or that are `unknown`/`unavailable`, are shown as "—" and the footer
says "Målinger mangler". Readings older than three minutes (by `last_reported`) are flagged as old.

## Notes

- The animation switch in the flow card's help section is stored per browser in `localStorage` (`fb-energy-motion`)
  and applies to all three cards; the system's "reduce motion" setting is always respected.
- The bundle entry is `fb-energy-cards.js` (version 1.1.1); it loads the three cards and their shared core.
