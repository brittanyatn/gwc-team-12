// Builds a "forest mix" from the listener's own Spotify history + their quiz answers.
//
// How it works (all calls go straight from the browser to Spotify with the user's
// token — no listening data is sent anywhere else):
//   1. Turn the quiz answers into a weighted list of genre keywords.
//   2. Pull the listener's top tracks (short / medium / long term) and top artists.
//   3. Score each top track by how well its artists' genres match the keywords,
//      keeping the user's own ranking as a tie-breaker.
//   4. If there aren't enough matches, top up with Spotify search results for the
//      strongest keywords, then with the user's other top tracks.
//
// Spotify removed the Recommendations and Audio Features endpoints for new apps
// (Nov 2024), so this only uses endpoints that are still available: /me/top,
// /search, and (optionally) playlist creation.

const API = "https://api.spotify.com/v1";
const MIX_SIZE = 30;
const MIN_GENRE_MATCHES = 12; // below this, top up with search results

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

// answers: the quiz options the user picked (each has a `genres` array)
export function genreWeights(theme, answers = []) {
  const weights = new Map();
  const add = (g, w) => weights.set(g, (weights.get(g) || 0) + w);
  (THEME_GENRES[theme] || []).forEach((g) => add(g, 1));
  answers.forEach((a) => (a?.genres || []).forEach((g) => add(g, 2)));
  return weights;
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

export async function buildForestMix(token, theme, answers = []) {
  const weights = genreWeights(theme, answers);
  const log = []; // human-readable notes, printed to the console for debugging

  // --- 2. the listener's top artists (for genres) and top tracks ---
  const artistGenres = new Map(); // artist id → genres
  try {
    const top = await spotify(token, "/me/top/artists?limit=50&time_range=medium_term");
    top.items.forEach((a) => artistGenres.set(a.id, a.genres || []));
    log.push(`top artists: ${top.items.length}`);
  } catch (e) {
    log.push(`top artists unavailable (${e.status})`);
  }

  const topTracks = [];
  const seen = new Set();
  for (const range of ["short_term", "medium_term", "long_term"]) {
    try {
      const page = await spotify(token, `/me/top/tracks?limit=50&time_range=${range}`);
      page.items.forEach((t, i) => {
        if (seen.has(t.id)) return;
        seen.add(t.id);
        topTracks.push({ track: t, rank: topTracks.length + i });
      });
    } catch (e) {
      log.push(`top tracks ${range} unavailable (${e.status})`);
    }
  }
  log.push(`top tracks: ${topTracks.length}`);

  // Some track artists aren't in the top-artists list; look up their genres.
  const missing = [...new Set(topTracks.flatMap(({ track }) => track.artists.map((a) => a.id)))]
    .filter((id) => !artistGenres.has(id));
  for (let i = 0; i < missing.length; i += 50) {
    try {
      const batch = await spotify(token, `/artists?ids=${missing.slice(i, i + 50).join(",")}`);
      batch.artists.forEach((a) => a && artistGenres.set(a.id, a.genres || []));
    } catch (e) {
      log.push(`artist lookup unavailable (${e.status})`);
      break;
    }
  }
  const anyGenres = [...artistGenres.values()].some((g) => g.length);
  if (!anyGenres) log.push("Spotify returned no artist genres — falling back to search");

  // --- 3. score the user's own top tracks ---
  const scored = topTracks
    .map(({ track, rank }) => {
      const genres = track.artists.flatMap((a) => artistGenres.get(a.id) || []);
      return { track, rank, score: scoreGenres(genres, weights) };
    })
    .filter((t) => t.score > 0)
    .sort((a, b) => b.score - a.score || a.rank - b.rank);

  const picked = scored.slice(0, MIX_SIZE).map((t) => t.track);
  log.push(`genre matches from your top tracks: ${scored.length}`);

  // --- 4a. top up with search results for the strongest keywords ---
  if (picked.length < MIN_GENRE_MATCHES) {
    const keywords = [...weights.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g).slice(0, 4);
    for (const keyword of keywords) {
      if (picked.length >= MIX_SIZE) break;
      try {
        const q = encodeURIComponent(`genre:"${keyword}"`);
        const res = await spotify(token, `/search?type=track&limit=10&q=${q}`);
        res.tracks.items.forEach((t) => {
          if (picked.length < MIX_SIZE && !picked.some((p) => p.id === t.id)) picked.push(t);
        });
        log.push(`search "${keyword}": ${res.tracks.items.length}`);
      } catch (e) {
        log.push(`search "${keyword}" unavailable (${e.status})`);
      }
    }
  }

  // --- 4b. still short? use the rest of their top tracks ---
  for (const { track } of topTracks) {
    if (picked.length >= MIX_SIZE) break;
    if (!picked.some((p) => p.id === track.id)) picked.push(track);
  }

  console.info("[forest mix]", log.join(" · "), "| keywords:", Object.fromEntries(weights));

  return {
    name: MIX_NAMES[theme] || "Forest Mix",
    uris: picked.map((t) => t.uri),
    tracks: picked,
    log,
  };
}

// Optional: save the mix to the user's Spotify library as a private playlist.
export async function saveMixAsPlaylist(token, mix) {
  const body = JSON.stringify({
    name: `${mix.name} · Enchanted Grove`,
    description: "Made by the Enchanted Grove forest DJ from your top songs and quiz answers.",
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
