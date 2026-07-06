// frontend/src/features/accounting/pages/Documents/Invoice/ProductRow/PromoRows.tsx
import { useTranslation } from "react-i18next";
import { Trash2, Gift } from "lucide-react";
import { type ItemRow, type ColumnDef, colVisibilityClass, printSize } from "../Interface";

interface PromoRowsProps {
  isPosted: boolean;
  promoItems: ItemRow[];
  lineTotal: (row: ItemRow) => number;
  onRemove: (row: ItemRow) => void;
  columns: ColumnDef[];
  selectedCell: { key: string; colIndex: number } | null;
  onSelectCell: (key: string, colIndex: number) => void;
  onPreviewImage: (productId: number | null) => void;
  viewMode?: boolean;
}

const fmt = (n: number) => n.toLocaleString("ru-RU", { minimumFractionDigits: 2 });
const fmt3 = (v: string | undefined) => (v ? parseFloat(v).toLocaleString("ru-RU", { minimumFractionDigits: 3 }) : "—");

const PromoRows = ({ isPosted, promoItems, lineTotal, onRemove, columns, selectedCell, onSelectCell, onPreviewImage, viewMode }: PromoRowsProps) => {
  const { t } = useTranslation();

  if (!promoItems.length) return null;

  return (
    <>
      {/* Разделитель */}
      <tr className={printSize(viewMode, "print:hidden")}>
        <td colSpan={columns.length + (isPosted ? 0 : 1)}>
          <div className="flex items-center gap-2 px-2 py-1 bg-emerald-50 dark:bg-emerald-900/10 border-y border-black">
            <Gift className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{t("PromoBonus")}</span>
          </div>
        </td>
      </tr>

      {promoItems.map((row) => (
        <tr
          key={row._key}
          data-selectable-row
          className={`border-b border-black divide-x divide-black hover:bg-emerald-100 dark:hover:bg-emerald-900/20 transition-colors focus-within:bg-emerald-100/80 dark:focus-within:bg-emerald-900/30 focus-within:ring-2 focus-within:ring-inset focus-within:ring-emerald-400 dark:focus-within:ring-emerald-500 ${printSize(viewMode, "print:!bg-transparent print:!ring-0")} ${
            selectedCell?.key === row._key ? "bg-emerald-100/80 dark:bg-emerald-900/30 ring-2 ring-inset ring-emerald-400 dark:ring-emerald-500" : "bg-emerald-50/50 dark:bg-emerald-900/5"
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
                  ${isCellSelected ? "ring-2 ring-inset ring-emerald-600 bg-emerald-200/70 dark:bg-emerald-800/40" : ""}
                `}
              >
                <PromoCellContent col={col} row={row} lineTotal={lineTotal} onPreviewImage={onPreviewImage} viewMode={viewMode} />
              </td>
            );
          })}

          {!isPosted && (
            <td className="px-1 py-1 print:hidden">
              <button onClick={() => onRemove(row)} className="p-1 text-emerald-400 hover:text-red-500 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </td>
          )}
        </tr>
      ))}
    </>
  );
};

// ── Ячейка promo-строки — полностью read-only, авторассчитывается ────────────

const PromoCellContent = ({
  col,
  row,
  lineTotal,
  onPreviewImage,
  viewMode,
}: {
  col: ColumnDef;
  row: ItemRow;
  lineTotal: (row: ItemRow) => number;
  onPreviewImage: (productId: number | null) => void;
  viewMode?: boolean;
}) => {
  const { t } = useTranslation();

  switch (col.key) {
    case "index":
      return <Gift className="w-3.5 h-3.5 text-emerald-400 mx-auto" />;

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
        <div className="w-8 h-8 rounded bg-emerald-100 dark:bg-emerald-900/30 mx-auto" />
      );

    case "sku":
      return <span className="text-xs text-gray-400 dark:text-gray-500">{row.sku || "—"}</span>;

    case "barcode":
      return <span className="text-xs font-mono text-gray-400 dark:text-gray-500">{row.barcode || "—"}</span>;

    case "product":
      return (
        <span className={`font-medium text-emerald-700 dark:text-emerald-300 italic ${viewMode ? "text-xl" : "text-lg print:text-xl"}`}>
          {row.product_name} <span className="text-[10px]">({t("Free")})</span>
        </span>
      );

    case "unit":
      return <span className="text-xs text-gray-500 whitespace-nowrap">{row.unit_name || "—"}</span>;

    case "quantity":
      return <span className={`block text-right text-emerald-600 dark:text-emerald-400 font-medium ${viewMode ? "text-xl" : "text-base print:text-xl"}`}>+{row.quantity}</span>;

    case "price":
      return <span className={`block text-right font-mono text-emerald-600 dark:text-emerald-400 ${viewMode ? "text-xl" : "text-base print:text-xl"}`}>0.00</span>;

    case "discount_percent":
    case "discount_amount":
    case "cost_price":
      return <span className="block text-right text-gray-400">—</span>;

    case "total":
      return <span className={`block text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400 ${viewMode ? "text-xl" : "text-base print:text-xl"}`}>{fmt(lineTotal(row))}</span>;

    case "income":
    case "income_percent":
      return <span className="block text-right text-gray-400">—</span>;

    case "weight":
      return <span className="block text-right text-xs text-gray-500">{fmt3(row.weight)}</span>;

    case "volume_m3":
      return <span className="block text-right text-xs text-gray-500">{fmt3(row.volume_m3)}</span>;

    case "length":
      return <span className="block text-right text-xs text-gray-500">{fmt3(row.length)}</span>;

    case "width":
      return <span className="block text-right text-xs text-gray-500">{fmt3(row.width)}</span>;

    case "height":
      return <span className="block text-right text-xs text-gray-500">{fmt3(row.height)}</span>;

    default:
      return null;
  }
};

export default PromoRows;
