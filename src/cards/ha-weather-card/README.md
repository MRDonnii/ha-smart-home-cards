# HA Weather Card

One weather card: warnings, now with key figures, hourly forecast, a 7-day list
with temperature ranges, radar, extra measurements as tidy panels, pollen, and
sun & UV. On wide screens (container width 860 px and up) the days and the radar
sit side by side and the panels flow in three columns; narrow cards stack. Forecasts come from any native
`weather` entity through `weather.get_forecasts`.

```yaml
type: custom:ha-weather-card
title: Vejr og varsler
weather_entity: weather.home
sun_entity: sun.sun
pollen:
  - name: Birk
    entity: sensor.pollen_birch
# Optional: show an image entity (for example a national radar with lightning)
# in the radar section instead of the web radar and lightning maps.
radar_image_entity: image.radar_map
# Optional: a sensor whose `varsler` (or `warnings`) attribute lists warnings.
warnings_entity: sensor.weather_warnings
# Optional: any sensors, in groups of tiles.
detail_sections:
  - title: Målt nu
    icon: mdi:thermometer
    items:
      - name: Dugpunkt
        entity: sensor.dew_point
      - name: Sigtbarhed
        entity: sensor.visibility
        icon: mdi:eye-outline
```

## Options

| Option | Default | Description |
|---|---|---|
| `weather_entity` | required | Native weather entity. |
| `more_info_entity` | `weather_entity` | Opened when a forecast day is tapped. |
| `sun_entity` | `sun.sun` | Sunrise, sunset and the sun arc. |
| `pollen` | five Google Pollen sensors | List of `{name, entity, icon}`. |
| `radar_lat`, `radar_lon` | home | Centre of the web radar and wind maps. |
| `radar_image_entity` | none | An `image` entity. When set, the radar section shows it under **Nedbør og lyn** (tap for more-info); the **Vind** tab keeps the web wind map. |
| `warnings_entity` | none | A sensor whose `varsler` or `warnings` attribute is a list of `{type, overskrift, beskrivelse, niveau, start, slut}` (English keys `event`, `headline`, `description`, `level`, `onset`, `expires` work too). Levels 2/3/4 are yellow/orange/red. With an empty list the card says there are no active warnings. |
| `radar_details` | none | Small facts under the radar: `[{name, entity, icon}]`. |
| `detail_sections` | none | Groups of tiles: `[{title, icon, items: [{name, entity, icon}]}]`. Values are formatted by Home Assistant (unit, decimals, dates). |

Tiles and the radar image update in place, so a sensor update does not rebuild
the card or reload the wind map.
