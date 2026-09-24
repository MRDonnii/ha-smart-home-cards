# Electricity Dashboard Card

Et samlet el-dashboard i ét Lovelace-kort: strømpris nu, dagens og morgendagens priser,
prisbaseret ladeanbefaling, live-fordeling mellem hus og billader, dagens energi og
opladningsstatus. Ingen eksterne afhængigheder.

## Installation

Kopiér `ha-electricity-dashboard-card.js` til `/config/www/ha-electricity-dashboard-card/`
og registrér ressourcen som et JavaScript-modul:

```text
/local/ha-electricity-dashboard-card/ha-electricity-dashboard-card.js?v=1.1.0
```

## Konfiguration

Kun `entities.price` er påkrævet. Alle andre dele af kortet skjules eller vises som "—",
hvis en entity mangler eller er utilgængelig – kortet viser aldrig opdigtede værdier.

```yaml
type: custom:ha-electricity-dashboard-card
title: Elpriser
subtitle: Samlet overblik over strømpriser, forbrug og opladning
log_prefix: elpriser            # prefix på advarsler i browser-konsollen
charger_max_power_kw: 11        # valgfri; ellers udledt af max_current × faser × 230 V
entities:
  price: sensor.current_price_incl_vat            # state = pris nu, attribut `prices`
  tomorrow: binary_sensor.prices_tomorrow          # state on/off, attribut `prices`, `available_at`
  house_power: sensor.house_power_without_ev       # W eller kW (enheden læses fra sensoren)
  charger_power: sensor.ev_charger_power           # W eller kW
  house_energy_today: sensor.house_energy_today    # daglig kWh (fx utility_meter)
  house_energy_total: sensor.house_energy_total    # samlet kWh – bruges til timestatistik
  charger_energy_today: sensor.ev_energy_today     # daglig kWh; uden den vises ingen samlet sum
  charger_session_energy: sensor.ev_session_energy
  charger_mode: sensor.ev_charger_mode             # disconnected / connected_charging / …
  charger_online: binary_sensor.ev_charger_online
  charger_max_current: number.ev_charger_max_current
  charger_phases: sensor.ev_network_type           # fx "tn_3_phase" eller et tal
  spot_price: sensor.spot_price_incl_vat
  price_components:                                # summeres til "Net, tariffer & afgifter"
    - sensor.grid_tariff_incl_vat
    - sensor.electricity_tax_incl_vat
  co2: sensor.co2_intensity
  fossil_share: sensor.grid_fossil_fuel_percentage
```

Prislisten forventes som `[{price, start, end}, …]` med ISO-tidsstempler inkl. UTC-offset
(fx Strømligning). Morgendagens priser vises kun, når `tomorrow` er `on`.

## Farver og tema

Kortet har ingen egen farvepalet. Alle farver og baggrunde kommer fra det aktive tema:
kort bruger `--dashboard-card-bg`/`--ha-card-background`, `--dashboard-border-neutral`,
`--ha-card-box-shadow` og `--ha-card-border-radius`; accent fra `--dashboard-accent`; billig/
normal/dyr fra `--dashboard-success`/`--dashboard-warning`/`--dashboard-danger`; tekst fra
`--primary-text-color`/`--secondary-text-color`. Kortet har ingen ydre baggrund, så temaets
sidebaggrund skinner igennem, og den globale venstre-accent (`--dashboard-left-accent-width`)
respekteres. Lyse og mørke temaer virker begge. Hex-værdier i koden er kun fallbacks.

## Beregninger

- **Gennemsnit** er tidsvægtet over dagens prisliste (ikke "resten af dagen").
- **Prisniveau og farver** bestemmes af percentilen blandt dagens egne priser:
  0–10 meget billigt, –25 billigt, –60 normalt, –80 dyrt, derover meget dyrt.
  Det virker både på billige og dyre dage og med negative priser.
- **Ladeanbefalingen** er vejledende og baseres kun på prisen. Kortet styrer ikke laderen.
- **Samlet elforbrug** vises kun, når både hus og bil har en rigtig daglig kWh-sensor –
  effekt (kW) omregnes aldrig til energi.
- **Sparklines** kommer fra Home Assistants recorder-statistik (5-minutters middelværdier de
  seneste 6 timer og timeforbrug i dag/i går). Uden statistik skjules de.

## Ydelse

Skelettet bygges én gang; `hass`-opdateringer skriver kun til de noder, der er ændret, og
kun hvis en af kortets egne entities har skiftet state-objekt. Prisanalysen caches pr. rå
prisliste. Kontinuerlige animationer er rene CSS-animationer, som sættes på pause, når kortet
ikke er synligt (`IntersectionObserver`/`visibilitychange`), og slås fra ved
`prefers-reduced-motion`. Statistik hentes højst hvert 5. minut og kun mens kortet ses.

## Licens

MIT
