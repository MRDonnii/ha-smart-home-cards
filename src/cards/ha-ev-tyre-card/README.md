# HA EV Tyre Card

`custom:ha-ev-tyre-card` shows the tyre sets of a car from [EV Ledger](https://github.com/MRDonnii/evledger) 0.7 or newer.

```yaml
type: custom:ha-ev-tyre-card
entity: sensor.my_car_tyres
```

- The set on the car: kind, tyre size (e.g. `235/45 R18 98W`), rim, tyre brand/model, DOT and age.
- This season: km, driving Wh/km (from the battery drop on the trips), charged kWh/100 km and cost per km.
- Tread depth with the recommended least depth, the wear per 1000 km and about how far the set lasts.
- Every set side by side, use per outside temperature band, and how much more or less a set uses than the summer set
  **at the same temperature** (the cold, not the tyres, is most of the winter use).
- The seasons: every period a set was on the car; tap one to correct its date or odometer.
- A reminder banner when it is time to change (7-degree rule, studded-tyre season).
- **Skift hjul**, **Mål mønster** and new/edit set forms call the EV Ledger services.

The Tesla dashboard card (`custom:th-tesla-dashboard-card` with `ev_ledger:`) shows this card as its own panel.
