// frontend/src/features/accounting/pages/Documents/Invoice/ProductRow/Mainrows.tsx
import { useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import SearchableSelect, { type SelectOption, type SearchableSelectHandle } from "../../../../../../components/ui/SearchableSelect";
import { type ItemRow, type ColumnDef } from "../Interface";

const inputCell =
  "w-full px-2 py-1 text-sm border border-transparent hover:border-gray-300 dark:hover:border-slate-500 " +
  "focus:border-indigo-500 rounded bg-transparent focus:bg-white dark:focus:bg-slate-700 " +
  "focus:outline-none transition-colors text-right";

interface MainRowsProps {
  isPosted: boolean;
  mainItems: ItemRow[];
  productOptions: SelectOption[];
  lineTotal: (row: ItemRow) => number;
  updateItem: (key: string, field: keyof ItemRow, value: ItemRow[keyof ItemRow]) => void;
  onProductChange: (rowKey: string, productId: number | null) => void;
  onQtyChange: (rowKey: string, value: string) => void;
  onRemove: (row: ItemRow) => void;
  onAddRow: () => number;
  columns: ColumnDef[];
  stockMap?: Map<number, { quantity: number; reserved: number; available: number }>;
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
  productOptions,
  lineTotal,
  updateItem,
  onProductChange,
  onQtyChange,
  selectRef,
  qtyRef,
  priceRef,
  onQtyKeyDown,
  onPriceKeyDown,
  onProductSelect,
  stockMap,
}: {
  col: ColumnDef;
  row: ItemRow;
  mIdx: number;
  isPosted: boolean;
  productOptions: SelectOption[];
  lineTotal: (row: ItemRow) => number;
  updateItem: (key: string, field: keyof ItemRow, value: ItemRow[keyof ItemRow]) => void;
  onProductChange: (rowKey: string, productId: number | null) => void;
  onQtyChange: (rowKey: string, value: string) => void;
  selectRef: (el: SearchableSelectHandle | null) => void;
  qtyRef: (el: HTMLInputElement | null) => void;
  priceRef: (el: HTMLInputElement | null) => void;
  onQtyKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onPriceKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onProductSelect: (id: number) => void;
  stockMap?: Map<
    number,
    {
      quantity: number;
      reserved: number;
      available: number;
    }
  >;
}) => {
  const { t } = useTranslation();

  switch (col.key) {
    case "index":
      return <span className="text-gray-400 text-xs">{mIdx + 1}</span>;

    case "thumbnail":
      return row.thumbnail ? (
        <img src={row.thumbnail} alt={row.product_name} className="w-8 h-8 object-cover rounded mx-auto" />
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

      return isPosted ? (
        <div>
          <span>{row.product_name}</span>
          {stock != null && (
            <div className="flex items-center gap-1.5 text-[10px] mt-0.5 text-gray-400">
              <span>
                {t("InStock")}: {fmt3(stock.quantity)}
              </span>
              {stock.reserved > 0 && <span className="text-orange-400">−{fmt3(stock.reserved)}</span>}
              <span className={`font-semibold ${stockColor(stock.available)}`}>= {fmt3(stock.available)}</span>
            </div>
          )}
        </div>
      ) : (
        <SearchableSelect
          ref={selectRef}
          options={productOptions}
          value={row.product}
          onChange={(id) => onProductChange(row._key, id)}
          // onSelect={(id) => handleProductSelect(id, row._key)}
          onSelect={onProductSelect}
          placeholder={t("SelectProduct")}
        />
      );
    }

    case "unit":
      return <span className="text-xs text-gray-500 whitespace-nowrap">{row.unit_name || "—"}</span>;

    case "quantity":
      return isPosted ? (
        <span className="block text-right">{row.quantity}</span>
      ) : (
        <input ref={qtyRef} type="number" value={row.quantity} min="0.001" step="0.001" onChange={(e) => onQtyChange(row._key, e.target.value)} onKeyDown={onQtyKeyDown} className={inputCell} />
      );

    case "cost_price":
      return isPosted ? (
        <span className="block text-right font-mono">{fmt(parseFloat(row.cost_price) || 0)}</span>
      ) : (
        <input type="number" value={row.cost_price} min="0" step="0.01" onChange={(e) => updateItem(row._key, "cost_price", e.target.value)} className={inputCell} />
      );

    case "price":
      return isPosted ? (
        <span className="block text-right font-mono">{fmt(parseFloat(row.price) || 0)}</span>
      ) : (
        <input ref={priceRef} type="number" value={row.price} min="0" step="0.01" onChange={(e) => updateItem(row._key, "price", e.target.value)} onKeyDown={onPriceKeyDown} className={inputCell} />
      );

    case "discount_percent":
      return isPosted ? (
        <span className="block text-right">{row.discount_percent}</span>
      ) : (
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
          className={inputCell}
        />
      );

    case "discount_amount":
      return <span className="block text-right font-mono text-orange-500 dark:text-orange-400">{fmt(calcDiscountAmount(row))}</span>;

    case "total":
      return <span className="block text-right font-mono font-medium">{fmt(lineTotal(row))}</span>;

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

const MainRows = ({ isPosted, mainItems, productOptions, lineTotal, updateItem, onProductChange, onQtyChange, onRemove, onAddRow, columns, stockMap }: MainRowsProps) => {
  const selectRefs = useRef<(SearchableSelectHandle | null)[]>([]);
  const qtyRefs = useRef<(HTMLInputElement | null)[]>([]);
  const priceRefs = useRef<(HTMLInputElement | null)[]>([]);

  const indexOf = (key: string) => mainItems.findIndex((r) => r._key === key);

  const handleProductSelect = useCallback(
    (_id: number, rowKey: string) => {
      const mIdx = indexOf(rowKey);
      setTimeout(() => {
        qtyRefs.current[mIdx]?.focus();
        qtyRefs.current[mIdx]?.select();
      }, 30);
    },
    [mainItems],
  );

  const handleQtyKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, rowKey: string) => {
      const mIdx = indexOf(rowKey);
      if (e.key === "Enter") {
        e.preventDefault();
        priceRefs.current[mIdx]?.focus();
        priceRefs.current[mIdx]?.select();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (mIdx < mainItems.length - 1) {
          qtyRefs.current[mIdx + 1]?.focus();
          qtyRefs.current[mIdx + 1]?.select();
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (mIdx > 0) {
          qtyRefs.current[mIdx - 1]?.focus();
          qtyRefs.current[mIdx - 1]?.select();
        } else {
          selectRefs.current[mIdx]?.clear();
          selectRefs.current[mIdx]?.open();
        }
      }
    },
    [mainItems],
  );

  const handlePriceKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, rowKey: string) => {
      const mIdx = indexOf(rowKey);
      if (e.key === "Enter") {
        e.preventDefault();
        const newMIdx = onAddRow();
        setTimeout(() => {
          selectRefs.current[newMIdx]?.open();
        }, 50);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (mIdx < mainItems.length - 1) {
          priceRefs.current[mIdx + 1]?.focus();
          priceRefs.current[mIdx + 1]?.select();
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (mIdx > 0) {
          priceRefs.current[mIdx - 1]?.focus();
          priceRefs.current[mIdx - 1]?.select();
        }
      }
    },
    [mainItems, onAddRow],
  );

  return (
    <>
      {mainItems.map((row, mIdx) => (
        <tr key={row._key} className="border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
          {columns.map((col) => (
            <td
              key={col.key}
              className={`
                px-2 py-1
                ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : ""}
                ${!col.visiblePrint ? "print:hidden" : ""}
              `}
            >
              <CellContent
                col={col}
                row={row}
                mIdx={mIdx}
                stockMap={stockMap}
                isPosted={isPosted}
                productOptions={productOptions}
                lineTotal={lineTotal}
                updateItem={updateItem}
                onProductChange={onProductChange}
                onQtyChange={onQtyChange}
                selectRef={(el) => {
                  selectRefs.current[mIdx] = el;
                }}
                qtyRef={(el) => {
                  qtyRefs.current[mIdx] = el;
                }}
                priceRef={(el) => {
                  priceRefs.current[mIdx] = el;
                }}
                onQtyKeyDown={(e) => handleQtyKeyDown(e, row._key)}
                onPriceKeyDown={(e) => handlePriceKeyDown(e, row._key)}
                onProductSelect={(id) => handleProductSelect(id, row._key)}
              />
            </td>
          ))}

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
};

export default MainRows;
