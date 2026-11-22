# HA Air Quality Card

Air quality for one room: CO₂, PM2.5 and the monitor's own rating, with 24-hour curves. Use it on its own or inside a room popup. `ha-radiator-overview-card-v2` shows it as the "Luftkvalitet" tab of a room popup when the room has air quality sensors.

```yaml
type: custom:ha-air-quality-card
name: Living room
co2: sensor.living_room_carbon_dioxide
pm25: sensor.living_room_pm2_5
air_quality: sensor.living_room_air_quality
hours: 24
```

At least one of `co2`, `pm25` and `air_quality` is required.

| Option | Default | Meaning |
|---|---|---|
| `name` | — | Room name, shown as "Luftkvalitet · name" |
| `title` | — | Replaces the heading |
| `co2` | — | CO₂ sensor in ppm |
| `pm25` | — | PM2.5 sensor in µg/m³ |
| `air_quality` | — | Enum sensor with the Matter scale `good`, `fair`, `moderate`, `poor`, `very_poor`, `extremely_poor` (for example IKEA ALPSTUGA) |
| `hours` | `24` | History window, 1–168 hours |
| `co2_warning` | `1000` | CO₂ level where the curve turns orange ("luft ud") |
| `co2_critical` | `1400` | CO₂ level where the curve turns red |
| `animation` | `true` | Set `false` to stop the status pulse |

Levels: CO₂ below 800 ppm is good, 800–1000 fair, 1000–1400 poor, and 1400 or more very poor. PM2.5 below 15 µg/m³ (WHO 24-hour guideline) is good, then 25, 35 and 55 µg/m³ step up. The overall level is the worst of CO₂, PM2.5 and the monitor's rating.

The same levels are used on the room cards of `ha-radiator-overview-card-v2` and `ha-home-room-overview-card-v3`. Both accept the same `co2`, `pm25` and `air_quality` keys per room.
