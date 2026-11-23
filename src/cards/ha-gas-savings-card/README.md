# HA Gas Savings Card

What district heating saves compared with staying on gas, for the heat you actually use now. Each month since the
switch: heat kWh from the heat meter → the same heat on gas (m³ = kWh ÷ (kWh per m³ × boiler efficiency)) at that
month's all-in gas price plus the gas side's fixed amounts → minus what district heating cost. Also a 12-month forecast
from a normal year's heat profile at today's prices, and the payback of the installation.

```yaml
type: custom:ha-gas-savings-card
heat_energy: sensor.heat_meter_energy_total      # cumulative kWh with long-term statistics
heat_price: sensor.heat_price_per_kwh            # entity or number, kr/kWh incl. VAT
heat_fixed_month: 280                            # district heating fixed fees per month
gas_price: sensor.gas_price_total_m3             # today's all-in gas price per m³
gas_price_months: input_text.gas_price_months    # optional JSON {"2026-11": 14.94, …}
gas_fixed_year: 2400                             # e.g. system tariff + subscription per year
service_year: 1100                               # boiler service agreement you no longer pay
investment: 70000
switch_date: "2026-04-27"
heat_profile: [2000, 1800, 2000, 1600, 1600, 1600, 300, 300, 300, 2150, 2100, 2150]  # kWh heat per calendar month
```

Optional: `title`, `kwh_per_m3` (11), `efficiency` (0.9), `max_kwh_day` (400, skips meter glitches), `year_kwh`.
