# GWC TEAM 12
mp3 Spotify player project for Girls Who Code Fall Project, Team 12

Customizable mp3 player based on a personality quiz

# How it works
Sign in with Spotify, take the forest quiz, then hit "DJ spin that shit". The quiz picks a light or dark forest and a mood (acoustic, beats or dreamy).

- **Demo mode on** (the switch on the welcome screen, on by default): plays the team's playlist for that mood
- **Demo mode off**: makes a 30 song forest mix from what you've been listening to lately, only from your artists that fit the mood
- note: Spotify doesn't tell apps an artist's genre, so the mix checks your artists with Spotify search, most typical genre for the mood first (like indie for acoustic). If not enough of your artists fit, it moves to broader genres (ending with pop), so some picks won't match the mood exactly
- if the mix doesn't work out (or Spotify says too many requests), the mood playlist plays instead
- **+ Save mix** saves it to your Spotify

# Setup
You need Node.js 20+, Spotify Premium, and Chrome on a laptop.

    git clone https://github.com/brittanyatn/gwc-team-12.git
    cd gwc-team-12/gwc-team-12
    npm install
    cp .env.example .env

Put the team's `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` in `.env` (ask the team, never commit it). Your Spotify email has to be added under **User Management** on the Spotify dashboard (up to 5 people).

    npm start

Open **http://127.0.0.1:1420/** (not localhost) and connect Spotify. Ctrl + C stops it.

# Changing things
- quiz questions: `src/components/OnboardingQuiz.jsx`
- mood playlists + demo mode default: `src/lib/backupPlaylists.js`
- forest mix (which genres fit each mood): `src/lib/forestMix.js`
- sound effects: `src/lib/sfx.js`, `public/sounds/`
- player and art: `src/components/SpotifyPlayer.jsx`, `src/components/Forest.css`, `src/assets/forest/`
- Spotify login: `server/index.cjs`

Testing: add `?backup` or `?nobackup` to the page address to force the mood playlists on or off.

# Troubleshooting
- login error / INVALID_CLIENT: check the keys in `.env`, then restart `npm start`
- 403 / not allowed: your Spotify email isn't in User Management
- play does nothing: refresh and press play again (Premium + desktop Chrome)
- a mood playlist plays instead of the mix: Spotify search hit its limit or not enough of your songs fit the mood, try again later

# APIs used
    Spotify Web Playback SDK, Spotify Web API (login via the Express server in `server/index.cjs`)
