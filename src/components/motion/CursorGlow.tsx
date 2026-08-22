import { useEffect, useRef, useState } from "react";

export function CursorGlow() {
  const glowRef = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const target = useRef({ x: -1000, y: -1000 });
  const current = useRef({ x: -1000, y: -1000 });
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const allowed = window.matchMedia("(pointer: fine)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setEnabled(allowed);
    if (!allowed) return;
    const move = (event: PointerEvent) => { target.current = { x: event.clientX, y: event.clientY }; };
    const tick = () => {
      current.current.x += (target.current.x - current.current.x) * 0.16;
      current.current.y += (target.current.y - current.current.y) * 0.16;
      glowRef.current?.style.setProperty("--cursor-x", `${current.current.x}px`);
      glowRef.current?.style.setProperty("--cursor-y", `${current.current.y}px`);
      frame.current = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", move, { passive: true });
    frame.current = requestAnimationFrame(tick);
    return () => { window.removeEventListener("pointermove", move); if (frame.current) cancelAnimationFrame(frame.current); };
  }, []);

  if (!enabled) return null;
  return <div ref={glowRef} aria-hidden="true" className="cursor-glow pointer-events-none fixed inset-0 z-0 overflow-hidden" />;
}
