# HA Settings Center Card

`custom:ha-settings-center-card` samler husets indstillinger i ét kort med faner: overblik, lys, rutiner, udstyr,
system og kort. Det bygges én gang og opdaterer derefter kun de felter, hvis entiteter ændrer sig.

## Rutiner

`routine_groups` er grupper af rutiner. `kind: toggle` viser hver rutine som et felt, der slår den til og fra (en
automation, et input_boolean eller en switch). `kind: entity` åbner entiteten, og `kind: number` giver − / +.

```yaml
type: custom:ha-settings-center-card
routine_groups:
  - title: Faste rutiner
    icon: mdi:calendar-clock
    kind: toggle
    items:
      - entity: automation.morgen_vaekning
        name: Vækning 06:50
        icon: mdi:alarm
        pause:                                   # valgfri: "Spring over"
          entity: input_datetime.vaekning_pause_til
          script: script.vaekning_spring_over
```

### Spring over

Med `pause` får rutinens felt en lille knap i hjørnet. Den åbner en popup med valgene:

- **Spring næste over** – scriptet kaldes med `dage: 1`
- **Spring en uge over** – `dage: 7`
- **Genoptag** – `dage: 0` (vises kun under en pause)

`pause.entity` er en dato-hjælper (`input_datetime` med kun dato). Så længe datoen er i dag eller senere, er feltet gult
og viser "Springer over i dag", "Springer over i morgen" eller "Springer over til og med <dato>". Rutinen selv skal
tjekke datoen, fx med en betingelse i automationen:

```yaml
conditions:
  - condition: template
    value_template: >-
      {% set p = states('input_datetime.vaekning_pause_til') %}
      {{ p in ['unknown', 'unavailable', ''] or now().strftime('%Y-%m-%d') > p }}
```

Scriptet sætter datoen ud fra `dage` (et eksempel er at regne fra i dag før rutinens tidspunkt, ellers fra i morgen).
`pause.field` ændrer feltets navn i scriptkaldet (standard `dage`), og `pause.options` (`[{days, label, sub, icon}]`)
erstatter valgene.
