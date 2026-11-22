# MRDonnii Vejr Studio

`custom:mr-weather-studio-card` – one large weather card built around a Home Assistant `weather` entity: an animated
weather scene with the current temperature, wind, gusts, humidity and rain chance, short insights (rain now, the next
hours, sunset/sunrise), and four tabs:

- **Overblik** – a 24-hour chart (temperature, rain or wind) with a slider, an hourly strip, the sun line and a 7-day list
  with temperature ranges.
- **Time for time** – the chart plus a table of the next 48 hours.
- **Radar** – a radar or satellite image from an `image` entity (zoom, freeze the animation), or a Windy wind map for
  Home Assistant's location (or `radar_lat`/`radar_lon`).
- **Detaljer** – grouped readings (measurements, today, at the water, risk forecasts) from separate sensors, e.g. from a
  DMI weather integration. Without sensors the measurements come from the weather entity itself.

Forecasts are fetched with `weather.get_forecasts` (daily and hourly) every 20 minutes, when the page becomes visible
again, and with the "Opdater" button.

```yaml
type: custom:mr-weather-studio-card
weather_entity: weather.forecast_home          # required
# all optional
title: Vejret
location: Example Town                          # default: Home Assistant's location name
warnings_entity: sensor.example_weather_warnings
radar_image_entity: image.example_rain_radar
satellite_image_entity: image.example_satellite
sensor_prefix: sensor.example_weather_          # sensor ids = prefix + key (see below)
entities:                                       # or name single sensors (wins over the prefix)
  temperatur: sensor.example_outdoor_temperature
today_title: Dagen i kommunen
```

## Options

| Option | Default | Description |
| --- | --- | --- |
| `weather_entity` | – (required) | The `weather` entity for the current weather and the forecasts. Without it the card asks to be configured |
| `title` | `Vejret` | Heading |
| `location` | HA location name | Shown in the header and footer; `""` hides it |
| `sun_entity` | `sun.sun` | Sunrise/sunset and day/night scene |
| `warnings_entity` | – | Sensor whose `varsler` or `warnings` attribute is a list of warnings (`overskrift`/`headline`/`type`/`event`, `beskrivelse`/`description`). Unset = no warnings box |
| `radar_image_entity` | – | `image` entity with a rain radar |
| `satellite_image_entity` | – | `image` entity with a satellite picture |
| `radar_lat`, `radar_lon` | HA location | Centre of the Windy wind map |
| `sensor_prefix` | – | Prefix for the sensor keys below (`sensor_prefix + key`) |
| `entities` | – | Map of sensor key → entity id, overrides the prefix per key |
| `today_title` | `Dagen i kommunen` | Title of the "today" group in Detaljer |

## Sensor keys

Rows whose sensor is not configured are left out (a group without rows is hidden). Timestamps (`device_class:
timestamp`) are shown as date and time; a `kilde` or `station_name` attribute is shown under the label.

| Group | Keys |
| --- | --- |
| DMI-målinger | `temperatur`, `luftfugtighed`, `vindhastighed`, `vindstod`, `vindretning`, `lufttryk`, `sigtbarhed`, `dugpunkt`, `skydaekke` (fall back to the weather entity's attributes) |
| Today (`today_title`) | `nedbor_i_dag`, `solskinstimer_i_dag`, `hojeste_temperatur_i_dag`, `laveste_temperatur_i_dag`, `kraftigste_vindstod_i_dag`, `nedbor_denne_maned` |
| Ved vandet | `vandstand_havn`, `vandtemperatur_havn`, `naeste_hojvande`, `naeste_lavvande` |
| Avancerede risikoprognoser | `frostrisiko_naeste_dogn`, `risiko_for_kraftig_regn_naeste_dogn`, `risiko_for_skybrud_naeste_dogn`, `risiko_for_stormstod_naeste_dogn`, `snerisiko_naeste_dogn`, `tagerisiko_naeste_dogn` |
| Radar / insights | `nedbor_lige_nu` (mm/h), `nedbor_maks_inden_for_5_km`, `radartidspunkt` (timestamp), `lyn_sidste_30_min`, `afstand_til_naermeste_regn` |

## Notes

- "Rolig visning" turns the animations off; the choice is stored per browser in `localStorage`
  (`mr-weather-studio-motion`). The system's "reduce motion" setting is always respected.
- Units from the weather entity are converted to °C, mm and m/s.
