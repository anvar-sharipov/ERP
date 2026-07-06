// frontend/src/features/accounting/pages/Documents/Invoice/ProductRow/Bundlerows.tsx
import { useTranslation } from "react-i18next";
import { Trash2, Package } from "lucide-react";
import { type ItemRow, type ColumnDef, colVisibilityClass, printSize } from "../Interface";

const inputCell =
  "w-full px-2 py-1 text-sm border border-amber-200 dark:border-amber-800/60 hover:border-amber-400 dark:hover:border-amber-500 " +
  "focus:border-amber-500 rounded bg-white dark:bg-slate-800/60 focus:bg-white dark:focus:bg-slate-700 " +
  "focus:outline-none focus:ring-1 focus:ring-amber-500/40 shadow-sm transition-colors text-right";

interface BundleRowsProps {
  isPosted: boolean;
  bundleItems: ItemRow[];
  lineTotal: (row: ItemRow) => number;
  updateItem: (key: string, field: keyof ItemRow, value: ItemRow[keyof ItemRow]) => void;
  onRemove: (row: ItemRow) => void;
  columns: ColumnDef[];
  selectedCell: { key: string; colIndex: number } | null;
  onSelectCell: (key: string, colIndex: number) => void;
  onPreviewImage: (productId: number | null) => void;
  viewMode?: boolean;
}

const fmt = (n: number) => n.toLocaleString("ru-RU", { minimumFractionDigits: 2 });

const BundleRows = ({ isPosted, bundleItems, lineTotal, updateItem, onRemove, columns, selectedCell, onSelectCell, onPreviewImage, viewMode }: BundleRowsProps) => {
  const { t } = useTranslation();

  if (!bundleItems.length) return null;

  return (
    <>
      {/* Разделитель */}
      <tr className={printSize(viewMode, "print:hidden")}>
        <td colSpan={columns.length + (isPosted ? 0 : 1)}>
          <div className="flex items-center gap-2 px-2 py-1 bg-amber-50 dark:bg-amber-900/10 border-y border-black">
            <Package className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">{t("BundleComponents")}</span>
          </div>
        </td>
      </tr>

      {bundleItems.map((row) => (
        <tr
          key={row._key}
          data-selectable-row
          className={`border-b border-black divide-x divide-black hover:bg-amber-100 dark:hover:bg-amber-900/20 transition-colors focus-within:bg-amber-100/80 dark:focus-within:bg-amber-900/30 focus-within:ring-2 focus-within:ring-inset focus-within:ring-amber-400 dark:focus-within:ring-amber-500 ${printSize(viewMode, "print:!bg-transparent print:!ring-0")} ${
            selectedCell?.key === row._key ? "bg-amber-100/80 dark:bg-amber-900/30 ring-2 ring-inset ring-amber-400 dark:ring-amber-500" : "bg-amber-50/50 dark:bg-amber-900/5"
          }`}
        >
          {columns.map((col, colIdx) => {
            const isCellSelected = selectedCell?.key === row._key && selectedCell?.colIndex === colIdx;
            return (
              <td
                key={col.key}
                data-row-key={row._key}
                data-col-idx={colIdx}
                onClick={() => onSelectCell(row._key, colIdx)}
                className={`
                  cursor-pointer
                  ${viewMode ? "px-1 py-0.5" : "px-2 py-1 print:px-1 print:py-0.5"}
                  ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : ""}
                  ${colVisibilityClass(col)}
                  ${printSize(viewMode, "print:!bg-transparent print:!ring-0")}
                  ${isCellSelected ? "ring-2 ring-inset ring-amber-600 bg-amber-200/70 dark:bg-amber-800/40" : ""}
                `}
              >
                <BundleCellContent col={col} row={row} isPosted={isPosted} lineTotal={lineTotal} updateItem={updateItem} onPreviewImage={onPreviewImage} viewMode={viewMode} />
              </td>
            );
          })}

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
  onPreviewImage,
  viewMode,
}: {
  col: ColumnDef;
  row: ItemRow;
  isPosted: boolean;
  lineTotal: (row: ItemRow) => number;
  updateItem: (key: string, field: keyof ItemRow, value: ItemRow[keyof ItemRow]) => void;
  onPreviewImage: (productId: number | null) => void;
  viewMode?: boolean;
}) => {
  switch (col.key) {
    case "index":
      // Иконка вместо номера
      return <Package className="w-3.5 h-3.5 text-amber-400 mx-auto" />;

    case "thumbnail":
      return row.thumbnail ? (
        <img
          src={row.thumbnail}
          alt={row.product_name}
          className="w-8 h-8 object-cover rounded mx-auto opacity-75 cursor-zoom-in"
          onClick={(e) => {
            e.stopPropagation();
            onPreviewImage(row.product);
          }}
        />
      ) : (
        <div className="w-8 h-8 rounded bg-amber-100 dark:bg-amber-900/30 mx-auto" />
      );

    case "sku":
      return <span className="text-xs text-gray-400 dark:text-gray-500">{row.sku || "—"}</span>;

    case "barcode":
      return <span className="text-xs font-mono text-gray-400 dark:text-gray-500">{row.barcode || "—"}</span>;

    case "product":
      return <span className={`font-medium text-amber-700 dark:text-amber-300 italic ${viewMode ? "text-xl" : "text-lg print:text-xl"}`}>{row.product_name}</span>;

    case "unit":
      return <span className="text-xs text-gray-500 whitespace-nowrap">{row.unit_name || "—"}</span>;

    case "quantity":
      // Bundle qty — только чтение (рассчитывается автоматически)
      return <span className={`block text-right text-amber-600 dark:text-amber-400 font-medium ${viewMode ? "text-xl" : "text-base print:text-xl"}`}>{row.quantity}</span>;

    case "price":
      // Bundle цену можно редактировать
      return isPosted ? (
        <span className={`block text-right font-mono font-semibold ${viewMode ? "text-xl" : "text-base print:text-xl"}`}>{fmt(parseFloat(row.price) || 0)}</span>
      ) : (
        <>
          <input
            type="number"
            value={row.price}
            min="0"
            step="0.01"
            onChange={(e) => updateItem(row._key, "price", e.target.value)}
            className={`${inputCell} !text-base font-semibold print:hidden`}
          />
          <span className="hidden print:block text-right font-mono print:text-xl">{fmt(parseFloat(row.price) || 0)}</span>
        </>
      );

    case "discount_percent":
      return <span className="block text-right text-gray-400">—</span>;

    case "discount_amount":
      return <span className="block text-right text-gray-400">—</span>;

    case "cost_price":
      return <span className="block text-right text-gray-400">—</span>;

    case "total":
      return <span className={`block text-right font-mono font-semibold text-amber-600 dark:text-amber-400 ${viewMode ? "text-xl" : "text-base print:text-xl"}`}>{fmt(lineTotal(row))}</span>;

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
