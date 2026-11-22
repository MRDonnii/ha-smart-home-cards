# HA Home Header Card

`custom:ha-home-header-card` – the "Hjemmet lige nu" header: clock and date, home status and alerts, the weather with
its animated weather effect (classic or V3 style), activities and quick insights.

```yaml
type: custom:ha-home-header-card
weather: weather.home
```

## Seasonal decoration

| Option | Default | Description |
|---|---|---|
| `seasonal_decor` | `true` | Seasonal decoration on the card. Set to `false` to turn it off. Also in the card editor. |
| `seasonal_date` | – | Hidden test option: force a date (`"YYYY-MM-DD"`) to preview the decoration, e.g. `"2026-12-31"`. Leave it out in normal use. |

Preview on one device without changing the card: add `?jul=1` (Christmas), `?jul=nytaar` (New Year's Eve) or `?jul=YYYY-MM-DD` to the dashboard URL. The device remembers it until you open `?jul=0`.

The decoration follows the browser's local date and changes by itself at midnight, without a page reload:

- **1–30 December**: a garland of small twinkling lights along the top edge, a star with a holly sprig and a few
  hanging baubles. Light snowfall is added only when the weather effect is not already showing rain, snow, sleet or hail.
- **31 December**: small fireworks in the background corners, confetti and serpentines.
- **1 January**: the same, plus a small sparkling "Godt nytår" at the top.
- **All other days**: nothing is added at all – no elements, styles, listeners or animations.

The decoration sits behind the text, alerts, clock and weather and never takes clicks. It is drawn with CSS and SVG
only (no images, no network). With `animation: false` or the system's reduced-motion setting it is shown without
animation, and the animations pause while the card is off screen or the browser tab is hidden. It works with both
weather styles (`weather_style_v3`), in light and dark themes and at all widths.
