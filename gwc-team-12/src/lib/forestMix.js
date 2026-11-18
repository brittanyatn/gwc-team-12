// Builds a "forest mix" from the listener's own Spotify history, shaped by their quiz answers.
//
// All calls go straight from the browser to Spotify with the user's token —
// no listening data is sent anywhere else.
//
// 1. GENRES   Quiz answers + theme → weighted genre keywords.
// 2. FAMILIAR Pool of songs the listener knows: top tracks (4 weeks / 6 months /
//             all time), Liked Songs, and recently played.
// 3. MATCH    Which of the listener's main artists fit the mood question's genre?
//             Spotify hides artist genres from new apps, but its search still filters
//             by genre, so we ask it "is <artist> <genre>?" once per artist.
//             Only songs by matching artists count as familiar picks.
// 4. DISCOVER New songs in the same genres: deep cuts from the matching artists, and
//             genre search limited to the years the listener usually plays.
// 5. BLEND    The "familiar vs. discover" quiz answer sets the ratio. If too few of
//             their artists match, themed new songs fill the gap — unrelated favourites
//             are only a last resort.
// 6. FLOW     Max 2 songs per artist, never the same artist back-to-back,
//             opens with a familiar favourite.
//
// Spotify removed Recommendations / Audio Features / Related Artists / artist genres
// for new apps, so this only uses endpoints that still work.

const API = "https://api.spotify.com/v1";
const MIX_SIZE = 30;
const DEFAULT_DISCOVER = 0.35; // used if the quiz was skipped
const DEEP_CUT_ARTISTS = 4; // how many top-matching artists to dig into
const DEEP_CUTS_PER_ARTIST = 3;
const ARTISTS_TO_CHECK = 10; // listener's main artists to test against the genres
// Search is the scarce part (Spotify rate-limits it), so only ONE genre is searched:
// the main genre of the mood question (Q4). First mix ≈ 10 artist checks + 2 new-song
// searches = 12 searches. The other answers still set the light/dark theme.
const KEYWORDS_TO_CHECK = 1;
const GENRE_SEARCHES = 1;    // genres used for new-song search (2 pages each)

// Spotify rate-limits search hard in development mode (a burst of ~100 searches
// earned a 22-hour block in testing). So: remember artist/genre answers AND new-song
// search results in this browser for 2 days (today's practice + tomorrow's demo), so
// a repeat mix with the same mood answer needs no searches at all; and stop
// searching entirely once Spotify says "too many" (kept until the block ends).
const CACHE_KEY = "forestGenreCache";
const SONG_CACHE_KEY = "forestSongSearchCache";
const BLOCK_KEY = "forestSearchBlockedUntil";
const CACHE_DAYS = 2;
const fresh = (e) => !!e && Date.now() - e.t < CACHE_DAYS * 864e5;
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
const SEARCH_LIMIT = 10;     // Spotify's max page size for search in development mode

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

// The genres to test artists against: every answer's main genre (both for
// double-weight answers), so each response shapes the mix — not just the
// highest-scoring genres overall. Strongest first.
export function genresToCheck(theme, answers = [], max = KEYWORDS_TO_CHECK) {
  const weights = genreWeights(theme, answers);
  // the mood question (Q4, double weight) leads: its main genre is checked first
  const mood = answers.find((a) => (a?.weight || 1) > 1 && a?.genres?.length);
  if (mood && max === 1) return [[mood.genres[0], weights.get(mood.genres[0]) || 1]];
  const picks = [];
  answers.filter((a) => a?.genres?.length).forEach((a) => {
    a.genres.slice(0, (a.weight || 1) > 1 ? 2 : 1).forEach((g) => !picks.includes(g) && picks.push(g));
  });
  if (!picks.length) picks.push(...weights.keys());
  return picks
    .map((g) => [g, weights.get(g) || 1])
    .sort((a, b) => b[1] - a[1])
    .slice(0, max);
}

// 0 = only songs they know, 1 = all new finds
export function discoveryLevel(answers = []) {
  const pick = answers.find((a) => typeof a?.discover === "number");
  return pick ? pick.discover : DEFAULT_DISCOVER;
}

// Run `fn` over items with at most `size` requests in flight
async function inPool(items, size, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}

const releaseYear = (t) => Number(String(t.album?.release_date || "").slice(0, 4)) || null;

const primaryArtist = (t) => t.artists?.[0]?.id || t.id;

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- main ----------

export async function buildForestMix(token, theme, answers = []) {
  rateLimitHits = 0;
  const weights = genreWeights(theme, answers);
  const discover = discoveryLevel(answers);
  const log = []; // human-readable notes, printed to the console for debugging

  // ---------- 2. familiar pool ----------
  const known = new Map(); // track id → { track, fam, sources }
  const addKnown = (track, fam, source) => {
    if (!track?.id || !track.uri || track.is_local) return;
    const entry = known.get(track.id) || { track, fam: 0, sources: new Set() };
    entry.fam += fam;
    entry.sources.add(source);
    known.set(track.id, entry);
  };

  const ranges = { short_term: 1, medium_term: 0.8, long_term: 0.6 };
  for (const [range, w] of Object.entries(ranges)) {
    const page = await attempt(log, `top ${range}`, () =>
      spotify(token, `/me/top/tracks?limit=50&time_range=${range}`));
    page?.items.forEach((t, i) => addKnown(t, 3 * w * (1 - i / 50), "top"));
  }

  let likedCount = 0;
  for (let offset = 0; offset < 200; offset += 50) {
    const page = await attempt(log, "liked songs", () =>
      spotify(token, `/me/tracks?limit=50&offset=${offset}`));
    if (!page) break;
    page.items.forEach((item, i) => addKnown(item.track, 1 + (1 - (offset + i) / 200), "liked"));
    likedCount += page.items.length;
    if (!page.next) break;
  }

  const recent = await attempt(log, "recently played", () =>
    spotify(token, "/me/player/recently-played?limit=50"));
  recent?.items.forEach((item) => addKnown(item.track, 1.5, "recent"));

  log.push(`familiar pool: ${known.size} (liked ${likedCount}, recent ${recent?.items.length ?? 0})`);

  // ---------- 3. which of the listener's artists fit the answers? ----------
  const keywords = genresToCheck(theme, answers);

  // their main artists, ranked by how much they play them
  const artistRank = new Map();
  for (const { track, fam } of known.values()) {
    const a = track.artists?.[0];
    if (!a?.id || !a.name) continue;
    const e = artistRank.get(a.id) || { id: a.id, name: a.name, fam: 0 };
    e.fam += fam;
    artistRank.set(a.id, e);
  }
  const mainArtists = [...artistRank.values()].sort((a, b) => b.fam - a.fam).slice(0, ARTISTS_TO_CHECK);

  const artistFit = new Map(); // artist id → sum of matching genre weights
  const cache = store.get(CACHE_KEY, {}); // "artistId|genre" → { m: matched?, t: when checked }
  let failedChecks = 0;
  let cachedChecks = 0;
  const checks = mainArtists.flatMap((artist) => keywords.map(([genre, w]) => ({ artist, genre, w })));
  await inPool(checks, 3, async ({ artist, genre, w }) => {
    const key = `${artist.id}|${genre}`;
    let matched;
    if (fresh(cache[key])) {
      matched = cache[key].m;
      cachedChecks++;
    } else {
      const q = encodeURIComponent(`artist:"${artist.name.replace(/"/g, "")}" genre:"${genre}"`);
      try {
        const res = await spotify(token, `/search?type=artist&limit=3&q=${q}`);
        matched = res.artists.items.some((x) => x.id === artist.id);
        cache[key] = { m: matched, t: Date.now() };
      } catch {
        failedChecks++;
        return;
      }
    }
    if (matched) artistFit.set(artist.id, (artistFit.get(artist.id) || 0) + w);
  });
  store.set(CACHE_KEY, cache);
  log.push(`artists matching your answers: ${artistFit.size} of ${mainArtists.length}` +
    ` (${cachedChecks} remembered` + (failedChecks ? `, ${failedChecks} skipped` : "") + ")");
  if (searchBlocked(token)) log.push("Spotify search is paused (rate limit) — leaning on your own songs");

  const fitOf = (track) => Math.max(0, ...track.artists.map((a) => artistFit.get(a.id) || 0));
  const familiar = [...known.values()]
    .map((e) => ({ ...e, match: fitOf(e.track) }))
    .filter((e) => e.match > 0)
    .sort((a, b) => (b.match + b.fam) - (a.match + a.fam));
  const unmatched = [...known.values()]
    .filter((e) => fitOf(e.track) === 0)
    .sort((a, b) => b.fam - a.fam);
  log.push(`your songs that fit: ${familiar.length}`);

  // ---------- 4. discovery pool (same genres, new to them) ----------
  // a) deep cuts: other songs by the artists that fit best
  const digInto = [...artistFit.entries()].sort((a, b) => b[1] - a[1]).slice(0, DEEP_CUT_ARTISTS);
  const deepCuts = [];
  for (const [artistId] of digInto) {
    const albums = await attempt(log, "artist albums", () =>
      spotify(token, `/artists/${artistId}/albums?include_groups=album,single&limit=10`));
    const found = [];
    for (const album of shuffle(albums?.items || []).slice(0, 2)) {
      const tracks = await attempt(log, "album tracks", () =>
        spotify(token, `/albums/${album.id}/tracks?limit=50`));
      tracks?.items.forEach((t) => {
        if (t.uri && !known.has(t.id)) found.push({ ...t, album: { name: album.name, images: album.images } });
      });
    }
    deepCuts.push(...shuffle(found).slice(0, DEEP_CUTS_PER_ARTIST));
  }
  log.push(`deep cuts: ${deepCuts.length} from ${digInto.length} artists`);

  // b) genre search, limited to the years they usually listen to
  const years = (familiar.length >= 5 ? familiar : [...known.values()])
    .map((e) => releaseYear(e.track)).filter(Boolean).sort((a, b) => a - b);
  const pct = (p) => years[Math.min(years.length - 1, Math.floor(p * years.length))];
  const yearFilter = years.length >= 5 ? ` year:${pct(0.15) - 2}-${pct(0.9) + 1}` : "";

  const searched = [];
  const songCache = store.get(SONG_CACHE_KEY, {}); // "genre|years|offset" → { items, t }
  let cachedSearches = 0;
  for (const [genre] of keywords.slice(0, GENRE_SEARCHES)) {
    for (const offset of [0, SEARCH_LIMIT]) {
      const key = `${genre}|${yearFilter}|${offset}`;
      let items = fresh(songCache[key]) ? songCache[key].items : null;
      if (items) {
        cachedSearches++;
      } else {
        const q = encodeURIComponent(`genre:"${genre}"${yearFilter}`);
        const res = await attempt(log, `search "${genre}"`, () =>
          spotify(token, `/search?type=track&limit=${SEARCH_LIMIT}&offset=${offset}&q=${q}`));
        items = res?.tracks.items.map((t) => ({
          id: t.id, uri: t.uri, name: t.name, artists: t.artists?.map((a) => ({ id: a.id, name: a.name })),
          album: { name: t.album?.name, release_date: t.album?.release_date },
        }));
        if (items) songCache[key] = { items, t: Date.now() };
      }
      items?.forEach((t) => !known.has(t.id) && !searched.some((x) => x.id === t.id) && searched.push(t));
    }
  }
  // drop expired entries so the cache doesn't grow
  for (const k of Object.keys(songCache)) if (!fresh(songCache[k])) delete songCache[k];
  store.set(SONG_CACHE_KEY, songCache);
  if (cachedSearches) log.push(`new-song searches remembered: ${cachedSearches}`);
  log.push(`genre finds: ${searched.length}${yearFilter ? ` (${yearFilter.trim()})` : ""}`);

  // alternate deep cuts and search finds so neither dominates
  const discovery = [];
  for (let i = 0; i < Math.max(deepCuts.length, searched.length); i++) {
    if (deepCuts[i]) discovery.push(deepCuts[i]);
    if (searched[i]) discovery.push(searched[i]);
  }

  // ---------- 5. blend by the familiar/discover answer ----------
  const wantDiscover = Math.round(MIX_SIZE * discover);
  const wantFamiliar = MIX_SIZE - wantDiscover;

  const used = new Set();
  const perArtist = new Map();
  const take = (list, n, cap) => {
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

  const familiarList = familiar.map((e) => e.track);
  const fam = [];
  const disc = [];
  const room = () => MIX_SIZE - fam.length - disc.length;
  // fill each side to its target: strict artist cap first, a bit looser if needed
  for (const cap of [2, 3]) {
    fam.push(...take(familiarList, Math.min(wantFamiliar - fam.length, room()), cap));
    disc.push(...take(discovery, Math.min(wantDiscover - disc.length, room()), cap));
  }
  // if one side ran short, fill with themed songs from the other side
  for (const cap of [3, Infinity]) {
    fam.push(...take(familiarList, room(), cap));
    disc.push(...take(discovery, room(), cap));
  }
  // last resort: favourites that didn't match the answers
  let fillerCount = 0;
  if (room() > 0) {
    const filler = take(unmatched.map((e) => e.track), room(), 3);
    fam.push(...filler);
    fillerCount = filler.length;
    log.push(`filled ${filler.length} with favourites outside your answers`);
  }

  // ---------- 6. flow ----------
  const ordered = [];
  const famQueue = [...fam];
  const discQueue = [...disc];
  if (famQueue.length) ordered.push(famQueue.shift()); // open with a favourite
  // spread discoveries evenly between familiar songs
  const total = fam.length + disc.length;
  const ratio = total ? disc.length / total : 0;
  let placedDisc = 0;
  while (famQueue.length || discQueue.length) {
    const dueDisc = placedDisc + 1 <= Math.round((ordered.length + 1) * ratio);
    if (discQueue.length && (dueDisc || !famQueue.length)) {
      ordered.push(discQueue.shift());
      placedDisc++;
    } else {
      ordered.push(famQueue.shift());
    }
  }
  // never the same artist twice in a row
  for (let i = 1; i < ordered.length; i++) {
    if (primaryArtist(ordered[i]) !== primaryArtist(ordered[i - 1])) continue;
    const j = ordered.findIndex((t, k) =>
      k > i && primaryArtist(t) !== primaryArtist(ordered[i - 1]) &&
      (k + 1 >= ordered.length || primaryArtist(ordered[i]) !== primaryArtist(ordered[k + 1])));
    if (j > 0) [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  }

  log.push(`mix: ${fam.length} familiar + ${disc.length} new (asked for ${Math.round(discover * 100)}% new)`);
  console.info("[forest mix]", log.join(" · "), "| keywords:", Object.fromEntries(weights));

  return {
    name: MIX_NAMES[theme] || "Forest Mix",
    uris: ordered.map((t) => t.uri),
    tracks: ordered,
    familiarCount: fam.length,
    discoverCount: disc.length,
    themedCount: fam.length + disc.length - fillerCount, // songs that fit the answers
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
