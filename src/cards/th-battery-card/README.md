# TH Battery Card

`custom:th-battery-card` – Huawei LUNA2000 batteries as animated towers: one tower per battery unit, one module per
pack with its own level, power LED and temperature, the flow to the inverter, a balance line and key figures (working
mode, SOC limits, cycles, max. power, today's charge/discharge, grid charging, status). Danish UI. Reads the
[Huawei Solar](https://github.com/wlcrs/huawei_solar) integration.

The button *Styr batteri og anlæg* fires the event `th-battery-control` (bubbles, composed); `th-energy-card` embeds
this card and opens its control sheet on that event.

```yaml
type: custom:th-battery-card
# all optional
title: Batterier
batteries: 2      # battery units (default: the units the integration reports)
packs: 3          # modules per unit (default: the modules the integration reports)
pack_kwh: 5       # kWh per module, only used without the rated capacity sensor
huawei:
  batteries: batteries   # device name of the battery system
  inverter: inverter
  battery: battery       # prefix of the per-unit sensors: sensor.<battery>_1_state_of_capacity, …_1_pack_2_…
entities:
  soc: sensor.example_battery_level
```

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `title` | `Batterier` | Heading. |
| `batteries` | found, else 1 | Number of battery units (towers). |
| `packs` | found, else 1 | Modules per unit. |
| `pack_kwh` | `5` | kWh per module (capacity fallback). |
| `huawei` | integration names | Device names (`batteries`, `inverter`, `emma`, `battery`); `huawei: false` derives no ids. |
| `entities` | – | Override single values by key (below); `null` hides one. |

## Entity keys

| Key | Default | Used for |
| --- | --- | --- |
| `soc`, `power` | `sensor.<batteries>_state_of_capacity`, `_charge_discharge_power` | Level and power |
| `rated` | `sensor.<batteries>_rated_capacity` | Capacity (Wh) |
| `ch`, `dis`, `totDis` | `sensor.<batteries>_day_charge`, `_day_discharge`, `_total_discharge` | Today, cycles |
| `maxCh`, `maxDis` | `sensor.<batteries>_maximum_charge_power`, `_maximum_discharge_power` | Max. power |
| `status` | `sensor.<batteries>_status` | Status |
| `mode` | `select.<batteries>_working_mode` | Working mode |
| `eod`, `eoc` | `number.<batteries>_end_of_discharge_soc`, `number.<inverter>_end_of_charge_soc` | SOC limits and time estimates |
| `gridCh` | `switch.<batteries>_charge_from_grid` | Grid charging |
| `load` | `sensor.<emma>_load_power` | (kept for compatibility) |

Per unit `i` and module `j` the card reads `sensor.<battery>_<i>_state_of_capacity`, `_charge_discharge_power`,
`_bms_temperature`, `_day_charge`, `_day_discharge`, `_running_status` and
`sensor.<battery>_<i>_pack_<j>_state_of_capacity`, `_charge_discharge_power`, `_max_temperature`. Missing values fall
back to the system totals.
