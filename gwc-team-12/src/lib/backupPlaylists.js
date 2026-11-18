// Backup playlists: hand-picked Spotify playlists, one per theme × sound answer.
//
// The forest mix needs ~70 Spotify requests, and Spotify's search limit can block it.
// Playing one of these takes a single request, so it works even when search is blocked.
// The player switches to the matching backup playlist when:
//   - the mix fails to build, or comes back empty,
//   - too few of its songs match the answers (e.g. search is rate-limited), or
//   - Spotify refuses to play the mix.
//
// TO ADD A PLAYLIST: in Spotify, ⋯ on the playlist → Share → Copy link to playlist,
// and paste the whole link between the quotes. Make the playlist Public so every
// account can play it. Use playlists a person made, not Spotify's own playlists
// (Spotify blocks new apps from those). An empty link = no backup for that combo,
// so play resumes the listener's last Spotify music instead.
export const BACKUP_PLAYLISTS = {
  lightForest: {
    acoustic: { name: "Sunlit Canopy · Acoustic", link: "" },
    beats:    { name: "Sunlit Canopy · Beats",    link: "" },
    dreamy:   { name: "Sunlit Canopy · Dreamy",   link: "" }, // also used for "Skip to Light Forest"
  },
  darkForest: {
    acoustic: { name: "Moonlit Glade · Acoustic", link: "" },
    beats:    { name: "Moonlit Glade · Beats",    link: "" },
    dreamy:   { name: "Moonlit Glade · Dreamy",   link: "" }, // also used for "Skip to Dark Forest"
  },
};

// DEMO SWITCH: true = always play the backup playlists and don't build a mix at all
// (no Spotify search, 1 request per play). You can also add ?backup to the page
// address to force it without changing code, e.g. http://127.0.0.1:1420/?backup
export const ALWAYS_USE_BACKUP = false;

// The mix counts as good enough if at least this many of its 30 songs fit the
// answers. Below that it's mostly unrelated favourites, so the backup plays instead.
export const MIN_THEMED_SONGS = 15;

export function backupForced() {
  if (ALWAYS_USE_BACKUP) return true;
  try {
    return new URLSearchParams(globalThis.location?.search || "").has("backup");
  } catch {
    return false;
  }
}

// "https://open.spotify.com/playlist/<id>?si=…" or "spotify:playlist:<id>" → id
export function playlistId(link) {
  return String(link || "").match(/playlist[/:]([A-Za-z0-9]{22})/)?.[1] || null;
}

// The sound question (Q4) picks the playlist; skipped → the theme's dreamy one.
export function soundFromAnswers(answers = []) {
  return answers.find((a) => a?.sound)?.sound || "dreamy";
}

// → { name, uri, url, theme, sound } or null if that playlist has no link yet
export function pickBackupPlaylist(theme, answers) {
  const sound = soundFromAnswers(answers);
  const entry = (BACKUP_PLAYLISTS[theme] || BACKUP_PLAYLISTS.lightForest)[sound];
  const id = playlistId(entry?.link);
  if (!id) {
    console.warn(`[backup playlist] no link set for ${theme} · ${sound} (src/lib/backupPlaylists.js)`);
    return null;
  }
  return {
    name: entry.name,
    uri: `spotify:playlist:${id}`,
    url: `https://open.spotify.com/playlist/${id}`,
    theme,
    sound,
  };
}

// Is this mix too far from the answers to play?
export function mixTooWeak(mix) {
  if (!mix?.uris?.length) return true;
  const themed = mix.themedCount ?? mix.uris.length;
  return themed < MIN_THEMED_SONGS;
}
