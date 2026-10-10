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
  photos:                                # fotos af bilen, valgfri
    charging: /local/tesla/plugged-in.webp # med ladekabel: i Opladning og i lade-popuppen
    parked: /local/tesla/parked.webp       # uden kabel: i Opladning
    top: /local/tesla/top.webp             # bilen set ovenfra (front op): i Dæktryk
    top_wheels: { fl: [13, 19], fr: [87, 19], rl: [13, 79], rr: [87, 79] }   # hjulenes placering i %
    cable: { path: "M524 252 L…", width: 889, height: 504 }  # kablet i ladefotoet: animeres under ladning
car_controls:                            # Bilstyring: runde knapper nederst i topkortet (kun på hele Tesla-siden)
  lock: lock.tesla_lock                  # oplåsning kræver to tryk
  climate: climate.tesla_climate         # lille termostat: tænd/sluk og temperatur ± (+ "Flere indstillinger")
  charge_port: cover.tesla_charge_port_door   # to tryk
  sentry: switch.tesla_sentry_mode       # slå fra kræver to tryk
  flash: button.tesla_flash_lights
  charge_limit: number.tesla_charge_limit
  charge_current: number.tesla_charge_current   # ladegrænse og -strøm: skyder i det lille panel
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

Bilstyringen ligger som en række runde knapper nederst i topkortet, så kortet ikke bliver større. Et tryk viser straks,
at kommandoen er sendt ("Låser…", "Starter klima…" med en roterende ring), og knappen kan ikke trykkes igen, før bilen
har svaret (eller efter 90 sekunder: "svarede ikke").

## Billede af bilen

Kortet tegner selv bilen: én enkel sidevisning pr. Tesla-karrosseri (`model_3`,
`model_3_highland`, `model_y`, `model_y_juniper`, `model_s`, `model_x`, `cybertruck`,
`roadster`) i farverne `grey` (standard), `black`, `white`, `silver`, `blue` og `red`.

```yaml
vehicle:
  model: auto        # navn og karrosseri fra EV Smart Charge (smart_charge)
  color: white
  # body: model_y    # vælg karrosseriet selv
```

Med `smart_charge` og `model: auto` (eller uden `model`) bruger kortet den model, EV Smart
Charge har fundet eller fået valgt for bilen. Teslas egne fotos må ikke distribueres her.
Vil du have din egen bil på kortet:

1. Læg et billede med transparent baggrund (WebP/PNG/SVG, ca. 900×434) i
   `config/www/`, fx `config/www/tesla/min-bil.webp`.
2. Sæt `vehicle.image: /local/tesla/min-bil.webp` (`/local/` = `config/www/`).
3. Genindlæs dashboardet (evt. tøm browserens cache).

Gennemsigtige fotos (WebP/PNG) vises som topbilledet med skygge; JPEG-fotos med egen baggrund toner ud mod
kanterne (bedst er at fjerne baggrunden). Opladning-panelet viser
fotoet med kabel, når bilen er sat til, ellers det parkerede, og lade-popuppen (`layout: charge`) bruger fotoet med
kabel som topbillede, mens bilen er sat til.

## Smart opladning (EV Smart Charge)

Med integrationen [EV Smart Charge](https://github.com/MRDonnii/ha-ev-smart-charge) (HACS)
er én linje nok:

```yaml
smart_charge: select.min_bil_charge_mode   # en vilkårlig entity fra bilens EV Smart Charge-enhed
charger_label: Zaptec                      # valgfrit navn på laderen i opladningspanelet
```

Kortet finder selv resten af bilens entiteter og viser panelet "Smart opladning":

- Ladeplan: Billigst, Fast tid, Lad nu, Prisloft, Pause og Manuel.
- Tidslinje fra nu til "klar senest" med de planlagte ladeperioder (skønnede priser stribet).
- Næste start, forventet slut og planlagt pris, mål-SOC og "klar senest".
- Fast tid viser start/slut, Prisloft viser prisloft og minimum-SOC.
- Midlertidig plan: afgang, destination (adresse, by eller `zone.*`) og tur/retur; viser
  afstand, energi og den SOC turen kræver.
- En lille prisgraf fra nu til "klar senest" med planens ladetider fremhævet (fra EV Ledgers `prices`), og når bilen
  ikke er sat til: "Sættes bilen til nu, lader den …".
- "Priser i": **Kvarter** eller **Time** (EV Ledgers prisopløsning). Med Time lægges planerne i hele
  timer med timens gennemsnitspris; pris-kort med `resolution_entity` følger med.

Uden egne `start_charge`/`stop_charge` skifter knapperne i opladningspanelet ladeplanen:
"Lad nu" vælger *Lad nu*, og "Stop" vælger *Pause*. `target_soc` og `deadline` følger
integrationen, med mindre de er sat under `controls`.

## Smart ladeplan (egne sensorer)

Den nemmeste vej er integrationen
[EV Smart Charge](https://github.com/MRDonnii/ha-ev-smart-charge) (HACS). Den laver alle
sensorerne til panelet ud fra bilens batteri og din elpris-sensor; se dens README for
den færdige `entities`/`controls`-blok.

Panelet "Smart ladeplan" læser **dine egne sensorer**. Hverken Tesla-integrationen,
EV Ledger eller Monta/Zaptec leverer dem, så navnene i eksemplet ovenfor er kun
pladsholdere. Byg dem fx som template-sensorer ud fra din elpris og din egen bils
batteri, mål-SOC og deadline – og brug ikke en anden bils sensorer, for så viser
kortet den bils beregninger.

| Nøgle | Forventet tilstand |
|---|---|
| `best_charge_start` | Starttid som tekst `HH:MM` (anden tekst vises som "Ingen gyldig plan"). |
| `best_charge_end` | Forventet sluttid som `HH:MM`. |
| `best_charge_price` | Samlet pris for opladningen, fx i `kr.`. |
| `missing_wall_kwh` | kWh fra væggen, der mangler for at nå målet (≤ 0,05 = "Mål nået"). |
| `charge_minutes_needed` | Ladetid i minutter (eller timer med enheden `h`). |

Er ingen af de fem sensorer eller kontrollerne `apply_plan`, `target_soc` og
`deadline` sat, udelades panelet helt, og opladningspanelet fylder dets plads.

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
