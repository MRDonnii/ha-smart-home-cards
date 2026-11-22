# TH Home Card

`custom:th-home-card` – a front page in one card: solar and battery today (ring, live values and the day's solar
curve), electricity prices for the next 24 h / 48 h / 7 days, climate, security and the rooms with their lights.
Tapping a tile opens a sheet (`th-home-sheet`): a room with its lights, all lights (Inde/Ude), all temperatures, or
the alarm and lock with a code pad.

Nothing about the home is built in: alarm, lock, doors, rooms, lights, sensors and prices come from the config. Tiles
without configuration are hidden or show "–". Only the solar tile has defaults: it reads the
[Huawei Solar](https://github.com/wlcrs/huawei_solar) integration's standard entity names.

```yaml
type: custom:th-home-card
energy: /energy                        # tapping the solar tile goes here (default /energy; false = nothing)
alarm:
  entity: alarm_control_panel.home_alarm
  name: Example Alarm                  # shown in the security sheet ("Koden sendes direkte til …")
lock:
  entity: lock.front_door
  name: Hoveddør                       # default "Hoveddør" → "Hoveddør låst", "Lås hoveddøren op"
doors:
  - { entity: binary_sensor.front_door, name: Hoveddør }
  - { entity: binary_sensor.terrace_door, name: Terrassedør }
climate:
  entity: sensor.living_room_temperature   # the big number
  label: i stuen                           # the line under it
  sensors:
    - { entity: sensor.bedroom_temperature, name: Soveværelse }
    - { entity: sensor.outdoor_temperature, name: Udenfor }
freezer: sensor.example_freezer        # or { entity, name: Fryser, max: -15 }
price:
  stromligning: stromligning           # the Strømligning integration's entity prefix (fills everything below)
  fallback: sensor.example_price       # used in the solar tile when the current price is not a number
rooms:
  - name: Stue
    icon: sofa
    temperature: sensor.living_room_temperature
    humidity: sensor.living_room_humidity
    door: binary_sensor.terrace_door
    media_player: media_player.living_room_tv
    lights:
      - { entity: light.living_room, name: Loftlampe }
      - light.living_room_lamp           # name = the entity's friendly name
  - name: Have
    icon: tree
    outdoor: true                      # listed under "Ude"
    lights: [{ entity: light.garden, name: Have }, { entity: switch.flag_pole, name: Flagstang }]
temperatures:                          # the "Temperaturer" sheet (default: every room's temperature + the freezer)
  - { entity: sensor.living_room_temperature, name: Stue }
  - { entity: sensor.example_freezer, name: Fryser, kind: freezer }
```

## Options

| Key | Default | Description |
| --- | --- | --- |
| `energy` | `/energy` | Navigation path for a tap on the solar tile; `false` disables it. |
| `latitude` | Home Assistant's home latitude | Latitude used for the height of the sun arc in the solar curve. |
| `huawei` | integration names | Device names of the Huawei Solar entities (see below); `false` = no derived ids. |
| `entities` | – | Overrides single values of the solar tile by key (see below). |
| `price` | – | Price tile; without it the tile is hidden. A string is the current-price entity. |
| `price.stromligning` | – | Prefix of the Strømligning integration's entities (`true` = `stromligning`); fills `current`, `mean`, `tomorrow`, `forecast` and the six price components, and sets the title "Strømligning". |
| `price.current` | – | Current price (state in kr/kWh); its `prices` attribute (`[{start, end, price}]`) is today's slots. |
| `price.mean` | – | Today's mean price ("Billig nu" / "Dyr nu" chip). |
| `price.tomorrow` | – | Entity whose `prices` attribute holds tomorrow's slots. |
| `price.forecast` | – | Entity whose `prices` attribute holds the forecast (dashed line, "prognose"). |
| `price.fallback` | – | Price shown in the solar tile when `current` is not a number. |
| `price.components` | – | `[{ name, entity, color }]` – the bar that splits the price (spot, tariffs, tax …). |
| `price.title` | `Strømligning` with `stromligning`, else empty | Shown as "Elpris · <title>". |
| `alarm` | – | `alarm_control_panel` entity, or `{ entity, name }`. |
| `lock` | – | `lock` entity, or `{ entity, name, name_definite }`; `name` defaults to "Hoveddør", `name_definite` to the name + "en" ("hoveddøren"). |
| `doors` | `[]` | `[{ entity, name }]` – door contacts (open doors turn the security tile orange). |
| `climate.entity` | – | Temperature shown large in the climate tile ("–" when unset). |
| `climate.label` | – | Text under the large temperature, e.g. "i stuen". |
| `climate.sensors` | `[]` | `[{ entity, name }]` – the small bars in the climate tile. |
| `freezer` | – | Freezer temperature line in the climate tile; `{ entity, name: "Fryser", max: -15 }` (above `max` = "for varm"). |
| `rooms` | `[]` | The room list (see below). |
| `temperatures` | rooms + freezer | `[{ entity, name, kind }]` for the "Temperaturer" sheet; `kind: freezer` uses the freezer scale and warning. |

Every `{ entity, name }` may also be just the entity id; the name is then the entity's friendly name.

### Rooms

| Key | Description |
| --- | --- |
| `name` | Room name. |
| `icon` | `sofa`, `kitchen`, `mug`, `bed`, `desk`, `stairs`, `tree`, `road`, `tools`, `home` (default), `garage`, or any `mdi:` icon. |
| `temperature`, `humidity` | Sensors shown on the room button and in the room sheet. |
| `door` | Door contact (a dot on the room button when open). |
| `media_player` | TV shown in the room sheet (Standby / Slukket / Spiller / Tændt / Pause). |
| `outdoor` | `true` lists the room under "Ude" instead of "Inde". |
| `lights` | `[{ entity, name }]` – `light` or `switch` entities, toggled from the room and light sheets. |
| `id` | Optional internal id (default: the position). |

### Solar values (`entities` keys)

| Key | Default (Huawei Solar) | Used for |
| --- | --- | --- |
| `pv` | `sensor.<emma>_pv_output_power` | "Sol nu", ring and curve. Without it the solar tile is hidden. |
| `load` | `sensor.<emma>_load_power` | "Huset bruger" and the consumption curve. |
| `inverter_power` | `sensor.<emma>_inverter_active_power` | Grid = load − inverter ("Køber" / "Sælger"). |
| `battery_power` | `sensor.<batteries>_charge_discharge_power` | Share from the battery. |
| `battery_soc` | `sensor.<batteries>_state_of_capacity` | "Batteri" %. |
| `pv_today` | `sensor.<emma>_pv_yield_today` | kWh produced today. |
| `feed_in_today` | `sensor.<emma>_feed_in_to_grid_today` | "Brugt selv" %. |
| `sunshine_hours` | – | "Solskin" hours today (optional). |

`<emma>` and `<batteries>` are the device names, by default `emma` and `batteries`; change them with
`huawei: { emma: my_emma, batteries: my_batteries }`.
