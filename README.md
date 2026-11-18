# GWC TEAM 12
mp3 Spotify player project for Girls Who Code Fall Project, Team 12

Customizable mp3 player based on a personality quiz

# Setup on a new laptop

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

Open **http://127.0.0.1:1420/** (use `127.0.0.1`, not `localhost`, or Spotify login won't return to the app). Click **Connect to Spotify**, take the quiz, and press play.

### Troubleshooting

- **"INVALID_CLIENT" or the login page errors:** the keys in `.env` are wrong, or the redirect URI on the Spotify dashboard doesn't match exactly. Restart `npm run server` after changing `.env`.
- **Spotify says you're not allowed / 403:** your Spotify email isn't in the app's **User Management** list.
- **Play does nothing, or the console says "Failed to initialize player":** refresh the page and press play again. Make sure you're on Premium and in desktop Chrome (not Safari or the VS Code preview browser).
- **The mix is your own songs instead of new ones, or the console says "search is paused (rate limit)":** Spotify limits how many searches an app can make. The app falls back to your own songs and tries search again later. If Spotify refuses the mix entirely, play resumes your last Spotify music instead.

- **A backup playlist plays instead of the forest mix:** the mix couldn't be built, too few of its songs matched the answers (often because Spotify's search limit was hit), or Spotify refused it. The backup playlists are set in `src/lib/backupPlaylists.js`, one per answer to the sound question (plus an optional one for skipping the quiz). Add `?backup` to the page address, or set `ALWAYS_USE_BACKUP = true` in that file, to always use them.

# APIs used
    Spotify Web Playback SDK, Spotify Web API (login via the Express server in `server/index.cjs`)
