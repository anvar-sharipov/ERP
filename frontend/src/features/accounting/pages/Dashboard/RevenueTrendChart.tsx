// frontend/src/features/accounting/pages/Dashboard/RevenueTrendChart.tsx
import { useId, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useIsDarkMode } from "../../../../core/hooks/useIsDarkMode";
import { useMeasuredWidth } from "../../../../core/hooks/useMeasuredWidth";
import { CATEGORICAL_PALETTE, CHART_INK } from "./chartPalette";

export interface RevenueTrendPoint {
  date: string;
  revenue: string;
}

interface Props {
  data: RevenueTrendPoint[];
}

const fmt = (v: number) => v.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
// ✅ "31.08"/"18.11" было нечитаемо — не видно ни названия месяца, ни года
// (за период длиннее года, например TV-режим/дашборд за "Год", это делает подписи
// неоднозначными). Подписи оси — день + короткое имя месяца ("31 авг"), плюс год
// ("31 авг '26"), если период захватывает больше одного календарного года.
// Подсказка при наведении — с полным (длинным) именем месяца, там места хватает.
const fmtAxisDate = (d: string, showYear: boolean) =>
  new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", ...(showYear ? { year: "2-digit" } : {}) });
const fmtTooltipDate = (d: string) => new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });

const HEIGHT = 200;
const PAD_LEFT = 56; // ✅ место под шкалу цен слева (подписи значений по Y)
const PAD_RIGHT = 12;
const PAD_TOP = 24;
const PAD_BOTTOM = 26;
const Y_TICK_COUNT = 4;
const TOOLTIP_W = 108;
const TOOLTIP_H = 30;

// ✅ Плавная кривая через все точки (Catmull-Rom → кубический Безье, uniform) —
// как в Google Finance/курсах валют, вместо ломаной линии по прямым сегментам.
// Никакой сторонней библиотеки — чистая геометрия, работает офлайн.
const smoothPath = (points: { x: number; y: number }[]) => {
  if (points.length < 2) return "";
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
};

export const RevenueTrendChart = ({ data }: Props) => {
  const { t } = useTranslation();
  const isDark = useIsDarkMode();
  const mode = isDark ? "dark" : "light";
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const gradientId = useId();

  const { ref, width } = useMeasuredWidth();
  const values = useMemo(() => data.map((d) => Number(d.revenue)), [data]);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(1, ...values);
  const plotWidth = Math.max(1, width - PAD_LEFT - PAD_RIGHT);
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const ink = {
    primary: CHART_INK.primary[mode],
    secondary: CHART_INK.secondary[mode],
    gridline: CHART_INK.gridline[mode],
    baseline: CHART_INK.baseline[mode],
  };
  const lineColor = CATEGORICAL_PALETTE[0][mode];

  if (data.length === 0) {
    return <div className="text-center py-8 text-gray-400 text-xs md:text-sm">{t("NoDataForPeriod")}</div>;
  }

  const range = maxValue - minValue || 1;
  const pointX = (i: number) => (data.length === 1 ? PAD_LEFT + plotWidth / 2 : PAD_LEFT + (i / (data.length - 1)) * plotWidth);
  const pointY = (v: number) => PAD_TOP + plotHeight - ((v - minValue) / range) * plotHeight;
  const baselineY = pointY(Math.max(minValue, 0));

  const points = values.map((v, i) => ({ x: pointX(i), y: pointY(v) }));
  const linePath = smoothPath(points);
  const areaPath = points.length > 1
    ? `${linePath} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`
    : "";

  // ✅ Подписи по оси X — как в Google-графиках: несколько равномерных отметок,
  // а не только первая/последняя дата.
  const tickCount = Math.min(5, data.length);
  const tickIdx = Array.from(new Set(
    Array.from({ length: tickCount }, (_, i) => Math.round((i / Math.max(1, tickCount - 1)) * (data.length - 1))),
  ));
  const showYear = new Date(data[0].date).getFullYear() !== new Date(data[data.length - 1].date).getFullYear();

  // ✅ Шкала цен слева — несколько горизонтальных отметок по значению (min…max),
  // как курс валют/Google Finance, а не только сама кривая без осей.
  const yTicks = Array.from({ length: Y_TICK_COUNT }, (_, i) => minValue + (range * i) / (Y_TICK_COUNT - 1));

  return (
    <div ref={ref} className="w-full">
      <svg viewBox={`0 0 ${width} ${HEIGHT}`} style={{ width: "100%", height: HEIGHT, display: "block" }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity={0.28} />
            <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* ✅ Шкала цен слева — гридлайны + подписи значений */}
        {yTicks.map((v, i) => {
          const y = pointY(v);
          return (
            <g key={i}>
              <line x1={PAD_LEFT} y1={y} x2={width - PAD_RIGHT} y2={y} stroke={ink.gridline} strokeWidth={1} />
              <text x={PAD_LEFT - 8} y={y + 3} textAnchor="end" fontSize={10} fill={ink.secondary}>
                {fmt(v)}
              </text>
            </g>
          );
        })}

        <line x1={PAD_LEFT} y1={baselineY} x2={width - PAD_RIGHT} y2={baselineY} stroke={ink.baseline} strokeWidth={1} />

        {/* ✅ motion.path — при обновлении данных (WS push) кривая плавно
            "перетекает" в новую форму, а не мгновенно перерисовывается. */}
        {areaPath && (
          <motion.path
            fill={`url(#${gradientId})`}
            stroke="none"
            initial={false}
            animate={{ d: areaPath }}
            transition={{ duration: 0.6, ease: "easeInOut" }}
          />
        )}
        <motion.path
          fill="none"
          stroke={lineColor}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ d: linePath }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
        />

        {values.map((v, i) => {
          const boxX = Math.min(Math.max(pointX(i) - TOOLTIP_W / 2, 2), width - TOOLTIP_W - 2);
          const boxY = Math.max(pointY(v) - TOOLTIP_H - 10, 2);
          return (
            <g
              key={data[i].date}
              // ✅ Обработчики — на всей группе (точка + подсказка), а не на отдельном
              // sibling-rect'е: подсказка — ДОЧЕРНИЙ элемент этой же группы, значит
              // наведение на неё саму не считается "уходом" с точки (см. комментарий
              // выше про мерцание на пиках — тот же паттерн, что уже работает в
              // RevenueByWarehouseChart.tsx).
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              style={{ cursor: "pointer" }}
            >
              {/* увеличенная невидимая цель для наведения */}
              <rect
                x={pointX(i) - Math.max(12, plotWidth / Math.max(data.length, 1) / 2)}
                y={0}
                width={Math.max(24, plotWidth / Math.max(data.length, 1))}
                height={HEIGHT}
                fill="transparent"
              />
              {hoverIdx === i && (
                <>
                  <line x1={pointX(i)} y1={PAD_TOP} x2={pointX(i)} y2={HEIGHT - PAD_BOTTOM} stroke={ink.gridline} strokeWidth={1} strokeDasharray="3 3" />
                  <circle cx={pointX(i)} cy={pointY(v)} r={5} fill={lineColor} stroke={mode === "dark" ? "#1a1a19" : "#fcfcfb"} strokeWidth={2} />
                  <rect
                    x={boxX}
                    y={boxY}
                    width={TOOLTIP_W}
                    height={TOOLTIP_H}
                    rx={6}
                    fill={mode === "dark" ? "#1a1a19" : "#fcfcfb"}
                    stroke={ink.baseline}
                    strokeWidth={1}
                  />
                  <text x={boxX + TOOLTIP_W / 2} y={boxY + 12} textAnchor="middle" fontSize={9.5} fill={ink.secondary}>
                    {fmtTooltipDate(data[i].date)}
                  </text>
                  <text x={boxX + TOOLTIP_W / 2} y={boxY + 24} textAnchor="middle" fontSize={12} fontWeight={700} fill={ink.primary}>
                    {fmt(v)}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {tickIdx.map((i) => (
          <text
            key={i}
            x={pointX(i)}
            y={HEIGHT - 8}
            textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
            fontSize={11}
            fill={ink.secondary}
          >
            {fmtAxisDate(data[i].date, showYear)}
          </text>
        ))}
      </svg>
    </div>
  );
};
