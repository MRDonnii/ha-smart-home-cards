# TH Electricity Price Card

`custom:th-electricity-price-card` – Danish electricity prices from [Strømligning](https://github.com/MTrab/stromligning)
as bars or a line for 24 h, 48 h or 7 days, the price breakdown, the cheapest window, advice per appliance and an
optional car charging plan (EV Ledger).

```yaml
type: custom:th-electricity-price-card
# Strømligning sensors (these are the defaults)
current: sensor.stromligning_current_price_vat
mean: sensor.stromligning_today_mean_vat
forecast: sensor.stromligning_forecasts_vat
tomorrow: binary_sensor.stromligning_tomorrow_available_vat
levels:                  # fixed price levels, see below
  cheap: input_number.elpris_billig_under
  dear: input_number.elpris_dyrt_fra
  very_dear: input_number.elpris_meget_dyrt_fra
  extreme: input_number.elpris_ekstremt_dyrt_fra
days: true               # day averages below the chart (never on phones)
advice: true             # tap the price badge for advice
fill_height: true
```

## Price levels

What counts as cheap or dear is a fixed price in kr/kWh (the total price including tariffs, taxes and VAT), not the
day's own range – so the dearest hour of a cheap day is not called "very dear".

| Level | Price | Bars | Badge |
|---|---|---|---|
| Cheap | below `cheap` | green | "Billig nu" |
| Normal | `cheap` – `dear` | yellow-green | "Normal pris" |
| Dear | from `dear` | yellow | "Dyrt nu" |
| Very dear | from `very_dear` | red, pulsing | "Meget dyrt nu", MEGET DYRT over the period |
| Extremely dear | from `extreme` | magenta | "Ekstremt dyrt nu", EKSTREMT DYRT over the period |

Each level is a number or an entity (an `input_number`, `number` or `sensor`), so the thresholds can be changed from
Home Assistant without editing the card. Without `levels` the card uses **1.50 / 3.00 / 3.75 / 5.00 kr/kWh**.
The MEGET/EKSTREMT DYRT badge only shows when the whole dear period (above `dear`) is inside the chart.

The helpers in a package (`packages/elpris_niveauer.yaml`), then set the values once in Settings → Helpers:

```yaml
input_number:
  elpris_billig_under:
    name: Elpris – billig under
    min: 0
    max: 10
    step: 0.05
    unit_of_measurement: kr/kWh
    mode: box
  elpris_dyrt_fra:
    name: Elpris – dyrt fra
    min: 0
    max: 10
    step: 0.05
    unit_of_measurement: kr/kWh
    mode: box
  elpris_meget_dyrt_fra:
    name: Elpris – meget dyrt fra
    min: 0
    max: 15
    step: 0.05
    unit_of_measurement: kr/kWh
    mode: box
  elpris_ekstremt_dyrt_fra:
    name: Elpris – ekstremt dyrt fra
    min: 0
    max: 20
    step: 0.05
    unit_of_measurement: kr/kWh
    mode: box
```

The levels can also be picked in the card's visual editor under "Prisniveauer (kr/kWh)", or written as plain numbers:

```yaml
levels: { cheap: 1.5, dear: 3, very_dear: 3.75, extreme: 5 }
```

## Car charging

`charge: { plan, mode, cost, energy, cable, tracker, charger_mode, charging, soc, target, name }` – EV Ledger's plan as
bubbling bars while the car is plugged in at home. `charger_mode` (e.g. Zaptec's `sensor.<charger>_charger_mode`)
decides whether the car charges; `charging` (the car's charging sensor) is only used when the charger reports nothing.

## New or classic look

`style: new | classic` or `style_entity: input_boolean.…` (on = this card, off = `custom:ha-electricity-price-card`
configured under `classic:`), as described in the main README.
