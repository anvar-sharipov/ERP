// frontend/src/features/accounting/pages/Documents/Invoice/ProductRow/Tablefooter.tsx
import { useTranslation } from "react-i18next";
import { type ColumnDef, colVisibilityClass } from "../Interface";

interface TableFooterProps {
  isPosted: boolean;
  subtotal: number;
  discAmount: number;
  total: number;
  totalIncome: number;
  totalWeight: number;
  totalVolume: number;
  totalLength: number;
  totalWidth: number;
  totalHeight: number;
  columns: ColumnDef[];
}

const fmt = (n: number) => n.toLocaleString("ru-RU", { minimumFractionDigits: 2 });
const fmt3 = (n: number) => n.toLocaleString("ru-RU", { minimumFractionDigits: 3 });

const PHYSICAL_KEYS = ["weight", "volume_m3", "length", "width", "height"] as const;

const TableFooter = ({ isPosted, subtotal, discAmount, total, totalIncome, totalWeight, totalVolume, totalLength, totalWidth, totalHeight, columns }: TableFooterProps) => {
  const { t } = useTranslation();

  const trailingCell = !isPosted ? 1 : 0;

  const totalColIdx = columns.findIndex((c) => c.key === "total");
  const incomeColIdx = columns.findIndex((c) => c.key === "income");

  const physicalValues: Partial<Record<string, number>> = {
    weight: totalWeight,
    volume_m3: totalVolume,
    length: totalLength,
    width: totalWidth,
    height: totalHeight,
  };
  const hasPhysicalCols = columns.some((c) => (PHYSICAL_KEYS as readonly string[]).includes(c.key));
  const productColIdx = columns.findIndex((c) => c.key === "product");

  // ✅ Итого доход и итого по физическим характеристикам объединены в одну строку —
  // они занимают разные колонки и не пересекаются, отдельная строка не нужна.
  const renderIncomeAndPhysicalRow = () => {
    if (incomeColIdx === -1 && !hasPhysicalCols) return null;

    return (
      <tr className="border-t-2 border-black divide-x divide-black bg-gray-400 dark:bg-slate-700 print:bg-gray-100">
        {columns.map((col, idx) => {
          const visClass = colVisibilityClass(col);

          if (incomeColIdx !== -1 && idx === incomeColIdx - 1) {
            return (
              <td key={col.key} className={`px-2 py-1.5 print:px-1 print:py-0.5 text-right text-xs text-gray-500 dark:text-gray-400 ${visClass}`}>
                {t("TotalIncome")}:
              </td>
            );
          }

          if (incomeColIdx !== -1 && idx === incomeColIdx) {
            return (
              <td key={col.key} className={`px-2 py-1.5 print:px-1 print:py-0.5 print:text-xs text-right font-mono font-semibold ${totalIncome >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"} ${visClass}`}>
                {fmt(totalIncome)}
              </td>
            );
          }

          if ((PHYSICAL_KEYS as readonly string[]).includes(col.key)) {
            return (
              <td key={col.key} className={`px-2 py-1.5 print:px-1 print:py-0.5 print:text-xs text-right font-mono text-xs font-semibold text-gray-700 dark:text-gray-300 ${visClass}`}>
                {fmt3(physicalValues[col.key] ?? 0)}
              </td>
            );
          }

          if (idx === productColIdx && incomeColIdx === -1) {
            return (
              <td key={col.key} className={`px-2 py-1.5 print:px-1 print:py-0.5 text-right text-xs text-gray-500 dark:text-gray-400 ${visClass}`}>
                {t("Total")}:
              </td>
            );
          }

          return <td key={col.key} className={visClass} />;
        })}

        {trailingCell > 0 && <td className="print:hidden" />}
      </tr>
    );
  };

  const renderRow = (
    label: string,
    value: string,
    targetIdx: number,
    valueClass = "font-mono font-semibold text-gray-900 dark:text-gray-100",
    labelClass = "text-sm text-gray-500 dark:text-gray-400",
  ) => {
    if (targetIdx === -1) return null;

    // ✅ Метка ("Сумма:", "Скидка:" и т.п.) не может занимать фиксированное число колонок —
    // скрытые (display:none) колонки полностью выпадают из сетки таблицы, и их количество
    // разное для экрана и печати. Поэтому colSpan считаем отдельно на каждый режим и рендерим
    // два варианта ячейки, каждый видимый только в своём режиме (тот же приём, что и в
    // colVisibilityClass — "hidden ... print:table-cell").
    const leadingCols = columns.slice(0, targetIdx);
    const screenSpan = Math.max(leadingCols.filter((c) => c.visibleScreen).length, 1);
    const printSpan = Math.max(leadingCols.filter((c) => c.visiblePrint).length, 1);

    return (
      <tr className="border-t-2 border-black divide-x divide-black bg-gray-400 dark:bg-slate-700 print:bg-gray-100">
        <td colSpan={screenSpan} className={`px-2 py-1.5 text-right print:hidden ${labelClass}`}>
          {label}
        </td>
        <td colSpan={printSpan} className="hidden print:table-cell print:px-1 print:py-0.5 print:text-sm text-right text-xs text-gray-500 dark:text-gray-400">
          {label}
        </td>

        {columns.map((col, idx) => {
          if (idx < targetIdx) return null;
          const visClass = colVisibilityClass(col);

          if (idx === targetIdx) {
            return (
              <td key={col.key} className={`px-2 py-1.5 print:px-1 print:py-0.5 print:text-xl text-right ${valueClass} ${visClass}`}>
                {value}
              </td>
            );
          }

          return <td key={col.key} className={visClass} />;
        })}

        {trailingCell > 0 && <td className="print:hidden" />}
      </tr>
    );
  };

  return (
    <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_6px_-4px_rgba(0,0,0,0.15)]">
      {/* Подытог */}
      {renderRow(t("Subtotal") + ":", fmt(subtotal), totalColIdx, "font-mono text-base text-gray-700 dark:text-gray-300")}

      {/* Скидка — суммарно построчные скидки (акции/ручные) + скидка документа; показываем всегда,
          если сумма скидки не нулевая, НЕЗАВИСИМО от того, скрыта ли колонка discount_amount —
          якорим на "Итого" (как в Excel-экспорте), а не на саму колонку discount_amount, которая
          может быть скрыта только в экране или только в печати. */}
      {discAmount > 0.004 && renderRow(`${t("Discount")}:`, `−${fmt(discAmount)}`, totalColIdx, "font-mono text-base text-orange-500 dark:text-orange-400")}

      {/* Сумма после скидки — главная итоговая цифра документа, делаем огромной */}
      {renderRow(
        t("TotalAfterDiscount") + ":",
        fmt(total),
        totalColIdx,
        "font-mono font-extrabold text-3xl text-gray-900 dark:text-white",
        "text-base font-semibold text-gray-600 dark:text-gray-300",
      )}

      {/* Итого доход + итого по физическим характеристикам (вес/объём/длина/ширина/высота) — в одной строке */}
      {renderIncomeAndPhysicalRow()}
    </tfoot>
  );
};

export default TableFooter;
