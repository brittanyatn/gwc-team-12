// Builds a "forest mix" from the listener's recent Spotify listening, matched to the mood
// they picked in the quiz. Only their own artists are used, so nothing is out of character.
//
// 1. THEIR SONGS  Recently played, top songs (4 weeks, 6 months) and recent Liked Songs,
//                 most recent counting most.
// 2. MATCH        Their 12 most-played recent artists are checked against the mood answer's
//                 genres (MOOD_SEARCH_GENRES) with Spotify search ("is <artist> <genre>?"). Spotify hides
//                 genres from new apps, but search still filters by them.
// 3. PICK         Mostly their own recent songs by artists that fit. The "where do you go?"
//                 answer adds a few deeper tracks by those same artists (up to 40%).
// 4. FLOW         Max 2 songs per artist, never the same artist back-to-back,
//                 opens with one of their own songs.
//
// If too few songs fit, or Spotify says "too many requests", the player plays the
// hand-picked playlist for the mood instead (src/lib/backupPlaylists.js).

const API = "https://api.spotify.com/v1";
const MIX_SIZE = 30;
const DEFAULT_DISCOVER = 0.2; // used if the quiz was skipped
const MAX_NEW_SHARE = 0.4;     // at most this share of the mix is songs new to them

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

// ---------- which of their artists fit the mood (Spotify search) ----------
// Spotify hides genres from new apps, but its search still filters by genre, so we ask it
// "is <artist> <genre>?" for their main recent artists and the mood answer's genres.
// About 20 searches the first time; answers are remembered in this browser for
// CHECK_CACHE_DAYS, so a repeat mix with the same mood needs none.
const CHECK_CACHE_KEY = "forestGenreCache";
const CHECK_CACHE_DAYS = 2;
const ARTISTS_TO_CHECK = 12; // their most-played recent artists (12 × 2 genres = 24 searches)

// Spotify genre names to check for each answer to the mood question (Q4), matching what
// the team's hand-picked playlists sound like. Change these to retune the moods.
export const MOOD_SEARCH_GENRES = {
  acoustic: ["indie", "singer-songwriter"], // indie with acoustic vibes, not folk
  beats: ["hip hop", "r&b"],
  dreamy: ["r&b", "lo-fi"],
};
const fresh = (e) => !!e && Date.now() - e.t < CHECK_CACHE_DAYS * 864e5;

// The genres to check: the mood question's answer (Q4); quiz skipped → the Dreamy genres.
function moodGenres(theme, answers) {
  const sound = answers.find((a) => a?.sound)?.sound;
  return MOOD_SEARCH_GENRES[sound] || MOOD_SEARCH_GENRES.dreamy;
}

async function artistsThatFit(token, artists, genres, log) {
  const cache = store.get(CHECK_CACHE_KEY, {}); // "artistId|genre" → { m: matched?, t: when }
  const fit = new Map(); // artist id → how many of the mood's genres they match
  let remembered = 0;
  let skipped = 0;
  const checks = artists.flatMap((artist) => genres.map((genre) => ({ artist, genre })));
  let next = 0;
  await Promise.all(Array.from({ length: 3 }, async () => { // 3 at a time
    while (next < checks.length) {
      const { artist, genre } = checks[next++];
      const key = `${artist.id}|${genre}`;
      let matched;
      if (fresh(cache[key])) {
        matched = cache[key].m;
        remembered++;
      } else {
        const q = encodeURIComponent(`artist:"${artist.name.replace(/"/g, "")}" genre:"${genre}"`);
        try {
          const res = await spotify(token, `/search?type=artist&limit=3&q=${q}`);
          matched = res.artists.items.some((x) => x.id === artist.id);
          cache[key] = { m: matched, t: Date.now() };
        } catch {
          skipped++;
          continue;
        }
      }
      if (matched) fit.set(artist.id, (fit.get(artist.id) || 0) + 1);
    }
  }));
  for (const k of Object.keys(cache)) if (!fresh(cache[k])) delete cache[k];
  store.set(CHECK_CACHE_KEY, cache);
  log.push(`artists that fit ${genres.join(" / ")}: ${fit.size} of ${artists.length}` +
    ` (${remembered} remembered` + (skipped ? `, ${skipped} skipped` : "") + ")");
  return fit;
}

// ---------- main ----------

const DEEP_CUT_ARTISTS = 4;    // new songs come from the best-fitting artists' albums
const DEEP_CUTS_PER_ARTIST = 3;

export async function buildForestMix(token, theme, answers = []) {
  rateLimitHits = 0;
  const discover = Math.min(discoveryLevel(answers), MAX_NEW_SHARE);
  const log = []; // human-readable notes, printed to the console for debugging

  // ---------- 1. what they've been listening to, most recent first ----------
  const known = new Map(); // track id → { track, recency }
  const addKnown = (track, score) => {
    if (!track?.id || !track.uri || track.is_local) return;
    const e = known.get(track.id) || { track, recency: 0 };
    e.recency = Math.max(e.recency, score) + 0.1; // a song in several lists counts a bit more
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

  // ---------- 2. which of their main recent artists fit the mood ----------
  const artistRank = new Map(); // artist id → { id, name, recency }
  for (const { track, recency } of known.values()) {
    const a = track.artists?.[0];
    if (!a?.id || !a.name) continue;
    const e = artistRank.get(a.id) || { id: a.id, name: a.name, recency: 0 };
    e.recency += recency;
    artistRank.set(a.id, e);
  }
  const mainArtists = [...artistRank.values()].sort((a, b) => b.recency - a.recency).slice(0, ARTISTS_TO_CHECK);
  const genres = moodGenres(theme, answers);
  const fit = await artistsThatFit(token, mainArtists, genres, log);
  if (searchBlocked(token)) log.push("Spotify search is paused (rate limit)");

  // ---------- 3. their own songs by artists that fit, most recent first ----------
  const fitOf = (t) => fit.get(t.artists?.[0]?.id) || 0;
  const theirs = [...known.values()]
    .filter(({ track }) => fitOf(track) > 0)
    .sort((a, b) => b.recency * (1 + 0.3 * fitOf(b.track)) - a.recency * (1 + 0.3 * fitOf(a.track)))
    .map((e) => e.track);

  // ---------- 4. new songs: deeper tracks by the artists that fit best (no search) ----------
  const digInto = mainArtists.filter((a) => fit.has(a.id)).slice(0, DEEP_CUT_ARTISTS);
  const deepCuts = [];
  for (const artist of digInto) {
    const albums = await attempt(log, "artist albums", () =>
      spotify(token, `/artists/${artist.id}/albums?include_groups=album,single&limit=10`));
    const found = [];
    for (const album of shuffle(albums?.items || []).slice(0, 2)) {
      const tracks = await attempt(log, "album tracks", () =>
        spotify(token, `/albums/${album.id}/tracks?limit=50`));
      tracks?.items.forEach((t) => {
        if (t.uri && !known.has(t.id) && t.artists?.[0]?.id === artist.id) {
          found.push({ ...t, album: { name: album.name, images: album.images } });
        }
      });
    }
    deepCuts.push(...shuffle(found).slice(0, DEEP_CUTS_PER_ARTIST));
  }

  // ---------- 5. pick: mostly their own songs, plus a few deep cuts ----------
  const used = new Set();
  const ownPerArtist = new Map(); // their songs and deep cuts are capped separately,
  const newPerArtist = new Map(); // so their own songs don't use up an artist's deep cuts
  const take = (list, n, cap, perArtist) => {
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
  const fam = take(theirs, MIX_SIZE - wantNew, 2, ownPerArtist);
  const disc = take(deepCuts, MIX_SIZE - fam.length, DEEP_CUTS_PER_ARTIST, newPerArtist);
  // still short of 30: a few more of their songs per artist
  for (const cap of [3, 4, 5]) fam.push(...take(theirs, MIX_SIZE - fam.length - disc.length, cap, ownPerArtist));
  log.push(`mix: ${fam.length} of your songs + ${disc.length} deeper tracks by the same artists`);

  // ---------- 6. flow: open with one of theirs, spread the new ones out, no artist twice in a row ----------
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

  console.info("[forest mix]", log.join(" · "), "| fitting artists:",
    mainArtists.filter((a) => fit.has(a.id)).map((a) => a.name).join(", ") || "none");

  return {
    name: MIX_NAMES[theme] || "Forest Mix",
    uris: ordered.map((t) => t.uri),
    tracks: ordered,
    familiarCount: fam.length,
    discoverCount: disc.length,
    themedCount: ordered.length, // every song is by an artist that fits the mood
    searchPaused: searchBlocked(token),
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
