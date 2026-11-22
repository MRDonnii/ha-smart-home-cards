# TH Energy Flow Card

`custom:th-energy-flow-card` – where the power comes from and where it goes: fine line-art medallions for the solar
panels, the grid, the battery, the house and the charger, joined by hairlines with glowing comets. Starts in
*Lige nu* (kW); *I dag* (kWh) can be selected. Below the diagram: sun share, self-sufficiency, grid and price.
Danish UI. Reads the [Huawei Solar](https://github.com/wlcrs/huawei_solar) integration; `th-energy-card` embeds it.

```yaml
type: custom:th-energy-flow-card
# all optional
title: Hvor kommer strømmen fra?
mode: day            # start in "I dag" (default: "Lige nu")
inverter_w: 8000     # full scale of the sun arc and "% af anlægget"
grid_max_w: 11000    # full scale of the grid arc
ev_max_w: 11000      # full scale of the charger arc
entities:
  price: sensor.example_price_now   # current price in kr/kWh (no default)
  mean: sensor.example_price_mean   # today's mean price (no default; falls back to price)
```

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `title` | `Hvor kommer strømmen fra?` | Heading. |
| `mode` | `now` | `day` starts in *I dag*. |
| `inverter_w` | `10000` | Full scale (W) of the sun arc. |
| `grid_max_w` | `11000` | Full scale (W) of the grid arc. |
| `ev_max_w` | `11000` | Full scale (W) of the charger arc. |
| `huawei` | integration names | Device names (`emma`, `batteries`, `charger`); `huawei: false` derives no ids. |
| `entities` | – | Override single values by key (below); `null` hides one. |

## Entity keys

| Key | Default | Used for |
| --- | --- | --- |
| `pv`, `load`, `inv` | `sensor.<emma>_pv_output_power`, `_load_power`, `_inverter_active_power` | Live flows (grid = load − inverter) |
| `bat`, `soc` | `sensor.<batteries>_charge_discharge_power`, `_state_of_capacity` | Battery |
| `pvDay`, `cons`, `imp`, `exp` | `sensor.<emma>_pv_yield_today`, `_consumption_today`, `_supply_from_grid_today`, `_feed_in_to_grid_today` | *I dag* |
| `ch`, `dis` | `sensor.<batteries>_day_charge`, `_day_discharge` | *I dag* |
| `ev`, `evTemp` | `sensor.<charger>_charger_total_charged_energy`, `_charger_temperature` | Charger: power from how fast the total rises (and 5-minute statistics); without `ev` the charger is left out |
| `price`, `mean` | – | Price now and today's mean (kr/kWh) |
