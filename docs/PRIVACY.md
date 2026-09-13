# Privacy and neutral defaults

This repository is intended for reuse across independent Home Assistant installations.

Published source and release bundles must not contain:

- household or person names;
- street addresses or precise personal locations;
- private IP addresses, email addresses or credentials;
- entity IDs tied to one author's household when a neutral example or configuration field can be used.

Example values use neutral names such as `Person 1`, `Room 1`, `camera.front_door` and `weather.home`. Runtime discovery should be preferred where Home Assistant exposes a dependable entity relationship.

`npm test` builds the complete bundle and scans every vendored JavaScript file as well as the generated artifact for known private values and common secret patterns. A card that cannot yet meet this rule must not be included in a public release.
