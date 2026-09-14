# HA Electricity Price Card

`desktop_height` kan bruges til at gøre grafen højere på store skærme uden at
ændre den faste, kompakte mobilhøjde. Værdien kan sættes i GUI-editoren mellem
350 og 560 px.

`fill_height` lader kortet udfylde den resterende højde i et balanceret
desktop-layout. Indstillingen ignoreres på mobil.

`show_header: false` skjuler kortets titel og den aktuelle pris øverst. Faner,
dagsoversigt og prisgraf bevares, og grafen bruger den frigjorte højde. Valget
kan også ændres i GUI-editoren under **Vis titel og aktuel pris**.

Et samlet, responsivt Home Assistant-kort til elpriser fra enten Strømligning eller Energi Data Service.

Kortet viser aktuel pris, dagens minimum/gennemsnit/maksimum, 24 interaktive timesøjler, officielle morgendagspriser og fler-dages forecast. Ugefanen har direkte valg af hver ugedag med dato samt forrige/næste-navigation.

![HA Electricity Price Card](docs/preview.png)

```yaml
type: custom:ha-electricity-price-card
high_price_animation: true
source: auto
stromligning_current: sensor.stromligning_current_price_vat
stromligning_tomorrow: binary_sensor.stromligning_tomorrow_available_vat
stromligning_forecast: sensor.stromligning_forecasts_vat
energidataservice: sensor.energi_data_service
show_header: false
force_price_animation: false
```

`source` kan være `auto`, `stromligning` eller `energidataservice`. I automatisk tilstand foretrækkes Strømligning, hvis den har gyldige prisdata; ellers bruges Energi Data Service.

`force_price_animation: true` lader højpris-pulsen fortsætte på en skærm, der
rapporterer reduceret bevægelse. Standardværdien er `false`, så den normale
tilgængelighedsindstilling fortsat respekteres hos andre brugere.
