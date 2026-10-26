# TH Camera Card

`custom:th-camera-card` – UniFi Protect cameras the way the Protect app shows them: every camera as a live tile, the
last day's events beside them with thumbnails and filters, and a tap on a camera opens it live with its own clips.

```yaml
type: custom:th-camera-card
# all optional
cameras: [camera.front_high_resolution_channel, camera.drive_high_resolution_channel]  # default: every UniFi Protect camera
live_tiles: true      # tiles play live video (WebRTC, the camera's lowest channel); false = stills
max_live: 16          # at most this many live tiles at once (only tiles on screen play)
refresh: 3            # seconds between stills (default 3, or 5 with more than 8 cameras)
concurrency: 5        # cameras whose events are fetched at the same time
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

## Fast with many cameras

- **Live tiles:** each tile on screen plays Home Assistant's own camera stream (WebRTC through go2rtc) on the camera's
  lowest channel (about 0.4 Mbit/s), with the still underneath until the video runs. Tiles scrolled out of view stop.
  The camera popup plays the highest channel.
- **Events** come from the UniFi Protect media source (last 24 hours per camera). Several cameras are asked at once and
  the list fills in as each answers; the camera you open is asked first. The latest events are kept in the browser,
  so the list is there at once on the next visit and is then refreshed. Thumbnails are signed ten at a time.

A recorder with many cameras and events answers slower (each camera's event list is a request to the NVR), which
mostly shows on the first visit.

Needs the UniFi Protect integration; live tiles need WebRTC (Home Assistant's built-in go2rtc).
