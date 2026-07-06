// frontend/src/features/accounting/pages/Accounting/productTurnoverGrouping.ts
// ✅ Общая логика группировки (по категории/по бренду) — используется и экраном
// (ProductTurnoverPage.tsx, переключатель "Группировка" в сайдбаре), и обоими
// Excel-экспортами (exportProductTurnoverExcel.ts/exportProductTurnoverByBrandExcel.ts),
// чтобы они не могли разойтись между собой (см. правило в CLAUDE.md). Вынесено в
// отдельный модуль (а не в саму страницу), чтобы экспортам не пришлось импортировать
// страницу обратно (циклический импорт).
import { emptyTotals, addToTotals, type ProductTurnoverRow, type GroupedRow } from "../../../../components/ui/Table/ProductTurnoverTable";

export function groupByCategory(rows: ProductTurnoverRow[]): GroupedRow[] {
  const sorted = [...rows].sort((a, b) => a.category_name.localeCompare(b.category_name) || a.name.localeCompare(b.name));
  const grouped: GroupedRow[] = [];
  let currentCategory: string | null = null;
  let categoryTotals = emptyTotals();
  let counter = 1;
  const grandTotals = emptyTotals();

  sorted.forEach((row, idx) => {
    if (row.category_name !== currentCategory) {
      if (currentCategory !== null) {
        grouped.push({ type: "subtotal", id: `${currentCategory}_total`, totals: categoryTotals });
      }
      categoryTotals = emptyTotals();
      grouped.push({ type: "category", id: row.category_name, name: row.category_name });
      currentCategory = row.category_name;
    }
    grouped.push({ type: "product", displayNumber: counter++, ...row });
    addToTotals(categoryTotals, row);
    addToTotals(grandTotals, row);

    if (idx === sorted.length - 1) {
      grouped.push({ type: "subtotal", id: `${currentCategory}_total`, totals: categoryTotals });
      grouped.push({ type: "grand_total", id: "grand_total", totals: grandTotals });
    }
  });

  return grouped;
}

export function groupByBrand(rows: ProductTurnoverRow[]): GroupedRow[] {
  const sorted = [...rows].sort((a, b) => a.brand_name.localeCompare(b.brand_name) || a.name.localeCompare(b.name));
  const grouped: GroupedRow[] = [];
  let current: string | null = null;
  let totals = emptyTotals();
  const grandTotals = emptyTotals();
  let counter = 1;

  sorted.forEach((row, idx) => {
    if (row.brand_name !== current) {
      if (current !== null) grouped.push({ type: "subtotal", id: `${current}_total`, totals });
      totals = emptyTotals();
      grouped.push({ type: "category", id: row.brand_name, name: row.brand_name });
      current = row.brand_name;
    }
    grouped.push({ type: "product", displayNumber: counter++, ...row });
    addToTotals(totals, row);
    addToTotals(grandTotals, row);

    if (idx === sorted.length - 1) {
      grouped.push({ type: "subtotal", id: `${current}_total`, totals });
      grouped.push({ type: "grand_total", id: "grand_total", totals: grandTotals });
    }
  });

  return grouped;
}
