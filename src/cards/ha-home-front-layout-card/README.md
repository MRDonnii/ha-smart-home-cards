# HA Home Front Layout Card

`custom:ha-home-desktop-layout-card-front` is a responsive Home Assistant front page wrapper. It accepts the same `header_cards`, `left_cards`, `right_cards`, `mobile_cards`, and `vertical_cards` configuration as `ha-home-desktop-layout-card`.

The visible **Kort / Samlet flade** switch stores its choice in browser `localStorage` under `ha-home-front-surface-mode`. It changes layout CSS and inherited theme variables without rebuilding child cards. The unified surface uses the active HA theme, while child card surfaces and shadows become transparent. The classic card layout is the default until the user switches modes.

The front page header can use `custom:ha-home-header-card-front` from the Home Header Card resource. Its unique element name prevents an older bundled header implementation from registering first. In unified mode, the wrapper adds `home-unified` to the header host for a soft lower edge.
