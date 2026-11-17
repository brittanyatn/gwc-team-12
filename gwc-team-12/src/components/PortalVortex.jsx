// Swirling portal shown inside the album window before the first song plays.
// Spiral arms are drawn as SVG paths and rotated with CSS (see .vortex in Forest.css).
// Colours come from the theme: arms + glow use the lightest theme colour.

// Centre of the visible portal window inside the 200 × 200 drawing
const CX = 100;
const CY = 91;

// One Archimedean spiral arm (r grows steadily with the angle), as an SVG path
function spiralPath(startAngle, turns = 1.6, growth = 10.5, start = 3) {
  const end = turns * 2 * Math.PI;
  let d = "";
  for (let t = 0; t <= end; t += 0.12) {
    const r = start + growth * t;
    const x = CX + r * Math.cos(t + startAngle);
    const y = CY + r * Math.sin(t + startAngle);
    d += `${d ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)} `;
  }
  return d;
}

// Fewer, wider arms = bigger spirals
const ARMS = 4;
const ARM_PATHS = Array.from({ length: ARMS }, (_, i) =>
  spiralPath((i / ARMS) * 2 * Math.PI, 1.25, 16, 4));
// a second set offset between the first, for depth
const ARM_PATHS_BACK = Array.from({ length: ARMS }, (_, i) =>
  spiralPath(((i + 0.5) / ARMS) * 2 * Math.PI, 1.15, 17, 8));

export default function PortalVortex({ hidden }) {
  return (
    <svg
      className={`vortex ${hidden ? "is-hidden" : ""}`}
      viewBox="0 0 200 200"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="vortex-bg" cx={CX / 200} cy={CY / 200} r="0.65">
          <stop offset="0" className="vortex-stop-light" />
          <stop offset="1" className="vortex-stop-edge" />
        </radialGradient>
        <radialGradient id="vortex-core" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" className="vortex-stop-light" stopOpacity="1" />
          <stop offset="0.45" className="vortex-stop-light" stopOpacity="0.55" />
          <stop offset="1" className="vortex-stop-light" stopOpacity="0" />
        </radialGradient>
        {/* arms fade out toward the rim of the portal */}
        <radialGradient id="vortex-fade" cx={CX / 200} cy={CY / 200} r="0.55">
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.7" stopColor="#fff" stopOpacity="0.7" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="vortex-mask">
          <rect width="200" height="200" fill="url(#vortex-fade)" />
        </mask>
        <filter id="vortex-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>

      <rect width="200" height="200" fill="url(#vortex-bg)" />

      <g mask="url(#vortex-mask)">
        {/* slower, softer back layer */}
        <g className="vortex-spin vortex-spin--slow">
          {ARM_PATHS_BACK.map((d, i) => (
            <path key={i} d={d} className="vortex-arm vortex-arm--back" />
          ))}
        </g>
        {/* main arms: blurred glow underneath, crisp line on top */}
        <g className="vortex-spin">
          {ARM_PATHS.map((d, i) => (
            <path key={`g${i}`} d={d} className="vortex-arm vortex-arm--glow" filter="url(#vortex-glow)" />
          ))}
          {ARM_PATHS.map((d, i) => (
            <path key={i} d={d} className="vortex-arm" />
          ))}
        </g>
      </g>

      {/* bright centre */}
      <circle className="vortex-core" cx={CX} cy={CY} r="26" fill="url(#vortex-core)" />
    </svg>
  );
}
