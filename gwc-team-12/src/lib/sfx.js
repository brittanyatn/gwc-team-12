// Sound effects for "DJ spin that shit" and the wait before the first song.
//
// The files live in public/sounds/. Each click on "DJ spin that shit" plays ONE of the
// DJ_SOUNDS at random (never the same one twice in a row), then the ambient loop
// plays until the music starts. To add a sound: put the file in public/sounds/ and
// add its name to DJ_SOUNDS. A file that's missing is skipped.
const DJ_SOUNDS = [
  "dj-scratch.mp3", // record scratch (made for this app)
  "fah.mp3",        // the "FAHHH" meme sound (add the file yourself)
];
const AMBIENT = "ambient-forest.mp3"; // soft forest loop (made for this app)

export const VOLUME = { dj: 0.85, ambient: 0.35 };
const AMBIENT_LATEST_MS = 2500; // ambient fades in when the DJ sound ends, or by this time

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
  clearTimeout(ambientTimer);
  const a = ambient;
  ambient = null;
  if (!a) return;
  fade(a, 0, ms, () => a.pause());
}

let lastDj = null;

// Play a random DJ sound; if that file is missing, try the others.
function playRandomDj(onDone) {
  const order = DJ_SOUNDS.filter((f) => f !== lastDj).sort(() => Math.random() - 0.5);
  if (lastDj && DJ_SOUNDS.includes(lastDj)) order.push(lastDj); // repeat only as a last resort
  const tryNext = () => {
    const file = order.shift();
    if (!file) return onDone();
    const audio = new Audio(url(file));
    audio.volume = VOLUME.dj;
    audio.addEventListener("ended", onDone, { once: true });
    audio.play()
      .then(() => { lastDj = file; })
      .catch(() => { console.info(`[sfx] couldn't play ${url(file)} (missing file?)`); tryNext(); });
  };
  tryNext();
}

// "DJ spin that shit": one random DJ sound, then the ambient loop until the music starts.
export function playDjSpin() {
  clearTimeout(ambientTimer);
  ambientTimer = setTimeout(startAmbient, AMBIENT_LATEST_MS);
  playRandomDj(startAmbient);
}
