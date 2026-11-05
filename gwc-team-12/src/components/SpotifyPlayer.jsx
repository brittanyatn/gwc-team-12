import { useEffect, useRef } from "react";

function SpotifyPlayer({ token }) {
  const playerRef = useRef(null);

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
    };

    return () => {
      playerRef.current?.disconnect();
    };
  }, [token]);

  return (
    <main>

        <button onClick={() => playerRef.current?.activateElement()}>
      Activate Player
    </button>

        <button onClick={() => playerRef.current?.togglePlay()}>
            Toggle Play
        </button>
    </main>
  );
}

export default SpotifyPlayer;