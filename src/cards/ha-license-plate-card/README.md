# Protect Number Plate Card

`custom:ha-license-plate-card` – the last 14 days of number plates registered by a UniFi Protect watcher, with the
event picture, plate, confidence and known/unknown filters.

```yaml
type: custom:ha-license-plate-card
entity: sensor.plate_history                        # history sensor (attribute events: [{event_id, plate, …}])
camera_entity: camera.drive_high_resolution_channel # "Live" button
guard_entity: binary_sensor.household_away          # optional: on when the watcher is active (attribute grund is shown)
pause_entity: input_datetime.plate_watch_pause      # optional: notifications are paused until this date and time
```

With `pause_entity` the card shows buttons that pause the watcher's notifications for 1 or 3 hours or until 7 o'clock
the next morning, and a button that resumes them. The watcher keeps registering while its notifications are paused; the
automation that sends the notifications checks the same `input_datetime`.
