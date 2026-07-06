// frontend/src/features/accounting/pages/Documents/Invoice/ProductRow/Tablefooter.tsx
import { useTranslation } from "react-i18next";
import { type ColumnDef, colVisibilityClass, printSize } from "../Interface";

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
  viewMode?: boolean;
}

const fmt = (n: number) => n.toLocaleString("ru-RU", { minimumFractionDigits: 2 });
const fmt3 = (n: number) => n.toLocaleString("ru-RU", { minimumFractionDigits: 3 });

const PHYSICAL_KEYS = ["weight", "volume_m3", "length", "width", "height"] as const;

const TableFooter = ({ isPosted, subtotal, discAmount, total, totalIncome, totalWeight, totalVolume, totalLength, totalWidth, totalHeight, columns, viewMode }: TableFooterProps) => {
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
      <tr className={`border-t-2 border-black divide-x divide-black dark:bg-slate-700 ${viewMode ? "bg-gray-100" : "bg-gray-200 print:bg-gray-100"}`}>
        {columns.map((col, idx) => {
          const visClass = colVisibilityClass(col);

          const pad = viewMode ? "px-1 py-0.5" : "px-2 py-1.5 print:px-1 print:py-0.5";

          if (incomeColIdx !== -1 && idx === incomeColIdx - 1) {
            return (
              <td key={col.key} className={`${pad} text-right text-xs text-gray-900 dark:text-gray-300 ${visClass}`}>
                {t("TotalIncome")}:
              </td>
            );
          }

          if (incomeColIdx !== -1 && idx === incomeColIdx) {
            return (
              <td key={col.key} className={`${pad} text-right font-mono font-semibold ${viewMode ? "text-xs" : "print:text-xs"} ${totalIncome >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"} ${visClass}`}>
                {fmt(totalIncome)}
              </td>
            );
          }

          if ((PHYSICAL_KEYS as readonly string[]).includes(col.key)) {
            return (
              <td key={col.key} className={`${pad} text-right font-mono text-xs font-semibold text-gray-900 dark:text-gray-100 ${visClass}`}>
                {fmt3(physicalValues[col.key] ?? 0)}
              </td>
            );
          }

          if (idx === productColIdx && incomeColIdx === -1) {
            return (
              <td key={col.key} className={`${pad} text-right text-xs text-gray-900 dark:text-gray-300 ${visClass}`}>
                {t("Total")}:
              </td>
            );
          }

          return <td key={col.key} className={visClass} />;
        })}

        {trailingCell > 0 && <td className={printSize(viewMode, "print:hidden")} />}
      </tr>
    );
  };

  const renderRow = (
    label: string,
    value: string,
    targetIdx: number,
    valueClass = "font-mono font-semibold text-gray-900 dark:text-gray-100",
    labelClass = "text-sm text-gray-900 dark:text-gray-300",
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

    // ✅ В viewMode (read-only просмотр — см. DocumentViewPage.tsx) нам нужна не
    // "экранная", а именно "печатная" метка (приглушённый мелкий текст) — просто
    // меняем, какая из двух ячеек видима, вместо print:-варианта из colVisibilityClass.
    const screenLabelClass = viewMode ? "hidden" : "print:hidden";
    const printLabelClass = viewMode ? "table-cell px-1 py-0.5 text-sm" : "hidden print:table-cell print:px-1 print:py-0.5 print:text-sm";

    return (
      <tr className={`border-t-2 border-black divide-x divide-black dark:bg-slate-700 ${viewMode ? "bg-gray-100" : "bg-gray-200 print:bg-gray-100"}`}>
        <td colSpan={screenSpan} className={`px-2 py-1.5 text-right ${screenLabelClass} ${labelClass}`}>
          {label}
        </td>
        <td colSpan={printSpan} className={`text-right text-xs text-gray-500 dark:text-gray-400 ${printLabelClass}`}>
          {label}
        </td>

        {columns.map((col, idx) => {
          if (idx < targetIdx) return null;
          const visClass = colVisibilityClass(col);

          if (idx === targetIdx) {
            // ✅ В печати ВСЕ итоговые строки (подытог/скидка/итого) выравниваются
            // на один размер (text-xl), даже если на экране "Итого" крупнее
            // остальных (text-3xl) — тот же паритет нужен и в viewMode, поэтому
            // убираем экранный text-* размер из valueClass, а не добавляем поверх.
            const sizeStripped = valueClass.replace(/\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)\b/g, "");
            const finalValueClass = viewMode ? `${sizeStripped} text-xl` : `${valueClass} print:text-xl`;
            const pad = viewMode ? "px-1 py-0.5" : "px-2 py-1.5 print:px-1 print:py-0.5";
            return (
              <td key={col.key} className={`${pad} text-right ${finalValueClass} ${visClass}`}>
                {value}
              </td>
            );
          }

          return <td key={col.key} className={visClass} />;
        })}

        {trailingCell > 0 && <td className={printSize(viewMode, "print:hidden")} />}
      </tr>
    );
  };

  return (
    <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_6px_-4px_rgba(0,0,0,0.15)]">
      {/* ✅ Если скидки нет — "Подытог" и "Сумма после скидки" совпадают, показываем
          только одну итоговую строку "Сумма:", а не два одинаковых числа подряд. */}
      {discAmount > 0.004 ? (
        <>
          {renderRow(t("Subtotal") + ":", fmt(subtotal), totalColIdx, "font-mono text-base text-gray-900 dark:text-gray-100")}

          {/* Скидка — суммарно построчные скидки (акции/ручные) + скидка документа; якорим
              на "Итого" (как в Excel-экспорте), а не на саму колонку discount_amount, которая
              может быть скрыта только в экране или только в печати. */}
          {renderRow(`${t("Discount")}:`, `−${fmt(discAmount)}`, totalColIdx, "font-mono text-base font-semibold text-orange-700 dark:text-orange-300")}

          {/* Сумма после скидки — главная итоговая цифра документа, делаем огромной */}
          {renderRow(
            t("TotalAfterDiscount") + ":",
            fmt(total),
            totalColIdx,
            "font-mono font-extrabold text-3xl text-gray-900 dark:text-white",
            "text-base font-semibold text-gray-600 dark:text-gray-300",
          )}
        </>
      ) : (
        renderRow(
          t("Subtotal") + ":",
          fmt(total),
          totalColIdx,
          "font-mono font-extrabold text-3xl text-gray-900 dark:text-white",
          "text-base font-semibold text-gray-600 dark:text-gray-300",
        )
      )}

      {/* Итого доход + итого по физическим характеристикам (вес/объём/длина/ширина/высота) — в одной строке */}
      {renderIncomeAndPhysicalRow()}
    </tfoot>
  );
};

export default TableFooter;
