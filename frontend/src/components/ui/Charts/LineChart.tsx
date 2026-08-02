// frontend/src/components/ui/Charts/LineChart.tsx
import { useMemo, useRef, useState } from "react";

// ✅ Общий линейный график для раздела "Аналитика" (динамика продаж и т.д.) —
// построен вручную на SVG по спецификации из /dataviz skill (references/marks-and-anatomy.md,
// interaction.md): линия 2px с закруглёнными концами, заливка ~10% под линией,
// hairline-сетка, курсор-crosshair + тултип на hover/touch, конечная точка-маркер
// с кольцом в цвет поверхности. Один ряд — легенда не нужна (её роль играет
// заголовок карточки). Цвет — indigo, фирменный акцент этого приложения (see
// CLAUDE.md: dark:-классы, а не сырые hex — компонент уже тема-совместим).
export interface LineChartPoint {
  label: string;
  value: number;
}

interface LineChartProps {
  data: LineChartPoint[];
  height?: number;
  formatValue?: (v: number) => string;
  emptyText?: string;
}

const VB_W = 1000;

const niceStep = (range: number) => {
  if (range <= 0) return 1;
  const rough = range / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / pow;
  const step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return step * pow;
};

export const LineChart = ({ data, height = 220, formatValue = (v) => v.toLocaleString("ru-RU"), emptyText = "" }: LineChartProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const { points, ticks } = useMemo(() => {
    if (!data.length) return { points: [] as { x: number; y: number }[], ticks: [] as number[] };
    const values = data.map((d) => d.value);
    const rawMax = Math.max(...values, 0);
    const rawMin = Math.min(...values, 0);
    const step = niceStep(rawMax - rawMin);
    const maxY = Math.ceil(rawMax / step) * step || step;
    const minY = Math.min(0, Math.floor(rawMin / step) * step);
    const tickList: number[] = [];
    for (let v = minY; v <= maxY + 1e-9; v += step) tickList.push(Math.round(v * 100) / 100);

    const n = data.length;
    const scaleY = (v: number) => (maxY === minY ? height / 2 : height - ((v - minY) / (maxY - minY)) * height);
    const pointList = data.map((d, i) => ({
      x: n === 1 ? VB_W / 2 : (i / (n - 1)) * VB_W,
      y: scaleY(d.value),
    }));
    return { points: pointList, ticks: tickList };
  }, [data, height]);

  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-sm text-gray-400" style={{ height }}>
        {emptyText}
      </div>
    );
  }

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(2)},${height} L${points[0].x.toFixed(2)},${height} Z`;

  const updateHover = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const ratio = (clientX - rect.left) / rect.width;
    const idx = data.length === 1 ? 0 : Math.round(ratio * (data.length - 1));
    setHoverIdx(Math.max(0, Math.min(data.length - 1, idx)));
  };

  // ✅ Подписи по X прорежены (не более ~8), иначе на большом периоде (день за год)
  // подписи налезают друг на друга — тот же принцип, что "не подписывать каждую точку".
  const labelEvery = Math.max(1, Math.ceil(data.length / 8));
  const hoverPoint = hoverIdx != null ? points[hoverIdx] : null;
  const tooltipAlign = hoverIdx === 0 ? "left" : hoverIdx === data.length - 1 ? "right" : "center";

  return (
    <div
      ref={containerRef}
      className="relative select-none"
      onMouseMove={(e) => updateHover(e.clientX)}
      onMouseLeave={() => setHoverIdx(null)}
      onTouchMove={(e) => e.touches[0] && updateHover(e.touches[0].clientX)}
      onTouchEnd={() => setHoverIdx(null)}
    >
      <svg viewBox={`0 0 ${VB_W} ${height}`} width="100%" height={height} preserveAspectRatio="none" className="overflow-visible">
        {ticks.map((t) => {
          const ty = height - ((t - ticks[0]) / (ticks[ticks.length - 1] - ticks[0] || 1)) * height;
          return (
            <g key={t}>
              <line x1={0} y1={ty} x2={VB_W} y2={ty} className="stroke-gray-200 dark:stroke-gray-700" strokeWidth={1} />
              <text x={2} y={ty - 4} className="fill-gray-400" fontSize={11}>
                {formatValue(t)}
              </text>
            </g>
          );
        })}

        <path d={areaPath} className="fill-indigo-500/10" stroke="none" />
        <path d={linePath} className="stroke-indigo-500 dark:stroke-indigo-400" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />

        {hoverPoint && <line x1={hoverPoint.x} y1={0} x2={hoverPoint.x} y2={height} className="stroke-gray-300 dark:stroke-gray-600" strokeWidth={1} />}

        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={hoverIdx === i ? 5 : 4}
            className={`fill-indigo-500 dark:fill-indigo-400 stroke-white dark:stroke-gray-900 ${hoverIdx === i || data.length === 1 ? "opacity-100" : "opacity-0"}`}
            strokeWidth={2}
          />
        ))}
      </svg>

      <div className="flex justify-between mt-1 px-0.5">
        {data.map((d, i) => (
          <span key={i} className={`text-[10px] text-gray-400 whitespace-nowrap ${i % labelEvery === 0 || i === data.length - 1 ? "" : "invisible"}`}>
            {d.label}
          </span>
        ))}
      </div>

      {hoverPoint && (
        <div
          className="absolute top-1 pointer-events-none px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg text-xs whitespace-nowrap z-10"
          style={{
            left: `${(hoverPoint.x / VB_W) * 100}%`,
            transform: `translateX(${tooltipAlign === "left" ? "0%" : tooltipAlign === "right" ? "-100%" : "-50%"})`,
          }}
        >
          <div className="text-gray-400">{data[hoverIdx!].label}</div>
          <div className="font-semibold text-gray-800 dark:text-gray-100">{formatValue(data[hoverIdx!].value)}</div>
        </div>
      )}
    </div>
  );
};
