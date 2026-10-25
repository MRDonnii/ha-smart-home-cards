# HA Energy Center Card

One energy page with tabs: **Oversigt** (overview), **Strøm** (electricity, phases, consumer groups),
**Fjernvarme** (district heating), **Vand** (water) and **Billader** (EV charger). Values update live and
"today" figures come from Home Assistant's statistics.

```yaml
type: custom:ha-energy-center-card
title: Energi
subtitle: Hjemmets energioverblik
entities:
  grid_power: sensor.main_meter_power          # W, required for the electricity tab
  grid_energy: sensor.main_meter_energy        # kWh total
  grid_price: sensor.electricity_price         # kr/kWh
phases:
  - name: A
    power: sensor.phase_a_power
    current: sensor.phase_a_current
    voltage: sensor.phase_a_voltage
groups:
  - name: Kitchen
    icon: mdi:fridge-outline
    entities:
      - entity: sensor.dishwasher_power
        name: Dishwasher
        icon: mdi:dishwasher
```

## Entities

Every key is optional and the card never fails on a missing sensor. Only what is set up is shown: a key counts
as set up when it is listed under `entities:` (shown as "—" while its entity is unavailable or missing). Tiles,
energy-flow nodes, charts and sections whose keys are not set up are hidden, and the remaining tiles share the
row. A home with only electricity and district heating, for example, gets no water or EV tiles, no "Målte
grupper"/"Umålt" flow nodes, no "Aktuel effekt" box without `heat_power`, no phase section with `phases: []` and
no group section without `groups`.

| Tab | Keys |
|---|---|
| Electricity | `grid_power` (W), `grid_energy` (kWh), `grid_cost`, `grid_price`, `grid_returned` (kWh exported), `grid_apparent` (VA), `meter_temperature`, `measured_power` (sum of measured consumers, W), `unmeasured_power` (W) |
| District heating | `heat_power`, `heat_energy`, `heat_cost`, `heat_price`, `heat_flow`, `heat_supply`, `heat_return`, `heat_cooling` |
| Water | `water_flow` (L/min), `water_total` (m³), `water_cost_today`, `water_price` |
| EV charger | `ev_power`, `ev_energy_today`, `ev_energy_month`, `ev_energy_total`, `ev_session`, `ev_cost_today`, `ev_mode` |

## Tabs

The district heating, water and EV tabs appear only when at least one of their entities exists in Home
Assistant, so an installation without district heating, a water meter or a car gets no empty tabs. To choose
the tabs yourself, list them: `tabs: [power, heat, water, ev]` (the overview is always shown).

## Other options

| Option | Default | Description |
|---|---|---|
| `phases` | three phases A/B/C | List of `{name, power, apparent, power_factor, current, voltage, frequency}`. |
| `groups` | none | Consumer groups `{name, icon, entities: [{entity, name, icon}]}`, shown on the electricity tab. |
| `default_tab` | `overview` | Tab that opens first. |
| `heat_subtitle` | meter line with `heat_power`, else none | Subtitle of the district heating tab; `""` hides it. |
| `accounting_tolerance_w` | 25 | Warn when measured consumers and the main meter differ by more than this. |
| `phase_moderate_a`, `phase_high_a` | 3, 6 | Phase imbalance thresholds in ampere. |
| `water_high_flow_lpm` | 15 | Water flow above this is shown as high (display only, no leak alarm). |
| `ev_charging_threshold_w` | 0 | EV power above this counts as charging. |
