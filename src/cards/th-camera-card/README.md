# TH Camera Card

`custom:th-camera-card` – UniFi Protect cameras the way the Protect app shows them: every camera as a live tile, a
player with a timeline you scrub through the recordings with, and the last day's events with thumbnails and filters.

```yaml
type: custom:th-camera-card
# all optional
cameras: [camera.front_high_resolution_channel, camera.drive_high_resolution_channel]  # default: every UniFi Protect camera
exclude: [camera.workshop_high_resolution_channel]  # leave cameras (and their events) out
live_tiles: true      # tiles play live video (WebRTC, the camera's lowest channel); false = stills
max_live: 16          # at most this many live tiles at once (only tiles on screen play)
refresh: 3            # seconds between stills (default 3, or 5 with more than 8 cameras)
concurrency: 5        # cameras whose events are fetched at the same time
layout: auto          # auto: wide screens show live + player + events, narrow screens only live (a tap opens the
                      # player full screen); playback: the player and the events as the whole page
nvr:                  # recorder status under the cameras
  storage_entity: sensor.<nvr>_storage_utilization
  capacity_entity: sensor.<nvr>_recording_capacity
  uptime_entity: sensor.<nvr>_uptime
  cpu_entity: sensor.<nvr>_cpu_utilization
  temp_entity: sensor.<nvr>_cpu_temperature
  memory_entity: sensor.<nvr>_memory_utilization
  hdd_entities: [binary_sensor.<nvr>_hdd_1, binary_sensor.<nvr>_hdd_2]
quick_links:          # buttons under the cameras
  - name: Number plates
    subtitle: Registered vehicles
    icon: mdi:card-account-details-star-outline
    navigation_path: /dashboard/plates
```

## Player

The player plays the recordings as one continuous timeline, not as separate clips:

- **Timeline** under the video with the camera's events as coloured marks (person, vehicle, animal, ring, motion).
  Drag it to scrub, tap a mark to jump to the event, scroll or pinch to zoom (1 minute to 24 hours), hover a mark on a
  PC to see its thumbnail. Earlier days load as you scroll back.
- **Buttons:** previous/next event, ±10 s, play/pause, 1–8× speed, quality (Auto/HD/SD), sound, go to a date, live,
  full screen. Keys: space, ←/→ (shift = 1 minute), L for live, F for full screen.
- **Switching camera** keeps the time, so you can follow someone from camera to camera.
- `?cam=camera.x&t=<ms or ISO time>` in the page address opens a camera at a time (for example from a notification).

Recordings are fetched in 10-second pieces through Home Assistant and the next pieces are fetched ahead, so playback
runs on without pauses. Without anything extra the player uses Home Assistant's own UniFi Protect endpoint, which
always sends the camera's highest channel (a 4K camera is about 1 MB per second).

**Faster with the Protect Playback integration (optional).** Copy
[`integrations/protect_playback`](../../../integrations/protect_playback) to `custom_components/protect_playback`, add
`protect_playback:` to `configuration.yaml` and restart. The player then fetches the camera's low channel first
(360p, about 0.4 MB per 10 s, shown in about 0.3 s) and switches to the high channel in the middle of playback when it
has arrived – the way the Protect app does. Scrubbing shows the low channel, so the picture follows your finger.
The integration reuses the UniFi Protect integration's connection and its access checks.

## Fast with many cameras

- **Live tiles:** each tile on screen plays Home Assistant's own camera stream (WebRTC through go2rtc) on the camera's
  lowest channel (about 0.4 Mbit/s), with the still underneath until the video runs. Tiles scrolled out of view stop.
  The player's live view plays the highest channel (the medium one in the small player beside the tiles).
- **Events** come from the UniFi Protect media source (last 24 hours per camera). Several cameras are asked at once and
  the list fills in as each answers; the camera you open is asked first. The latest events are kept in the browser,
  so the list is there at once on the next visit and is then refreshed. Thumbnails are signed ten at a time.

A recorder with many cameras and events answers slower (each camera's event list is a request to the NVR), which
mostly shows on the first visit.

Needs the UniFi Protect integration; live tiles need WebRTC (Home Assistant's built-in go2rtc).
