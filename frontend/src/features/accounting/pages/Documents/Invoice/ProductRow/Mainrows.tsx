// frontend/src/features/accounting/pages/Documents/Invoice/ProductRow/Mainrows.tsx
import { useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { type ItemRow, type ColumnDef, colVisibilityClass, printSize } from "../Interface";

const inputCell =
  "w-full px-2 py-1 text-sm border border-gray-300 dark:border-slate-600 hover:border-indigo-400 dark:hover:border-indigo-500 " +
  "focus:border-indigo-500 rounded bg-white dark:bg-slate-800/60 focus:bg-white dark:focus:bg-slate-700 " +
  "focus:outline-none focus:ring-1 focus:ring-indigo-500/40 shadow-sm transition-colors text-right";

interface MainRowsProps {
  isPosted: boolean;
  mainItems: ItemRow[];
  lineTotal: (row: ItemRow) => number;
  updateItem: (key: string, field: keyof ItemRow, value: ItemRow[keyof ItemRow]) => void;
  onQtyChange: (rowKey: string, value: string) => void;
  onRemove: (row: ItemRow) => void;
  onFocusAddSelect: () => void;
  columns: ColumnDef[];
  stockMap?: Map<number, { quantity: number; reserved: number; available: number }>;
  selectedCell: { key: string; colIndex: number } | null;
  onSelectCell: (key: string, colIndex: number) => void;
  onPreviewImage: (productId: number | null) => void;
  viewMode?: boolean;
}

export interface MainRowsHandle {
  focusQty: (index: number) => void;
}

// ── Расчётные колонки ─────────────────────────────────────────────────────────

const calcDiscountAmount = (row: ItemRow): number => {
  const qty = parseFloat(row.quantity) || 0;
  const price = parseFloat(row.price) || 0;
  const disc = parseFloat(row.discount_percent) || 0;
  return qty * price * (disc / 100);
};

const calcIncome = (row: ItemRow): number => {
  const qty = parseFloat(row.quantity) || 0;
  const price = parseFloat(row.price) || 0;
  const cost = parseFloat(row.cost_price) || 0;
  const disc = parseFloat(row.discount_percent) || 0;
  return qty * (price * (1 - disc / 100) - cost);
};

const calcIncomePercent = (row: ItemRow): number => {
  const price = parseFloat(row.price) || 0;
  const cost = parseFloat(row.cost_price) || 0;
  const disc = parseFloat(row.discount_percent) || 0;
  const salePrice = price * (1 - disc / 100);
  if (salePrice === 0) return 0;
  return ((salePrice - cost) / salePrice) * 100;
};

const fmt = (n: number) => n.toLocaleString("ru-RU", { minimumFractionDigits: 2 });
const fmt3 = (v: string | undefined) => (v ? parseFloat(v).toLocaleString("ru-RU", { minimumFractionDigits: 3 }) : "—");

// ── Рендер одной ячейки ───────────────────────────────────────────────────────

const CellContent = ({
  col,
  row,
  mIdx,
  isPosted,
  lineTotal,
  updateItem,
  onQtyChange,
  qtyRef,
  priceRef,
  onQtyKeyDown,
  onPriceKeyDown,
  stockMap,
  onPreviewImage,
  viewMode,
}: {
  col: ColumnDef;
  row: ItemRow;
  mIdx: number;
  isPosted: boolean;
  lineTotal: (row: ItemRow) => number;
  updateItem: (key: string, field: keyof ItemRow, value: ItemRow[keyof ItemRow]) => void;
  onQtyChange: (rowKey: string, value: string) => void;
  qtyRef: (el: HTMLInputElement | null) => void;
  priceRef: (el: HTMLInputElement | null) => void;
  onQtyKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onPriceKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  stockMap?: Map<
    number,
    {
      quantity: number;
      reserved: number;
      available: number;
    }
  >;
  onPreviewImage: (productId: number | null) => void;
  viewMode?: boolean;
}) => {
  const { t } = useTranslation();

  switch (col.key) {
    case "index":
      return <span className="text-gray-400 text-xs">{mIdx + 1}</span>;

    case "thumbnail":
      return row.thumbnail ? (
        <img
          src={row.thumbnail}
          alt={row.product_name}
          className="w-8 h-8 object-cover rounded mx-auto cursor-zoom-in"
          onClick={(e) => {
            e.stopPropagation();
            onPreviewImage(row.product);
          }}
        />
      ) : (
        <div className="w-8 h-8 rounded bg-gray-100 dark:bg-slate-700 mx-auto" />
      );

    case "sku":
      return <span className="text-xs text-gray-500 dark:text-gray-400">{row.sku || "—"}</span>;

    case "barcode":
      return <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{row.barcode || "—"}</span>;

    case "product": {
      const stock = row.product ? stockMap?.get(row.product) : null;
      const fmt3 = (n: number) => (n % 1 === 0 ? String(n) : n.toLocaleString("ru-RU", { maximumFractionDigits: 3 }));
      const stockColor = (a: number) => (a <= 0 ? "text-red-500" : a <= 5 ? "text-orange-500" : "text-emerald-600 dark:text-emerald-400");

      return (
        <div>
          <span className={`${viewMode ? "text-xl" : "text-lg print:text-xl"} font-medium`}>{row.product_name}</span>
          {stock != null && (
            <div className={`flex items-center gap-1.5 text-[10px] mt-0.5 text-gray-400 ${printSize(viewMode, "print:hidden")}`}>
              <span>
                {t("InStock")}: {fmt3(stock.quantity)}
              </span>
              {stock.reserved > 0 && <span className="text-orange-400">−{fmt3(stock.reserved)}</span>}
              <span className={`font-semibold ${stockColor(stock.available)}`}>= {fmt3(stock.available)}</span>
            </div>
          )}
        </div>
      );
    }

    case "unit":
      return <span className="text-xs text-gray-500 whitespace-nowrap">{row.unit_name || "—"}</span>;

    case "quantity":
      return isPosted ? (
        <span className={`block text-right ${viewMode ? "text-xl" : "text-base print:text-xl"}`}>{row.quantity}</span>
      ) : (
        <>
          <input
            ref={qtyRef}
            type="number"
            value={row.quantity}
            min="0.001"
            step="0.001"
            onChange={(e) => onQtyChange(row._key, e.target.value)}
            onKeyDown={onQtyKeyDown}
            className={`${inputCell} !text-base print:hidden`}
          />
          <span className="hidden print:block text-right print:text-xl">{row.quantity}</span>
        </>
      );

    case "cost_price":
      return isPosted ? (
        <span className={`block text-right font-mono ${printSize(viewMode, "print:text-xl")}`}>{fmt3(row.cost_price)}</span>
      ) : (
        <>
          <input type="number" value={row.cost_price} min="0" step="0.001" onChange={(e) => updateItem(row._key, "cost_price", e.target.value)} className={`${inputCell} print:hidden`} />
          <span className="hidden print:block text-right font-mono print:text-xl">{fmt3(row.cost_price)}</span>
        </>
      );

    case "price":
      return isPosted ? (
        <span className={`block text-right font-mono font-semibold ${viewMode ? "text-xl" : "text-base print:text-xl"}`}>{fmt3(row.price)}</span>
      ) : (
        <>
          <input
            ref={priceRef}
            type="number"
            value={row.price}
            min="0"
            step="0.001"
            onChange={(e) => updateItem(row._key, "price", e.target.value)}
            onKeyDown={onPriceKeyDown}
            className={`${inputCell} !text-base font-semibold print:hidden`}
          />
          <span className="hidden print:block text-right font-mono print:text-xl">{fmt3(row.price)}</span>
        </>
      );

    case "discount_percent":
      return isPosted ? (
        <span className={`block text-right ${printSize(viewMode, "print:text-xl")}`}>{row.discount_percent}</span>
      ) : (
        <>
          <input
            type="number"
            value={row.discount_percent}
            min="0"
            max="100"
            step="0.01"
            onChange={(e) => {
              updateItem(row._key, "discount_percent", e.target.value);
              updateItem(row._key, "discount_manual", true);
            }}
            className={`${inputCell} print:hidden`}
          />
          <span className="hidden print:block text-right print:text-xl">{row.discount_percent}</span>
        </>
      );

    case "discount_amount":
      return <span className={`block text-right font-mono text-orange-500 dark:text-orange-400 ${printSize(viewMode, "print:text-xl")}`}>{fmt(calcDiscountAmount(row))}</span>;

    case "total":
      return <span className={`block text-right font-mono font-semibold ${viewMode ? "text-xl" : "text-base print:text-xl"}`}>{fmt(lineTotal(row))}</span>;

    case "income": {
      const income = calcIncome(row);
      return <span className={`block text-right font-mono ${income >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>{fmt(income)}</span>;
    }

    case "income_percent": {
      const ip = calcIncomePercent(row);
      return <span className={`block text-right font-mono ${ip >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>{ip.toFixed(1)}%</span>;
    }

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

// ── Основной компонент ────────────────────────────────────────────────────────

const MainRows = forwardRef<MainRowsHandle, MainRowsProps>(({ isPosted, mainItems, lineTotal, updateItem, onQtyChange, onRemove, onFocusAddSelect, columns, stockMap, selectedCell, onSelectCell, onPreviewImage, viewMode }, ref) => {
  const qtyRefs = useRef<(HTMLInputElement | null)[]>([]);
  const priceRefs = useRef<(HTMLInputElement | null)[]>([]);

  const indexOf = (key: string) => mainItems.findIndex((r) => r._key === key);

  // ✅ Таблица товаров скроллится внутри себя, а шапка (thead) и подвал (tfoot)
  // sticky — нативный автоскролл при фокусе их не учитывает и может перекрыть
  // выделенную строку. preventScroll отключает нативный скролл, а затем сами
  // центрируем элемент, чтобы строка всегда была видна целиком.
  const focusAndReveal = (el: HTMLInputElement | null | undefined) => {
    el?.focus({ preventScroll: true });
    el?.select();
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  useImperativeHandle(ref, () => ({
    focusQty: (index: number) => focusAndReveal(qtyRefs.current[index]),
  }));

  const handleQtyKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, rowKey: string) => {
      const mIdx = indexOf(rowKey);
      if (e.key === "Enter" || e.key === "ArrowRight") {
        e.preventDefault();
        focusAndReveal(priceRefs.current[mIdx]);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (mIdx < mainItems.length - 1) {
          focusAndReveal(qtyRefs.current[mIdx + 1]);
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (mIdx > 0) {
          focusAndReveal(qtyRefs.current[mIdx - 1]);
        } else {
          onFocusAddSelect();
        }
      }
    },
    [mainItems, onFocusAddSelect],
  );

  const handlePriceKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, rowKey: string) => {
      const mIdx = indexOf(rowKey);
      if (e.key === "Enter") {
        e.preventDefault();
        onFocusAddSelect();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        focusAndReveal(qtyRefs.current[mIdx]);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (mIdx < mainItems.length - 1) {
          focusAndReveal(priceRefs.current[mIdx + 1]);
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (mIdx > 0) {
          focusAndReveal(priceRefs.current[mIdx - 1]);
        }
      }
    },
    [mainItems, onFocusAddSelect],
  );

  return (
    <>
      {mainItems.map((row, mIdx) => (
        <tr
          key={row._key}
          data-selectable-row
          className={`border-b border-black divide-x divide-black hover:bg-indigo-50/60 dark:hover:bg-slate-700/30 transition-colors
            focus-within:bg-indigo-100/80 dark:focus-within:bg-indigo-900/30 focus-within:ring-2 focus-within:ring-inset focus-within:ring-indigo-400 dark:focus-within:ring-indigo-500
            ${printSize(viewMode, "print:!bg-transparent print:!ring-0")} ${
            selectedCell?.key === row._key ? "bg-indigo-100/80 dark:bg-indigo-900/30 ring-2 ring-inset ring-indigo-400 dark:ring-indigo-500" : mIdx % 2 === 1 ? "bg-gray-50/70 dark:bg-slate-800/20" : "bg-white dark:bg-transparent"
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
                  ${isCellSelected ? "ring-2 ring-inset ring-indigo-600 bg-indigo-200/70 dark:bg-indigo-800/40" : ""}
                `}
              >
                <CellContent
                  col={col}
                  row={row}
                  mIdx={mIdx}
                  stockMap={stockMap}
                  isPosted={isPosted}
                  lineTotal={lineTotal}
                  updateItem={updateItem}
                  onQtyChange={onQtyChange}
                  qtyRef={(el) => {
                    qtyRefs.current[mIdx] = el;
                  }}
                  priceRef={(el) => {
                    priceRefs.current[mIdx] = el;
                  }}
                  onPreviewImage={onPreviewImage}
                  onQtyKeyDown={(e) => handleQtyKeyDown(e, row._key)}
                  onPriceKeyDown={(e) => handlePriceKeyDown(e, row._key)}
                  viewMode={viewMode}
                />
              </td>
            );
          })}

          {!isPosted && (
            <td className="px-1 py-1 print:hidden">
              <button onClick={() => onRemove(row)} className="p-1 text-red-400 hover:text-red-600 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </td>
          )}
        </tr>
      ))}
    </>
  );
});

MainRows.displayName = "MainRows";
export default MainRows;
