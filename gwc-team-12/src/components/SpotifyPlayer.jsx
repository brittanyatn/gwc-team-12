import { useEffect, useRef, useState } from "react";

function SpotifyPlayer({ token }) {
  const playerRef = useRef(null);
  const [track, setTrack] = useState(null);
  const [paused, setPaused] = useState(true);
  const deviceIdRef = useRef(null);
  const startedRef = useRef(false);
  const [started, setStarted] = useState(false);



    const handlePlayPause = async () => {
      const player = playerRef.current;
      if (!player) return;

      player.activateElement();

      if (!startedRef.current) {
        const state = await player.getCurrentState();
        const res = await fetch(
          `https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(
              state?.context?.uri ? { context_uri: state.context.uri } : {}
            ),
          }
        );
        console.log("Start play:", res.status);
        if (res.ok || res.status === 204) startedRef.current = true;
        return;
      }

      player.togglePlay();
    };

  useEffect(() => {

    if (!token) {
    console.warn("No token yet, skipping Spotify setup");
    return;
  }
    window.onSpotifyWebPlaybackSDKReady = () => {
      const player = new window.Spotify.Player({
        name: "Web Playback SDK Quick Start Player",
        getOAuthToken: (cb) => {
          cb(token);

        },
        volume: 0.5,
      });

      // Ready
      player.addListener("ready", ({ device_id }) => {
        
        console.log("Ready with Device ID", device_id);
        deviceIdRef.current = device_id;
        });

      // Not Ready
      player.addListener("not_ready", ({ device_id }) => {
        console.log("Device ID has gone offline", device_id);
      });

        player.addListener('initialization_error', ({ message }) => {
            console.error(message);
        });

        player.addListener('authentication_error', ({ message }) => {
            console.error(message);
        });

        player.addListener('account_error', ({ message }) => {
            console.error(message);
        });

      playerRef.current = player;
      player.connect();

      player.addListener("player_state_changed", (state) => {
        if (!state) 
          return; 
        setTrack(state.track_window.current_track);
        setPaused(!state.paused);

        if (!state.paused) 
          setStarted(true);

        });

     
    };

        if (!document.querySelector('script[src="https://sdk.scdn.co/spotify-player.js"]')) {
      const script = document.createElement("script");
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.async = true;
      document.body.appendChild(script);
    }

    return () => {
      playerRef.current?.disconnect();
    };
  }, [token]);

  return (
    <main>

      {playerRef &&
      (
        <div>Connected.</div>
      )}

      {started && track && (
        <div>
          <img src={track.album?.images?.[0]?.url} alt={track.album?.name} width={200} />
          <p>{track.name}</p>
          <p>{track.artists.map((a) => a.name).join(", ")}</p>
        </div>
      )}

        <button onClick={() => playerRef.current?.previousTrack()}>
          ⏮
        </button>

  
        <div>
        <button onClick={handlePlayPause}>
          {!started ? "Start playing" : paused ? "⏸" : "▶"}
        </button>

        <button onClick={() => playerRef.current?.nextTrack()}>
            ⏭
        </button>
        </div>
    
    </main>
  );
}

export default SpotifyPlayer;