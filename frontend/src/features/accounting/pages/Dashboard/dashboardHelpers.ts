// frontend/src/features/accounting/pages/Dashboard/dashboardHelpers.ts

interface HasWarehouse {
  warehouse_id: number;
}

interface DailyRow {
  date: string;
  revenue: string;
}

// ✅ Пустое множество = фильтр не активен, показываем все склады (та же логика,
// что и у остальных отчётов: "ничего не выбрано" = весь доступный набор).
export const filterByWarehouse = <T extends HasWarehouse>(rows: T[], selectedIds: Set<number>): T[] =>
  selectedIds.size === 0 ? rows : rows.filter((r) => selectedIds.has(r.warehouse_id));

// ✅ daily с бэкенда сгруппирован по (дата, склад) — здесь сворачиваем в одну
// точку на дату (сумма по уже отфильтрованному подмножеству складов), чтобы
// тренд-график корректно реагировал на фильтр складов в сайдбаре.
export const aggregateDailyByDate = (rows: DailyRow[]): DailyRow[] => {
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(r.date, (map.get(r.date) ?? 0) + Number(r.revenue));
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, revenue]) => ({ date, revenue: String(revenue) }));
};

const toIso = (d: Date) => d.toISOString().slice(0, 10);

// ✅ Предыдущий период той же длительности, сразу перед текущим — например для
// 30.06–09.07 (10 дней) предыдущий это 20.06–29.06. periodFrom/periodTo пустые
// (например до гидратации useDateStore) — валидного периода ещё нет, отдаём "".
export const getPreviousPeriod = (periodFrom: string, periodTo: string) => {
  if (!periodFrom || !periodTo) return { prevFrom: "", prevTo: "" };

  const from = new Date(periodFrom);
  const to = new Date(periodTo);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return { prevFrom: "", prevTo: "" };

  const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;

  const prevTo = new Date(from);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - (days - 1));

  return { prevFrom: toIso(prevFrom), prevTo: toIso(prevTo) };
};

export interface Delta {
  pct: number | null; // null = нет предыдущих данных для сравнения (не 0, а именно "не с чем сравнить")
  isNew: boolean; // текущий период есть, предыдущий = 0 — "новое", а не "-100%/+100%"
}

export const computeDelta = (current: number, prev: number): Delta => {
  if (prev === 0) {
    if (current === 0) return { pct: 0, isNew: false };
    return { pct: null, isNew: true };
  }
  return { pct: ((current - prev) / Math.abs(prev)) * 100, isNew: false };
};
