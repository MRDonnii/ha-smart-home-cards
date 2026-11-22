# TH Theme Card (opt-in theme)

`custom:th-theme-card` is an **invisible switch** for the TH theme: the same exclusive look as the `th-*` cards across a
whole dashboard.

- `ha-navbar-card` gets a glass look with a gold accent, a slow sheen along the edge and a lit indicator.
- Standard cards on every view get a dark glass surface, 24 px corners, a thin light border and the gold accent
  (`--ha-card-*`, `--primary-color`, text colours).

The theme is **off everywhere** until a dashboard contains this card. Put it once, anywhere on the dashboard (any view;
in a panel view after the first card, which is never rendered). Every view of that dashboard is then themed; leaving the
dashboard removes the styles again, and other dashboards are never touched. Outside edit mode the card renders nothing.

```yaml
type: custom:th-theme-card
navbar: true   # glass look for ha-navbar-card (default true)
cards: true    # dark glass surface for standard cards on all views (default true)
```

Remove the card to switch the theme off. The navbar part overlaps with `ha-navbar-card`'s own `style: glass`
(which has square buttons and its own accent); use one of them.
