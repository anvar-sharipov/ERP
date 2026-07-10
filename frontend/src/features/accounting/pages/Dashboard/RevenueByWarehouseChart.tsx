// frontend/src/features/accounting/pages/Dashboard/RevenueByWarehouseChart.tsx
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useIsDarkMode } from "../../../../core/hooks/useIsDarkMode";
import { useMeasuredWidth } from "../../../../core/hooks/useMeasuredWidth";
import { OTHER_COLOR, CHART_INK, buildWarehouseColorMap } from "./chartPalette";

export interface RevenueByWarehouseRow {
  warehouse_id: number;
  warehouse_name: string;
  revenue: string;
}

interface Props {
  data: RevenueByWarehouseRow[];
}

const fmt = (v: number) => v.toLocaleString("ru-RU", { maximumFractionDigits: 0 });

const HEIGHT = 220;
const PAD_TOP = 26;
const PAD_BOTTOM = 36;
const PAD_X = 12;
const MAX_BAR_W = 72;

export const RevenueByWarehouseChart = ({ data }: Props) => {
  const { t } = useTranslation();
  const isDark = useIsDarkMode();
  const mode = isDark ? "dark" : "light";
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const { ref, width } = useMeasuredWidth();

  const colorMap = useMemo(() => buildWarehouseColorMap(data.map((d) => d.warehouse_id)), [data]);

  const values = data.map((d) => Number(d.revenue));
  const maxValue = Math.max(1, ...values);
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const plotWidth = Math.max(1, width - PAD_X * 2);
  const slot = data.length > 0 ? plotWidth / data.length : plotWidth;
  const barW = Math.min(MAX_BAR_W, slot * 0.5);

  const ink = {
    primary: CHART_INK.primary[mode],
    secondary: CHART_INK.secondary[mode],
    baseline: CHART_INK.baseline[mode],
  };

  if (data.length === 0) {
    return <div className="text-center py-10 text-gray-400 text-xs md:text-sm">{t("NoDataForPeriod")}</div>;
  }

  return (
    <div ref={ref} className="w-full">
      <svg viewBox={`0 0 ${width} ${HEIGHT}`} style={{ width: "100%", height: HEIGHT, display: "block" }}>
        <line x1={PAD_X} y1={HEIGHT - PAD_BOTTOM} x2={width - PAD_X} y2={HEIGHT - PAD_BOTTOM} stroke={ink.baseline} strokeWidth={1} />

        {data.map((row, i) => {
          const value = values[i];
          const barH = maxValue > 0 ? (value / maxValue) * plotHeight : 0;
          const slotCenter = PAD_X + i * slot + slot / 2;
          const x = slotCenter - barW / 2;
          const y = HEIGHT - PAD_BOTTOM - barH;
          const color = colorMap.get(row.warehouse_id) ?? OTHER_COLOR;
          const fill = color[mode];
          const isHovered = hoverIdx === i;

          return (
            <g
              key={row.warehouse_id}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              style={{ cursor: "pointer" }}
            >
              {/* ✅ motion.rect — бар плавно "дорастает"/"садится" до новой высоты
                  при обновлении данных (WS push), а не мгновенно перескакивает. */}
              <motion.rect
                x={x}
                width={barW}
                rx={4}
                fill={fill}
                initial={false}
                animate={{ y, height: Math.max(barH, 1), opacity: isHovered ? 0.85 : 1 }}
                transition={{ type: "spring", stiffness: 120, damping: 18 }}
              />
              {/* прямая подпись значения над баром */}
              <motion.text
                x={slotCenter}
                textAnchor="middle"
                fontSize={12}
                fill={ink.primary}
                fontWeight={600}
                initial={false}
                animate={{ y: y - 8 }}
                transition={{ type: "spring", stiffness: 120, damping: 18 }}
              >
                {fmt(value)}
              </motion.text>
              {/* название склада под баром */}
              <text x={slotCenter} y={HEIGHT - PAD_BOTTOM + 18} textAnchor="middle" fontSize={11} fill={ink.secondary}>
                {row.warehouse_name.length > 16 ? `${row.warehouse_name.slice(0, 15)}…` : row.warehouse_name}
              </text>

              {isHovered && (
                <g>
                  <rect
                    x={Math.min(Math.max(slotCenter - 60, 2), width - 122)}
                    y={y - 38}
                    width={120}
                    height={26}
                    rx={4}
                    fill={mode === "dark" ? "#1a1a19" : "#fcfcfb"}
                    stroke={ink.baseline}
                    strokeWidth={1}
                  />
                  <text
                    x={Math.min(Math.max(slotCenter - 60, 2), width - 122) + 60}
                    y={y - 21}
                    textAnchor="middle"
                    fontSize={11}
                    fill={ink.primary}
                  >
                    {row.warehouse_name}: {fmt(value)}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
