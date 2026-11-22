# Protect Person Card

`custom:ha-person-detection-card` – the last 14 days of people registered by a UniFi Protect watcher on the outdoor
cameras, with a picture of each event and the camera it came from.

```yaml
type: custom:ha-person-detection-card
entity: sensor.person_history                    # history sensor (attribute events: [{event_id, camera, snapshot_url, …}])
guard_entity: binary_sensor.person_watch_active  # optional: on when the watcher is active (attribute grund is shown)
pause_entity: input_datetime.person_watch_pause  # optional: notifications are paused until this date and time
```

With `pause_entity` the card shows buttons that pause the watcher's notifications for 1 or 3 hours or until 7 o'clock
the next morning, and a button that resumes them. The watcher keeps registering while its notifications are paused.
