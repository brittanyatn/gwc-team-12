// Builds a "forest mix" from the listener's own Spotify history + their quiz answers.
//
// All calls go straight from the browser to Spotify with the user's token —
// no listening data is sent anywhere else.
//
// 1. GENRES   Quiz answers + theme → weighted genre keywords.
// 2. FAMILIAR Pool of songs the listener knows: top tracks (4 weeks / 6 months /
//             all time), Liked Songs, and recently played. Each song gets a
//             "familiarity" score from where it showed up.
// 3. MATCH    Each song is scored by how well its artists' genres match the
//             keywords (Spotify only tags genres on artists, not songs).
// 4. DISCOVER New-to-them songs: deep cuts from albums by their best-matching
//             artists, plus Spotify search results for the strongest genres.
// 5. BLEND    The "familiar vs. discover" quiz answer sets the ratio.
// 6. FLOW     Max 2 songs per artist, never the same artist back-to-back,
//             opens with a familiar favourite.
//
// Spotify removed Recommendations / Audio Features / Related Artists for new
// apps (Nov 2024), so this only uses endpoints that are still available.

const API = "https://api.spotify.com/v1";
const MIX_SIZE = 30;
const DEFAULT_DISCOVER = 0.35; // used if the quiz was skipped
const DEEP_CUT_ARTISTS = 4; // how many top-matching artists to dig into
const DEEP_CUTS_PER_ARTIST = 3;

// Genre keywords for each theme, used even if the quiz was skipped.
export const THEME_GENRES = {
  lightForest: ["indie", "folk", "acoustic", "pop"],
  darkForest: ["electronic", "alternative", "dark", "r&b"],
};

export const MIX_NAMES = {
  lightForest: "Sunlit Canopy",
  darkForest: "Moonlit Glade",
};

async function spotify(token, path, options = {}) {
  const res = await fetch(path.startsWith("http") ? path : API + path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
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
  (THEME_GENRES[theme] || []).forEach((g) => add(g, 1));
  answers.forEach((a) => (a?.genres || []).forEach((g) => add(g, 2 * (a.weight || 1))));
  return weights;
}

// 0 = only songs they know, 1 = all new finds
export function discoveryLevel(answers = []) {
  const pick = answers.find((a) => typeof a?.discover === "number");
  return pick ? pick.discover : DEFAULT_DISCOVER;
}

function scoreGenres(artistGenres, weights) {
  let score = 0;
  for (const genre of artistGenres) {
    for (const [keyword, w] of weights) {
      if (genre.includes(keyword)) score += w;
    }
  }
  return score;
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

// ---------- main ----------

export async function buildForestMix(token, theme, answers = []) {
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

  // ---------- 3. genre match ----------
  const artistGenres = new Map(); // artist id → genres
  const topArtists = await attempt(log, "top artists", () =>
    spotify(token, "/me/top/artists?limit=50&time_range=medium_term"));
  topArtists?.items.forEach((a) => artistGenres.set(a.id, a.genres || []));

  const missing = [...new Set([...known.values()].flatMap(({ track }) => track.artists.map((a) => a.id)))]
    .filter((id) => id && !artistGenres.has(id))
    .slice(0, 300);
  for (let i = 0; i < missing.length; i += 50) {
    const batch = await attempt(log, "artist genres", () =>
      spotify(token, `/artists?ids=${missing.slice(i, i + 50).join(",")}`));
    if (!batch) break;
    batch.artists.forEach((a) => a && artistGenres.set(a.id, a.genres || []));
  }
  if (![...artistGenres.values()].some((g) => g.length)) {
    log.push("no artist genres from Spotify — leaning on search");
  }

  const genreScoreOf = (track) =>
    scoreGenres(track.artists.flatMap((a) => artistGenres.get(a.id) || []), weights);

  const familiar = [...known.values()]
    .map((e) => ({ ...e, match: genreScoreOf(e.track) }))
    .sort((a, b) =>
      // genre matches first, then strongest match + most familiar
      (b.match > 0) - (a.match > 0) || (b.match + b.fam) - (a.match + a.fam));
  log.push(`genre matches among them: ${familiar.filter((e) => e.match > 0).length}`);

  // ---------- 4. discovery pool ----------
  // a) deep cuts: other songs by the artists that best fit the answers
  const artistFit = new Map(); // artist id → fit score
  familiar.forEach(({ track, match, fam }) => {
    if (match <= 0) return;
    const id = primaryArtist(track);
    artistFit.set(id, (artistFit.get(id) || 0) + match + fam);
  });
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

  // b) Spotify search for the strongest genres
  const searched = [];
  const keywords = [...weights.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g).slice(0, 4);
  for (const keyword of keywords) {
    const res = await attempt(log, `search "${keyword}"`, () =>
      spotify(token, `/search?type=track&limit=10&q=${encodeURIComponent(`genre:"${keyword}"`)}`));
    res?.tracks.items.forEach((t) => !known.has(t.id) && searched.push(t));
  }
  log.push(`search finds: ${searched.length}`);

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
  // if one side ran short, let the other side fill the gap
  for (const cap of [3, Infinity]) {
    fam.push(...take(familiarList, room(), cap));
    disc.push(...take(discovery, room(), cap));
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
    log,
  };
}

// Optional: save the mix to the user's Spotify library as a private playlist.
export async function saveMixAsPlaylist(token, mix) {
  const body = JSON.stringify({
    name: `${mix.name} · Enchanted Grove`,
    description: "Made by the Enchanted Grove forest DJ from your favourite songs and quiz answers.",
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
