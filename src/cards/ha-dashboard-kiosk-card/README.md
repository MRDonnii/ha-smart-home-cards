# HA Dashboard Kiosk Card (opt-in kiosk mode)

`custom:ha-dashboard-kiosk-card` is an **invisible switch** that turns one dashboard into a kiosk-style page:

- Home Assistant's top bar is hidden on every view of the dashboard (it is always shown in edit mode).
- The docked sidebar is set to "always hidden" (it opens as a drawer from the menu button) while you are on the
  dashboard, and your own sidebar setting comes back when you leave it.
- A tap on the menu button (☰) of a header card (`ha-home-header-card` / `ha-home-header-card-front`) opens the sidebar
  as before; a **long press** shows/hides the top bar. That choice is remembered per device/browser, so a wall tablet
  and a PC can differ.

Nothing happens on any dashboard without this card. Put it once, anywhere on the dashboard (any view; in a panel view
after the first card, which is never rendered). Outside edit mode the card renders nothing.

```yaml
type: custom:ha-dashboard-kiosk-card
hide_header: true        # hide the top bar
hide_sidebar: true       # sidebar as a drawer on this dashboard
header_toggle: true      # long press on a header card's menu button shows/hides the top bar on this device
header_cards: [ha-home-header-card-front, ha-home-header-card]   # cards whose menu button gets the long press
menu_selector: "button.menu:not(.quick)"                          # the menu button inside those cards
hold_ms: 600             # long-press time in ms
storage_key: ha-dashboard-kiosk-topbar   # localStorage key of the per-device choice
```

Remove the card to switch kiosk mode off.
