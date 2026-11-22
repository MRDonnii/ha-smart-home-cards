# HA Elforbrug Historik Card

`custom:ha-elforbrug-historik-card` shows electricity use **month by month** and **year by year** from Home Assistant's
long-term statistics (`recorder/statistics_during_period`, period month, type change) for one energy sensor. Key figures:
the last 12 months against the 12 before, the year to date against the same months last year, the monthly average with
the highest month, and an expected value for next month (the same month last year × the trend of the last six complete
months). The current month is preliminary and does not count in comparisons. Same design language as
`ha-energy-center-card`; the charts are plain SVG.

```yaml
type: custom:ha-elforbrug-historik-card
entity: sensor.example_energy_total   # a kWh sensor with long-term statistics (state_class total/total_increasing)
title: Elforbrug
subtitle: Måned for måned og år for år
source: netselskabets målinger og derefter hovedmåleren   # optional, shown as "Kilde: …" under the chart
```

| Option | Default | Description |
|---|---|---|
| `entity` | none (required) | Statistic id of the energy sensor. Without it the card asks for one. |
| `title` | `Elforbrug` | Heading. |
| `subtitle` | `Måned for måned og år for år` | Line under the heading. |
| `source` | none | Optional sentence about where the numbers come from, shown before the note about the current month. |

The statistics are reloaded every 30 minutes and when the page becomes visible again after 10 minutes or more.
