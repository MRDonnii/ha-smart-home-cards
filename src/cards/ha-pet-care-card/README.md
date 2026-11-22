# HA Pet Care Card

`custom:ha-pet-care-card` samler et kæledyrs vandskål, måltider og foderautomat i ét kort. Kortet har to udseender:
det klassiske og et premium-look med animationer.

```yaml
type: custom:ha-pet-care-card
title: Kæledyrspleje
pet_name: Bella
icon: mdi:dog-side
style: new                       # new = premium, classic = det klassiske (standard)
# style_entity: input_boolean.dashboard_nyt_kaeledyrskort   # til = premium; vinder over `style`
water: binary_sensor.vandskaal_water
water_battery: sensor.vandskaal_battery
feeder_mode: select.foderautomat_mode            # schedule / manual
daily_amount: sensor.foderautomat_weight_per_day
feeder_error: binary_sensor.foderautomat_error
container_grams: input_number.foder_resterende_g
container_percent: sensor.foder_procent
refill_action: script.foder_nulstil_beholder
meals:
  - name: Morgenmad
    time: "07:30"
    icon: mdi:weather-sunset-up
    enabled: input_boolean.morgen_aktiv          # til/fra
    status: input_select.morgen_status           # done / pending / missed
    feed_action: script.giv_morgenmad            # "Giv nu"
    skip: input_boolean.morgen_spring_over       # "Spring over" i dag
heat:                                            # valgfri, kun i premium-looket
  sensor: sensor.bella_lobetid
  start: input_datetime.bella_lobetid_start
  script: script.bella_gik_i_lobetid
  calendar: calendar.bella_lobetid
```

## Premium-looket

- **Toppen**: kæledyret i en ring med et felt pr. måltid (grøn = givet, gul = afventer, rød = misset, grå = sprunget
  over), en blød baggrund med poteaftryk og chips for måltider, næste måltid med nedtælling, vand og løbetid.
- **Dagens måltider**: en tidslinje fra 06 til 22 med et "nu"-mærke og et kort pr. måltid med "Giv nu", "Spring over"
  og en til/fra-knap. Fodertilstanden (plan/manuel) skiftes i hjørnet.
- **Foder og vand**: en foderbeholder, der fyldes efter procenten, gram, hvor mange dage det rækker, og en vandskål.
- **Løbetid** (med `heat`): de ca. 21 dage som et bånd (blødning dag 1–8, mest frugtbar dag 9–14, sidste del), dagen
  i dag markeret, en ring med hvor langt hun er (%), hvor mange dage der er tilbage, næste fase og hvornår den
  starter, og næste forventede løbetid. Mens hun er i løbetid, ligger panelet lige under toppen. Uden for løbetiden
  er der en nedtælling og "Hold øje fra" (14 dage før).
- **Startdato**: "Hun er gået i løbetid" (uden for løbetiden) og "Ret startdato" (under den) åbner en lille formular i
  kortet med I dag / I går / I forgårs og en datovælger. "Gem" kalder `heat.script` med `dato: ÅÅÅÅ-MM-DD`.

Alt bevæger sig langsomt og stopper med `animation: false` eller "reducer bevægelse" i systemet. I stedet for `heat`
kan de flade nøgler `heat_sensor`, `heat_start`, `heat_script` og `heat_calendar` bruges (dem viser editoren).

### Kalenderen

Før scriptet køres, fjerner kortet de begivenheder i `heat.calendar`, som den nye dato gør forkerte. Rettes datoen
under en løbetid, bliver den løbetids begivenheder og skønnet for den næste erstattet. Registreres en ny løbetid,
bliver den sidste stående som historik, og kun skønnet, der blev regnet ud fra den, bliver erstattet. Kortet rører kun
begivenheder med ordet `løbetidsknappen` i beskrivelsen, så scriptet skal skrive det i sine beskrivelser (fx "Lagt ind
af løbetidsknappen."). Det virker med kalendere, der kan slette begivenheder, som Local Calendar.

### Løbetidssensoren

`heat.sensor` er en template-sensor med tilstanden "Dag N af ca. 21" (eller "Ikke i løbetid") og attributterne `dag`,
`forventet_slut`, `naeste_forventet` og `dage_til_naeste`.

## Forsideknappen

`custom:ha-home-status-card` med `preset: pet` kan vise det samme med `heat_entity: sensor.bella_lobetid`. Den skifter
hvert 4. sekund mellem måltiderne og løbetiden, men kun mens hun er i løbetid ("Løbetid dag 7/21", "Frugtbar · dag
10/21") og de 14 dage før den forventede ("Løbetid om ca. 9 dage"). `heat_lead_days` ændrer de 14 dage.
