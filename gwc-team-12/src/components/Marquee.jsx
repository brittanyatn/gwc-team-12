import { useLayoutEffect, useRef, useState } from "react";

// Text that doesn't fit its line scrolls sideways in a loop: it pauses, slides left
// until a second copy is where the first one started, then repeats.
// Text that fits just sits still. With "Reduce motion" on, it doesn't move (see Forest.css).
const GAP = 40;    // px between the end of the text and the copy that follows it
const SPEED = 30;  // px per second
const PAUSE = 0.2; // share of each loop spent resting at the start

export default function Marquee({ children, className = "", as: Tag = "p" }) {
  const box = useRef(null);
  const text = useRef(null);
  const [scroll, setScroll] = useState(null); // { distance, duration } when it overflows

  useLayoutEffect(() => {
    const measure = () => {
      if (!box.current || !text.current) return;
      const width = text.current.scrollWidth;
      const over = width - box.current.clientWidth;
      setScroll(over > 1 ? { distance: width + GAP, duration: (width + GAP) / SPEED / (1 - PAUSE) } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box.current);
    ro.observe(text.current);
    document.fonts?.ready.then(measure); // web fonts change text width once they load
    return () => ro.disconnect();
  }, [children]);

  return (
    <Tag ref={box} className={`marquee ${scroll ? "is-scrolling" : ""} ${className}`}>
      <span
        className="marquee-track"
        style={scroll ? { "--marquee-distance": `${scroll.distance}px`, "--marquee-duration": `${scroll.duration}s`, gap: `${GAP}px` } : undefined}
      >
        <span ref={text}>{children}</span>
        {scroll && <span aria-hidden="true">{children}</span>}
      </span>
    </Tag>
  );
}
