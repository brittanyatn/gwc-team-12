import { useEffect, useRef, useState } from "react";
import "./Forest.css";
import { buildForestMix, saveMixAsPlaylist } from "../lib/forestMix";
import PortalVortex from "./PortalVortex";

// Player art from the Figma midfi "Player · iPhone Large" frames
import bgLight from "../assets/forest/bg-light.png";
import bgDark from "../assets/forest/bg-dark.png";
import bushLight from "../assets/forest/bush-light.png";
import bushDark from "../assets/forest/bush-dark.png";
import bushMask from "../assets/forest/bush-mask.svg";
// imported as text so each firefly can be animated individually (see Forest.css)
import firefliesLight from "../assets/forest/fireflies-light.svg?raw";
import firefliesDark from "../assets/forest/fireflies-dark.svg?raw";
import grassLight from "../assets/forest/grass-light.svg";
import grassDark from "../assets/forest/grass-dark.svg";
import portalLight from "../assets/forest/portal-light.svg";
import portalDark from "../assets/forest/portal-dark.svg";
import portalMask from "../assets/forest/portal-mask.svg";
import albumPlaceholder from "../assets/forest/album-placeholder.jpg";
import spotifyWhite from "../assets/forest/spotify-white.svg";
// PLACEHOLDER button art (Figma "Control Button" ovals, 73 × 37).
// To swap in final art: replace these files, or point the imports at the new files.
// Progress bar colors are placeholders too: --player-track / --player-played in Forest.css.
import prevLight from "../assets/forest/prev-light.svg";
import prevDark from "../assets/forest/prev-dark.svg";
import playLight from "../assets/forest/play-light.svg";
import playDark from "../assets/forest/play-dark.svg";
import pauseLight from "../assets/forest/pause-light.svg";
import pauseDark from "../assets/forest/pause-dark.svg";
import nextLight from "../assets/forest/next-light.svg";
import nextDark from "../assets/forest/next-dark.svg";

const ART = {
  lightForest: {
    bg: bgLight, bush: bushLight, fireflies: firefliesLight, grass: grassLight, portal: portalLight,
    prev: prevLight, play: playLight, pause: pauseLight, next: nextLight,
  },
  darkForest: {
    bg: bgDark, bush: bushDark, fireflies: firefliesDark, grass: grassDark, portal: portalDark,
    prev: prevDark, play: playDark, pause: pauseDark, next: nextDark,
  },
};

// TEST SONG: add ?track=<Spotify song link> to the page URL to start that song
// on the first press of play, e.g.
//   http://127.0.0.1:1420/?track=https://open.spotify.com/track/XXXXXXXX
// (Spotify app → ⋯ on a song → Share → Copy Song Link)
function getTestTrackUri() {
  const raw = new URLSearchParams(window.location.search).get("track");
  if (!raw) return null;
  const id = raw.match(/track[/:]([A-Za-z0-9]{22})/)?.[1] || raw.match(/^[A-Za-z0-9]{22}$/)?.[0];
  return id ? `spotify:track:${id}` : null;
}

// Building a mix makes ~100 Spotify requests. React (in development) starts effects
// twice, so share one build per token + answers instead of doing it all twice.
let mixCache = { key: null, promise: null };
function mixFor(token, theme, answers) {
  const key = JSON.stringify([token, theme, answers]);
  if (mixCache.key !== key) mixCache = { key, promise: buildForestMix(token, theme, answers) };
  return mixCache.promise;
}

// The Spotify SDK player lives for the whole page visit (see the setup effect).
const sharedPlayer = { player: null, deviceId: null };

// The backend renews the Spotify login every hour; always ask it for the current one.
async function currentToken(fallback) {
  try {
    const res = await fetch("/auth/token");
    const json = await res.json();
    return json.access_token || fallback;
  } catch {
    return fallback;
  }
}

function SpotifyPlayer({ token, theme = "lightForest", answers = [], onBack }) {
  const playerRef = useRef(null);
  const [track, setTrack] = useState(null);
  const [paused, setPaused] = useState(true); // note: true means music IS playing (set from !state.paused)
  const startedRef = useRef(false);
  const [started, setStarted] = useState(false);
  const [position, setPosition] = useState(0); // ms, for the progress bar
  const [duration, setDuration] = useState(0);

  // Forest mix: the listener's top songs filtered by their quiz answers
  const [mix, setMix] = useState(null);
  const [mixStatus, setMixStatus] = useState("idle"); // idle | loading | ready | error
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | error
  const [savedUrl, setSavedUrl] = useState(null);
  const [playerProblem, setPlayerProblem] = useState(null); // shown under the song info

  useEffect(() => {
    if (!token || token === "preview-token") return;
    let cancelled = false;
    setMixStatus("loading");
    mixFor(token, theme, answers)
      .then((m) => {
        if (cancelled) return;
        setMix(m);
        setMixStatus(m.uris.length ? "ready" : "error");
      })
      .catch((e) => {
        console.error("[forest mix] failed:", e);
        if (!cancelled) setMixStatus("error");
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, theme]);

  const handleSaveMix = async () => {
    if (!mix || saveStatus === "saving") return;
    setSaveStatus("saving");
    try {
      const playlist = await saveMixAsPlaylist(await currentToken(token), mix);
      setSavedUrl(playlist.external_urls?.spotify || null);
      setSaveStatus("saved");
    } catch (e) {
      console.error("[forest mix] save failed:", e);
      setSaveStatus("error");
    }
  };



    const handlePlayPause = async () => {
      const player = playerRef.current;
      if (!player) return;

      player.activateElement();

      if (!startedRef.current) {
        // the player registers with Spotify a moment after it's created;
        // if it never does (failed start / went offline), reconnect once and wait again
        const waitForDevice = async (ms) => {
          for (let i = 0; i < ms / 250 && !sharedPlayer.deviceId; i++) {
            await new Promise((r) => setTimeout(r, 250));
          }
          return sharedPlayer.deviceId;
        };
        setPlayerProblem(null);
        if (!(await waitForDevice(3000))) {
          console.warn("Spotify player not ready, reconnecting…");
          player.disconnect();
          await player.connect();
          if (!(await waitForDevice(6000))) {
            console.warn("Spotify player still isn't ready");
            setPlayerProblem("Spotify's player couldn't start. Refresh the page and press play again.");
            return;
          }
        }
        const state = await player.getCurrentState();
        const testTrack = getTestTrackUri();
        const liveToken = await currentToken(token);
        const res = await fetch(
          `https://api.spotify.com/v1/me/player/play?device_id=${sharedPlayer.deviceId}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${liveToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(
              testTrack ? { uris: [testTrack] }
              : mix?.uris?.length ? { uris: mix.uris } // play the forest mix
              : state?.context?.uri ? { context_uri: state.context.uri } : {}
            ),
          }
        );
        console.log("Start play:", res.status);
        if (res.ok || res.status === 204) {
          startedRef.current = true;
          return;
        }

        // Mix/test song rejected? Fall back to resuming whatever played last.
        if (testTrack || mix?.uris?.length) {
          console.warn("[forest mix] Spotify rejected the mix, resuming last playback instead");
          const retry = await fetch(
            `https://api.spotify.com/v1/me/player/play?device_id=${sharedPlayer.deviceId}`,
            {
              method: "PUT",
              headers: { Authorization: `Bearer ${liveToken}`, "Content-Type": "application/json" },
              body: JSON.stringify(state?.context?.uri ? { context_uri: state.context.uri } : {}),
            }
          );
          console.log("Start play (fallback):", retry.status);
          if (retry.ok || retry.status === 204) startedRef.current = true;
        }
        return;
      }

      player.togglePlay();
    };

  useEffect(() => {

    if (!token) {
    console.warn("No token yet, skipping Spotify setup");
    return;
  }

    // One Spotify player for the whole visit. Going Back to the quiz unmounts this
    // component; destroying and re-creating the SDK player then left the new one
    // unregistered when play was pressed. So it's created once and reused.
    const setup = () => {
      let player = sharedPlayer.player;

      if (!player) {
        player = new window.Spotify.Player({
          name: "Web Playback SDK Quick Start Player",
          getOAuthToken: (cb) => {
            // preview mode has no real login, so don't ask the backend
            if (token === "preview-token") return cb(token);
            currentToken(token).then(cb);
          },
          volume: 0.5,
        });
        sharedPlayer.player = player;

        // Ready
        player.addListener("ready", ({ device_id }) => {
          console.log("Ready with Device ID", device_id);
          sharedPlayer.deviceId = device_id;
        });

        // Not Ready
        player.addListener("not_ready", ({ device_id }) => {
          console.log("Device ID has gone offline", device_id);
          if (sharedPlayer.deviceId === device_id) sharedPlayer.deviceId = null;
        });

        // The SDK couldn't start (often the browser's protected-audio/DRM step).
        // Play will reconnect and try again; see waitForDevice.
        player.addListener('initialization_error', ({ message }) => {
            console.error(message);
            sharedPlayer.deviceId = null;
        });

        player.addListener('authentication_error', ({ message }) => {
            console.error(message);
        });

        player.addListener('account_error', ({ message }) => {
            console.error(message);
        });

        player.connect();
      }

      playerRef.current = player;

      // (re)attach this screen's state updates
      player.removeListener("player_state_changed");
      player.addListener("player_state_changed", (state) => {
        if (!state)
          return;
        setTrack(state.track_window.current_track);
        setPaused(!state.paused);
        setPosition(state.position);
        setDuration(state.duration);

        if (!state.paused)
          setStarted(true);

        });
    };

    window.onSpotifyWebPlaybackSDKReady = setup;
    // Coming back to the player (e.g. after "‹ Quiz"): the SDK is already loaded
    // and won't announce itself again, so set up straight away.
    if (window.Spotify?.Player) setup();

        if (!document.querySelector('script[src="https://sdk.scdn.co/spotify-player.js"]')) {
      const script = document.createElement("script");
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.async = true;
      document.body.appendChild(script);
    }

    return () => {
      // keep the player alive for next time; just stop updating this screen
      playerRef.current?.removeListener("player_state_changed");
    };
  }, [token]);

  // Move the progress bar forward while a song is playing
  const isPlaying = started && paused;
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => setPosition((p) => p + 500), 500);
    return () => clearInterval(timer);
  }, [isPlaying]);

  const art = ART[theme] || ART.lightForest;
  const cover = (started && track?.album?.images?.[0]?.url) || albumPlaceholder;
  const progress = duration ? Math.min(position / duration, 1) : 0;

  return (
    <main className={`player-card ${theme}`}>
      {/* scenery */}
      <img className="player-layer player-bg" src={art.bg} alt="" />
      <div className="player-layer player-bushes" style={{ "--bush-mask": `url("${bushMask}")` }}>
        <img src={art.bush} alt="" />
      </div>
      <div className="player-layer player-fireflies" aria-hidden="true" dangerouslySetInnerHTML={{ __html: art.fireflies }} />
      <img className="player-layer" src={art.grass} width="349" height="371" alt="" />

      {/* Back to the quiz — top-left corner of the widget */}
      {onBack && (
        <div className="back-pill">
          <button type="button" onClick={() => { playerRef.current?.pause(); onBack(); }}>
            ‹ Quiz
          </button>
        </div>
      )}

      {/* Save / open the forest mix — top-right corner of the widget */}
      {mixStatus === "ready" && (
        <div className="mix-pill">
          {saveStatus === "saved" && savedUrl ? (
            <a href={savedUrl} target="_blank" rel="noreferrer" title={`Open "${mix.name}" in Spotify`}>
              <img src={spotifyWhite} width="14" height="14" alt="" /> Open in Spotify
            </a>
          ) : saveStatus === "saved" ? (
            <span>✓ Saved</span>
          ) : (
            <button type="button" onClick={handleSaveMix} disabled={saveStatus === "saving"} title="Save this mix as a private playlist">
              {saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Retry save" : "+ Save mix"}
            </button>
          )}
        </div>
      )}

      {/* album cover in the portal */}
      <div className="player-portal">
        <div className="player-cover" style={{ "--portal-mask": `url("${portalMask}")` }}>
          {/* swirling portal until the first song starts, then the album cover fades in */}
          <PortalVortex hidden={started} />
          {started && (
            <img className="player-cover-art" src={cover} alt={track?.album?.name || ""} />
          )}
        </div>
        <img className="player-frame" src={art.portal} width="166.84" height="201.24" alt="" />
      </div>

      <div className="player-info">
        {started && track ? (
          <>
            <p className="player-title">{track.name}</p>
            <p className="player-artist">{track.artists.map((a) => a.name).join(", ")}</p>
          </>
        ) : (
          <>
            <p className="player-title">{playerRef ? "Connected." : "Connecting…"}</p>
            <p className="player-artist">
              {playerProblem ? playerProblem
                : mixStatus === "loading" ? "Gathering your forest mix…"
                : mixStatus === "ready" ? `${mix.name} · ${mix.uris.length} songs · press play`
                : "Press play to start"}
            </p>
          </>
        )}
      </div>

      <div className="player-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        <div className="player-played" style={{ width: `${progress * 100}%` }} />
      </div>

      <div className="player-controls">
        <button className="player-btn" aria-label="Previous track" onClick={() => playerRef.current?.previousTrack()}>
          <img src={art.prev} width="73" height="37" alt="" />
        </button>

        <button className="player-btn" aria-label={!started ? "Start playing" : paused ? "Pause" : "Play"} onClick={handlePlayPause}>
          <img src={!started ? art.play : paused ? art.pause : art.play} width="73" height="37" alt="" />
        </button>

        <button className="player-btn" aria-label="Next track" onClick={() => playerRef.current?.nextTrack()}>
          <img src={art.next} width="73" height="37" alt="" />
        </button>
      </div>
    </main>
  );
}

export default SpotifyPlayer;
