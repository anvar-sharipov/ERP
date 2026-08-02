// frontend/src/components/ui/Charts/BarChart.tsx
import { useState } from "react";

// ✅ Горизонтальный bar-chart для сравнения величины по категориям (категории/
// бренды/каналы и т.д. — где подписи длинные, горизонтальные бары читаются
// лучше вертикальных). Один ряд — один цвет (identity здесь не нужна, это
// сравнение величины, не серии), по спецификации /dataviz (marks-and-anatomy.md):
// бар ≤24px, 4px скруглённый конец, подпись-значение у конца бара, hover
// поднимает бар и показывает точный тултип.
export interface BarChartItem {
  label: string;
  value: number;
}

interface BarChartProps {
  data: BarChartItem[];
  formatValue?: (v: number) => string;
  emptyText?: string;
  barHeight?: number;
}

export const BarChart = ({ data, formatValue = (v) => v.toLocaleString("ru-RU"), emptyText = "", barHeight = 22 }: BarChartProps) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!data.length) {
    return <div className="flex items-center justify-center text-sm text-gray-400 py-8">{emptyText}</div>;
  }

  const maxValue = Math.max(...data.map((d) => Math.abs(d.value)), 1);

  return (
    <div className="space-y-1.5">
      {data.map((d, i) => {
        const pct = Math.max((Math.abs(d.value) / maxValue) * 100, d.value !== 0 ? 1.5 : 0);
        const isHover = hoverIdx === i;
        return (
          <div
            key={i}
            className="relative flex items-center gap-2 cursor-default"
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
          >
            <div className="w-28 md:w-40 shrink-0 text-xs text-gray-600 dark:text-gray-300 truncate text-right" title={d.label}>
              {d.label}
            </div>
            <div className="flex-1 relative" style={{ height: barHeight }}>
              <div className="absolute inset-0 rounded-full bg-gray-100 dark:bg-gray-800" />
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-all ${isHover ? "bg-indigo-600 dark:bg-indigo-400" : "bg-indigo-500 dark:bg-indigo-500"}`}
                style={{ width: `${pct}%`, minWidth: d.value !== 0 ? 4 : 0 }}
              />
            </div>
            <div className="w-20 md:w-24 shrink-0 text-xs font-medium tabular-nums text-gray-800 dark:text-gray-100">{formatValue(d.value)}</div>
          </div>
        );
      })}
    </div>
  );
};
