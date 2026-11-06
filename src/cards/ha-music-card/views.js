// HTML builders for ha-music-card. Pure functions: they get the data and a `ctx` with `reg(item)` (gives a key the
// card can resolve back to the item on a tap) and return markup. By Claude AI.
import { icon } from "./icons.js";
import { MEDIA_LABEL } from "./api.js";

export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export function fmtTotal(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min.`;
  return `${Math.floor(m / 60)} t. ${m % 60} min.`;
}

const TYPE_ICON = { track: "musicNote", album: "album", artist: "accountMusic", playlist: "playlistMusic", radio: "radio", podcast: "podcast",
  podcast_episode: "podcast", audiobook: "bookOpenPageVariant", folder: "musicBoxMultiple" };

export function art(item, cls = "art", large = false) {
  const src = large ? (item?.image_large || item?.image) : item?.image;
  const ph = `<div class="${cls} art-ph" style="--h:${hue(item?.name)}">${icon(TYPE_ICON[item?.media_type] || "musicNote")}</div>`;
  if (!src) return ph;
  return `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-ph="${esc(TYPE_ICON[item?.media_type] || "musicNote")}">`;
}

// A stable colour per name, so covers without art still look different from each other.
export function hue(name = "") {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

export const eq = (playing) => `<span class="eq${playing ? "" : " paused"}"><i></i><i></i><i></i></span>`;
export const artistNames = (item) => (item?.artists || []).map((a) => a.name).join(", ");

function subtitle(item) {
  switch (item.media_type) {
    case "album": return [item.year, artistNames(item)].filter(Boolean).join(" · ") || "Album";
    case "playlist": return item.owner ? `Playliste · ${item.owner}` : "Playliste";
    case "artist": return "Kunstner";
    case "radio": return "Radio";
    case "podcast": return artistNames(item) || item.owner || "Podcast";
    case "audiobook": return artistNames(item) || "Lydbog";
    case "track": return `Nummer · ${artistNames(item)}`;
    default: return MEDIA_LABEL[item.media_type] || "";
  }
}

export function tile(ctx, item) {
  const key = ctx.reg(item);
  const circle = item.media_type === "artist";
  return `<div class="tile${circle ? " circle" : ""}" role="button" tabindex="0" data-open="${key}">
    <div class="cover">${art(item, "art", true)}
      ${circle ? "" : `<button class="fab" data-play="${key}" aria-label="Afspil">${icon("play")}</button>`}
      <button class="more" data-menu="${key}" aria-label="Flere valg">${icon("dotsHorizontal")}</button>
    </div>
    <div class="t">${esc(item.name)}</div><div class="s">${esc(subtitle(item))}</div></div>`;
}

export function skeletonTiles(n = 6) {
  return Array.from({ length: n }, () => `<div class="sk-tile"><div class="sk"></div><div class="sk sk-line" style="width:80%"></div><div class="sk sk-line" style="width:55%"></div></div>`).join("");
}

export function skeletonRows(n = 8) {
  return `<div class="tracks">${Array.from({ length: n }, () => `<div class="tr nohead" style="pointer-events:none"><div class="main-c"><div class="sk" style="width:42px;height:42px"></div><div style="flex:1"><div class="sk sk-line" style="width:60%"></div><div class="sk sk-line" style="width:35%;margin-top:6px"></div></div></div></div>`).join("")}</div>`;
}

export function shelf(ctx, title, items, moreAction = "") {
  if (!items?.length) return "";
  return `<section class="shelf"><div class="shelf-h"><h2>${esc(title)}</h2>${moreAction ? `<button data-nav="${esc(moreAction)}">Vis alle</button>` : ""}</div>
    <div class="row">${items.map((i) => tile(ctx, i)).join("")}</div></section>`;
}

export function emptyState(ic, title, text = "", action = "") {
  return `<div class="empty">${icon(ic)}<b>${esc(title)}</b>${text ? `<span>${esc(text)}</span>` : ""}${action}</div>`;
}

function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 5) return "God nat";
  if (h < 10) return "Godmorgen";
  if (h < 12) return "God formiddag";
  if (h < 18) return "God eftermiddag";
  return "God aften";
}

const REC_NAMES = {
  "recently played": "Senest afspillet", "recently added tracks": "Nye numre i biblioteket", "recently added albums": "Nye album i biblioteket",
  "latest podcast episodes": "Nye podcastafsnit", "random artists": "Kunstnere du måske har glemt", "random albums": "Tilfældige album",
  "recently favorited tracks": "Nye favoritnumre", "favorite playlists": "Dine playlister", "favorite radio stations": "Dine radiokanaler",
  "recent artists": "Senest hørte kunstnere", "recent tracks": "Senest hørte numre", "forgotten tracks": "Glemte numre", "forgotten albums": "Glemte album",
  "forgotten artists": "Glemte kunstnere", "most played tracks": "Mest spillede numre", "never / rarely played": "Sjældent spillet", "artist events": "Kunstnere"
};
const REC_SKIP = new Set(["favorite playlists", "favorite radio stations", "recently played", "artist events"]);

export function homeView(ctx, data) {
  const quick = (data.recent || []).slice(0, 8);
  let html = `<div class="view home"><div class="home-bg"></div><div class="greet">${greeting()}</div>`;
  if (data.loading && !quick.length) {
    html += `<div class="quick">${Array.from({ length: 6 }, () => '<div class="sk" style="height:60px"></div>').join("")}</div><div class="grid">${skeletonTiles(6)}</div>`;
  } else if (data.error && !quick.length) {
    html += emptyState("alertCircleOutline", "Musikken kunne ikke hentes", data.error, `<button class="pill" data-retry>Prøv igen</button>`);
  } else {
    if (quick.length) {
      html += `<div class="quick">${quick.map((item) => {
        const key = ctx.reg(item);
        const on = ctx.isCurrent(item);
        return `<div class="qt" role="button" tabindex="0" data-open="${key}">${art(item)}<div class="t">${esc(item.name)}</div>${on ? eq(ctx.playing) : ""}</div>`;
      }).join("")}</div>`;
    }
    html += shelf(ctx, "Dine playlister", data.playlists, "library:playlist");
    html += shelf(ctx, "Senest hørt album", data.albums, "library:album");
    html += shelf(ctx, "Radio", data.radio, "library:radio");
    for (const folder of data.recs || []) {
      const n = String(folder.name || "").toLowerCase();
      if (REC_SKIP.has(n)) continue;
      html += shelf(ctx, REC_NAMES[n] || folder.name, folder.items);
    }
    html += shelf(ctx, "Podcasts", data.podcasts, "library:podcast");
    if (!quick.length && !data.playlists?.length && !data.albums?.length && !data.radio?.length) {
      html += emptyState("musicNote", "Biblioteket er tomt", "Tilføj musik i Music Assistant, så dukker det op her.");
    }
  }
  return `${html}</div>`;
}

export const LIB_TYPES = [
  ["playlist", "Playlister", "playlistMusic"], ["album", "Album", "album"], ["artist", "Kunstnere", "accountMusic"], ["track", "Numre", "musicNote"],
  ["radio", "Radio", "radio"], ["podcast", "Podcasts", "podcast"], ["audiobook", "Lydbøger", "bookOpenPageVariant"]
];
export const SORTS = [["name", "Navn (A–Å)"], ["timestamp_added_desc", "Senest tilføjet"], ["last_played_desc", "Senest afspillet"], ["play_count_desc", "Mest afspillet"]];

export function trackRow(ctx, item, index, opts = {}) {
  const key = ctx.reg(item);
  const on = ctx.isCurrent(item);
  const withArt = opts.art !== false;
  const num = opts.number === false ? "" : `<div class="n">${on ? eq(ctx.playing) : `<span>${esc(opts.label ?? index + 1)}</span>`}${icon("play")}</div>`;
  const sub = opts.sub ?? artistNames(item);
  return `<div class="tr${opts.number === false ? " nohead" : ""}${on ? " on" : ""}${opts.cls ? ` ${opts.cls}` : ""}" role="button" tabindex="0" data-track="${key}" data-idx="${index}" data-label="${esc(opts.label ?? index + 1)}" data-uri="${esc(item.uri)}">
    ${num}<div class="main-c">${withArt ? art(item) : ""}<div style="min-width:0"><div class="tt">${esc(item.name)}${item.version ? ` <span style="color:var(--mc-dim)">(${esc(item.version)})</span>` : ""}</div>${sub ? `<div class="ts">${opts.subHtml ? sub : esc(sub)}</div>` : ""}</div></div>
    <div class="al">${esc(opts.col3 ?? item.album?.name ?? "")}</div><div class="d">${item.duration ? fmtTime(item.duration) : ""}</div>
    <button class="dots" data-menu="${key}" aria-label="Flere valg">${icon("dotsHorizontal")}</button></div>`;
}

export function trackHead() {
  return `<div class="tr-head"><div class="r">#</div><div>Titel</div><div class="al">Album</div><div class="r">${icon("clockOutline", "").replace('class="ic "', 'class="ic" style="width:16px;height:16px;margin-left:auto"')}</div><div></div></div>`;
}

export function libraryItems(ctx, type, items, offset = 0) {
  if (type === "track") return items.map((item, i) => trackRow(ctx, item, offset + i)).join("");
  return items.map((item) => tile(ctx, item)).join("");
}

export function libraryView(ctx, st) {
  const label = LIB_TYPES.find((t) => t[0] === st.type)?.[1] || "Bibliotek";
  let body;
  if (st.loading && !st.items.length) body = st.type === "track" ? skeletonRows(10) : `<div class="grid">${skeletonTiles(12)}</div>`;
  else if (st.error && !st.items.length) body = emptyState("alertCircleOutline", "Kunne ikke hente biblioteket", st.error, `<button class="pill" data-retry>Prøv igen</button>`);
  else if (!st.items.length) body = emptyState(LIB_TYPES.find((t) => t[0] === st.type)?.[2] || "musicNote", st.filter ? "Ingen resultater" : `Ingen ${label.toLowerCase()} endnu`, st.filter ? `Intet matcher “${st.filter}”.` : (st.fav ? "Du har ingen favoritter her endnu." : ""));
  else if (st.type === "track") body = `${trackHead()}<div class="tracks" data-list>${libraryItems(ctx, st.type, st.items)}</div>`;
  else body = `<div class="grid" data-list>${libraryItems(ctx, st.type, st.items)}</div>`;
  return `<div class="view lib"><div class="lib-head"><h1>${esc(label)}</h1>
    <div class="chips">${LIB_TYPES.map(([t, l]) => `<button class="chip${t === st.type ? " on" : ""}" data-libtype="${t}">${l}</button>`).join("")}</div>
    <div class="lib-tools"><label class="filter">${icon("magnify")}<input data-filter placeholder="Filtrér ${esc(label.toLowerCase())}" value="${esc(st.filter || "")}" enterkeyhint="search"></label>
      <button class="chip${st.fav ? " on" : ""}" data-favfilter>${icon(st.fav ? "heart" : "heartOutline")}Favoritter</button>
      <select class="sort" data-sort aria-label="Sortér">${SORTS.map(([v, l]) => `<option value="${v}"${v === st.sort ? " selected" : ""}>${l}</option>`).join("")}</select></div></div>
    ${body}<div class="sentinel" data-sentinel>${st.loading && st.items.length ? '<div class="sk" style="height:6px;width:120px;margin:16px auto"></div>' : ""}</div></div>`;
}

const BROWSE = [["playlist", "Playlister", "#7c3aed", "playlistMusic"], ["album", "Album", "#0d9488", "album"], ["artist", "Kunstnere", "#e11d48", "accountMusic"],
  ["track", "Numre", "#2563eb", "musicNote"], ["radio", "Radio", "#ea580c", "radioTower"], ["podcast", "Podcasts", "#16a34a", "podcast"], ["audiobook", "Lydbøger", "#a16207", "bookOpenPageVariant"]];

export function searchView(ctx, st) {
  let html = `<div class="view search">`;
  if (!st.query) {
    if (st.recent?.length) {
      html += `<h2 class="sec-h">Seneste søgninger</h2><div class="recent">${st.recent.map((q, i) => `<span class="chip" role="button" tabindex="0" data-recent="${esc(q)}">${icon("history")}${esc(q)}<button class="x" data-unrecent="${i}" aria-label="Fjern">${icon("close")}</button></span>`).join("")}</div>`;
    }
    html += `<h2 class="sec-h">Gennemse alt</h2><div class="browse">${BROWSE.map(([t, l, c, ic]) => `<button class="bt" style="background:${c}" data-nav="library:${t}">${l}${icon(ic)}</button>`).join("")}</div>`;
    return `${html}</div>`;
  }
  const r = st.results;
  if (st.loading && !r) return `${html}<div class="grid">${skeletonTiles(6)}</div></div>`;
  if (st.error) return `${html}${emptyState("alertCircleOutline", "Søgningen mislykkedes", st.error)}</div>`;
  const total = r ? Object.values(r).reduce((n, l) => n + l.length, 0) : 0;
  if (!total) return `${html}${emptyState("magnify", `Ingen resultater for “${st.query}”`, "Prøv at stave anderledes eller søg efter noget andet.")}</div>`;
  const q = st.query.toLowerCase();
  const candidates = [...r.artists, ...r.albums, ...r.playlists, ...r.tracks, ...r.radio, ...r.podcasts];
  const best = candidates.find((i) => i.name.toLowerCase() === q) || r.artists[0] || r.tracks[0] || r.albums[0] || candidates[0];
  const bkey = ctx.reg(best);
  html += `<div class="best"><div><h2 class="sec-h">Bedste resultat</h2>
    <div class="best-tile${best.media_type === "artist" ? " circle" : ""}" role="button" tabindex="0" data-open="${bkey}">${art(best, "art", true)}
      <div><div class="t">${esc(best.name)}</div><div class="s">${artistNames(best) ? `${esc(artistNames(best))}` : ""}<span class="tag">${esc(MEDIA_LABEL[best.media_type] || "")}</span></div></div>
      <button class="fab big" data-play="${bkey}" aria-label="Afspil">${icon("play")}</button></div></div>`;
  html += r.tracks.length ? `<div><h2 class="sec-h">Numre</h2><div class="tracks cozy-list">${r.tracks.slice(0, 4).map((t, i) => trackRow(ctx, t, i, { number: false })).join("")}</div></div>` : "<div></div>";
  html += "</div>";
  html += shelf(ctx, "Kunstnere", r.artists);
  html += shelf(ctx, "Album", r.albums);
  html += shelf(ctx, "Playlister", r.playlists);
  html += shelf(ctx, "Radio", r.radio);
  html += shelf(ctx, "Podcasts", r.podcasts);
  html += shelf(ctx, "Lydbøger", r.audiobooks);
  return `${html}</div>`;
}

export function detailView(ctx, st) {
  const item = st.item;
  const key = ctx.reg(item);
  const tracks = st.tracks || [];
  const isArtist = item.media_type === "artist";
  const isPodcast = item.media_type === "podcast";
  const total = tracks.reduce((n, t) => n + (t.duration || 0), 0);
  const meta = [];
  if (item.artists?.length) meta.push(item.artists.map((a) => a.uri ? `<button class="link" data-goto="${esc(a.uri)}" data-name="${esc(a.name)}">${esc(a.name)}</button>` : `<b>${esc(a.name)}</b>`).join(", "));
  if (item.owner) meta.push(`<b>${esc(item.owner)}</b>`);
  if (item.year) meta.push(esc(item.year));
  if (tracks.length && !isArtist) meta.push(`${tracks.length} ${isPodcast ? "afsnit" : (tracks.length === 1 ? "nummer" : "numre")}${total && !isPodcast ? `, ${fmtTotal(total)}` : ""}`);
  let html = `<div class="view hero-view detail"><div class="hero${isArtist ? " circle" : ""}">${art(item, "art", true)}
    <div style="min-width:0"><div class="kind">${esc(MEDIA_LABEL[item.media_type] || "")}</div><h1 class="${item.name.length > 42 ? "long" : (item.name.length > 18 ? "mid" : "")}">${esc(item.name)}</h1>
    <div class="meta">${meta.join(' <span>•</span> ')}</div>${item.description ? `<div class="desc">${esc(item.description.replace(/<[^>]+>/g, ""))}</div>` : ""}</div></div>
    <div class="actions"><div class="actions-bg"></div><button class="fab big" data-play="${key}" aria-label="Afspil">${icon(ctx.isCurrent(item) && ctx.playing ? "pause" : "play")}</button>
    ${isPodcast ? "" : `<button class="act" data-shuffleplay="${key}" aria-label="Bland">${icon("shuffleVariant")}</button>`}
    <button class="act${item.favorite ? " on" : ""}" data-fav="${key}" aria-label="Favorit">${icon(item.favorite ? "heart" : "heartOutline")}</button>
    <button class="act" data-menu="${key}" aria-label="Flere valg">${icon("dotsHorizontal")}</button></div>`;
  if (st.loading && !tracks.length) html += skeletonRows(8);
  else if (st.error) html += emptyState("alertCircleOutline", "Kunne ikke hente indholdet", st.error);
  else if (isArtist) {
    if (tracks.length) html += `<h2 class="sec-h">Populære</h2><div class="tracks">${tracks.slice(0, st.showAll ? 50 : 5).map((t, i) => trackRow(ctx, t, i, { list: "detail" })).join("")}</div>
      ${tracks.length > 5 ? `<button class="pill" style="margin:10px 0 26px" data-showall>${st.showAll ? "Vis færre" : "Se flere"}</button>` : '<div style="height:20px"></div>'}`;
    html += shelf(ctx, "Album", st.albums);
    if (!tracks.length && !st.albums?.length) html += emptyState("accountMusic", "Intet fundet for denne kunstner", "Music Assistant har ingen numre eller album for kunstneren.");
  } else if (isPodcast) {
    html += tracks.length ? `<div class="tracks">${tracks.map((t, i) => trackRow(ctx, t, i, { cls: "ep", label: t.track_number || i + 1, col3: t.released ? new Date(t.released).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" }) : "", sub: t.description ? t.description.replace(/<[^>]+>/g, "").slice(0, 180) : (t.fully_played ? "Afspillet" : "") })).join("")}</div>`
      : emptyState("podcast", "Ingen afsnit");
  } else if (tracks.length) {
    const showAlbum = item.media_type !== "album";
    html += `<div class="${showAlbum ? "" : "noalbum"}">${trackHead()}<div class="tracks">${tracks.map((t, i) => trackRow(ctx, t, i, { art: showAlbum, label: item.media_type === "album" ? (t.track_number || i + 1) : i + 1, col3: showAlbum ? (t.album?.name || "") : "" })).join("")}</div></div>`;
  } else if (item.media_type !== "radio") html += emptyState("musicNote", "Ingen numre", "Der er ingen numre her endnu.");
  return `${html}</div>`;
}

export function queuePanel(ctx, st) {
  if (!st.entity) return emptyState("speaker", "Ingen afspiller valgt");
  if (st.loading && !st.items) return skeletonRows(6);
  if (!ctx.hasQueueApi) {
    return `${st.current ? `<div class="sub-h">Afspiller nu</div>${queueRow(ctx, st.current, true, false)}` : ""}${st.next ? `<div class="sub-h">Næste</div>${queueRow(ctx, st.next, false, false)}` : ""}
      <div class="empty" style="padding:30px 10px"><span>Installer mass_queue-integrationen for at se og redigere hele køen.</span></div>`;
  }
  const items = st.items || [];
  const ci = items.findIndex((i) => st.current && (i.queue_item_id === st.current.queue_item_id));
  if (!items.length && !st.current) return emptyState("playlistMusic", "Køen er tom", "Vælg noget musik for at komme i gang.");
  const cur = ci >= 0 ? items[ci] : st.current;
  const after = ci >= 0 ? items.slice(ci + 1) : items;
  let html = cur ? `<div class="sub-h">Afspiller nu</div>${queueRow(ctx, cur, true, false)}` : "";
  html += `<div class="sub-h"><span>Næste i køen</span>${after.length ? '<button data-qclear>Ryd resten</button>' : ""}</div>`;
  html += after.length ? after.map((i) => queueRow(ctx, i, false, true)).join("") : `<div class="empty" style="padding:24px 10px"><span>Intet i kø efter dette nummer.</span></div>`;
  return html;
}

function queueRow(ctx, item, current, editable) {
  const key = ctx.reg(item);
  return `<div class="qi${current ? " on" : ""}" role="button" tabindex="0" data-qplay="${esc(item.queue_item_id || "")}">${art(item)}
    <div class="tx"><div class="tt">${esc(item.name)}</div><div class="ts">${esc(artistNames(item) || MEDIA_LABEL[item.media_type] || "")}</div></div>
    ${current ? eq(ctx.playing) : ""}
    ${editable ? `<div class="qa"><button class="mini-btn" data-qact="move_queue_item_next" data-qid="${esc(item.queue_item_id)}" title="Spil som næste" aria-label="Spil som næste">${icon("skipNextCircleOutline")}</button>
      <button class="mini-btn" data-qact="move_queue_item_up" data-qid="${esc(item.queue_item_id)}" title="Flyt op" aria-label="Flyt op">${icon("arrowUp")}</button>
      <button class="mini-btn" data-qact="move_queue_item_down" data-qid="${esc(item.queue_item_id)}" title="Flyt ned" aria-label="Flyt ned">${icon("arrowDown")}</button>
      <button class="mini-btn" data-qact="remove_queue_item" data-qid="${esc(item.queue_item_id)}" title="Fjern" aria-label="Fjern fra kø">${icon("close")}</button></div>` : `<button class="mini-btn" data-menu="${key}" aria-label="Flere valg">${icon("dotsHorizontal")}</button>`}</div>`;
}

export function speakersPanel(ctx, sp) {
  const active = sp.players.find((p) => p.entity_id === sp.active);
  let html = "";
  if (active) {
    const members = sp.players.filter((p) => p.groupedWithActive && p.entity_id !== active.entity_id);
    html += `<div class="sp-cur"><div class="lbl">Styrer nu</div><div class="nm">${icon(active.icon)}${esc(active.name)}${members.length ? ` <span style="color:var(--mc-dim);font-weight:700">+${members.length}</span>` : ""}</div>
      <div class="sub">${esc(active.status)}</div>
      ${members.length ? `<div class="sp-vol" style="padding:10px 0 0">${icon("speakerMultiple")}<input class="rng" type="range" min="0" max="100" step="1" value="${Math.round(sp.groupVolume * 100)}" data-gvol aria-label="Gruppevolumen" style="--p:${Math.round(sp.groupVolume * 100)}%"><span style="font-size:12px;color:var(--mc-dim);min-width:30px">Alle</span></div>` : ""}</div>`;
  }
  html += `<div class="sub-h"><span>Højttalere</span></div><div class="sp-hint">Tryk på en højttaler for at styre den · ${icon("plus")} spiller med på ${esc(active?.name || "den valgte")}</div>`;
  for (const p of sp.players) {
    const isActive = p.entity_id === sp.active;
    const canGroup = !isActive && p.canGroup && active?.canGroup && !p.isGroup && !active?.isGroup;
    html += `<div class="sp${isActive ? " active" : ""}${p.groupedWithActive && !isActive ? " grouped" : ""}" data-sp="${esc(p.entity_id)}">
      <div class="sp-row"><button class="sp-main" data-select="${esc(p.entity_id)}"><span class="sp-ic">${icon(p.icon)}${p.playing ? eq(true) : ""}</span>
        <span class="sp-tx"><div class="sp-nm">${esc(p.name)}${p.isGroup ? '<span class="sp-badge">Gruppe</span>' : ""}</div><div class="sp-st">${esc(p.status)}</div></span></button>
        ${isActive ? "" : `<button class="grp${p.groupedWithActive ? " on" : ""}" data-group="${esc(p.entity_id)}" ${canGroup ? "" : "disabled"} aria-label="${p.groupedWithActive ? "Fjern fra gruppen" : "Spil sammen med den valgte"}" title="${canGroup ? (p.groupedWithActive ? "Fjern fra gruppen" : `Spil sammen med ${esc(active?.name || "")}`) : "Kan ikke grupperes"}">${icon(p.groupedWithActive ? "check" : "plus")}</button>`}</div>
      ${p.available ? `<div class="sp-vol"><button class="mini-btn" data-mute="${esc(p.entity_id)}" aria-label="Lydløs">${icon(p.muted ? "volumeOff" : (p.volume < 0.35 ? "volumeLow" : "volumeHigh"))}</button>
        <input class="rng" type="range" min="0" max="100" step="1" value="${Math.round(p.volume * 100)}" data-vol="${esc(p.entity_id)}" aria-label="Volumen ${esc(p.name)}" style="--p:${Math.round(p.volume * 100)}%"></div>` : ""}
      ${!isActive && sp.canTransfer && p.available && !p.groupedWithActive ? `<button class="pill sp-move" data-transfer="${esc(p.entity_id)}">${icon("swapHorizontal")}Flyt musikken hertil</button>` : ""}</div>`;
  }
  return html;
}

// Now-playing pieces. `np` is the card's now-playing model; values that tick (position, volume) are set in place.
export function barHtml(np) {
  const key = np.key;
  return `<div class="np-left">${np.title ? art(np.item || { image: np.image, media_type: "track" }) : `<div class="art art-ph">${icon("musicNote")}</div>`}
      <div class="np-tx">${np.title ? `<button class="np-t" data-npopen="album">${esc(np.title)}</button><button class="np-a" data-npopen="artist">${esc(np.artist || np.playerName)}</button>`
        : `<span class="np-t">Intet spiller</span><span class="np-a">${esc(np.playerName || "Vælg en højttaler")}</span>`}</div>
      ${np.title && np.canFav ? `<button class="heart${np.favorite ? " on" : ""}" data-npfav aria-label="Favorit">${icon(np.favorite ? "heart" : "heartOutline")}</button>` : ""}</div>
    <div class="np-mid"><div class="ctrls">
      <button class="cb${np.shuffle ? " on" : ""}" data-cmd="shuffle" aria-label="Bland" ${np.live || !np.entity ? "disabled" : ""}>${icon("shuffleVariant")}</button>
      <button class="cb" data-cmd="prev" aria-label="Forrige" ${np.live || !np.entity ? "disabled" : ""}>${icon("skipPrevious")}</button>
      <button class="pp" data-cmd="playpause" aria-label="${np.playing ? "Pause" : "Afspil"}">${icon(np.playing ? "pause" : "play")}</button>
      <button class="cb" data-cmd="next" aria-label="Næste" ${np.live || !np.entity ? "disabled" : ""}>${icon("skipNext")}</button>
      <button class="cb${np.repeat !== "off" ? " on" : ""}" data-cmd="repeat" aria-label="Gentag" ${np.live || !np.entity ? "disabled" : ""}>${icon(np.repeat === "one" ? "repeatOnce" : "repeat")}</button></div>
      <div class="seek"><span class="tm" data-pos>${np.live ? "" : fmtTime(np.position)}</span>${np.live ? '<span class="live">LIVE</span>' : `<input class="rng" type="range" min="0" max="${Math.max(1, Math.round(np.duration))}" step="1" value="${Math.round(np.position)}" data-seek aria-label="Spoleposition" ${np.duration ? "" : "disabled"}>`}<span class="tm" data-dur>${np.live ? "" : fmtTime(np.duration)}</span></div></div>
    <div class="np-right"><button class="cb${np.panel === "queue" ? " on act-p" : ""}" data-panel="queue" aria-label="Kø" title="Kø">${icon("playlistPlay")}</button>
      <button class="spk-btn" data-panel="speakers" title="Højttalere">${icon(np.groupCount ? "speakerMultiple" : "speaker")}<span>${esc(np.speakerLabel)}</span></button>
      <div class="vol"><button class="cb" data-cmd="mute" aria-label="Lydløs">${icon(np.muted ? "volumeOff" : (np.volume < 0.35 ? "volumeLow" : "volumeHigh"))}</button>
      <input class="rng" type="range" min="0" max="100" step="1" value="${Math.round(np.volume * 100)}" data-npvol aria-label="Volumen"></div></div>`;
}

export function miniHtml(np) {
  return `<div class="mini-in"><button class="mini-open" data-sheet="player">${np.title ? art(np.item || { image: np.image, media_type: "track" }) : `<div class="art art-ph">${icon("musicNote")}</div>`}
    <span class="np-tx"><span class="np-t">${esc(np.title || "Intet spiller")}</span><span class="np-a">${np.groupCount || np.playing ? icon(np.groupCount ? "speakerMultiple" : "speaker") + " " : ""}${esc(np.title ? (np.artist ? `${np.artist} · ${np.speakerLabel}` : np.speakerLabel) : np.speakerLabel)}</span></span></button>
    ${np.title && np.canFav ? `<button class="heart${np.favorite ? " on" : ""}" data-npfav aria-label="Favorit">${icon(np.favorite ? "heart" : "heartOutline")}</button>` : ""}
    <button class="cb" data-cmd="playpause" aria-label="${np.playing ? "Pause" : "Afspil"}">${icon(np.playing ? "pause" : "play")}</button></div>
    <div class="mini-prog"><i data-miniprog style="width:${np.duration ? Math.min(100, (np.position / np.duration) * 100) : 0}%"></i></div>`;
}

export function fullPlayerHtml(np) {
  return `<div class="fp">${np.title ? art(np.item || { image: np.image, image_large: np.imageLarge, media_type: "track" }, `fp-art art ${np.playing ? "playing" : "paused"}`, true) : `<div class="fp-art art art-ph">${icon("musicNote")}</div>`}
    <div><div class="fp-row"><div class="fp-tx"><button class="fp-t" data-npopen="album">${esc(np.title || "Intet spiller")}</button><button class="fp-a" data-npopen="artist">${esc(np.artist || np.playerName || "")}</button></div>
      ${np.title && np.canFav ? `<button class="heart${np.favorite ? " on" : ""}" data-npfav aria-label="Favorit">${icon(np.favorite ? "heart" : "heartOutline")}</button>` : ""}</div></div>
    <div class="fp-seek">${np.live ? '<div style="display:flex;justify-content:center;padding:8px 0"><span class="live">LIVE</span></div>' : `<input class="rng" type="range" min="0" max="${Math.max(1, Math.round(np.duration))}" step="1" value="${Math.round(np.position)}" data-seek aria-label="Spoleposition" ${np.duration ? "" : "disabled"}>
      <div class="fp-times"><span data-pos>${fmtTime(np.position)}</span><span data-dur>-${fmtTime(Math.max(0, np.duration - np.position))}</span></div>`}</div>
    <div class="fp-ctrls"><button class="cb sidebtn${np.shuffle ? " on" : ""}" data-cmd="shuffle" aria-label="Bland" ${np.live ? "disabled" : ""}>${icon("shuffleVariant")}</button>
      <button class="cb" data-cmd="prev" aria-label="Forrige" ${np.live ? "disabled" : ""}>${icon("skipPrevious")}</button>
      <button class="pp" data-cmd="playpause" aria-label="${np.playing ? "Pause" : "Afspil"}">${icon(np.playing ? "pause" : "play")}</button>
      <button class="cb" data-cmd="next" aria-label="Næste" ${np.live ? "disabled" : ""}>${icon("skipNext")}</button>
      <button class="cb sidebtn${np.repeat !== "off" ? " on" : ""}" data-cmd="repeat" aria-label="Gentag" ${np.live ? "disabled" : ""}>${icon(np.repeat === "one" ? "repeatOnce" : "repeat")}</button></div>
    <div class="fp-vol"><button class="cb" data-cmd="mute" aria-label="Lydløs" style="color:inherit">${icon(np.muted ? "volumeOff" : "volumeLow")}</button><input class="rng" type="range" min="0" max="100" step="1" value="${Math.round(np.volume * 100)}" data-npvol aria-label="Volumen">${icon("volumeHigh")}</div>
    <div class="fp-foot"><button class="spk-btn" data-sheet="speakers">${icon(np.groupCount ? "speakerMultiple" : "speaker")}<span>${esc(np.speakerLabel)}</span></button>
      <button class="round" style="background:rgba(255,255,255,.12)" data-sheet="queue" aria-label="Kø">${icon("playlistPlay")}</button></div></div>`;
}

export function menuHtml(item, actions) {
  return `<div class="menu-head">${art(item)}<div style="min-width:0"><div class="t">${esc(item.name)}</div><div class="s">${esc([MEDIA_LABEL[item.media_type], artistNames(item)].filter(Boolean).join(" · "))}</div></div></div>
    ${actions.map((a) => `<button class="mi${a.sep ? " sep" : ""}" data-mact="${a.id}">${icon(a.icon)}${esc(a.label)}</button>`).join("")}`;
}
