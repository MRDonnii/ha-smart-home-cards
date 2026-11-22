# TH Energy Card

`custom:th-energy-card` – one energy page for a Huawei SUN2000 inverter with EMMA, LUNA2000 batteries and (optionally)
the Huawei charger, read through the [Huawei Solar](https://github.com/wlcrs/huawei_solar) integration. Danish UI.

The page shows:

- **Hero:** a live ring with where the house's power comes from right now (sun / battery / grid), the inverter's output
  as an outer arc, and four instruments (Solceller, Elnet, Batteri, Elbil). Each instrument opens a detail sheet.
- **Økonomi i dag:** bought, saved, sold and net for today (hourly statistics × hourly prices).
- **Solen i dag:** the sun's path with today's production curve, sunrise/sunset and a small weather row.
- **Hvor kommer strømmen fra?** – the embedded [`th-energy-flow-card`](../th-energy-flow-card/README.md).
- **Batterier** – the embedded [`th-battery-card`](../th-battery-card/README.md).
- **Elpris inkl. afgifter:** today's and tomorrow's prices with the cheapest and dearest 3-hour windows.
- **Status og styring:** inverter state and a control sheet (working mode, EMMA mode, grid charging, SOC limits, charge
  and discharge power, feed-in limit, power derating, inverter on/off). Changes are only sent when you press *Anvend*.
- **Sidste 24 timer** (production, consumption, battery %) and **Anlæggets historie** (totals and cycles), plus an
  optional button to a 3D view.

The element `th-energy-sheet` (the detail/control sheet) is defined by the same file.

```yaml
type: custom:th-energy-card
# everything is optional – the Huawei Solar values use the integration's own entity names
name: Home                 # shown after "Energi · " in the header
panels: 24                 # "24 paneler" under Solceller
inverter_model: SUN2000-8K # subtitle of the Solceller sheet
weather: weather.home      # fallback for the weather row (temperature, cloud cover, wind)
view3d: /lovelace/3d       # shows the "Se huset i 3D" button
entities:                  # values that do not come from Huawei Solar have no default
  price: sensor.example_spot_prices        # Energi Data Service style: raw_today / raw_tomorrow / today_mean
  priceNow: sensor.example_price_now       # price incl. tax now; attribute `prices` [{start, price}] for the economy
  spotNow: sensor.example_spot_price_now   # spot price incl. VAT; attribute `prices` for the sale value
  priceMean: sensor.example_price_mean     # today's mean price (flow card)
  co2: sensor.example_grid_co2
  month: sensor.example_plant_month_energy
  year: sensor.example_plant_year_energy
  maxFeed: number.example_maximum_feed_grid_power
```

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `huawei` | integration names | Device part of the Huawei Solar entity ids: `inverter`, `batteries`, `emma`, `charger` and `battery` (prefix of the per-unit sensors, `<battery>_1_…`). `huawei: false` derives no ids at all. |
| `entities` | – | Override any single value by its key (table below); `null` hides it. |
| `name` | – | Header text after `Energi · `. |
| `panels` | – | Number of panels, shown under Solceller and in its sheet. |
| `inverter_model` | `SUN2000` | Subtitle of the Solceller sheet (`""` hides it). |
| `charger_model` | `Huawei SCharger` | Subtitle of the Elbil-lader sheet (`""` hides it). |
| `view3d` | – | Path of a 3D view; without it the 3D button is hidden. |
| `weather` | – | A `weather.*` entity used for temperature, cloud cover and wind when `temp` / `cloud` / `wind` are not set (irradiance needs the `rad` sensor). |
| `latitude` | Home Assistant's latitude | Used for the height of the sun's path. |
| `inverter_w` | `10000` | Full scale (W) of the production arc; also passed to the flow card. |
| `grid_max_w` | `11000` | Full scale (W) of the grid bar and the feed-in slider; also passed to the flow card. |
| `ev_max_w` | `11000` | Full scale (W) of the charger arc in the flow card. |
| `string_max_w` | `inverter_w / 2` | Full scale (W) of each PV string bar. |
| `battery_kwh` | rated capacity sensor | Battery capacity used for cycles and the battery sheet; falls back to units × modules × `pack_kwh`. |
| `batteries`, `packs`, `pack_kwh` | found / found / `5` | Battery units and modules (found from the per-unit sensors); passed to the battery card. |
| `flow_card` | – | Extra options for the embedded flow card (e.g. `mode: day`, `entities`). |
| `battery_card` | – | Extra options for the embedded battery card (e.g. `title`, `entities`). |

One config is enough: the embedded flow and battery cards get `huawei`, the scales, the battery layout and this card's
entities under their own key names (`priceNow` → flow `price`, `priceMean` → flow `mean`, `evTot` → flow `ev`,
`bat` → battery `power`, `batTotDis` → battery `totDis`, `batStatus` → battery `status` …).

## Entity keys

Huawei Solar values default to `<domain>.<device>_<suffix>` with the device names from `huawei` (defaults: `inverter`,
`batteries`, `emma`, `charger`).

| Key | Default | Used for |
| --- | --- | --- |
| `pv`, `load`, `inv` | `sensor.<emma>_pv_output_power`, `_load_power`, `_inverter_active_power` | Live power (grid = load − inverter) |
| `bat`, `soc` | `sensor.<batteries>_charge_discharge_power`, `_state_of_capacity` | Battery power and level |
| `pvDay`, `cons`, `imp`, `exp` | `sensor.<emma>_pv_yield_today`, `_consumption_today`, `_supply_from_grid_today`, `_feed_in_to_grid_today` | Today's energy |
| `ch`, `dis` | `sensor.<batteries>_day_charge`, `_day_discharge` | Battery today |
| `hourY`, `peak`, `eff` | `sensor.<inverter>_hourly_yield`, `_day_active_power_peak`, `_efficiency` | Solceller sheet |
| `pv1v`, `pv1a`, `pv2v`, `pv2a` | `sensor.<inverter>_pv_1_voltage` … `_pv_2_current` | PV strings |
| `invStatus`, `invState`, `alarms` | `sensor.<inverter>_device_status`, `_inverter_state`, `_alarms` | Status and faults |
| `invSwitch`, `derate` | `switch.<inverter>`, `number.<inverter>_power_derating` | Control sheet |
| `mode`, `ess`, `tou` | `select.<batteries>_working_mode`, `select.<emma>_ess_control_mode`, `select.<batteries>_excess_pv_energy_use_in_tou` | Control sheet |
| `batStatus`, `forc`, `stopForc` | `sensor.<batteries>_status`, `_forcible_charge`, `button.<batteries>_stop_forcible_charge` | Battery status, forced charge |
| `gridCh`, `eod`, `eoc`, `gridCut`, `gridChMax` | `switch.<batteries>_charge_from_grid`, `number.<batteries>_end_of_discharge_soc`, `number.<inverter>_end_of_charge_soc`, `_grid_charge_cutoff_soc`, `_grid_charge_maximum_power` | Control sheet |
| `maxCh`, `maxDis` | `number.<inverter>_maximum_charging_power`, `_maximum_discharging_power` | Control sheet |
| `batTotCh`, `batTotDis`, `rated` | `sensor.<batteries>_total_charge`, `_total_discharge`, `_rated_capacity` | Totals, cycles, capacity |
| `evTot`, `evTemp` | `sensor.<charger>_charger_total_charged_energy`, `_charger_temperature` | Elbil (charging = the total rises) |
| `pvTot`, `expTot`, `impTot` | `sensor.<emma>_total_pv_energy_yield`, `_total_feed_in_to_grid`, `_total_supply_from_grid` | Totals |
| `sun` | `sun.sun` | Sun path |
| `maxFeed` | – | `number` for the maximum feed-in power (control sheet and status row; hidden when unset) |
| `month`, `year` | – | Plant energy this month / year ("–" when unset) |
| `price` | – | Price list with `raw_today` / `raw_tomorrow` (`[{hour, price}]`) and `today_mean` (chart and pills) |
| `priceNow` | – | Current price incl. tax; attribute `prices` (`[{start, price}]`) for today's economy |
| `spotNow` | – | Spot price incl. VAT; attribute `prices` for the value of sold energy (VAT removed) |
| `priceMean` | – | Today's mean price (flow card) |
| `co2` | – | Grid CO₂ intensity in g/kWh (hidden when unset) |
| `temp`, `cloud`, `wind`, `rad` | – | Weather row sensors (°C, %, m/s, W/m²); else the `weather` entity, else "–" |

Without `price` and `priceNow` the price section is hidden and prices are left out of the texts.
