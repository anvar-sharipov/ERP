// features/accounting/pages/Documents/Invoice/ProductRow.tsx
import { useRef, useCallback } from "react";
import { Trash2, Package } from "lucide-react";
import { newItemRow } from "./Vars";
import { type ProductRowProps, type ItemRow, type Product } from "./Interface";
import SearchableSelect, { type SelectOption, type SearchableSelectHandle } from "../../../../../components/ui/SearchableSelect";

const inputCell =
  "w-full px-2 py-1 text-sm border border-transparent hover:border-gray-300 dark:hover:border-slate-500 " +
  "focus:border-indigo-500 rounded bg-transparent focus:bg-white dark:focus:bg-slate-700 " +
  "focus:outline-none transition-colors text-right";

const inputCellBundle =
  "w-full px-2 py-1 text-sm border border-transparent hover:border-blue-300 dark:hover:border-blue-700 " +
  "focus:border-blue-400 rounded bg-transparent focus:bg-blue-50 dark:focus:bg-blue-950/30 " +
  "focus:outline-none transition-colors text-right text-blue-700 dark:text-blue-300";

// ── Хелперы ──────────────────────────────────────────────────────────────────

/**
 * Пересчитать сводные bundle-строки в конце списка.
 * Проходим по всем основным строкам, суммируем qty комплектующих,
 * затем заменяем все bundle-строки в конце на новые сводные.
 */
function recalcAllBundles(items: ItemRow[], products: Product[]): ItemRow[] {
  const mainItems = items.filter((r) => !r.is_bundle);

  // Карта: bundle_product_id → { суммарное qty, данные товара из bundle }
  const bundleMap = new Map<
    number,
    {
      product_id: number;
      product_name: string;
      unit: number | null;
      unit_name: string;
      default_price: number;
      total_qty: number;
      // Для ручного переопределения qty/price — сохраняем если уже была bundle-строка
      manual_qty?: string;
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

  // Перенести manual qty/price из старых bundle-строк
  const oldBundles = items.filter((r) => r.is_bundle);
  for (const old of oldBundles) {
    if (old.product && bundleMap.has(old.product)) {
      const entry = bundleMap.get(old.product)!;
      entry.existing_key = old._key;
      entry.existing_id = old.id;
      // Сохраняем ручное переопределение цены
      entry.manual_price = old.price;
    }
  }

  // Создать новые bundle-строки
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
    parent_key: undefined, // нет одного родителя — сводная
    bundle_ratio: undefined,
  }));

  return [...mainItems, ...newBundles];
}

// ── Компонент ────────────────────────────────────────────────────────────────

const ProductRow = ({ isPosted, setItems, items, updateItem, products, lineTotal, removeItem, subtotal, discPercent, discAmount, total, disabled, defaultPriceType }: ProductRowProps) => {
  const selectRefs = useRef<(SearchableSelectHandle | null)[]>([]);
  const qtyRefs = useRef<(HTMLInputElement | null)[]>([]);
  const priceRefs = useRef<(HTMLInputElement | null)[]>([]);

  const mainItems = items.filter((r) => !r.is_bundle);
  const bundleItems = items.filter((r) => r.is_bundle);

  const productOptions: SelectOption[] = products.map((p) => ({
    id: p.id,
    label: p.name,
    sublabel: p.unit_detail?.name,
  }));

  // ── Выбор товара ──────────────────────────────────────────────────────────

  const handleProductChange = useCallback(
    (rowKey: string, productId: number | null, priceTypeId: number | null) => {
      setItems((prev) => {
        let updated: ItemRow[];
        if (!productId) {
          updated = prev.map((r) => (r._key === rowKey ? { ...r, product: null, product_name: "", unit: null, unit_name: "", price: "0" } : r));
        } else {
          const prod = products.find((p) => p.id === productId);
          if (!prod) return prev;

          // ── Подставить цену по priceType ──
          let price = "0";
          if (priceTypeId && prod.prices) {
            const pp = prod.prices.find((p) => p.price_type === priceTypeId);
            if (pp) price = String(pp.price);
          }

          updated = prev.map((r) => {
            if (r._key !== rowKey) return r;
            return {
              ...r,
              product: prod.id,
              product_name: prod.name,
              unit: prod.unit ?? null,
              unit_name: prod.unit_detail?.name ?? "",
              cost_price: String(prod.cost_price ?? 0),
              price, // ← теперь не "0"
            };
          });
        }
        return recalcAllBundles(updated, products);
      });
    },
    [products, setItems],
  );

  // ── Изменение qty основной строки → пересчёт bundle ──────────────────────

  const handleMainQtyChange = useCallback(
    (rowKey: string, value: string) => {
      setItems((prev) => {
        const updated = prev.map((r) => (r._key === rowKey ? { ...r, quantity: value } : r));
        return recalcAllBundles(updated, products);
      });
    },
    [products, setItems],
  );

  // ── Навигация клавишами ───────────────────────────────────────────────────

  const mainIndexOf = (key: string) => mainItems.findIndex((r) => r._key === key);

  const handleProductSelect = useCallback(
    (_id: number, rowKey: string) => {
      const mIdx = mainIndexOf(rowKey);
      setTimeout(() => {
        qtyRefs.current[mIdx]?.focus();
        qtyRefs.current[mIdx]?.select();
      }, 30);
    },
    [mainItems],
  );

  const handleQtyKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, rowKey: string) => {
      const mIdx = mainIndexOf(rowKey);
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

  const addRow = useCallback((): number => {
    const row = newItemRow();
    setItems((prev) => {
      // Вставить новую строку перед bundle-строками
      const mains = prev.filter((r) => !r.is_bundle);
      const bundles = prev.filter((r) => r.is_bundle);
      return [...mains, row, ...bundles];
    });
    return mainItems.length;
  }, [mainItems.length, setItems]);

  const handlePriceKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, rowKey: string) => {
      const mIdx = mainIndexOf(rowKey);
      if (e.key === "Enter") {
        e.preventDefault();
        const newMIdx = addRow();
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
    [mainItems, addRow],
  );

  // ── Удаление ──────────────────────────────────────────────────────────────

  const handleRemove = useCallback(
    (row: ItemRow) => {
      if (row.is_bundle) {
        // Удалить только эту bundle-строку
        setItems((prev) => prev.filter((r) => r._key !== row._key));
        if (row.id) removeItem(row);
        return;
      }
      // Удалить основную строку и пересчитать bundles
      setItems((prev) => {
        const without = prev.filter((r) => r._key !== row._key && !r.is_bundle);
        return recalcAllBundles(without, products);
      });
      if (row.id) removeItem(row);
    },
    [removeItem, setItems, products],
  );

  // ── Рендер ───────────────────────────────────────────────────────────────

  let mainRefIdx = -1;
  let mainDisplayIdx = 0;

  if (disabled) {
    return (
      <div className="border border-gray-200 dark:border-slate-600 rounded-lg p-8 text-center">
        <p className="text-sm text-gray-400">Выберите филиал и склад в правой панели для добавления товаров</p>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 dark:border-slate-600 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-slate-700/50 border-b border-gray-200 dark:border-slate-600">
        <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400">Товары</h2>
        {!isPosted && <p className="text-xs text-gray-400 dark:text-gray-500">Enter в цене → новая строка</p>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/30">
              <th className="text-left px-2 py-2 font-medium text-gray-500 dark:text-gray-400 w-6">#</th>
              <th className="text-left px-2 py-2 font-medium text-gray-500 dark:text-gray-400">Товар</th>
              <th className="text-left px-2 py-2 font-medium text-gray-500 dark:text-gray-400 w-20">Ед.</th>
              <th className="text-right px-2 py-2 font-medium text-gray-500 dark:text-gray-400 w-24">Кол-во</th>
              <th className="text-right px-2 py-2 font-medium text-gray-500 dark:text-gray-400 w-28">Цена</th>
              <th className="text-right px-2 py-2 font-medium text-gray-500 dark:text-gray-400 w-20">Скидка%</th>
              <th className="text-right px-2 py-2 font-medium text-gray-500 dark:text-gray-400 w-28">Итого</th>
              {!isPosted && <th className="w-8" />}
            </tr>
          </thead>

          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={isPosted ? 7 : 8} className="text-center py-6 text-gray-400 text-sm">
                  Нет строк
                </td>
              </tr>
            )}

            {/* ── Основные строки ── */}
            {mainItems.map((row) => {
              mainRefIdx++;
              const mIdx = mainRefIdx;
              mainDisplayIdx++;

              return (
                <tr key={row._key} className="border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="px-2 py-1 text-gray-400 text-xs">{mainDisplayIdx}</td>

                  <td className="px-2 py-1 min-w-[200px]">
                    {isPosted ? (
                      <span>{row.product_name}</span>
                    ) : (
                      <SearchableSelect
                        ref={(el) => {
                          selectRefs.current[mIdx] = el;
                        }}
                        options={productOptions}
                        value={row.product}
                        // onChange={(id) => handleProductChange(row._key, id)}
                        onChange={(id) => handleProductChange(row._key, id, defaultPriceType ?? null)}
                        onSelect={(id) => handleProductSelect(id, row._key)}
                        placeholder="— товар —"
                      />
                    )}
                  </td>

                  <td className="px-2 py-1 text-xs text-gray-500 whitespace-nowrap">{row.unit_name || "—"}</td>

                  <td className="px-2 py-1">
                    {isPosted ? (
                      <span className="block text-right">{row.quantity}</span>
                    ) : (
                      <input
                        ref={(el) => {
                          qtyRefs.current[mIdx] = el;
                        }}
                        type="number"
                        value={row.quantity}
                        min="0.001"
                        step="0.001"
                        onChange={(e) => handleMainQtyChange(row._key, e.target.value)}
                        onKeyDown={(e) => handleQtyKeyDown(e, row._key)}
                        className={inputCell}
                      />
                    )}
                  </td>

                  <td className="px-2 py-1">
                    {isPosted ? (
                      <span className="block text-right font-mono">{Number(row.price).toLocaleString("ru-RU", { minimumFractionDigits: 2 })}</span>
                    ) : (
                      <input
                        ref={(el) => {
                          priceRefs.current[mIdx] = el;
                        }}
                        type="number"
                        value={row.price}
                        min="0"
                        step="0.01"
                        onChange={(e) => updateItem(row._key, "price", e.target.value)}
                        onKeyDown={(e) => handlePriceKeyDown(e, row._key)}
                        className={inputCell}
                      />
                    )}
                  </td>

                  <td className="px-2 py-1">
                    {isPosted ? (
                      <span className="block text-right">{row.discount_percent}</span>
                    ) : (
                      <input
                        type="number"
                        value={row.discount_percent}
                        min="0"
                        max="100"
                        step="0.01"
                        onChange={(e) => updateItem(row._key, "discount_percent", e.target.value)}
                        className={inputCell}
                      />
                    )}
                  </td>

                  <td className="px-2 py-1 text-right font-mono font-medium">{lineTotal(row).toLocaleString("ru-RU", { minimumFractionDigits: 2 })}</td>

                  {!isPosted && (
                    <td className="px-1 py-1">
                      <button onClick={() => handleRemove(row)} className="p-1 text-red-400 hover:text-red-600 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}

            {/* ── Разделитель перед комплектующими ── */}
            {bundleItems.length > 0 && (
              <tr>
                <td colSpan={isPosted ? 7 : 8}>
                  <div className="flex items-center gap-2 px-2 py-1 bg-blue-50/60 dark:bg-blue-950/20 border-t border-blue-100 dark:border-blue-900/30">
                    <Package className="w-3 h-3 text-blue-400 shrink-0" />
                    <span className="text-xs text-blue-500 dark:text-blue-400 font-medium">Комплектующие (суммарно)</span>
                  </div>
                </td>
              </tr>
            )}

            {/* ── Bundle строки в конце ── */}
            {bundleItems.map((row) => (
              <tr key={row._key} className="border-b border-blue-100 dark:border-blue-900/30 bg-blue-50/40 dark:bg-blue-950/10 transition-colors">
                <td className="px-2 py-1">
                  <Package className="w-3 h-3 text-blue-400 mx-auto" />
                </td>

                <td className="px-2 py-1 text-blue-700 dark:text-blue-300 font-medium">{row.product_name}</td>

                <td className="px-2 py-1 text-xs text-blue-500 dark:text-blue-400 whitespace-nowrap">{row.unit_name || "—"}</td>

                <td className="px-2 py-1">
                  {isPosted ? (
                    <span className="block text-right text-blue-700 dark:text-blue-300">{row.quantity}</span>
                  ) : (
                    <input
                      type="number"
                      value={row.quantity}
                      min="0"
                      step="0.001"
                      onChange={(e) => updateItem(row._key, "quantity", e.target.value)}
                      className={inputCellBundle}
                      title="Суммарное кол-во (можно изменить вручную)"
                    />
                  )}
                </td>

                <td className="px-2 py-1">
                  {isPosted ? (
                    <span className="block text-right font-mono text-blue-700 dark:text-blue-300">{Number(row.price).toLocaleString("ru-RU", { minimumFractionDigits: 2 })}</span>
                  ) : (
                    <input type="number" value={row.price} min="0" step="0.01" onChange={(e) => updateItem(row._key, "price", e.target.value)} className={inputCellBundle} />
                  )}
                </td>

                {/* Скидка — заблокирована */}
                <td className="px-2 py-1 text-center text-xs text-blue-300 dark:text-blue-600">—</td>

                <td className="px-2 py-1 text-right font-mono font-medium text-blue-600 dark:text-blue-400">{lineTotal(row).toLocaleString("ru-RU", { minimumFractionDigits: 2 })}</td>

                {!isPosted && (
                  <td className="px-1 py-1">
                    <button onClick={() => handleRemove(row)} className="p-1 text-blue-300 hover:text-blue-500 transition-colors" title="Удалить комплектующую">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr className="border-t-2 border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/30">
              <td colSpan={6} className="px-2 py-2 text-right text-sm text-gray-500">
                Сумма:
              </td>
              <td className="px-2 py-2 text-right font-mono font-medium">{subtotal.toLocaleString("ru-RU", { minimumFractionDigits: 2 })}</td>
              {!isPosted && <td />}
            </tr>

            {discPercent > 0 && (
              <tr className="bg-gray-50 dark:bg-slate-700/30">
                <td colSpan={6} className="px-2 py-1 text-right text-sm text-red-500">
                  Скидка {discPercent}%:
                </td>
                <td className="px-2 py-1 text-right font-mono text-red-500">−{discAmount.toLocaleString("ru-RU", { minimumFractionDigits: 2 })}</td>
                {!isPosted && <td />}
              </tr>
            )}

            <tr className="bg-gray-50 dark:bg-slate-700/30">
              <td colSpan={6} className="px-2 py-2 text-right text-sm font-bold text-gray-700 dark:text-gray-300">
                К оплате:
              </td>
              <td className="px-2 py-2 text-right font-mono font-bold text-lg">{total.toLocaleString("ru-RU", { minimumFractionDigits: 2 })}</td>
              {!isPosted && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default ProductRow;
