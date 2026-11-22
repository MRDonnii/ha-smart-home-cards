# HA Bambu Lab Dashboard Card

`custom:ha-bambulab-dashboard-card` samler kamera, printstatus, fremdrift,
temperaturer, AMS-materialer, energiforbrug og betjening i ét responsivt kort.

Kortet har en visuel GUI-editor, hvor alle entities vælges. Det indeholder ingen
installationsspecifikke standardværdier. Felter, som ikke konfigureres, skjules.

## Sikker strømafbrydelse

En valgfri `power_switch` giver en tydelig rød sluk-knap. Handlingen kalder kun
`switch.turn_off` og kræver altid bekræftelse. Ved et aktivt print vises en ekstra
advarsel, så strømmen ikke afbrydes ved et uheld.

## Minimal konfiguration

```yaml
type: custom:ha-bambulab-dashboard-card
title: 3D-printer
camera: camera.example
power_switch: switch.example_printer
status: sensor.example_print_status
progress: sensor.example_print_progress
```

Tilføj temperaturer, lag, sluttid, energimålere, AMS-bakker og kontrolknapper i
kortets GUI-editor efter behov.
