// frontend/src/features/accounting/pages/Documents/Invoice/ProductRow/Tablefooter.tsx
import { useTranslation } from "react-i18next";
import { type ColumnDef } from "../Interface";

interface TableFooterProps {
  isPosted: boolean;
  subtotal: number;
  discPercent: number;
  discAmount: number;
  total: number;
  totalIncome: number;
  columns: ColumnDef[];
}

const fmt = (n: number) => n.toLocaleString("ru-RU", { minimumFractionDigits: 2 });

const TableFooter = ({ isPosted, subtotal, discPercent, discAmount, total, totalIncome, columns }: TableFooterProps) => {
  const { t } = useTranslation();

  const trailingCell = !isPosted ? 1 : 0;

  const totalColIdx = columns.findIndex((c) => c.key === "total");
  const discColIdx = columns.findIndex((c) => c.key === "discount_amount");
  const incomeColIdx = columns.findIndex((c) => c.key === "income");

  const renderRow = (label: string, value: string, targetIdx: number, valueClass = "font-mono font-semibold text-gray-900 dark:text-gray-100") => {
    if (targetIdx === -1) return null;

    return (
      <tr className="border-t border-gray-200 dark:border-slate-600 bg-gray-50/80 dark:bg-slate-700/30">
        {columns.map((col, idx) => {
          const hidePrint = !col.visiblePrint ? "print:hidden" : "";

          if (idx === targetIdx - 1) {
            return (
              <td key={col.key} className={`px-2 py-1.5 text-right text-xs text-gray-500 dark:text-gray-400 ${hidePrint}`}>
                {label}
              </td>
            );
          }

          if (idx === targetIdx) {
            return (
              <td key={col.key} className={`px-2 py-1.5 text-right ${valueClass} ${hidePrint}`}>
                {value}
              </td>
            );
          }

          return <td key={col.key} className={hidePrint} />;
        })}

        {trailingCell > 0 && <td className="print:hidden" />}
      </tr>
    );
  };

  return (
    <tfoot>
      {/* Подытог */}
      {renderRow(t("Subtotal") + ":", fmt(subtotal), totalColIdx, "font-mono text-gray-700 dark:text-gray-300")}

      {/* Скидка — только если колонка discount_amount видима и скидка > 0 */}
      {discPercent > 0 && discColIdx !== -1 && renderRow(`${t("Discount")} ${discPercent}%:`, `−${fmt(discAmount)}`, discColIdx, "font-mono text-orange-500 dark:text-orange-400")}

      {/* Итого к оплате */}
      {renderRow(t("TotalPayable") + ":", fmt(total), totalColIdx, "font-mono font-bold text-base text-gray-900 dark:text-white")}

      {/* Итого доход — только если колонка income видима */}
      {incomeColIdx !== -1 &&
        renderRow(t("TotalIncome") + ":", fmt(totalIncome), incomeColIdx, `font-mono font-semibold ${totalIncome >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`)}
    </tfoot>
  );
};

export default TableFooter;

// import { useTranslation } from "react-i18next";

// interface TableFooterProps {
//   isPosted: boolean;
//   subtotal: number;
//   discPercent: number;
//   discAmount: number;
//   total: number;
// }

// const TableFooter = ({ isPosted, subtotal, discPercent, discAmount, total }: TableFooterProps) => {
//   const { t } = useTranslation();

//   return (
//     <tfoot>
//       <tr className="border-t-2 border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/30">
//         <td colSpan={6} className="px-2 py-2 text-right text-sm text-gray-500">
//           {t("Subtotal")}:
//         </td>
//         <td className="px-2 py-2 text-right font-mono font-medium">{subtotal.toLocaleString("ru-RU", { minimumFractionDigits: 2 })}</td>
//         {!isPosted && <td />}
//       </tr>

//       {discPercent > 0 && (
//         <tr className="bg-gray-50 dark:bg-slate-700/30">
//           <td colSpan={6} className="px-2 py-1 text-right text-sm text-red-500">
//             {t("Discount")} {discPercent}%:
//           </td>
//           <td className="px-2 py-1 text-right font-mono text-red-500">−{discAmount.toLocaleString("ru-RU", { minimumFractionDigits: 2 })}</td>
//           {!isPosted && <td />}
//         </tr>
//       )}

//       <tr className="bg-gray-50 dark:bg-slate-700/30">
//         <td colSpan={6} className="px-2 py-2 text-right text-sm font-bold text-gray-700 dark:text-gray-300">
//           {t("TotalPayable")}:
//         </td>
//         <td className="px-2 py-2 text-right font-mono font-bold text-lg">{total.toLocaleString("ru-RU", { minimumFractionDigits: 2 })}</td>
//         {!isPosted && <td />}
//       </tr>
//     </tfoot>
//   );
// };

// export default TableFooter;
