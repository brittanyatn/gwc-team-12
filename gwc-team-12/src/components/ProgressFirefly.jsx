import { useEffect, useRef, useState } from "react";
import fireflyLight from "../assets/forest/firefly-light.png";
import fireflyDark from "../assets/forest/firefly-dark.png";

// The song progress tracker: a firefly that slides along the progress bar and leaves
// a trail of glitter behind it while music plays. Styles are in Forest.css.
const ART = { lightForest: fireflyLight, darkForest: fireflyDark };
const GLITTER_EVERY_MS = 90; // how often a new sparkle appears
const GLITTER_LIFE_MS = 1000;
const MAX_GLITTER = 24;
const TAIL_OFFSET = 11; // px behind the firefly's body where the glitter starts

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function ProgressFirefly({ progress, playing, theme }) {
  const wrap = useRef(null);
  const bug = useRef(null);
  const last = useRef(progress);
  const [glitter, setGlitter] = useState([]);

  // jumping backwards (new song, skip) snaps instead of sliding back
  const jump = progress < last.current - 0.02;
  useEffect(() => { last.current = progress; }, [progress]);

  // glitter: while playing, drop sparkles where the firefly's tail is right now
  useEffect(() => {
    if (!playing || reducedMotion()) return;
    let id = 0;
    const timer = setInterval(() => {
      if (!wrap.current || !bug.current) return;
      const box = wrap.current.getBoundingClientRect();
      const b = bug.current.getBoundingClientRect();
      const x = b.left - box.left + b.width * 0.41 - TAIL_OFFSET + (Math.random() * 6 - 3);
      const sparkle = {
        id: `${Date.now()}-${id++}`,
        x,
        y: Math.random() * 10 - 5,
        size: 2 + Math.random() * 2.5,
        driftX: -(4 + Math.random() * 8),
        driftY: 3 + Math.random() * 7,
        star: Math.random() < 0.3,
        hue: Math.floor(Math.random() * 3),
      };
      setGlitter((g) => [...g.slice(-(MAX_GLITTER - 1)), sparkle]);
      setTimeout(() => setGlitter((g) => g.filter((s) => s.id !== sparkle.id)), GLITTER_LIFE_MS);
    }, GLITTER_EVERY_MS);
    return () => clearInterval(timer);
  }, [playing]);

  return (
    <div ref={wrap} className={`firefly-track ${playing ? "is-playing" : ""}`} aria-hidden="true">
      {glitter.map((s) => (
        <span
          key={s.id}
          className={`glitter glitter-${s.hue} ${s.star ? "glitter-star" : ""}`}
          style={{
            left: `${s.x}px`,
            top: `calc(50% + ${s.y}px)`,
            width: `${s.size * (s.star ? 2 : 1)}px`,
            height: `${s.size * (s.star ? 2 : 1)}px`,
            "--drift-x": `${s.driftX}px`,
            "--drift-y": `${s.driftY}px`,
            animationDuration: `${GLITTER_LIFE_MS}ms`,
          }}
        />
      ))}
      <img
        ref={bug}
        className={`firefly ${jump ? "no-slide" : ""}`}
        src={ART[theme] || fireflyLight}
        style={{ left: `${progress * 100}%` }}
        width="30"
        height="25"
        alt=""
      />
    </div>
  );
}
