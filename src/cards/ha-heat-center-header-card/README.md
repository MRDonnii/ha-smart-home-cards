# HA Heat Center Header Card

Title and Temperature, Air and District Heating tabs for a Home Assistant heat center. Place this card before the three conditional sections inside one `custom:stack-in-card`. The shared surface includes the header and the selected section.

Extra tabs can be added after the built-in ones. Each one shows its own `custom:local-conditional-card` section:

```yaml
extra_tabs:
  - key: house
    label: House
    icon: mdi:home-outline
    conditional: house   # id of the local-conditional-card to show
```
