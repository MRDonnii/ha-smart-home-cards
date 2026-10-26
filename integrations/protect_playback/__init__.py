"""Protect Playback: UniFi Protect recordings from a chosen channel for TH Camera Card's player.

Claude AI, 2026-10-26. Home Assistant's own /api/unifiprotect/video view always exports the camera's
high channel (4K here, ~0.9 MB per second), which is too heavy for snappy scrubbing. This adds the
same view with a channel (0 high, 1 medium, 2 low) and an optional timelapse fps, and a list of the
cameras and their channels, reusing the UniFi Protect integration's connection and access checks.

Enable with `protect_playback:` in configuration.yaml.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from http import HTTPStatus
import logging

from aiohttp import web
from uiprotect.exceptions import ClientError

from homeassistant.components.http import HomeAssistantView
from homeassistant.components.unifiprotect.data import (
    async_get_data_for_nvr_id,
    async_get_ufp_entries,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

_LOGGER = logging.getLogger(__name__)

DOMAIN = "protect_playback"
VERSION = "1.0.0"
MAX_SPAN = timedelta(hours=3)
CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register the views."""
    hass.http.register_view(PlaybackCamerasView(hass))
    hass.http.register_view(PlaybackVideoView(hass))
    return True


def _error(message: str, status: HTTPStatus) -> web.Response:
    _LOGGER.debug("Protect Playback %s: %s", status.value, message)
    return web.Response(text=message, status=status)


class PlaybackCamerasView(HomeAssistantView):
    """GET /api/protect_playback/cameras – NVRs, cameras and their channels."""

    url = "/api/protect_playback/cameras"
    name = "api:protect_playback:cameras"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def get(self, request: web.Request) -> web.Response:
        nvrs = []
        for entry in async_get_ufp_entries(self.hass):
            api = entry.runtime_data.api
            if api.is_public_only:
                continue
            bootstrap = api.bootstrap
            cameras = []
            for camera in bootstrap.cameras.values():
                if not camera.can_read_media(bootstrap.auth_user):
                    continue
                cameras.append(
                    {
                        "id": camera.id,
                        "name": camera.name,
                        "mac": camera.mac,
                        "channels": [
                            {
                                "index": i,
                                "name": ch.name,
                                "enabled": ch.enabled,
                                "width": ch.width,
                                "height": ch.height,
                                "fps": ch.fps,
                                "bitrate": ch.bitrate,
                            }
                            for i, ch in enumerate(camera.channels)
                        ],
                    }
                )
            nvrs.append({"id": bootstrap.nvr.id, "name": bootstrap.nvr.name, "cameras": cameras})
        return self.json({"version": VERSION, "nvrs": nvrs})


class PlaybackVideoView(HomeAssistantView):
    """GET /api/protect_playback/video/{nvr_id}/{camera_id}/{channel}/{start}/{end}[?fps=4]."""

    url = "/api/protect_playback/video/{nvr_id}/{camera_id}/{channel}/{start}/{end}"
    name = "api:protect_playback:video"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def get(
        self,
        request: web.Request,
        nvr_id: str,
        camera_id: str,
        channel: str,
        start: str,
        end: str,
    ) -> web.StreamResponse:
        data = async_get_data_for_nvr_id(self.hass, nvr_id)
        if data is None:
            return _error("Invalid NVR ID", HTTPStatus.NOT_FOUND)
        bootstrap = data.api.bootstrap
        camera = bootstrap.cameras.get(camera_id)
        if camera is None:
            return _error("Invalid camera ID", HTTPStatus.NOT_FOUND)
        if not camera.can_read_media(bootstrap.auth_user):
            return _error("No access to this camera", HTTPStatus.FORBIDDEN)
        try:
            channel_index = int(channel)
            camera.channels[channel_index]
        except (ValueError, IndexError):
            return _error("Invalid channel", HTTPStatus.BAD_REQUEST)
        try:
            start_dt = datetime.fromisoformat(start)
            end_dt = datetime.fromisoformat(end)
        except ValueError:
            return _error("Invalid start or end", HTTPStatus.BAD_REQUEST)
        if not timedelta(0) < end_dt - start_dt <= MAX_SPAN:
            return _error("The span must be between 0 and 3 hours", HTTPStatus.BAD_REQUEST)
        fps: int | None = None
        if "fps" in request.query:
            try:
                fps = max(1, min(60, int(request.query["fps"])))
            except ValueError:
                return _error("Invalid fps", HTTPStatus.BAD_REQUEST)

        response = web.StreamResponse(
            status=200,
            reason="OK",
            headers={"Content-Type": "video/mp4", "Cache-Control": "private, max-age=86400"},
        )

        async def iterator(total: int, chunk: bytes | None) -> None:
            if not response.prepared:
                response.content_length = total
                await response.prepare(request)
            if chunk is not None:
                await response.write(chunk)

        try:
            await camera.get_video(
                start_dt, end_dt, channel_index=channel_index, iterator_callback=iterator, fps=fps
            )
        except ClientError as err:
            if response.prepared:
                raise
            return _error(f"No recording: {err}", HTTPStatus.NOT_FOUND)
        except ConnectionResetError:
            # The player cancels segments it no longer needs while the user scrubs.
            return response

        if not response.prepared:
            return _error("No recording", HTTPStatus.NOT_FOUND)
        await response.write_eof()
        return response
