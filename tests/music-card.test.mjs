// ha-music-card: data access against a stubbed Home Assistant (example data only) and the pure view builders.
import assert from "node:assert/strict";

const registry = new Map();
class FakeElement {
  attachShadow() { this.shadowRoot = { innerHTML: "", querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {} }; return this.shadowRoot; }
  addEventListener() {}
  dispatchEvent(event) { this.lastEvent = event; }
}
globalThis.HTMLElement = FakeElement;
globalThis.customElements = { define(name, ctor) { registry.set(name, ctor); }, get(name) { return registry.get(name); } };
globalThis.window = { customCards: [] };
globalThis.CustomEvent = class { constructor(type, o = {}) { this.type = type; this.detail = o.detail; } };

const api = await import("../src/cards/ha-music-card/api.js");
const views = await import("../src/cards/ha-music-card/views.js");
await import("../src/cards/ha-music-card/ha-music-card.js");

// Card registration and config validation.
const Card = registry.get("ha-music-card");
assert.ok(Card, "ha-music-card is registered");
assert.ok(registry.get("ha-music-card-editor"), "editor is registered");
assert.ok(window.customCards.some((c) => c.type === "ha-music-card"));
assert.deepEqual(Card.getStubConfig(), { entities: [], fill_height: true });
assert.throws(() => new Card().setConfig({ entities: "media_player.kitchen" }), /liste/);

// Images: the private Music Assistant proxy moves onto ma_url with a size the proxy accepts.
const cfg = { ma_url: "https://music.example.com/" };
assert.equal(api.fixImageUrl("http://music-server:8095/imageproxy/abc?size=0", cfg, 256), "https://music.example.com/imageproxy/abc?size=256");
assert.equal(api.fixImageUrl("https://cdn.example.com/a.jpg", cfg), "https://cdn.example.com/a.jpg");
assert.equal(api.fixImageUrl("/api/media_player_proxy/media_player.kitchen?token=x", cfg), "/api/media_player_proxy/media_player.kitchen?token=x");
assert.equal(api.fixImageUrl("http://ma.internal:9000/imageproxy/x?size=0", { ...cfg, ma_internal_url: "http://ma.internal:9000" }, 512), "https://music.example.com/imageproxy/x?size=512");
assert.equal(api.imageUrl({ image: { path: "https://cdn.example.com/b.jpg", remotely_accessible: true } }, cfg), "https://cdn.example.com/b.jpg");
assert.equal(api.imageUrl({ metadata: { images: [{ type: "thumb", path: "/music/x/cover.jpg", provider: "filesystem", proxy_id: "p1" }] } }, cfg), "https://music.example.com/imageproxy/p1?size=256");
assert.equal(api.mediaTypeFromUri("library://album/12"), "album");

// Normalising: service responses, raw MA items and queue items end up with the same fields.
const n = api.normItem({ media_type: "track", uri: "library://track/1", name: "Example Song", duration: 201, favorite: null,
  artists: [{ name: "Example Artist", uri: "library://artist/3" }], album: { name: "Example Album", uri: "library://album/4" } }, cfg);
assert.equal(n.name, "Example Song");
assert.equal(n.favorite, false);
assert.equal(n.artists[0].uri, "library://artist/3");
assert.equal(n.album.uri, "library://album/4");
const qn = api.normItem({ queue_item_id: "q9", name: "Artist - Song", duration: 100, media_item: { media_type: "track", uri: "x://track/9", name: "Song", artists: [] } }, cfg);
assert.equal(qn.queue_item_id, "q9");
assert.equal(qn.name, "Song");

// A stubbed hass: records every websocket message and answers like Home Assistant does.
const calls = [];
const album = { media_type: "album", uri: "library://album/4", name: "Example Album", image: null, artists: [{ name: "Example Artist", uri: "library://artist/3" }] };
const hass = {
  services: { music_assistant: {}, mass_queue: {} },
  states: { "media_player.kitchen": { state: "playing", attributes: { active_queue: "queue-1" } } },
  async callWS(msg) {
    calls.push(msg);
    if (msg.type === "config_entries/get") return [{ entry_id: msg.domain === "mass_queue" ? "mq-entry" : "ma-entry", state: "loaded" }];
    const d = msg.service_data;
    const key = `${msg.domain}.${msg.service}`;
    if (key === "music_assistant.get_library") return { response: { items: d.offset ? [] : [album] } };
    if (key === "music_assistant.search") return { response: { artists: [{ media_type: "artist", uri: "library://artist/3", name: "Example Artist" }], tracks: [], albums: [album] } };
    if (key === "music_assistant.get_queue") return { response: { "media_player.kitchen": { queue_id: "queue-1", items: 3, current_index: 1, shuffle_enabled: false, repeat_mode: "off",
      current_item: { queue_item_id: "q2", name: "Song", duration: 180, media_item: { media_type: "track", uri: "x://track/2", name: "Song", artists: [] } }, next_item: null } } };
    // mass_queue.get_queue_items fails on items without a favourite flag; the card falls back to the raw command.
    if (key === "mass_queue.get_queue_items") throw new Error("expected bool at 'favorite'");
    if (key === "mass_queue.send_command") {
      if (d.command === "player_queues/items") return { response: { response: [{ queue_item_id: "q1", name: "A" }, { queue_item_id: "q2", name: "B" }] } };
      if (d.command === "music/albums/album_tracks") return { response: { response: [{ media_type: "track", uri: "library://track/1", name: "One", duration: 60, track_number: 1 }] } };
      return { response: { response: [] } };
    }
    return { context: {} };
  }
};
const music = new api.MusicApi(() => hass, () => cfg);
const lib = await music.library("album", { order_by: "name", limit: 50 });
assert.equal(lib.length, 1);
const libCall = calls.find((c) => c.service === "get_library");
assert.deepEqual({ ...libCall.service_data }, { config_entry_id: "ma-entry", media_type: "album", limit: 50, offset: 0, order_by: "name" });
assert.equal(libCall.return_response, true);
await music.library("album", { order_by: "name", limit: 50 });
assert.equal(calls.filter((c) => c.service === "get_library").length, 1, "library answers are cached");

const found = await music.search("example");
assert.equal(found.artists[0].name, "Example Artist");
assert.deepEqual(found.playlists, []);

const q = await music.queue("media_player.kitchen");
assert.equal(q.current.queue_item_id, "q2");
const qi = await music.queueItems("media_player.kitchen", q);
assert.deepEqual(qi.map((i) => i.queue_item_id), ["q1", "q2"]);
const fallback = calls.find((c) => c.service_data?.command === "player_queues/items");
assert.deepEqual(fallback.service_data.data, { queue_id: "queue-1", limit: 100, offset: 0 });
assert.equal(fallback.service_data.config_entry_id, "mq-entry");

const tracks = await music.tracks({ media_type: "album", uri: "library://album/4" });
assert.equal(tracks[0].name, "One");
assert.deepEqual(calls.find((c) => c.service_data?.command === "music/albums/album_tracks").service_data.data, { item_id: "4", provider_instance_id_or_domain: "library" });

await music.play("media_player.kitchen", album, "next");
const play = calls.at(-1);
assert.equal(play.service, "play_media");
assert.deepEqual(play.target, { entity_id: "media_player.kitchen" });
assert.deepEqual(play.service_data, { media_id: "library://album/4", enqueue: "next", media_type: "album" });
assert.equal(play.return_response, undefined);
await music.play("media_player.kitchen", [{ uri: "a://track/1" }, { uri: "a://track/2" }], "replace");
assert.deepEqual(calls.at(-1).service_data.media_id, ["a://track/1", "a://track/2"]);
await music.transfer("media_player.kitchen", "media_player.office");
assert.deepEqual(calls.at(-1).target, { entity_id: "media_player.office" });
assert.deepEqual(calls.at(-1).service_data, { source_player: "media_player.kitchen", auto_play: true });

// Views.
let seq = 0;
const reg = new Map();
const ctx = { reg: (item) => { const k = `k${(seq += 1)}`; reg.set(k, item); return k; }, isCurrent: (i) => i.uri === "library://track/1", playing: true, hasQueueApi: true };
const home = views.homeView(ctx, { recent: [n], playlists: [], albums: lib, radio: [] });
assert.match(home, /Senest hørt album/);
assert.match(home, /Example Album/);
assert.match(views.homeView(ctx, { loading: true }), /class="sk"/);
const detail = views.detailView(ctx, { item: lib[0], tracks, loading: false });
assert.match(detail, /1 nummer/);
assert.match(detail, /class="eq"/, "the playing track shows the equalizer");
assert.match(views.searchView(ctx, { query: "example", results: found }), /Bedste resultat/);
assert.match(views.searchView(ctx, { query: "zzz", results: { tracks: [], artists: [], albums: [], playlists: [], radio: [], podcasts: [], audiobooks: [] } }), /Ingen resultater/);
assert.match(views.searchView(ctx, { query: "", recent: ["old search"] }), /Seneste søgninger/);
const speakers = views.speakersPanel(ctx, { active: "media_player.kitchen", groupVolume: 0.4, canTransfer: true, players: [
  { entity_id: "media_player.kitchen", name: "Kitchen", icon: "speaker", available: true, volume: 0.4, canGroup: true, status: "Spiller", groupedWithActive: true },
  { entity_id: "media_player.office", name: "Office", icon: "speaker", available: true, volume: 0.2, canGroup: true, status: "Klar", groupedWithActive: true },
  { entity_id: "media_player.garden", name: "Garden", icon: "speaker", available: true, volume: 0.2, canGroup: false, status: "Klar" }
] });
assert.match(speakers, /Kitchen <span[^>]*>\+1/);
assert.match(speakers, /data-gvol/);
assert.match(speakers, /data-group="media_player.office"[^>]*aria-label="Fjern fra gruppen"/);
assert.match(speakers, /data-group="media_player.garden" disabled/);
assert.match(speakers, /data-transfer="media_player.garden"/);
assert.doesNotMatch(speakers, /data-transfer="media_player.office"/, "a grouped speaker already plays the music");
assert.equal(views.fmtTime(3725), "1:02:05");
assert.equal(views.esc('<a href="x">'), "&lt;a href=&quot;x&quot;&gt;");

console.log("music card tests passed");
