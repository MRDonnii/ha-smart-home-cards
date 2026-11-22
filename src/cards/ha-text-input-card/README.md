# HA Text Input Card

`custom:ha-text-input-card` is a light text field for an `input_text` (or `text`) entity. It writes the value with
`set_value` on Enter or when the field loses focus, and follows changes made elsewhere (a clear button, a preset)
while the field is not being edited. It renders its own field, so it needs no entity registry download and does not
depend on Home Assistant's internal input elements.

```yaml
type: custom:ha-text-input-card
entity: input_text.message
name: Message        # shown in the empty field
icon: mdi:text-box-outline
height: 90           # px, card height
```

The field colour follows `--ha-text-input-fill` (default `--input-fill-color`, then black) and the corner radius
`--ha-text-input-radius`.
