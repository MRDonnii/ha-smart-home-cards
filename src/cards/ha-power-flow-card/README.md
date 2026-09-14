# Power Flow Card

## Neutral mobile preview

![Neutral mobile preview of ha-power-flow-card](docs/preview.png)

> Rendered at 390 px mobile width with fictional Home Assistant entities and values. No private dashboard, person, address, camera, or sensor data is included.


Et selvstændigt, tema-kompatibelt Lovelace-kort til Home Assistant. Kortet er flyttet fra en aktiv installation til et separat repository, så kildekode og versionshistorik kan vedligeholdes sikkert.

## Installation

Kopiér `ha-power-flow-card.js` til `/config/www/ha-power-flow-card/` og registrér ressourcen som et JavaScript-modul:

```text
/local/ha-power-flow-card/ha-power-flow-card.js?v=0.4.0
```

Tilføj derefter korttypen `custom:ha-power-flow-card` i Lovelace. De nødvendige entities angives i kortets konfiguration; repositoryet indeholder ingen installationens dashboardkonfiguration eller personlige data.

Den absolutte prisgradient bruger grøn 0–1 kr, gul frem mod 2 kr, orange frem
mod 4 kr, rød ved 5 kr og mørkerød ved 6 kr. Søjlepuls over 6 kr er slået til
som standard og kan styres i korteditoren eller med
`high_price_animation: false`.

## Udvikling

```bash
npm run check
```

## Licens

MIT
