// frontend/src/features/accounting/pages/Dashboard/chartPalette.ts
// ✅ Валидированная категориальная палитра (см. skill dataviz/references/palette.md) —
// порядок слотов фиксирован и НЕ является косметикой (максимизирует минимальную
// разницу ΔE между соседними цветами для colorblind-safety), поэтому цвет всегда
// назначается по фиксированному индексу слота, никогда не берётся "следующий
// свободный" и никогда не переставляется по рангу/сортировке данных.
export const CATEGORICAL_PALETTE: { light: string; dark: string }[] = [
  { light: "#2a78d6", dark: "#3987e5" }, // blue
  { light: "#1baf7a", dark: "#199e70" }, // aqua
  { light: "#eda100", dark: "#c98500" }, // yellow
  { light: "#008300", dark: "#008300" }, // green
  { light: "#4a3aa7", dark: "#9085e9" }, // violet
  { light: "#e34948", dark: "#e66767" }, // red
  { light: "#e87ba4", dark: "#d55181" }, // magenta
  { light: "#eb6834", dark: "#d95926" }, // orange
];
// ✅ 9-й+ ряд никогда не получает "сгенерированный" повторный оттенок (см.
// anti-patterns.md) — сверх 8 складов лишние сворачиваются в "Прочие" (серый).
export const OTHER_COLOR = { light: "#898781", dark: "#898781" };

export const CHART_INK = {
  primary: { light: "#0b0b0b", dark: "#ffffff" },
  secondary: { light: "#52514e", dark: "#c3c2b7" },
  muted: { light: "#898781", dark: "#898781" },
  gridline: { light: "#e1e0d9", dark: "#2c2c2a" },
  baseline: { light: "#c3c2b7", dark: "#383835" },
  surface: { light: "#fcfcfb", dark: "#1a1a19" },
};

/**
 * Стабильное назначение цвета складу — по возрастанию warehouse_id, а не по
 * рангу выручки в текущем ответе (см. правило "цвет закреплён за сущностью,
 * а не за её рангом" — иначе один и тот же склад менял бы цвет при смене
 * периода просто потому, что поменялось место в сортировке по выручке).
 * Свыше 8 складов — остаток сворачивается вызывающей стороной в "Прочие".
 */
export function buildWarehouseColorMap(warehouseIds: number[]): Map<number, { light: string; dark: string }> {
  const sortedIds = [...new Set(warehouseIds)].sort((a, b) => a - b);
  const map = new Map<number, { light: string; dark: string }>();
  sortedIds.forEach((id, i) => {
    map.set(id, i < CATEGORICAL_PALETTE.length ? CATEGORICAL_PALETTE[i] : OTHER_COLOR);
  });
  return map;
}
