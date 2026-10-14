# HA Weather Charts Card

`custom:ha-weather-charts-card` draws the weather page's charts in SVG for [DMI Vejr](https://github.com/MRDonnii/dmi-vejr):

- **Temperatur** – measured (30 min) and the DMI forecast with the 10–90 % ensemble band.
- **Nedbør** – measured per hour, forecast median, and a dashed "kan blive op til" (90 %).
- **Vind** – measured gusts and mean wind, the forecast with its 90 % band, and arrows for the wind direction.
- **Skyer og sol** – low, middle and high clouds and the sun (forecast and measured).
- **Skybase, nulgradsgrænse og tordenenergi (CAPE)**, **Vandstand** (measured, storm surge forecast, tide),
  **Lufttryk og luftfugtighed** (7 days) and **Temperatur · 30 dage** (daily low–high and mean).

```yaml
type: custom:ha-weather-charts-card
prefix: sensor.dmi_vejr_       # DMI Vejr's sensor names
weather: weather.dmi_vejr      # hourly forecast when the ensemble sensors have no data
entities: {}                   # other names for single sensors, e.g. { temperatur: sensor.my_temp }
charts: [temperature, precipitation, wind, clouds, atmosphere, water, pressure, month]
```

A crosshair shows every value at a time; legend chips hide a series. Charts without their sensors are left out.
Colours follow the theme, the left stripe follows the dashboard's left accent switch.
