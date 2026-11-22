# Huawei Solar Card

`custom:huawei-solar-card` – one animated energy page for a Huawei SUN2000 inverter with EMMA, LUNA2000 batteries and
(optionally) the Huawei charger, read through the [Huawei Solar](https://github.com/wlcrs/huawei_solar) integration.
Danish UI. Everything is tappable and opens a detail sheet (`huawei-solar-popup`) with more values and the controls.

Sections (`section`):

- **`main`** – live power flow (Solceller, Elnet, Hus, Batteri, Elbil) with moving particles and the sun's position,
  a one-line summary ("Solen dækker huset …"), today's yield, string 1 and 2, this month, and the last 24 hours
  (sun, consumption, battery %).
- **`side`** – today (produceret, forbrug, købt, solgt, % selvforsynet), the battery with its limits and a *Styring*
  button, the electricity price with the next 24 hours and the cheapest 3 hours (only when a price entity is set), and
  chips for Elnet, Inverter and Lader.
- **`all`** (default) – `main` and `side` under each other.
- **`3d`** – an animated 3D diorama of the site (three.js, loaded from jsDelivr on first use): buildings, the panel row,
  the cabinet with inverter and battery, the charger and the grid pole, with the live flows between them, signs with the
  values, day/night, clouds, rain and wind from the weather sensors, coins while exporting. Drag to turn, pinch/scroll
  to zoom, *Ovenfra* and *Rundtur* buttons. A sign tap flies the camera there and opens its sheet.

Sheets: Solceller, Inverter (effektbegrænsning, on/off), Huset i dag, Elnet (max feed-in), Batteri, Batteri · styring
(working mode, EMMA mode, TOU surplus, grid charging, SOC limits, charge/discharge power, stop forcible charge), Elpris,
Elbil-lader. Changes in a sheet are collected and sent when you press **Anvend** (or dropped with **Fortryd**).

```yaml
type: custom:huawei-solar-card
section: all            # main | side | all | 3d
# all optional:
huawei:                 # the device part of the entity ids, if your devices are named differently
  inverter: inverter
  batteries: batteries
  emma: emma
  charger: charger
entities:               # single values; also the only way to show values from other integrations
  price: sensor.example_price               # attributes raw_today / raw_tomorrow (hour, price), today_mean …
  priceNow: sensor.example_price_incl_tax   # the price shown "now" (falls back to `price`)
  co2: sensor.example_grid_co2
  month: sensor.example_plant_month_energy
  year: sensor.example_plant_year_energy
  maxFeed: number.example_maximum_feed_grid_power
  cloud: sensor.example_cloud_cover
  rad: sensor.example_solar_radiation
  sunH: sensor.example_sunshine_hours_today
  rain: sensor.example_precipitation_now
  wind: sensor.example_wind_speed
  temp: sensor.example_outdoor_temperature
pv_capacity: 10000      # W
max_power: 11000        # W
charger_model: Example Charger 22
```

## Options

| Key | Default | Meaning |
|---|---|---|
| `section` | `all` | `main`, `side`, `all` or `3d` (see above). |
| `flow` | `true` | `false` hides the summary and the power flow in `main` (keeps the strip and the chart). |
| `fill` | `false` | `3d` only: the scene fills the screen height (`100dvh − 300px`, at least 440 px). |
| `name` | `Solcelleanlæg` | `3d` only: the header, "*name* · live". |
| `pv_capacity` | `10000` | W. 100 % for "% af kapacitet", the 3D Solceller bar; the panels glow fully at 90 %. |
| `max_power` | `11000` | W, the inverter's max AC power: the max of the *Effektbegrænsning* and *Maks. salg* sliders (and the "… W = ingen begrænsning" hint), the 3D Hus/Elnet bars and the particle speed. |
| `string_max_power` | `5500` | W, a full Streng 1 / Streng 2 bar. |
| `month_target` | `1200` | kWh, a full "Denne måned" bar. |
| `day_target` | `40` | kWh, the "I dag" bar is full at the larger of this and 5 × today's peak power. |
| `charger_model` | – | Shown as *Model* in the Elbil-lader sheet; left out when not set. |
| `huawei` | the integration's names | Device names used to build the Huawei ids (`inverter`, `batteries`, `emma`, `charger`); `false` = none. |
| `entities` | – | Override any value below by key (a full entity id; `null`/`""` hides it). |
| `site` | a neutral example plot | The 3D diorama, see [Site](#site-3d). |

## Entity keys

Huawei Solar values default to the integration's standard names, built from the device names in `huawei`
(`<emma>` = `emma`, `<inverter>` = `inverter`, `<batteries>` = `batteries`, `<charger>` = `charger`):

| Key | Default id | Used for |
|---|---|---|
| `pv` | `sensor.<emma>_pv_output_power` | solar power (also "offline" detection, history) |
| `load` | `sensor.<emma>_load_power` | house consumption (history) |
| `invAct` | `sensor.<emma>_inverter_active_power` | inverter power; grid = load − inverter |
| `pvDay`, `consDay`, `impDay`, `expDay` | `sensor.<emma>_pv_yield_today`, `_consumption_today`, `_supply_from_grid_today`, `_feed_in_to_grid_today` | today |
| `pvTot`, `impTot`, `expTot` | `sensor.<emma>_total_pv_energy_yield`, `_total_supply_from_grid`, `_total_feed_in_to_grid` | totals |
| `ess` | `select.<emma>_ess_control_mode` | EMMA styring |
| `bat`, `soc` | `sensor.<batteries>_charge_discharge_power`, `_state_of_capacity` | battery (history) |
| `chDay`, `disDay`, `batTotCh`, `batTotDis` | `sensor.<batteries>_day_charge`, `_day_discharge`, `_total_charge`, `_total_discharge` | battery energy |
| `batStatus`, `forc`, `busV` | `sensor.<batteries>_status`, `_forcible_charge`, `_bus_voltage` | battery sheet |
| `mode`, `touExcess` | `select.<batteries>_working_mode`, `_excess_pv_energy_use_in_tou` | driftsform |
| `gridCh` | `switch.<batteries>_charge_from_grid` | opladning fra elnettet |
| `eod` | `number.<batteries>_end_of_discharge_soc` | minimum ladestand |
| `stopForc` | `button.<batteries>_stop_forcible_charge` | stop tvangsopladning |
| `invDay`, `hourY`, `peak`, `eff`, `start` | `sensor.<inverter>_daily_yield`, `_hourly_yield`, `_day_active_power_peak`, `_efficiency`, `_startup_time` | inverter / solar sheets |
| `pv1v`, `pv1a`, `pv2v`, `pv2a` | `sensor.<inverter>_pv_1_voltage`, `_pv_1_current`, `_pv_2_voltage`, `_pv_2_current` | string 1 and 2 |
| `invStatus`, `invState`, `alarms`, `pvConn` | `sensor.<inverter>_device_status`, `_inverter_state`, `_alarms`, `_pv_connection_status` | inverter status / fault |
| `invSwitch` | `switch.<inverter>` | inverter on/off |
| `derate` | `number.<inverter>_power_derating` | effektbegrænsning |
| `eoc`, `gridCut`, `gridChMax`, `maxCh`, `maxDis` | `number.<inverter>_end_of_charge_soc`, `_grid_charge_cutoff_soc`, `_grid_charge_maximum_power`, `_maximum_charging_power`, `_maximum_discharging_power` | battery control |
| `evTot`, `evTemp` | `sensor.<charger>_charger_total_charged_energy`, `_charger_temperature` | charger ("Lader" while the total rises, for 10 min) |
| `sun` | `sun.sun` | the sun's position, day/night |

No default (set them under `entities`; unset values show "–", or are left out):

| Key | Used for |
|---|---|
| `maxFeed` | the *Maks. salg til elnettet* slider (a `number` in W) |
| `month`, `year` | "Denne måned" / "I år" (kWh) |
| `price` | price sensor with `raw_today` / `raw_tomorrow` lists of `{hour, price}` and `today_mean`, `today_min`, `today_max`, `tomorrow_mean` (e.g. Energi Data Service); without `price`/`priceNow` the price block in `side` is hidden |
| `priceNow` | the current price incl. taxes (kr/kWh), else the `price` state |
| `co2` | CO₂ in the grid (g/kWh) |
| `cloud`, `rad`, `sunH` | Vejret in the Solceller sheet (%, W/m², hours); `cloud` also sets the clouds in `3d` |
| `rain`, `wind`, `temp` | `3d`: rain (> 0 = raining), wind (m/s, trees sway), the weather chip (temperature · wind) |

## Site (3D)

Without `site` the 3D section shows a made-up example plot (a house, a garage, a shed, one row of 24 panels in the
garden). Your own `site` keeps what it names; missing positions (`island`, `house`, `cab`, `ev`, `pole`, `array`) come
from the example, missing `signs`, `via`, `wire` and `yard` are worked out from the positions, and missing decoration
is simply not drawn. Coordinates are metres around the house, **x = east, z = south**, y = up.

```yaml
site:
  island: { x: 0, z: 0, size: 80, depth: 5 }      # the square island the diorama sits on
  house: { x: -4, z: 6.5 }                         # where the "Hus" flow ends (on the roof)
  cab: { x: 6, z: 1 }                              # inverter + battery cabinet (the hub of the flows)
  ev: { x: 11.5, z: 2.6 }                          # the charger post
  pole: { x: -33, z: -6 }                          # the grid pole
  array: { x0: -12, z0: -20, x1: 12, z1: -20, n: 24, tilt: 0.44 }   # one panel row from (x0,z0) to (x1,z1)
  main: house                                      # id of the main building (taller, chimney with smoke)
  blds:                                            # building outlines [[x, z], …]; optional roof colour
    - { id: house, p: [[-12, 2], [4, 2], [4, 11], [-12, 11]] }
    - { id: garage, p: [[10, 4], [17, 4], [17, 11], [10, 11]], roof: "#6b7480" }
  roofColors: { house: "#3e4756" }                 # roof colour by building id (else a palette)
  tiles: { ox: 0, oy: 0, res: 1 }                  # paint/trees/cars/conifers units: metres = (value − ox|oy) × res
  paint:                                           # ground drawing (all optional)
    fields: [{ p: [[-40, -40], [-14, -40], [-14, -28], [-40, -28]], c: "#d3bc80", r: "rgba(150,115,60,.32)", a: 0.3 }]
    lawn: [[-30, -27], [30, -27], [30, 30], [-30, 30]]
    gravel: []                                     # list of polygons
    paved: [[[-36, -4.5], [18, -4.5], [18, 3.5], [-36, 3.5]]]
    lane: [[-36, 10], [-10, 12]]                   # a narrow lane (polyline)
    road: [[-36, -45], [-36, 45]]                  # a road with centre line (polyline)
    plot: [[0, -14], [6, -14], [6, -10], [0, -10]] # a soil patch
    hedges: [[[-30, -27], [30, -27]]]              # polylines of hedge
  trees: [[22, 20, 3.2]]                           # [x, z, size]
  cars: [[13.5, -0.5, 0, "#2f5a8a"]]               # [x, z, rotation (rad), colour]
  conifers: [[30, -30], [30, 30], 12]              # a row: from, to, count
  garden: { x: 8, z: -12, rot: 0.3 }               # 8 raised beds
  trampoline: { x: 18, z: 20 }
  signs:                                           # label posts: x, z, post bottom y0 and top y1 (any subset)
    pv: { x: 0, z: -17.5, y0: 0, y1: 6.5 }
  via:                                             # extra points the flow curves pass through ([x, y, z] lists)
    pv: [[0, 3.4, -9]]
    grid: [[-12, 3.4, 5], [-22, 4.8, 0]]
    home: [[1, 3.8, 4]]
    ev: [[8, 2, 2]]
  wire: [-12, 3.4, 5]                              # where the overhead cable from the pole meets the house
  yard: [1, 4, 4]                                  # the yard lamp that lights up at night
  attribution: "Buildings © OpenStreetMap contributors"   # small text in the corner (e.g. when outlines come from OSM)
```

The sign on the panel row reads "I dag … kWh · *n* paneler" with `array.n`.
