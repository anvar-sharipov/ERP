// frontend/src/features/accounting/pages/Documents/Invoice/ProductRow/ProductRow.tsx
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { newItemRow, resolveVolumeDiscount } from "../Vars";
import { DEFAULT_COLUMNS, type ProductRowProps, type ItemRow, type Product } from "../Interface";
import { type SelectOption } from "../../../../../../components/ui/SearchableSelect";
import MainRows from "./Mainrows";
import BundleRows from "./Bundlerows";
import TableFooter from "./Tablefooter";
import ColumnToggleDropdown from "../ColumnToggleDropdown";
import { useWarehouseStocks } from "../useWarehouseStocks";

// ── Хелперы ──────────────────────────────────────────────────────────────────

function recalcAllBundles(items: ItemRow[], products: Product[]): ItemRow[] {
  const mainItems = items.filter((r) => !r.is_bundle);

  // const bundleMap = new Map
  //   number,
  //   {
  //     product_id: number;
  //     product_name: string;
  //     unit: number | null;
  //     unit_name: string;
  //     default_price: number;
  //     total_qty: number;
  //     manual_price?: string;
  //     existing_key?: string;
  //     existing_id?: number | null;
  //   }
  // >();
  const bundleMap = new Map<
    number,
    {
      product_id: number;
      product_name: string;
      unit: number | null;
      unit_name: string;
      default_price: number;
      total_qty: number;
      manual_price?: string;
      existing_key?: string;
      existing_id?: number | null;
    }
  >();

  for (const row of mainItems) {
    if (!row.product) continue;
    const prod = products.find((p) => p.id === row.product);
    if (!prod?.bundle_items?.length) continue;
    const rowQty = parseFloat(row.quantity) || 0;
    for (const b of prod.bundle_items) {
      const existing = bundleMap.get(b.bundle_product_id);
      if (existing) {
        existing.total_qty += b.qty_ratio * rowQty;
      } else {
        bundleMap.set(b.bundle_product_id, {
          product_id: b.bundle_product_id,
          product_name: b.bundle_product_name,
          unit: b.bundle_product_unit,
          unit_name: b.bundle_product_unit_name,
          default_price: b.default_price,
          total_qty: b.qty_ratio * rowQty,
        });
      }
    }
  }

  const oldBundles = items.filter((r) => r.is_bundle);
  for (const old of oldBundles) {
    if (old.product && bundleMap.has(old.product)) {
      const entry = bundleMap.get(old.product)!;
      entry.existing_key = old._key;
      entry.existing_id = old.id;
      entry.manual_price = old.price;
    }
  }

  const newBundles: ItemRow[] = Array.from(bundleMap.values()).map((b) => ({
    id: b.existing_id ?? null,
    _key: b.existing_key ?? crypto.randomUUID(),
    product: b.product_id,
    product_name: b.product_name,
    unit: b.unit,
    unit_name: b.unit_name,
    quantity: String(b.total_qty),
    price: b.manual_price ?? String(b.default_price),
    discount_percent: "0",
    cost_price: "0",
    is_bundle: true,
    parent_key: undefined,
    bundle_ratio: undefined,
  }));

  return [...mainItems, ...newBundles];
}

const calcRowIncome = (row: ItemRow): number => {
  const qty = parseFloat(row.quantity) || 0;
  const price = parseFloat(row.price) || 0;
  const cost = parseFloat(row.cost_price) || 0;
  const disc = parseFloat(row.discount_percent) || 0;
  return qty * (price * (1 - disc / 100) - cost);
};

// ── Компонент ────────────────────────────────────────────────────────────────

const ProductRow = ({
  isPosted,
  setItems,
  items,
  updateItem,
  products,
  lineTotal,
  removeItem,
  subtotal,
  discPercent,
  discAmount,
  total,
  disabled,
  defaultPriceType,
  columns,
  onColumnsChange,
  warehouseId,
}: ProductRowProps) => {
  const { t } = useTranslation();

  const stockMap = useWarehouseStocks(warehouseId ?? null);

  const mainItems = items.filter((r) => !r.is_bundle);
  const bundleItems = items.filter((r) => r.is_bundle);

  // const productOptions: SelectOption[] = products.map((p) => ({
  //   id: p.id,
  //   label: p.name,
  //   sublabel: p.unit_detail?.name,
  // }));
  const productOptions: SelectOption[] = products.map((p) => ({
    id: p.id,
    label: p.name,
    sublabel: p.unit_detail?.name,
    thumbnail: p.main_image?.thumbnail_url ?? null,
    stock: stockMap.get(p.id) ?? null,
  }));

  // ── Выбор товара ──────────────────────────────────────────────────────────

  const handleProductChange = useCallback(
    (rowKey: string, productId: number | null) => {
      setItems((prev) => {
        let updated: ItemRow[];
        if (!productId) {
          updated = prev.map((r) =>
            r._key === rowKey
              ? {
                  ...r,
                  product: null,
                  product_name: "",
                  unit: null,
                  unit_name: "",
                  price: "0",
                  discount_percent: "0",
                  discount_manual: false,
                  sku: undefined,
                  barcode: undefined,
                  weight: undefined,
                  volume_m3: undefined,
                  length: undefined,
                  width: undefined,
                  height: undefined,
                  thumbnail: undefined,
                }
              : r,
          );
        } else {
          const prod = products.find((p) => p.id === productId);
          if (!prod) return prev;

          let price = "0";
          if (defaultPriceType && prod.prices) {
            const pp = prod.prices.find((p) => p.price_type === defaultPriceType);
            if (pp) price = String(pp.price);
          }

          const autoDiscount = resolveVolumeDiscount(prod, 1, defaultPriceType ?? null);

          updated = prev.map((r) => {
            if (r._key !== rowKey) return r;
            return {
              ...r,
              product: prod.id,
              product_name: prod.name,
              unit: prod.unit ?? null,
              unit_name: prod.unit_detail?.name ?? "",
              cost_price: String(prod.cost_price ?? 0),
              price,
              discount_percent: autoDiscount ?? "0",
              discount_manual: false,
              sku: prod.sku,
              barcode: prod.barcode,
              weight: prod.weight !== undefined ? String(prod.weight) : undefined,
              volume_m3: prod.volume_m3 !== undefined ? String(prod.volume_m3) : undefined,
              length: prod.length !== undefined ? String(prod.length) : undefined,
              width: prod.width !== undefined ? String(prod.width) : undefined,
              height: prod.height !== undefined ? String(prod.height) : undefined,
              thumbnail: prod.main_image?.thumbnail_url ?? undefined,
            };
          });
        }
        return recalcAllBundles(updated, products);
      });
    },
    [products, setItems, defaultPriceType],
  );

  // ── qty → пересчёт bundle + скидки ───────────────────────────────────────

  const handleMainQtyChange = useCallback(
    (rowKey: string, value: string) => {
      setItems((prev) => {
        const updated = prev.map((r) => {
          if (r._key !== rowKey) return r;
          if (!r.discount_manual) {
            const prod = products.find((p) => p.id === r.product);
            const qty = parseFloat(value) || 0;
            const autoDiscount = resolveVolumeDiscount(prod, qty, defaultPriceType ?? null);
            return { ...r, quantity: value, discount_percent: autoDiscount ?? r.discount_percent };
          }
          return { ...r, quantity: value };
        });
        return recalcAllBundles(updated, products);
      });
    },
    [products, setItems, defaultPriceType],
  );

  // ── Добавление строки ─────────────────────────────────────────────────────

  const addRow = useCallback((): number => {
    const row = newItemRow();
    setItems((prev) => {
      const mains = prev.filter((r) => !r.is_bundle);
      const bundles = prev.filter((r) => r.is_bundle);
      return [...mains, row, ...bundles];
    });
    return mainItems.length;
  }, [mainItems.length, setItems]);

  // ── Удаление ──────────────────────────────────────────────────────────────

  const handleRemove = useCallback(
    (row: ItemRow) => {
      if (row.is_bundle) {
        setItems((prev) => prev.filter((r) => r._key !== row._key));
        if (row.id) removeItem(row);
        return;
      }
      setItems((prev) => {
        const without = prev.filter((r) => r._key !== row._key && !r.is_bundle);
        return recalcAllBundles(without, products);
      });
      if (row.id) removeItem(row);
    },
    [removeItem, setItems, products],
  );

  // ── Колонки ───────────────────────────────────────────────────────────────

  const toggleScreen = useCallback(
    (key: string) => {
      onColumnsChange(columns.map((c) => (c.key === key && !c.locked ? { ...c, visibleScreen: !c.visibleScreen } : c)));
    },
    [columns, onColumnsChange],
  );

  const togglePrint = useCallback(
    (key: string) => {
      onColumnsChange(columns.map((c) => (c.key === key && !c.locked ? { ...c, visiblePrint: !c.visiblePrint } : c)));
    },
    [columns, onColumnsChange],
  );

  const resetColumns = useCallback(() => {
    onColumnsChange(DEFAULT_COLUMNS);
  }, [onColumnsChange]);

  const visibleScreen = columns.filter((c) => c.visibleScreen);

  // ── Итого доход по всем строкам ───────────────────────────────────────────

  const totalIncome = mainItems.reduce((sum, row) => sum + calcRowIncome(row), 0);

  // ── Рендер ───────────────────────────────────────────────────────────────

  if (disabled) {
    return (
      <div className="border border-gray-200 dark:border-slate-600 rounded-lg p-8 text-center">
        <p className="text-sm text-gray-400">{t("SelectBranchAndWarehouse")}</p>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 dark:border-slate-600 rounded-lg overflow-hidden">
      {/* ── Заголовок блока ── */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-slate-700/50 border-b border-gray-200 dark:border-slate-600">
        <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400">{t("Products")}</h2>
        <div className="flex items-center gap-2">
          {!isPosted && <p className="text-xs text-gray-400 dark:text-gray-500">{t("EnterInPrice")}</p>}
          <ColumnToggleDropdown columns={columns} onToggleScreen={toggleScreen} onTogglePrint={togglePrint} onReset={resetColumns} />
        </div>
      </div>

      {/* ── Таблица ── */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/30">
              {visibleScreen.map((col) => (
                <th
                  key={col.key}
                  className={`
                    px-2 py-2 font-medium text-gray-500 dark:text-gray-400
                    ${col.width ?? ""}
                    ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"}
                    ${!col.visiblePrint ? "print:hidden" : ""}
                  `}
                >
                  {col.key === "index" ? "#" : t(col.label)}
                </th>
              ))}
              {!isPosted && <th className="w-8 print:hidden" />}
            </tr>
          </thead>

          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={visibleScreen.length + (isPosted ? 0 : 1)} className="text-center py-6 text-gray-400 text-sm">
                  {t("NoRows")}
                </td>
              </tr>
            )}

            <MainRows
              isPosted={isPosted}
              mainItems={mainItems}
              productOptions={productOptions}
              lineTotal={lineTotal}
              updateItem={updateItem}
              onProductChange={handleProductChange}
              onQtyChange={handleMainQtyChange}
              onRemove={handleRemove}
              onAddRow={addRow}
              columns={visibleScreen}
              stockMap={stockMap}
            />

            <BundleRows isPosted={isPosted} bundleItems={bundleItems} lineTotal={lineTotal} updateItem={updateItem} onRemove={handleRemove} columns={visibleScreen} />
          </tbody>

          <TableFooter isPosted={isPosted} subtotal={subtotal} discPercent={discPercent} discAmount={discAmount} total={total} totalIncome={totalIncome} columns={visibleScreen} />
        </table>
      </div>
    </div>
  );
};

export default ProductRow;
