# HA Electricity Overview Card

Strømprisen lige nu, i dag og i morgen, og hvad strømmen har kostet – i samme stil som `ha-gas-savings-card`.

```yaml
type: custom:ha-electricity-overview-card
price: sensor.electricity_price            # med attributten prices: [{price, start, end}, …]
tomorrow: binary_sensor.prices_tomorrow    # valgfri, samme prices-attribut
grid_energy: sensor.grid_energy            # kWh med langtidsstatistik (hovedmåleren)
grid_cost: sensor.grid_energy_cost         # kr med langtidsstatistik (energi-dashboardets omkostning)
car_energy: sensor.charger_energy          # valgfri: laderens kWh
house_power: sensor.house_power            # valgfri: live effekt (W eller kW)
car_power: sensor.charger_power            # valgfri
spot_price: sensor.spot_price              # valgfri
price_components: [sensor.net_tariff, …]   # valgfri: prisens dele
price_labels: { sensor.net_tariff: Nettarif }  # valgfri: egne navne
co2: sensor.co2_intensity                  # valgfri
fossil_share: sensor.fossil_share          # valgfri
window_hours: 3                            # de billigste sammenhængende timer
layout: wide                               # wide/compact; ellers bred fra 1000 px
```
