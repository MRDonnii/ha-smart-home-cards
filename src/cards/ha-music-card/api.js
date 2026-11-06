// Music Assistant data access for ha-music-card. Everything goes through Home Assistant's websocket: the
// music_assistant integration (library, search, play, queue state) and, when installed, the mass_queue custom
// integration (queue editing, recommendations and raw Music Assistant API commands for track lists).
// By Claude AI.

const CACHE_MS = 60000;
const PRIVATE_HOST = /^(?:10\.|127\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|localhost$|[^.]+$|.*\.local$)/i;

export const MEDIA_LABEL = {
  track: "Nummer", album: "Album", artist: "Kunstner", playlist: "Playliste", radio: "Radio",
  podcast: "Podcast", podcast_episode: "Episode", audiobook: "Lydbog", folder: "Mappe"
};

// Item images arrive as plain strings (HA service responses), as {path, provider, remotely_accessible} (raw MA API)
// or inside metadata.images. Music Assistant's own image proxy is usually on a private http address, which a
// browser on https (or outside the house) can't load, so it is moved onto `ma_url` when that is configured.
export function imageUrl(item, config = {}, size = 256) {
  if (!item) return "";
  let src = item.image ?? item.media_image ?? item.entity_picture ?? "";
  if (src && typeof src === "object") src = imageFromRecord(src, config, size);
  if (!src && Array.isArray(item.metadata?.images)) {
    const img = item.metadata.images.find((i) => i.type === "thumb") || item.metadata.images[0];
    if (img) src = imageFromRecord(img, config, size);
  }
  if (!src && item.album?.image) src = imageUrl(item.album, config, size);
  return fixImageUrl(src, config, size);
}

function imageFromRecord(img, config, size) {
  if (!img?.path) return "";
  if (img.remotely_accessible || /^https?:\/\//.test(img.path)) return img.path;
  const base = (config.ma_url || "").replace(/\/+$/, "");
  if (img.proxy_id && base) return `${base}/imageproxy/${img.proxy_id}?size=${size}`;
  if (!base) return "";
  return `${base}/imageproxy?path=${encodeURIComponent(img.path)}&provider=${encodeURIComponent(img.provider || "")}&size=${size}`;
}

export function fixImageUrl(src, config = {}, size = 256) {
  if (!src || typeof src !== "string") return "";
  if (src.startsWith("/")) return src;
  let url;
  try { url = new URL(src); } catch (_e) { return src; }
  const base = (config.ma_url || "").replace(/\/+$/, "");
  const internal = (config.ma_internal_url || "").replace(/\/+$/, "");
  const isMa = (internal && src.startsWith(internal)) || (url.port === "8095" && PRIVATE_HOST.test(url.hostname));
  if (isMa && base) {
    let path = url.pathname + url.search;
    // The proxy only scales to a few sizes; size=0 is the full original (often several hundred kB).
    if (/\/imageproxy\//.test(url.pathname)) path = path.replace(/([?&]size=)\d+/, `$1${size}`);
    return base + path;
  }
  if (url.protocol === "http:" && typeof location !== "undefined" && location.protocol === "https:") {
    // Mixed content is blocked anyway; most image hosts also answer on https.
    return src.replace(/^http:/, "https:");
  }
  return src;
}

// Library and search items have the same core fields whatever API they came from.
export function normItem(raw, config) {
  if (!raw) return null;
  const media = raw.media_item && typeof raw.media_item === "object" ? raw.media_item : null;
  const base = media || raw;
  const item = {
    media_type: base.media_type || mediaTypeFromUri(base.uri),
    uri: base.uri || base.media_content_id || "",
    name: base.name || raw.media_title || raw.name || "",
    version: base.version || "",
    favorite: base.favorite === true || raw.favorite === true,
    artists: (base.artists || []).map((a) => ({ name: a.name, uri: a.uri })).filter((a) => a.name),
    album: base.album ? { name: base.album.name, uri: base.album.uri } : null,
    duration: Number(raw.duration ?? base.duration) || 0,
    track_number: base.track_number || base.episode_number || null,
    year: base.year || base.metadata?.year || null,
    owner: base.owner || "",
    image: imageUrl(raw.image ? raw : base, config, 256) || imageUrl(base, config, 256),
    image_large: imageUrl(raw.image ? raw : base, config, 512) || imageUrl(base, config, 512),
    queue_item_id: raw.queue_item_id || null,
    description: base.metadata?.description || "",
    fully_played: base.fully_played || false,
    resume_ms: base.resume_position_ms || 0,
    released: base.metadata?.release_date || base.date_added || ""
  };
  if (!item.artists.length && raw.media_artist) item.artists = [{ name: raw.media_artist }];
  if (!item.album && raw.media_album_name) item.album = { name: raw.media_album_name };
  return item;
}

export function mediaTypeFromUri(uri = "") {
  const m = String(uri).match(/^[^:]+:\/\/([a-z_]+)\//);
  return m ? m[1] : "";
}

function uriRef(uri) {
  const m = String(uri).match(/^([^:]+):\/\/[^/]+\/(.+)$/);
  return m ? { item_id: m[2], provider_instance_id_or_domain: m[1] } : null;
}

export class MusicApi {
  constructor(getHass, getConfig) {
    this._getHass = getHass;
    this._getConfig = getConfig;
    this._cache = new Map();
    this._entry = null;
    this._mqEntry = undefined;
  }

  get hass() { return this._getHass(); }
  get config() { return this._getConfig(); }
  get hasMassQueue() { return Boolean(this.hass?.services?.mass_queue); }

  clearCache() { this._cache.clear(); }

  async _cached(key, fn, ms = CACHE_MS) {
    const hit = this._cache.get(key);
    if (hit && Date.now() - hit.t < ms) return hit.p;
    const p = fn();
    this._cache.set(key, { t: Date.now(), p });
    p.catch(() => this._cache.delete(key));
    return p;
  }

  async call(domain, service, data = {}, target, response = true) {
    const msg = { type: "call_service", domain, service, service_data: data };
    if (target) msg.target = target;
    if (response) msg.return_response = true;
    const res = await this.hass.callWS(msg);
    return response ? res?.response : res;
  }

  async entryId() {
    if (this.config.config_entry_id) return this.config.config_entry_id;
    if (this._entry) return this._entry;
    const entries = await this.hass.callWS({ type: "config_entries/get", domain: "music_assistant" });
    const entry = entries.find((e) => e.state === "loaded") || entries[0];
    if (!entry) throw new Error("Music Assistant-integrationen blev ikke fundet");
    this._entry = entry.entry_id;
    return this._entry;
  }

  async mqEntryId() {
    if (this._mqEntry !== undefined) return this._mqEntry;
    if (!this.hasMassQueue) return (this._mqEntry = null);
    try {
      const entries = await this.hass.callWS({ type: "config_entries/get", domain: "mass_queue" });
      const entry = entries.find((e) => e.state === "loaded") || entries[0];
      this._mqEntry = entry ? entry.entry_id : null;
    } catch (_e) { this._mqEntry = null; }
    return this._mqEntry;
  }

  // Raw Music Assistant API command through mass_queue.send_command; answers {response: ...}.
  async command(command, data = {}) {
    const entry = await this.mqEntryId();
    if (!entry) throw new Error("mass_queue-integrationen mangler");
    const res = await this.call("mass_queue", "send_command", { config_entry_id: entry, command, data });
    return res?.response ?? res;
  }

  async library(mediaType, { order_by = "name", favorite, search, limit = 50, offset = 0 } = {}) {
    const key = `lib|${mediaType}|${order_by}|${favorite}|${search || ""}|${limit}|${offset}`;
    return this._cached(key, async () => {
      const data = { config_entry_id: await this.entryId(), media_type: mediaType, limit, offset, order_by };
      if (favorite) data.favorite = true;
      if (search) data.search = search;
      const res = await this.call("music_assistant", "get_library", data);
      return (res?.items || []).map((i) => normItem(i, this.config)).filter(Boolean);
    });
  }

  async search(query, limit = 10) {
    const key = `search|${query}|${limit}`;
    return this._cached(key, async () => {
      const res = await this.call("music_assistant", "search", { config_entry_id: await this.entryId(), name: query, limit });
      const out = {};
      for (const k of ["tracks", "artists", "albums", "playlists", "radio", "podcasts", "audiobooks"]) {
        out[k] = (res?.[k] || []).map((i) => normItem(i, this.config)).filter(Boolean);
      }
      return out;
    }, 120000);
  }

  async recommendations(entity) {
    if (!this.hasMassQueue || !entity) return [];
    return this._cached(`recs|${entity}`, async () => {
      const res = await this.call("mass_queue", "get_recommendations", { entity });
      const folders = Array.isArray(res) ? res : (res?.response || []);
      return folders.map((f) => ({ id: f.item_id, name: f.name, items: (f.items || []).map((i) => normItem(i, this.config)).filter((i) => i && i.uri) }))
        .filter((f) => f.items.length);
    }, 300000);
  }

  async queue(entity) {
    const res = await this.call("music_assistant", "get_queue", {}, { entity_id: entity });
    const q = res?.[entity] || Object.values(res || {})[0];
    if (!q) return null;
    return {
      queue_id: q.queue_id, items: q.items || 0, shuffle: q.shuffle_enabled, repeat: q.repeat_mode,
      current_index: q.current_index ?? 0, elapsed: q.elapsed_time || 0,
      current: q.current_item ? normItem(q.current_item, this.config) : null,
      next: q.next_item ? normItem(q.next_item, this.config) : null
    };
  }

  // The whole upcoming queue. mass_queue.get_queue_items is preferred, but it fails on items whose favorite flag is
  // empty, so the raw player_queues/items command (with the queue's own offset) is the fallback.
  async queueItems(entity, queueInfo) {
    if (!this.hasMassQueue) return [];
    try {
      const res = await this.call("mass_queue", "get_queue_items", { entity, limit_before: 3, limit_after: 100 });
      const list = res?.[entity] || Object.values(res || {})[0] || [];
      return list.map((i) => normItem({ ...i, image: i.media_image }, this.config));
    } catch (_e) {
      const qid = queueInfo?.queue_id || this.hass.states[entity]?.attributes?.active_queue;
      if (!qid) return [];
      const offset = Math.max(0, (queueInfo?.current_index || 0) - 3);
      const res = await this.command("player_queues/items", { queue_id: qid, limit: 100, offset });
      return (Array.isArray(res) ? res : []).map((i) => normItem(i, this.config));
    }
  }

  async item(uri) {
    return this._cached(`item|${uri}`, async () => {
      const raw = await this.command("music/item_by_uri", { uri });
      return normItem(raw, this.config);
    }, 300000);
  }

  // Tracks of an album/playlist, episodes of a podcast, chapters of an audiobook, top tracks and albums of an artist.
  async tracks(item) {
    const ref = uriRef(item.uri);
    if (!ref) return [];
    return this._cached(`tracks|${item.uri}`, async () => {
      const norm = (list) => (Array.isArray(list) ? list : []).map((i) => normItem(i, this.config)).filter(Boolean);
      switch (item.media_type) {
        case "album": return norm(await this.command("music/albums/album_tracks", ref));
        case "playlist": {
          const all = [];
          for (let page = 0; page < 10; page += 1) {
            const list = norm(await this.command("music/playlists/playlist_tracks", { ...ref, page }));
            all.push(...list);
            if (list.length < 50) break;
          }
          return all;
        }
        case "podcast": return norm(await this.command("music/podcasts/podcast_episodes", ref));
        case "artist": return norm(await this.command("music/artists/artist_tracks", ref));
        default: return [];
      }
    });
  }

  async artistAlbums(item) {
    const ref = uriRef(item.uri);
    if (!ref) return [];
    return this._cached(`artistalbums|${item.uri}`, async () => {
      const list = await this.command("music/artists/artist_albums", ref);
      return (Array.isArray(list) ? list : []).map((i) => normItem(i, this.config)).filter(Boolean);
    });
  }

  play(entity, item, enqueue = "play", radio = false) {
    const data = { media_id: Array.isArray(item) ? item.map((i) => i.uri) : item.uri, enqueue };
    if (!Array.isArray(item) && item.media_type) data.media_type = item.media_type;
    if (radio) data.radio_mode = true;
    return this.call("music_assistant", "play_media", data, { entity_id: entity }, false);
  }

  transfer(source, target) {
    return this.call("music_assistant", "transfer_queue", { source_player: source, auto_play: true }, { entity_id: target }, false);
  }

  queueAction(action, entity, queueItemId) {
    const data = { entity };
    if (queueItemId) data.queue_item_id = queueItemId;
    return this.call("mass_queue", action, data, undefined, false);
  }

  async setFavorite(item, on) {
    if (on) return this.command("music/favorites/add_item", { item: item.uri });
    const ref = uriRef(item.uri);
    if (ref?.provider_instance_id_or_domain === "library") {
      return this.command("music/favorites/remove_item", { media_type: item.media_type, library_item_id: ref.item_id });
    }
    throw new Error("Kan ikke fjerne favorit for dette element");
  }
}
