// Builds a "forest mix" from the listener's recent Spotify listening, matched to the mood
// they picked in the quiz.
//
// 1. THEIR SONGS  Recently played, top songs (4 weeks, 6 months) and recent Liked Songs,
//                 most recent counting most.
// 2. MOOD         The quiz answers' genres (the mood question counts double), extra tags for
//                 the mood answer, and the tags of the artists in the hand-picked playlist
//                 for that mood (src/lib/backupPlaylists.js).
// 3. MATCH        Each of their main artists gets Last.fm tags (via the login server) and a
//                 fit score against the mood. Only artists that fit count.
// 4. PICK         Mostly their own recent songs that fit; the "where do you go?" answer adds
//                 a few new songs from the mood playlist (up to 40%).
// 5. FLOW         Max 2 songs per artist, never the same artist back-to-back,
//                 opens with one of their own songs.
//
// Spotify calls go straight from the browser with the user's token (about 6 requests, no
// search). Only artist names go to Last.fm, through our server.

import { BACKUP_PLAYLISTS } from "./backupPlaylists";

const API = "https://api.spotify.com/v1";
const MIX_SIZE = 30;
const DEFAULT_DISCOVER = 0.25; // used if the quiz was skipped
const MAX_NEW_SHARE = 0.4;     // at most this share of the mix comes from the mood playlist
const ARTISTS_TO_TAG = 40;     // their most-played recent artists that get Last.fm tags

// If Spotify ever says "too many requests", remember it for that login and back off.
const BLOCK_KEY = "forestSearchBlockedUntil";
const makeStore = (area) => ({
  get(key, fallback) {
    try { return JSON.parse(globalThis[area]?.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { globalThis[area]?.setItem(key, JSON.stringify(value)); } catch { /* private mode etc. */ }
  },
});
const store = makeStore("localStorage");
// The block is Spotify's, per app: remember it with the login it hit, so switching
// to another Spotify app (new keys → new login) starts searching again.
const loginTag = (token) => String(token).slice(-12);
const searchBlocked = (token) => {
  const b = store.get(BLOCK_KEY, null);
  return !!b && b.login === loginTag(token) && Date.now() < b.until;
};

// Genre keywords for each theme — only used when the quiz was skipped.
// With answers, the genres come from the answers alone; the theme just sets the look.
export const THEME_GENRES = {
  lightForest: ["folk", "indie pop"],
  darkForest: ["electronic", "alternative"],
};

export const MIX_NAMES = {
  lightForest: "Sunlit Canopy",
  darkForest: "Moonlit Glade",
};

// Counts Spotify "too many requests" (429) answers, and searches skipped because of an
// earlier one, during the current mix build. The player switches to a backup playlist
// when this is above 0 (see rateLimited in buildForestMix's result).
let rateLimitHits = 0;

async function spotify(token, path, options = {}, retried = false) {
  if (path.startsWith("/search") && searchBlocked(token)) {
    rateLimitHits++;
    const err = new Error("Spotify search is paused (rate limit)");
    err.status = 429;
    throw err;
  }
  const res = await fetch(path.startsWith("http") ? path : API + path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (res.status === 429) {
    rateLimitHits++;
    const wait = Number(res.headers.get("Retry-After")) || 0;
    if (path.startsWith("/search")) {
      // don't hammer a blocked endpoint: pause all searches (at least 10 min, or as long as Spotify says)
      store.set(BLOCK_KEY, { login: loginTag(token), until: Date.now() + Math.max(wait, 600) * 1000 });
    } else if (!retried && wait <= 5) {
      await new Promise((r) => setTimeout(r, Math.max(wait, 1) * 1000));
      return spotify(token, path, options, true);
    }
  }
  if (!res.ok) {
    const err = new Error(`Spotify ${options.method || "GET"} ${path} → ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

// Run a Spotify call; on failure note it in the log and carry on.
async function attempt(log, label, fn) {
  try {
    return await fn();
  } catch (e) {
    log.push(`${label} unavailable (${e.status ?? e.message})`);
    return null;
  }
}

// ---------- 1. quiz → genre keywords ----------

// answers: the quiz options picked (each may have `genres` and a `weight`)
export function genreWeights(theme, answers = []) {
  const weights = new Map();
  const add = (g, w) => weights.set(g, (weights.get(g) || 0) + w);
  const tagged = answers.filter((a) => a?.genres?.length);
  if (tagged.length) {
    tagged.forEach((a) => a.genres.forEach((g) => add(g, 2 * (a.weight || 1))));
  } else {
    (THEME_GENRES[theme] || []).forEach((g) => add(g, 1)); // quiz skipped
  }
  return weights;
}

// 0 = only songs they know, 1 = all new finds
export function discoveryLevel(answers = []) {
  const pick = answers.find((a) => typeof a?.discover === "number");
  return pick ? pick.discover : DEFAULT_DISCOVER;
}

const primaryArtist = (t) => t.artists?.[0]?.id || t.id;

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Last.fm tags (genre + mood labels for each artist) ----------
// Spotify hides genres and moods from new apps, so artist tags come from Last.fm through
// our login server (/lastfm/tags, which holds the LASTFM_API_KEY from .env). No Spotify
// search is used at all. Tags are remembered in this browser for TAG_CACHE_DAYS.
const TAG_CACHE_KEY = "forestTagCache";
const TAG_CACHE_DAYS = 2;

// "Hip-Hop", "hip hop" → "hiphop"; "R&B" → "rnb"; "lo-fi" → "lofi"
export const normTag = (t) => String(t).toLowerCase().replace(/&/g, "n").replace(/[^a-z0-9]/g, "");

// Tags that say nothing about how music sounds
const IGNORE_TAGS = new Set([
  "seenlive", "favorites", "favourites", "favorite", "favourite", "femalevocalists", "femalevocalist",
  "malevocalists", "malevocalist", "american", "british", "canadian", "english", "usa", "uk",
  "australian", "swedish", "korean", "french", "german", "african", "nigerian", "jamaican",
  "all", "awesome", "beautiful", "love", "sexy", "cool", "amazing", "spotify", "music",
]);
const usefulTag = (t) => t && !IGNORE_TAGS.has(t) && !/\d/.test(t);

async function lastfmTags(names, log) {
  const cache = store.get(TAG_CACHE_KEY, {});
  const fresh = (e) => !!e && Date.now() - e.t < TAG_CACHE_DAYS * 864e5;
  const key = (n) => n.toLowerCase();
  const missing = [...new Set(names)].filter((n) => !fresh(cache[key(n)]));
  let failed = false;
  for (let i = 0; i < missing.length; i += 40) {
    const batch = missing.slice(i, i + 40);
    try {
      const res = await fetch("/lastfm/tags?" + batch.map((n) => "artist=" + encodeURIComponent(n)).join("&"));
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || res.status);
      for (const n of batch) cache[key(n)] = { tags: body[n] || [], t: Date.now() };
    } catch (e) {
      failed = true;
      log.push(`Last.fm tags unavailable (${e.message})`);
      break;
    }
  }
  for (const k of Object.keys(cache)) if (!fresh(cache[k])) delete cache[k];
  store.set(TAG_CACHE_KEY, cache);
  const out = new Map(); // name → [{ tag (normalised), w 0..1 }]
  for (const n of names) {
    const tags = (cache[key(n)]?.tags || [])
      .map((t) => ({ tag: normTag(t.name), w: Math.min(Number(t.count) || 0, 100) / 100 }))
      .filter((t) => usefulTag(t.tag) && t.w > 0)
      .slice(0, 10);
    out.set(n, tags);
  }
  return { tags: out, failed: failed && missing.length > 0 };
}

// ---------- the mood the quiz asked for ----------

// Extra tags for each answer to the mood question (Q4), on top of the answers' own genres.
const MOOD_TAGS = {
  acoustic: ["acoustic", "folk", "indie folk", "singer-songwriter", "folk pop", "soft rock", "indie"],
  beats: ["hip-hop", "hip hop", "rap", "trap", "rnb", "electronic", "house", "dance"],
  dreamy: ["lo-fi", "chillhop", "ambient", "chill", "chillout", "dream pop", "chillwave", "bedroom pop", "neo-soul", "rnb", "downtempo"],
};

// tag → weight, from: every answer's genres (Q4 counts double), the mood question's extra
// tags, and the tags of the artists in the hand-picked playlist for that mood (so "Dreamy"
// means what the team's Dreamy playlist sounds like).
function moodProfile(theme, answers, curatedArtistTags) {
  const p = new Map();
  const add = (tag, w) => { const t = normTag(tag); if (usefulTag(t)) p.set(t, (p.get(t) || 0) + w); };
  for (const [g, w] of genreWeights(theme, answers)) add(g, w);
  const sound = answers.find((a) => a?.sound)?.sound;
  (MOOD_TAGS[sound] || MOOD_TAGS.dreamy).forEach((t) => add(t, 3));
  // learned from the curated playlist: its artists' most common tags
  const learned = new Map();
  for (const tags of curatedArtistTags) tags.forEach(({ tag, w }) => learned.set(tag, (learned.get(tag) || 0) + w));
  [...learned.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
    .forEach(([tag, w], i) => add(tag, 1.5 * (1 - i / 12) * Math.min(1, w / 3))); // a hint, the quiz leads
  const max = Math.max(1, ...p.values());
  for (const [t, w] of p) p.set(t, w / max);
  return p;
}

// How well an artist fits the mood: the share of its tag weight that matches, 0..1
function artistFit(tags, profile) {
  let total = 0;
  let hit = 0;
  for (const { tag, w } of tags) {
    total += w;
    hit += w * (profile.get(tag) || 0);
  }
  return total ? hit / total : 0;
}

// ---------- main ----------

const MIN_FIT = 0.2; // below this an artist doesn't really fit the mood

export async function buildForestMix(token, theme, answers = []) {
  rateLimitHits = 0;
  const discover = Math.min(discoveryLevel(answers), MAX_NEW_SHARE);
  const log = []; // human-readable notes, printed to the console for debugging

  // ---------- 1. what they've been listening to, most recent first ----------
  const known = new Map(); // track id → { track, recency }
  const addKnown = (track, score) => {
    if (!track?.id || !track.uri || track.is_local) return;
    const e = known.get(track.id) || { track, recency: 0 };
    e.recency = Math.max(e.recency, score) + 0.1; // a song that shows up in several lists counts a bit more
    known.set(track.id, e);
  };
  const recent = await attempt(log, "recently played", () =>
    spotify(token, "/me/player/recently-played?limit=50"));
  recent?.items.forEach((item, i) => addKnown(item.track, 3 - i / 50));
  const shortTop = await attempt(log, "top 4 weeks", () =>
    spotify(token, "/me/top/tracks?limit=50&time_range=short_term"));
  shortTop?.items.forEach((t, i) => addKnown(t, 2.5 - i / 50));
  const midTop = await attempt(log, "top 6 months", () =>
    spotify(token, "/me/top/tracks?limit=50&time_range=medium_term"));
  midTop?.items.forEach((t, i) => addKnown(t, 1.5 - i / 50));
  for (let offset = 0; offset < 100; offset += 50) {
    const page = await attempt(log, "liked songs", () =>
      spotify(token, `/me/tracks?limit=50&offset=${offset}`));
    page?.items.forEach((item, i) => addKnown(item.track, 1 - (offset + i) / 200));
    if (!page?.next) break;
  }
  log.push(`your songs: ${known.size} (recent ${recent?.items.length ?? 0})`);

  // ---------- 2. the hand-picked playlist for this mood (new songs + what the mood sounds like) ----------
  const sound = answers.find((a) => a?.sound)?.sound || "dreamy";
  const curatedLink = (BACKUP_PLAYLISTS[sound] || BACKUP_PLAYLISTS.dreamy)?.link;
  const curatedId = String(curatedLink || "").match(/playlist[/:]([A-Za-z0-9]{22})/)?.[1];
  let curated = [];
  if (curatedId) {
    const page = await attempt(log, "mood playlist", () =>
      spotify(token, `/playlists/${curatedId}/items?limit=50`).catch(() =>
        spotify(token, `/playlists/${curatedId}/tracks?limit=50`)));
    curated = (page?.items || []).map((it) => it.track || it.item)
      .filter((t) => t?.uri?.startsWith("spotify:track:"));
  }

  // ---------- 3. which of their artists fit the mood (Last.fm tags) ----------
  const artistScore = new Map(); // artist name → summed recency (who they listen to most lately)
  for (const { track, recency } of known.values()) {
    const name = track.artists?.[0]?.name;
    if (name) artistScore.set(name, (artistScore.get(name) || 0) + recency);
  }
  const theirArtists = [...artistScore.entries()].sort((a, b) => b[1] - a[1]).slice(0, ARTISTS_TO_TAG).map(([n]) => n);
  const curatedArtists = [...new Set(curated.map((t) => t.artists?.[0]?.name).filter(Boolean))];
  const { tags, failed } = await lastfmTags([...theirArtists, ...curatedArtists], log);
  const profile = moodProfile(theme, answers, curatedArtists.map((n) => tags.get(n) || []));
  const fit = new Map(theirArtists.map((n) => [n, artistFit(tags.get(n) || [], profile)]));
  const fitting = theirArtists.filter((n) => fit.get(n) >= MIN_FIT);
  log.push(`artists that fit the mood: ${fitting.length} of ${theirArtists.length}` + (failed ? " (no Last.fm tags)" : ""));

  // ---------- 4. pick: mostly their own recent songs that fit, plus some from the mood playlist ----------
  const fitOf = (t) => fit.get(t.artists?.[0]?.name) || 0;
  const theirs = [...known.values()]
    .filter(({ track }) => fitOf(track) >= MIN_FIT)
    .sort((a, b) => (b.recency * (0.5 + fitOf(b.track))) - (a.recency * (0.5 + fitOf(a.track))))
    .map((e) => e.track);
  const newOnes = shuffle(curated.filter((t) => !known.has(t.id)));

  const used = new Set();
  const perArtist = new Map();
  const take = (list, n, cap = 2) => {
    const out = [];
    for (const t of list) {
      if (out.length >= n) break;
      const a = primaryArtist(t);
      if (used.has(t.id) || (perArtist.get(a) || 0) >= cap) continue;
      used.add(t.id);
      perArtist.set(a, (perArtist.get(a) || 0) + 1);
      out.push(t);
    }
    return out;
  };
  const wantNew = Math.round(MIX_SIZE * discover);
  const fam = take(theirs, MIX_SIZE - wantNew);
  const disc = take(newOnes, MIX_SIZE - fam.length);
  // still short of 30: allow a few more songs per artist, theirs first
  for (const cap of [3, 4]) {
    fam.push(...take(theirs, MIX_SIZE - fam.length - disc.length, cap));
    disc.push(...take(newOnes, MIX_SIZE - fam.length - disc.length, cap));
  }
  log.push(`mix: ${fam.length} of your songs + ${disc.length} from the mood playlist`);

  // ---------- 5. flow: open with one of theirs, spread the new ones out, no artist twice in a row ----------
  const ordered = [];
  const famQ = [...fam];
  const discQ = [...disc];
  const total = fam.length + disc.length;
  const ratio = total ? disc.length / total : 0;
  let placed = 0;
  if (famQ.length) ordered.push(famQ.shift());
  while (famQ.length || discQ.length) {
    const due = placed + 1 <= Math.round((ordered.length + 1) * ratio);
    if (discQ.length && (due || !famQ.length)) { ordered.push(discQ.shift()); placed++; }
    else ordered.push(famQ.shift());
  }
  for (let i = 1; i < ordered.length; i++) {
    if (primaryArtist(ordered[i]) !== primaryArtist(ordered[i - 1])) continue;
    const j = ordered.findIndex((t, k) => k > i && primaryArtist(t) !== primaryArtist(ordered[i - 1]));
    if (j > 0) [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  }

  console.info("[forest mix]", log.join(" · "), "| mood tags:",
    Object.fromEntries([...profile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t, w]) => [t, +w.toFixed(2)])),
    "| artist fit:", Object.fromEntries(theirArtists.slice(0, 15).map((n) => [n, +fit.get(n).toFixed(2)])));

  return {
    name: MIX_NAMES[theme] || "Forest Mix",
    uris: ordered.map((t) => t.uri),
    tracks: ordered,
    familiarCount: fam.length,
    discoverCount: disc.length,
    themedCount: ordered.length, // every song either fits the mood or comes from the mood playlist
    noTags: failed,
    rateLimited: rateLimitHits > 0, // Spotify said "too many requests" during this build
    log,
  };
}

// Optional: save the mix to the user's Spotify library as a private playlist.
export async function saveMixAsPlaylist(token, mix) {
  const body = JSON.stringify({
    name: `${mix.name} · Enchanted Grove`,
    description: mix.description || "Made by the Enchanted Grove forest DJ from your favourite songs and quiz answers.",
    public: false,
  });

  let playlist;
  try {
    playlist = await spotify(token, "/me/playlists", { method: "POST", body });
  } catch {
    // older form of the endpoint
    const me = await spotify(token, "/me");
    playlist = await spotify(token, `/users/${me.id}/playlists`, { method: "POST", body });
  }

  const items = JSON.stringify({ uris: mix.uris.slice(0, 100) });
  try {
    await spotify(token, `/playlists/${playlist.id}/items`, { method: "POST", body: items });
  } catch {
    await spotify(token, `/playlists/${playlist.id}/tracks`, { method: "POST", body: items });
  }

  return playlist;
}

// The songs in a playlist (up to 100), e.g. a backup playlist, so it can be copied.
// No search involved: 1 request.
export async function playlistTrackUris(token, playlistId) {
  let page;
  try {
    page = await spotify(token, `/playlists/${playlistId}/items?limit=100`);
  } catch {
    page = await spotify(token, `/playlists/${playlistId}/tracks?limit=100`); // older form
  }
  return (page?.items || [])
    .map((it) => (it.track || it.item)?.uri)
    .filter((uri) => uri && uri.startsWith("spotify:track:")); // skip local files and podcasts
}

// "+ Save mix" while a backup playlist is playing: copy it into the listener's own
// Spotify as a private playlist (~3 requests, no search).
export async function saveBackupAsPlaylist(token, backup) {
  const id = backup.uri.split(":").pop();
  const uris = await playlistTrackUris(token, id);
  if (!uris.length) throw new Error("the backup playlist has no songs Spotify can copy");
  return saveMixAsPlaylist(token, {
    name: backup.name,
    uris,
    description: "Your Enchanted Grove forest mix, picked from your quiz answers.",
  });
}
