# Protect Playback (optional)

A small Home Assistant integration for TH Camera Card's player. Home Assistant's own `/api/unifiprotect/video` view
always exports a camera's highest channel; this adds the same export from a chosen channel (0 high, 2 low) and an
optional timelapse, so the player can show the low channel at once and switch to the high one when it arrives.

Install: copy this folder to `custom_components/protect_playback`, add `protect_playback:` to `configuration.yaml` and
restart Home Assistant. It needs the UniFi Protect integration and uses its connection and access checks.

- `GET /api/protect_playback/cameras` – NVRs, cameras and their channels
- `GET /api/protect_playback/video/{nvr_id}/{camera_id}/{channel}/{start}/{end}[?fps=4]` – MP4, at most 10 minutes (3 hours as a timelapse); pieces newer than 2 minutes are not cached
