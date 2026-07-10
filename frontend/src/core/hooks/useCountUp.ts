import { useEffect, useRef, useState } from "react";

// ✅ Плавная "прокрутка" числа от старого к новому значению (ease-out) —
// используется на плитках дашборда, чтобы обновление по WebSocket-пушу
// выглядело "живым", а не мгновенной сменой цифр.
export const useCountUp = (target: number, duration = 700) => {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = target;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) {
      setDisplay(to);
      fromRef.current = to;
      return;
    }

    const start = performance.now();
    const animate = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return display;
};
