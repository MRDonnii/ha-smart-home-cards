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

Kortet viser aktuel pris, dagens minimum/gennemsnit/maksimum, interaktive søjler pr. time eller kvarter, officielle morgendagspriser og fler-dages forecast. Ugefanen har direkte valg af hver ugedag med dato samt forrige/næste-navigation.

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

`resolution` kan være `auto` (som prissensoren leverer dem), `quarter` eller `hour`: med `hour` bliver
kvarterpriser til timer med timens gennemsnitspris. `resolution_entity` (fx EV Ledgers
`select.<bil>_price_resolution`) vinder over `resolution`, så kortet viser kvarterer eller timer ligesom
ladeplanerne.

**15 min / Time:** Når priserne findes i kvarterer, har kortet et lille skift "15 min | Time" ud for "Pris lige nu"
(på de andre faner ud for datoen). Med EV Ledger (`ev_ledger` eller `resolution_entity`) sætter det EV Ledgers
prisopløsning, så ladeplanerne følger med. Uden huskes valget i browseren og gælder kun visningen. Skjul det med
`resolution_toggle: false`.

**EV Ledger med én linje:** `ev_ledger: select.<bil>_charge_mode` (en vilkårlig entity fra bilens EV Ledger-enhed)
er nok. Kortet finder selv ladeplanen (`sensor.<bil>_next_charge_start`) og kvarter/time-valget
(`select.<bil>_price_resolution`), så bilens ladetider vises i grafen. `charge_plan_entity` og `resolution_entity`
vinder, hvis de sættes med hånden. Feltet findes også i kortets editor ("EV Ledger (bilens ladetider)").

```yaml
type: custom:ha-electricity-price-card
stromligning_current: sensor.stromligning_current_price_vat
ev_ledger: select.min_bil_charge_mode
```

`charge_plan_entity` (fx EV Ledgers `sensor.<bil>_next_charge_start`) giver de søjler, hvor bilen efter planen
lader, en svag farvet søjle bag priserne og en fod i bunden, og et "BIL"-mærke med starttiden over dem; tooltippen
siger "Bilen lader her". Ligger planen på en senere dag (fx efter midnat), står mærket ved grafens højre kant som
"BIL · I MORGEN". Planen findes også, før bilen er sat til, så grafen viser, hvornår den vil lade. Farven kan
ændres med CSS-variablen `--plan-color`.

Mærkerne LAV, NU, HØJ og BIL står over grafen og skubbes til side, hvis de ville overlappe. NU har en prikket
linje ned til søjlen, og den aktuelle søjle er bredere.

`source` kan være `auto`, `stromligning` eller `energidataservice`. I automatisk tilstand foretrækkes Strømligning, hvis den har gyldige prisdata; ellers bruges Energi Data Service.

`force_price_animation: true` lader højpris-pulsen fortsætte på en skærm, der
rapporterer reduceret bevægelse. Standardværdien er `false`, så den normale
tilgængelighedsindstilling fortsat respekteres hos andre brugere.
