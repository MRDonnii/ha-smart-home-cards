# TH Pages

One file, three page cards in the same style as `th-home-card`:

- `custom:th-weather-page-card` – the weather page: `th-weather-card` as the hero, radar/satellite, 7 days and the
  current measurements.
- `custom:th-security-card` – alarm with arm/disarm, lock, doors and a list of warnings.
- `custom:th-tech-card` – power switches for equipment, Home Assistant gauges and updates, relays, printer ink and
  backups.

Nothing about the home is built in. Alarm, lock, doors, switches, printers and weather sensors come from the config;
defaults exist only for Home Assistant's own System Monitor and Backup integrations and the Huawei Solar integration.

## th-weather-page-card

```yaml
type: custom:th-weather-page-card
weather: weather.home                  # required
prefix: sensor.dmi_vejr_               # optional: the DMI Vejr integration's sensor prefix (fills everything below)
radar_image_entity: image.example_radar
satellite_image_entity: image.example_satellite
entities:                              # optional: any single measurement (null hides it)
  solar_radiation: sensor.example_solar_radiation
hero: {}                               # extra config for the embedded th-weather-card
```

| Key | Default | Description |
| --- | --- | --- |
| `weather` | – | Weather entity: the hero, the 7-day forecast (`weather/subscribe_forecast`) and the fallback measurements. |
| `prefix` | – | Sensor prefix of the [DMI Vejr](https://github.com/MRDonnii/dmi-vejr) integration (e.g. `sensor.dmi_vejr_`); fills all `entities`, the radar/satellite images (`image.<prefix>radarkort` / `satellitkort`) and sets `source: DMI`. It is also passed on to the hero. |
| `radar_image_entity`, `satellite_image_entity` | from `prefix` | `image` entities for the radar tile; with both a Radar/Satellit switch is shown, with none the tile is left out. |
| `source` | `DMI` with `prefix`, else empty | Shown as "Målinger lige nu · <source>" and after the radar time. |
| `entities` | from `prefix` | Measurement sensors by key (below). |
| `hero` | `{}` | Extra options for the `th-weather-card` hero (it always gets `weather`, and `prefix` when set). |

Measurement keys – a configured sensor wins, otherwise the weather entity's attribute in brackets is used, otherwise
the value is left out: `temperature` (`temperature`, the "now" mark in 7 days), `solar_radiation`,
`solar_radiation_hour`, `sunshine_today`, `sunshine_month`, `precipitation_today`, `precipitation_now`, `wind_gust`
(`wind_gust_speed`, converted to m/s), `wind_gust_max`, `humidity` (`humidity`), `dew_point` (`dew_point`), `pressure`
(`pressure`), `cloud_cover` (`cloud_coverage`), `visibility` (`visibility`), `ground_temperature`,
`water_temperature`. The UV cell uses the weather entity's `uv_index`.

## th-security-card

```yaml
type: custom:th-security-card
alarm: { entity: alarm_control_panel.home_alarm, name: Example }   # header "Example alarm" (default "Alarm")
lock: { entity: lock.front_door, name: Hoveddør }
doors:
  - { entity: binary_sensor.front_door, name: Hoveddør }
  - { entity: binary_sensor.back_door, name: Bagdør }
freezers:
  - { entity: sensor.example_freezer, name: Fryseren, max: -15 }
printers:
  - { name: Printer A, prefix: sensor.example_printer_ }
```

| Key | Default | Description |
| --- | --- | --- |
| `alarm` | – | `alarm_control_panel` entity or `{ entity, name }`; Fra / Hjemme / Ude via the code pad. Tile hidden when unset. |
| `lock` | – | `lock` entity or `{ entity, name, name_definite }` (default "Hoveddør" / "hoveddøren"); tap to lock/unlock via the code pad. |
| `doors` | `[]` | `[{ entity, name }]` – door contacts; a door open for more than 10 minutes becomes a warning. |
| `freezers` | `[]` | `[{ entity, name, max }]` – a warning "<name> er for varm" above `max` (default −15 °C, name "Fryseren"). |
| `printers` | `[]` | `[{ name, prefix }]` – every `sensor.<prefix>…_ink` below 5 % becomes a warning. |
| `huawei`, `entities.pv` | Huawei Solar names | The PV power sensor; "Ingen data fra solcellerne" when it is unavailable. `huawei: false` turns it off. |

Other warnings: the alarm is triggered, the lock has been unlocked for more than 15 minutes.

## th-tech-card

```yaml
type: custom:th-tech-card
power:
  - { entity: switch.router, name: Router, icon: router, warning: Internettet afbrydes, mens routeren er slukket. }
  - { entity: switch.tv_plug, name: TV-stik, icon: tv }
relay_platform: shelly                 # default; false = only the relays list
relays: [switch.example_relay_1, switch.example_relay_2]
printers:
  - { name: Printer A, prefix: sensor.example_printer_ }
```

| Key | Default | Description |
| --- | --- | --- |
| `power` | `[]` | `[{ entity, name, icon, warning }]` – "Strøm til udstyr". With a `warning`, switching off asks first. Icons: `router`, `box`, `fire`, `tv`, `plug` (default), `cpu`, `printer`, … or any `mdi:` icon. |
| `relay_platform` | `shelly` | "Relæer" lists the visible switches of this integration, sorted by area; `false` turns discovery off. |
| `relays` | `[]` | Switches shown when discovery finds none (or is off). |
| `printers` | `[]` | `[{ name, prefix }]` – black/cyan/magenta/yellow from `sensor.<prefix><colour>_ink`. The block is hidden without printers. |
| `entities.cpu`, `entities.memory`, `entities.cpu_temperature` | System Monitor standard names (`processor_use`, `memory_usage`, `processor_temperature`) | The three gauges. |
| `entities.backup_last`, `entities.backup_next` | Backup integration standard names (`last_successful_automatic_backup`, `next_scheduled_automatic_backup`) | "Seneste" / "Næste" backup. |

The update chip counts `update.*` entities that are on.
