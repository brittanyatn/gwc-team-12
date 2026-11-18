// Sound effects for "DJ spin that shit" and the wait before the first song.
//
// The files live in public/sounds/. Each click on "DJ spin that shit" plays ONE of the
// DJ_SOUNDS at random (a fresh pick every time). The ambient loop plays only while
// the player page is open, until the music starts (see SpotifyPlayer.jsx). To add a sound: put the file in public/sounds/ and
// add its name to DJ_SOUNDS. A file that's missing is skipped.
const DJ_SOUNDS = [
  "fah.mp3",        // the "FAHHH" meme sound
  "vine-boom.mp3",  // the Vine boom
];
const AMBIENT = "ambient-forest.mp3"; // soft forest loop (made for this app)

export const VOLUME = { dj: 0.85, ambient: 0.35 };
const AMBIENT_LATEST_MS = 2500; // after a DJ sound, ambient waits for it to end (at most this long)

const url = (file) => `/sounds/${file}`;

// Smoothly move an <audio>'s volume to `to` over `ms`, then call `done`.
function fade(audio, to, ms, done) {
  clearInterval(audio._fade);
  const from = audio.volume;
  const steps = Math.max(1, Math.round(ms / 50));
  let i = 0;
  audio._fade = setInterval(() => {
    i++;
    audio.volume = Math.min(1, Math.max(0, from + (to - from) * (i / steps)));
    if (i >= steps) { clearInterval(audio._fade); done?.(); }
  }, 50);
}

let ambient = null;
let ambientTimer = null;
let ambientGen = 0; // bumped by stopAmbient so a pending start is cancelled

export function startAmbient() {
  clearTimeout(ambientTimer);
  if (ambient) return;
  ambient = new Audio(url(AMBIENT));
  ambient.loop = true;
  ambient.volume = 0;
  ambient.play()
    .then(() => fade(ambient, VOLUME.ambient, 1500))
    .catch(() => { console.info("[sfx] ambient loop couldn't play"); ambient = null; });
}

export function stopAmbient(ms = 1200) {
  ambientGen++;
  clearTimeout(ambientTimer);
  const a = ambient;
  ambient = null;
  if (!a) return;
  fade(a, 0, ms, () => a.pause());
}

let djAudio = null; // the DJ sound currently playing, if any

// Play a random DJ sound; if that file is missing, try the others.
function playRandomDj(onDone) {
  const order = [...DJ_SOUNDS].sort(() => Math.random() - 0.5); // random order; first that plays wins
  const tryNext = () => {
    const file = order.shift();
    if (!file) return onDone();
    const audio = new Audio(url(file));
    audio.volume = VOLUME.dj;
    djAudio = audio;
    audio.addEventListener("ended", () => { if (djAudio === audio) djAudio = null; onDone(); }, { once: true });
    audio.play()
      .catch(() => { console.info(`[sfx] couldn't play ${url(file)} (missing file?)`); tryNext(); });
  };
  tryNext();
}

// "DJ spin that shit": one random DJ sound.
export function playDjSpin() {
  playRandomDj(() => {});
}

// The player page opened: start the ambient loop, after the DJ sound if one is playing.
export function ambientForPlayer() {
  clearTimeout(ambientTimer);
  const gen = ambientGen;
  const dj = djAudio;
  if (dj && !dj.ended) {
    const go = () => {
      if (gen !== ambientGen) return; // the player page closed or the music started
      clearTimeout(ambientTimer);
      startAmbient();
    };
    dj.addEventListener("ended", go, { once: true });
    ambientTimer = setTimeout(() => { dj.removeEventListener("ended", go); go(); }, AMBIENT_LATEST_MS);
  } else {
    startAmbient();
  }
}
