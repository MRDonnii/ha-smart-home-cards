# Scroll Stack Card

`custom:scroll-stack-card` stacks cards vertically and scrolls its content when it does not fit the height it is given,
e.g. a column of `custom:ha-home-desktop-layout-card-front`. Below `mobile_breakpoint`, where the height is "auto",
the stack simply grows with its content and the page scrolls.

```yaml
type: custom:scroll-stack-card
gap: 12px                 # space between the cards
padding: 0 6px 24px 0     # inner padding (e.g. room for a navbar on mobile)
mobile_padding: 0 10px    # padding below mobile_breakpoint
mobile_breakpoint: 1100   # px
scroll: true              # false = no own scrolling (the page scrolls instead)
css:                      # optional extra CSS put into a card's shadow root; the key is the card's element name,
  ha-toggle-grid-card: |  # cards inside grid/stack cards are found too
    .tile-name{font-size:15px}
cards:
  - type: custom:ha-home-header-card
  - type: tile
    entity: light.living_room
```

| Option | Default | Description |
|---|---|---|
| `cards` | required | The cards to stack. |
| `gap` | `12px` | Space between cards. |
| `padding` | `0 6px 24px 0` | Inner padding of the stack. |
| `mobile_padding` | none | Inner padding below `mobile_breakpoint`. |
| `mobile_breakpoint` | `1100` | Width in px below which the stack never scrolls by itself. |
| `scroll` | `true` | `false` lets the content overflow instead of scrolling inside the stack. |
| `css` | none | Map of element name → CSS added to that card's shadow root (re-added when the card rewrites its shadow root). |
