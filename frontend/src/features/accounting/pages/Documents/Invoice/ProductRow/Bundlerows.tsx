// frontend/src/features/accounting/pages/Documents/Invoice/ProductRow/Bundlerows.tsx
import { useTranslation } from "react-i18next";
import { Trash2, Package } from "lucide-react";
import { type ItemRow, type ColumnDef } from "../Interface";

const inputCell =
  "w-full px-2 py-1 text-sm border border-transparent hover:border-gray-300 dark:hover:border-slate-500 " +
  "focus:border-indigo-500 rounded bg-transparent focus:bg-white dark:focus:bg-slate-700 " +
  "focus:outline-none transition-colors text-right";

interface BundleRowsProps {
  isPosted: boolean;
  bundleItems: ItemRow[];
  lineTotal: (row: ItemRow) => number;
  updateItem: (key: string, field: keyof ItemRow, value: ItemRow[keyof ItemRow]) => void;
  onRemove: (row: ItemRow) => void;
  columns: ColumnDef[];
}

const fmt = (n: number) => n.toLocaleString("ru-RU", { minimumFractionDigits: 2 });

const BundleRows = ({ isPosted, bundleItems, lineTotal, updateItem, onRemove, columns }: BundleRowsProps) => {
  const { t } = useTranslation();

  if (!bundleItems.length) return null;

  return (
    <>
      {/* Разделитель */}
      <tr className="print:hidden">
        <td colSpan={columns.length + (isPosted ? 0 : 1)}>
          <div className="flex items-center gap-2 px-2 py-1 bg-amber-50 dark:bg-amber-900/10 border-y border-amber-200 dark:border-amber-800/40">
            <Package className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">{t("BundleComponents")}</span>
          </div>
        </td>
      </tr>

      {bundleItems.map((row) => (
        <tr key={row._key} className="border-b border-amber-100 dark:border-amber-900/20 bg-amber-50/30 dark:bg-amber-900/5 hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-colors">
          {columns.map((col) => (
            <td
              key={col.key}
              className={`
                px-2 py-1
                ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : ""}
                ${!col.visiblePrint ? "print:hidden" : ""}
              `}
            >
              <BundleCellContent col={col} row={row} isPosted={isPosted} lineTotal={lineTotal} updateItem={updateItem} />
            </td>
          ))}

          {!isPosted && (
            <td className="px-1 py-1 print:hidden">
              <button onClick={() => onRemove(row)} className="p-1 text-amber-400 hover:text-red-500 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </td>
          )}
        </tr>
      ))}
    </>
  );
};

// ── Ячейка bundle строки ──────────────────────────────────────────────────────

const BundleCellContent = ({
  col,
  row,
  isPosted,
  lineTotal,
  updateItem,
}: {
  col: ColumnDef;
  row: ItemRow;
  isPosted: boolean;
  lineTotal: (row: ItemRow) => number;
  updateItem: (key: string, field: keyof ItemRow, value: ItemRow[keyof ItemRow]) => void;
}) => {
  switch (col.key) {
    case "index":
      // Иконка вместо номера
      return <Package className="w-3.5 h-3.5 text-amber-400 mx-auto" />;

    case "thumbnail":
      return row.thumbnail ? (
        <img src={row.thumbnail} alt={row.product_name} className="w-8 h-8 object-cover rounded mx-auto opacity-75" />
      ) : (
        <div className="w-8 h-8 rounded bg-amber-100 dark:bg-amber-900/30 mx-auto" />
      );

    case "sku":
      return <span className="text-xs text-gray-400 dark:text-gray-500">{row.sku || "—"}</span>;

    case "barcode":
      return <span className="text-xs font-mono text-gray-400 dark:text-gray-500">{row.barcode || "—"}</span>;

    case "product":
      return <span className="text-sm text-amber-700 dark:text-amber-300 italic">{row.product_name}</span>;

    case "unit":
      return <span className="text-xs text-gray-500 whitespace-nowrap">{row.unit_name || "—"}</span>;

    case "quantity":
      // Bundle qty — только чтение (рассчитывается автоматически)
      return <span className="block text-right text-amber-600 dark:text-amber-400 font-medium">{row.quantity}</span>;

    case "price":
      // Bundle цену можно редактировать
      return isPosted ? (
        <span className="block text-right font-mono">{fmt(parseFloat(row.price) || 0)}</span>
      ) : (
        <input type="number" value={row.price} min="0" step="0.01" onChange={(e) => updateItem(row._key, "price", e.target.value)} className={inputCell} />
      );

    case "discount_percent":
      return <span className="block text-right text-gray-400">—</span>;

    case "discount_amount":
      return <span className="block text-right text-gray-400">—</span>;

    case "cost_price":
      return <span className="block text-right text-gray-400">—</span>;

    case "total":
      return <span className="block text-right font-mono font-medium text-amber-600 dark:text-amber-400">{fmt(lineTotal(row))}</span>;

    case "income":
    case "income_percent":
    case "weight":
    case "volume_m3":
    case "length":
    case "width":
    case "height":
      return <span className="block text-right text-gray-400">—</span>;

    default:
      return null;
  }
};

export default BundleRows;

// import { useTranslation } from "react-i18next";
// import { Trash2, Package } from "lucide-react";
// import { type ItemRow } from "../Interface";

// const inputCellBundle =
//   "w-full px-2 py-1 text-sm border border-transparent hover:border-blue-300 dark:hover:border-blue-700 " +
//   "focus:border-blue-400 rounded bg-transparent focus:bg-blue-50 dark:focus:bg-blue-950/30 " +
//   "focus:outline-none transition-colors text-right text-blue-700 dark:text-blue-300";

// interface BundleRowsProps {
//   isPosted: boolean;
//   bundleItems: ItemRow[];
//   lineTotal: (row: ItemRow) => number;
//   updateItem: (key: string, field: keyof ItemRow, value: any) => void;
//   onRemove: (row: ItemRow) => void;
// }

// const BundleRows = ({ isPosted, bundleItems, lineTotal, updateItem, onRemove }: BundleRowsProps) => {
//   const { t } = useTranslation();

//   if (bundleItems.length === 0) return null;

//   return (
//     <>
//       {/* Разделитель */}
//       <tr>
//         <td colSpan={isPosted ? 7 : 8}>
//           <div className="flex items-center gap-2 px-2 py-1 bg-blue-50/60 dark:bg-blue-950/20 border-t border-blue-100 dark:border-blue-900/30">
//             <Package className="w-3 h-3 text-blue-400 shrink-0" />
//             <span className="text-xs text-blue-500 dark:text-blue-400 font-medium">{t("BundleComponents")}</span>
//           </div>
//         </td>
//       </tr>

//       {bundleItems.map((row) => (
//         <tr key={row._key} className="border-b border-blue-100 dark:border-blue-900/30 bg-blue-50/40 dark:bg-blue-950/10 transition-colors">
//           <td className="px-2 py-1">
//             <Package className="w-3 h-3 text-blue-400 mx-auto" />
//           </td>

//           <td className="px-2 py-1 text-blue-700 dark:text-blue-300 font-medium">{row.product_name}</td>

//           <td className="px-2 py-1 text-xs text-blue-500 dark:text-blue-400 whitespace-nowrap">{row.unit_name || "—"}</td>

//           <td className="px-2 py-1">
//             {isPosted ? (
//               <span className="block text-right text-blue-700 dark:text-blue-300">{row.quantity}</span>
//             ) : (
//               <input
//                 type="number"
//                 value={row.quantity}
//                 min="0"
//                 step="0.001"
//                 onChange={(e) => updateItem(row._key, "quantity", e.target.value)}
//                 className={inputCellBundle}
//                 title={t("BundleQuantityTooltip")}
//               />
//             )}
//           </td>

//           <td className="px-2 py-1">
//             {isPosted ? (
//               <span className="block text-right font-mono text-blue-700 dark:text-blue-300">{Number(row.price).toLocaleString("ru-RU", { minimumFractionDigits: 2 })}</span>
//             ) : (
//               <input type="number" value={row.price} min="0" step="0.01" onChange={(e) => updateItem(row._key, "price", e.target.value)} className={inputCellBundle} />
//             )}
//           </td>

//           {/* Скидка — заблокирована */}
//           <td className="px-2 py-1 text-center text-xs text-blue-300 dark:text-blue-600">—</td>

//           <td className="px-2 py-1 text-right font-mono font-medium text-blue-600 dark:text-blue-400">{lineTotal(row).toLocaleString("ru-RU", { minimumFractionDigits: 2 })}</td>

//           {!isPosted && (
//             <td className="px-1 py-1">
//               <button onClick={() => onRemove(row)} className="p-1 text-blue-300 hover:text-blue-500 transition-colors" title={t("RemoveBundle")}>
//                 <Trash2 className="w-4 h-4" />
//               </button>
//             </td>
//           )}
//         </tr>
//       ))}
//     </>
//   );
// };

// export default BundleRows;
