# GWC TEAM 12
mp3 Spotify player project for Girls Who Code Fall Project, Team 12

Customizable mp3 player based on a personality quiz

## What it does

1. **Sign in** with Spotify.
2. **Take the forest quiz** (or skip to the Light or Dark Forest). The answers pick a light or dark theme and the kind of music you're in the mood for.
3. **"DJ spin that shit"** plays a random sound effect and opens the player.
4. **The player** builds a 30-song "forest mix" from your own Spotify listening, shaped by your answers, while a soft ambient loop plays. Press play to start it, and **+ Save mix** to save it as a private playlist in your Spotify.
5. If the mix can't be built or played, a **backup playlist** that matches your mood answer plays instead.

## Setup on a new laptop

You need: [Node.js](https://nodejs.org) (version 20 or newer), **Spotify Premium**, and a desktop browser (Chrome works best). Rust is only needed for the Tauri desktop app, not for the browser demo.

### 1. Get the code

    git clone <this repo's URL>
    cd gwc-team-12/gwc-team-12
    npm install

All commands below run inside the nested `gwc-team-12/gwc-team-12` folder.

### 2. Spotify keys

The app needs a Spotify app's **Client ID** and **Client secret**. Use one of these:

- **Use the team's Spotify app:** ask whoever owns it for the two keys, and ask them to add your Spotify email under **User Management** on the app's dashboard page. Spotify only lets accounts on that list log in (up to 5 while the app is in Development Mode).
- **Make your own:** go to https://developer.spotify.com/dashboard → **Create app**
  - Redirect URI: `http://127.0.0.1:3000/auth/callback` (exactly this)
  - APIs: tick **Web API** and **Web Playback SDK**
  - Save, then open **Settings** to copy the Client ID and Client secret

### 3. Create the `.env` file

Copy the example file and paste your keys in (no quotes, no spaces):

    cp .env.example .env

`.env` is gitignored, so never commit it or share keys in the repo.

### 4. Run it (two terminals)

    npm run server     # terminal 1: Spotify login, http://127.0.0.1:3000
    npm run dev        # terminal 2: the app

Or start both in one terminal with `npm start` (Ctrl + C stops both).

Open **http://127.0.0.1:1420/** (use `127.0.0.1`, not `localhost`, or Spotify login won't return to the app). Click **Connect to Spotify**, take the quiz, and press play.

## How it works and where to change things

All paths are inside the nested `gwc-team-12/gwc-team-12` folder.

| What | File | Notes |
| --- | --- | --- |
| Quiz questions, answers and their genres | `src/components/OnboardingQuiz.jsx` | Each answer adds light/dark points and genre tags. Question 4 (the mood question) also has a `sound` tag that picks the backup playlist. |
| Forest mix | `src/lib/forestMix.js` | Uses your top songs, Liked Songs and recent plays. Spotify search checks which of your top 10 artists fit Question 4's genre and finds new songs in that genre: about 12 searches for a first mix. Results are remembered in the browser for `CACHE_DAYS` (2), so a repeat mix needs no searches. |
| Backup playlists | `src/lib/backupPlaylists.js` | One public playlist link per mood answer (Acoustic, Beats, Dreamy) and an optional one for skipping the quiz. Used when the mix fails, when fewer than `MIN_THEMED_SONGS` (15) songs fit the answers, or when Spotify refuses the mix. |
| Sound effects | `src/lib/sfx.js`, `public/sounds/` | `DJ_SOUNDS` lists the clips picked at random for "DJ spin that shit". `ambient-forest.mp3` loops on the player page until the music starts. |
| Player screen | `src/components/SpotifyPlayer.jsx` | Spotify Web Playback SDK player, play/skip controls, Save mix button, swirling portal (`PortalVortex.jsx`) and scrolling text for long titles (`Marquee.jsx`). |
| Look and colours | `src/components/Forest.css`, `src/assets/forest/` | Light/dark theme colours are CSS variables. The rock frame (`portal-frame-*.png`), pebble buttons (`prev/play/pause/next-*.svg`) and firefly tracker (`firefly-*.png`) come in light and dark versions. |
| Spotify login | `server/index.cjs` | Express server on port 3000: sign-in, callback and automatic login renewal. It holds one login at a time, so it's meant to run on each person's own laptop. |

### Testing shortcuts

Add these to the page address:

- `?backup` always uses the backup playlists and makes no Spotify searches, e.g. `http://127.0.0.1:1420/?backup`.
- `?track=<Spotify song link>` plays that song on the first press of play.
- `?nobackup` turns the backup playlists off, so you only get the real forest mix.

## Spotify limits

- **Premium** is required for playback, and it only plays in a desktop browser (Chrome works best).
- While the Spotify app is in **Development Mode**, only accounts added under **User Management** on its dashboard can sign in (about 5).
- **Search is rate-limited.** Too many searches block it for hours. The app then builds the mix from your own songs or plays a backup playlist; playback keeps working.
- New apps can't use Spotify's recommendations, audio features, related artists or artist genres, which is why the mix uses search to match genres.

## Troubleshooting

- **"INVALID_CLIENT" or the login page errors:** the keys in `.env` are wrong, or the redirect URI on the Spotify dashboard doesn't match exactly. Restart `npm run server` after changing `.env`.
- **Spotify says you're not allowed / 403:** your Spotify email isn't in the app's **User Management** list.
- **Play does nothing, or the console says "Failed to initialize player":** refresh the page and press play again. Make sure you're on Premium and in desktop Chrome (not Safari or the VS Code preview browser).
- **The mix is your own songs instead of new ones, or the console says "search is paused (rate limit)":** Spotify limits how many searches an app can make. The app falls back to your own songs and tries search again later. If Spotify refuses the mix entirely, play resumes your last Spotify music instead.
- **A backup playlist plays instead of the forest mix:** the mix couldn't be built, too few of its songs matched the answers (often because Spotify's search limit was hit), or Spotify refused it. The backup playlists are set in `src/lib/backupPlaylists.js`, one per answer to the sound question (plus an optional one for skipping the quiz). Add `?backup` to the page address, or set `ALWAYS_USE_BACKUP = true` in that file, to always use them.

## APIs used

Spotify Web Playback SDK, Spotify Web API (login via the Express server in `server/index.cjs`)
