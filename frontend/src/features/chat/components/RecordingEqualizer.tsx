// frontend/src/features/chat/components/RecordingEqualizer.tsx
import { useEffect, useRef } from "react";

interface Props {
  analyser: AnalyserNode | null;
}

const BAR_COUNT = 24;
const MAX_BAR_HEIGHT = 24;
const MIN_BAR_HEIGHT = 3;

export const RecordingEqualizer: React.FC<Props> = ({ analyser }) => {
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!analyser) return;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const step = Math.max(1, Math.floor(dataArray.length / BAR_COUNT));

    const draw = () => {
      analyser.getByteFrequencyData(dataArray);
      for (let i = 0; i < BAR_COUNT; i++) {
        const value = dataArray[i * step] || 0;
        const height = Math.max(MIN_BAR_HEIGHT, (value / 255) * MAX_BAR_HEIGHT);
        const bar = barsRef.current[i];
        if (bar) bar.style.height = `${height}px`;
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [analyser]);

  return (
    <div className="flex items-center gap-[2px] h-6 flex-1 overflow-hidden">
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <div
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          className="w-[3px] rounded-full bg-red-500 shrink-0"
          style={{ height: MIN_BAR_HEIGHT }}
        />
      ))}
    </div>
  );
};
