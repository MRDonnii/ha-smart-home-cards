# TH Tesla Dashboard Card

`custom:th-tesla-dashboard-card` er et samlet Tesla-dashboard i ét kort:
bilstatus med batteriring, Home Assistants eget kort med bilens placering,
opladning (Monta/Zaptec), smart ladeplan, dæktryk, kørsel, økonomi (EV Ledger),
seneste opladning og en let graf over dagligt forbrug.

- Vanilla Web Component uden afhængigheder. Skyggeroden bygges én gang og
  opdateres derefter målrettet, når en overvåget entity ændrer sig.
- Ingen polling. Grafens statistik hentes via `recorder/statistics_during_period`,
  kun når kortet er synligt, og caches i 15 minutter.
- Kortet over placeringen er HA's indbyggede `map`-kort via `loadCardHelpers()`. Med
  `map.style: satellite` (eller knappen i kortets hoved) lægges Esri-satellitfotos ind i
  HA's eget kort, så markør, rute, zoom og more-info virker som før.
- Alle entities er valgfrie. Manglende eller utilgængelige værdier vises som `—`.
  En kontrol uden en fungerende entity skjules helt.
- Enheder kommer fra `unit_of_measurement`. Dæktryk omregnes kun, når sensorens
  egen enhed er kendt (bar, psi, kPa, …).

## Eksempel

```yaml
type: custom:th-tesla-dashboard-card
name: Min Tesla
vehicle:
  model: Tesla Model 3 RWD
  image: /local/tesla/model-3-rwd.webp   # transparent WebP/PNG/SVG, valgfri
location_entity: device_tracker.tesla_location_tracker
entities:
  battery: sensor.tesla_battery
  range: sensor.tesla_range
  odometer: sensor.tesla_odometer
  temperature_inside: sensor.tesla_temperature_inside
  temperature_outside: sensor.tesla_temperature_outside
  last_update: sensor.tesla_data_last_update_time
  online: binary_sensor.tesla_online
  asleep: binary_sensor.tesla_asleep
  charger: binary_sensor.tesla_charger
  charging: binary_sensor.tesla_charging
  charging_rate: sensor.tesla_charging_rate
  tpms_front_left: sensor.tesla_tpms_front_left
  tpms_front_right: sensor.tesla_tpms_front_right
  tpms_rear_left: sensor.tesla_tpms_rear_left
  tpms_rear_right: sensor.tesla_tpms_rear_right
  daily_energy: sensor.tesla_daily
  charging_finish_time: sensor.tesla_charging_finish_time
  charging_time_remaining: sensor.tesla_charging_time_remaining
  charging_price_estimate: sensor.tesla_charging_price_estimate
  charger_power: sensor.wallbox_power_kw
  charger_mode: sensor.wallbox_charger_mode
  best_charge_start: sensor.tesla_best_charge_start_text_by_deadline
  best_charge_end: sensor.tesla_best_charge_end_text_by_deadline
  best_charge_price: sensor.tesla_best_charge_price_by_deadline
  charge_minutes_needed: sensor.tesla_charge_minutes_needed
  missing_wall_kwh: sensor.tesla_missing_wall_kwh
  efficiency_score: sensor.tesla_battery_efficiency_score
  trips: sensor.tesla_trips
  last_trip: sensor.tesla_last_trip
  total_distance: sensor.tesla_total_distance
  cost_per_km: sensor.tesla_cost_per_km
  monthly_performance: sensor.tesla_monthly_performance
  charges: sensor.tesla_charges
  last_charge: sensor.tesla_last_charge
  charges_needing_price: sensor.tesla_charges_needing_price
  monta_state: sensor.monta_charger_state
  monta_last_charge: sensor.monta_charger_last_charge
  monta_last_meter_reading: sensor.monta_charger_last_meter_reading
  monta_wallet: sensor.monta_personal_wallet
  monta_latest_wallet_transactions: sensor.monta_latest_wallet_transactions
  monta_charge_energy: sensor.monta_charger_charge_energy
  monta_cable_connected: binary_sensor.monta_charger_cable_plugged_in
controls:
  start_charge: { entity: script.charger_start }   # eller switch/button
  stop_charge: { entity: script.charger_stop }
  target_soc: { entity: input_number.tesla_target_soc }
  deadline: { entity: input_datetime.tesla_ready_by_time }
tpms:
  unit: bar            # visningsenhed; omregnes fra sensorens egen enhed
map:
  theme_mode: dark     # auto | light | dark
  style: satellite     # default | satellite
  hours_to_show: 6
refresh_entities:      # bedes opdatere, når kortet vises (højst én gang i minuttet)
  - sensor.monta_charger_state
chart:
  energy_entity: sensor.monta_charger_charge_energy
```

## Øvrige indstillinger

| Nøgle | Standard | Betydning |
|---|---|---|
| `map.hours_to_show` | `6` | Rute der vises fra start. Knapperne `Nu/1t/6t/12t/24t` skifter den. |
| `map.ranges` | `[0, 1, 6, 12, 24]` | Tilgængelige ruteintervaller i timer. |
| `map.default_zoom`, `map.auto_fit` | `14`, – | Sendes videre til HA's map-kort. |
| `map.style` | `default` | `satellite` viser satellitfotos; kan skiftes med knappen i kortets hoved. |
| `map.satellite_url`, `map.satellite_attribution`, `map.satellite_labels` | Esri World Imagery | Egen rasterkilde for satellit og om stednavne vises ovenpå. |
| `layout` | `full` | `charge` viser kun status, opladning og ladeplan – beregnet til en popup. |
| `navigation_path` | – | Viser knappen "Åbn hele Tesla-oversigten" (lukker også en omgivende popup via `tesla-popup-close`). |
| `refresh_entities` | – | Entities der opdateres med `homeassistant.update_entity`, når kortet bliver synligt og efter start/stop. |
| `chart.range` | `today` | `today`, `7d` eller `30d`. |
| `chart.distance_entity` | `entities.odometer` | Stigende km-tæller (`total_increasing`) til kørsels-søjlerne. |
| `chart.energy_entity` | – | Stigende kWh-tæller til opladnings-søjlerne. |
| `tpms.warning_low/critical_low` | `2.6` / `2.2` | Grænser i bar (efter omregning). |
| `tpms.warning_high/critical_high` | `3.5` / `3.8` | Grænser i bar. |
| `battery.low/critical` | `20` / `10` | Farveskift for batteriringen i %. |
| `precision.<entity-nøgle>` | kortets egne | Antal decimaler, fx `precision: { range: 1 }`. |

## Kontroller

| Nøgle | Understøttede domæner | Handling |
|---|---|---|
| `start_charge` | `switch`, `input_boolean`, `button`, `input_button`, `script`, `scene`, `automation` | Vises kun når bilen er tilsluttet og ikke lader. |
| `stop_charge` | samme | Vises kun under opladning eller planlagt opladning. |
| `apply_plan` | samme | Knappen "Brug ladeplan". |
| `charger_mode` | `select`, `input_select` | Rullemenu i stedet for ren tekst. |
| `target_soc` | `input_number`, `number` | Skyder for mål-SOC. |
| `deadline` | `input_datetime`, `time` | Tidsvælger "Klar senest". |

Start, stop og ladeplan kræver to tryk (bekræftelse inden for fire sekunder).
Alle handlinger er almindelige Home Assistant-servicekald. Start vises, så snart ét af
signalerne (Zaptec-tilstand, bilens stik eller Montas kabel) melder tilsluttet. Et script
som kontrol viser "Starter …"/"Stopper …", mens det kører; andre domæner viser det i
otte sekunder og beder derefter `refresh_entities` om ny status.

## Attributter der bruges

| Entity | Attributter |
|---|---|
| `online` | `state` (`online`/`asleep`/`offline`) |
| `charger` | `charging_state`, `fast_charger_present` |
| TPMS | `unit_of_measurement`, `tpms_last_seen_pressure_timestamp` |
| `charging_price_estimate` | `estimated_kwh_needed`, `current_price` |
| `monthly_performance` (EV Ledger) | `months[].month`, `months[].distance_km` |
| `last_trip` (EV Ledger) | `started_at`, `ended_at` |
| `last_charge` (EV Ledger) | `kwh`, `price`, `price_currency`, `started_at`, `ended_at`, `start_battery_pct`, `end_battery_pct`, `location_name` |
| `monta_last_charge` | `consumedKwh`, `cost`, `currency.identifier`, `startedAt`, `stoppedAt`, `soc.percentage` |

## Samlet status

Statusteksten udledes ét sted (`deriveStatus`) ud fra Tesla, Monta og laderens
tilstand: `Lader`, `Opladning færdig`, `Venter på opladning`, `Klar til opladning`,
`Tilsluttet`, `Online`, `Sover`, `Offline` eller `Ukendt`.
