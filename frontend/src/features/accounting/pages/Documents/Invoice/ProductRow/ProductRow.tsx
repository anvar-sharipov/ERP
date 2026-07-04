// frontend/src/features/accounting/pages/Documents/Invoice/ProductRow/ProductRow.tsx
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { newItemRow, resolveVolumeDiscount, resolveQuantityPromotion, calcRowIncome } from "../Vars";
import { DEFAULT_COLUMNS, colVisibilityClass, type ProductRowProps, type ItemRow, type Product } from "../Interface";
import SearchableSelect, { type SelectOption, type SearchableSelectHandle } from "../../../../../../components/ui/SearchableSelect";
import MainRows, { type MainRowsHandle } from "./Mainrows";
import BundleRows from "./Bundlerows";
import PromoRows from "./PromoRows";
import TableFooter from "./Tablefooter";
import ColumnToggleDropdown from "../ColumnToggleDropdown";
import { useWarehouseStocks } from "../useWarehouseStocks";
import { useNotify } from "../../../../../../core/context/NotificationContext";
import { ImagePreview } from "../../../../../../components/ui/ImagePreview";

// ── Хелперы ──────────────────────────────────────────────────────────────────

// Пересчитывает автоматические строки: комплектующие (другой товар, непрерывный
// ratio) и бонус по акции "количество за количество" (тот же товар, порогово).
function recalcAuto(items: ItemRow[], products: Product[], priceTypeId: number | null): ItemRow[] {
  const mainItems = items.filter((r) => !r.is_bundle && !r.is_promo);

  // ── Комплектующие ──────────────────────────────────────────────────────────
  const bundleMap = new Map<
    number,
    {
      product_id: number;
      product_name: string;
      unit: number | null;
      unit_name: string;
      thumbnail: string | null;
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
          thumbnail: b.bundle_product_thumbnail ?? null,
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
    thumbnail: b.thumbnail,
    quantity: String(b.total_qty),
    price: b.manual_price ?? String(b.default_price),
    discount_percent: "0",
    cost_price: "0",
    is_bundle: true,
    parent_key: undefined,
    bundle_ratio: undefined,
  }));

  // ── Акция "количество за количество" (тот же товар, порогово) ─────────────
  const qtyByProduct = new Map<number, number>();
  for (const row of mainItems) {
    if (!row.product) continue;
    qtyByProduct.set(row.product, (qtyByProduct.get(row.product) ?? 0) + (parseFloat(row.quantity) || 0));
  }

  const promoMap = new Map<
    number,
    {
      product_id: number;
      product_name: string;
      unit: number | null;
      unit_name: string;
      thumbnail: string | null;
      free_qty: number;
      existing_key?: string;
      existing_id?: number | null;
    }
  >();

  for (const [productId, totalQty] of qtyByProduct) {
    const prod = products.find((p) => p.id === productId);
    if (!prod) continue;
    const freeQty = resolveQuantityPromotion(prod, totalQty, priceTypeId);
    if (!freeQty || freeQty <= 0) continue;
    promoMap.set(productId, {
      product_id: productId,
      product_name: prod.name,
      unit: prod.unit ?? null,
      unit_name: prod.unit_detail?.name ?? "",
      thumbnail: prod.main_image?.thumbnail_url ?? null,
      free_qty: freeQty,
    });
  }

  const oldPromos = items.filter((r) => r.is_promo);
  for (const old of oldPromos) {
    if (old.product && promoMap.has(old.product)) {
      const entry = promoMap.get(old.product)!;
      entry.existing_key = old._key;
      entry.existing_id = old.id;
    }
  }

  const newPromos: ItemRow[] = Array.from(promoMap.values()).map((p) => ({
    id: p.existing_id ?? null,
    _key: p.existing_key ?? crypto.randomUUID(),
    product: p.product_id,
    product_name: p.product_name,
    unit: p.unit,
    unit_name: p.unit_name,
    thumbnail: p.thumbnail,
    quantity: String(p.free_qty),
    price: "0",
    discount_percent: "0",
    cost_price: "0",
    is_promo: true,
  }));

  return [...mainItems, ...newBundles, ...newPromos];
}

// ── Компонент ────────────────────────────────────────────────────────────────

export interface ProductRowHandle {
  focusProductSearch: () => void;
}

const ProductRow = forwardRef<ProductRowHandle, ProductRowProps>(({
  isPosted,
  setItems,
  items,
  updateItem,
  products,
  lineTotal,
  removeItem,
  subtotal,
  discAmount,
  total,
  disabled,
  defaultPriceType,
  columns,
  onColumnsChange,
  warehouseId,
  onBack,
}, ref) => {
  const { t } = useTranslation();
  const notify = useNotify();

  const stockMap = useWarehouseStocks(warehouseId ?? null);

  // ✅ Тень сверху/снизу таблицы показывает, есть ли ещё что скроллить в эту сторону —
  // пропадает у настоящего конца/начала списка, чтобы не приходилось скроллить "на пробу".
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const updateScrollShadows = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 2);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
  }, []);

  useEffect(() => {
    updateScrollShadows();
  }, [items.length, updateScrollShadows]);

  const scrollShadow = [canScrollUp && "inset 0 12px 10px -10px rgba(0,0,0,0.25)", canScrollDown && "inset 0 -12px 10px -10px rgba(0,0,0,0.25)"]
    .filter(Boolean)
    .join(", ");

  // ✅ Подсветка выбранной строки — общая для основных и комплектующих строк,
  // клик вне строки товара (шапка/футер таблицы, пустое место, вне таблицы) сбрасывает выбор.
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);

  useEffect(() => {
    const handleDocMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest?.("[data-selectable-row]")) setSelectedRowKey(null);
    };
    document.addEventListener("mousedown", handleDocMouseDown);
    return () => document.removeEventListener("mousedown", handleDocMouseDown);
  }, []);

  // ✅ Увеличенное превью фото товара по клику на миниатюру — как в EmployeesPage/CounterpartiesPage.
  // Полноразмерное фото ищем по id товара в уже загруженном списке products (image_url приходит
  // в том же ответе API, что и thumbnail_url) — доп. запрос на бэкенд по клику не нужен.
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const handlePreviewProductImage = useCallback(
    (productId: number | null) => {
      const prod = products.find((p) => p.id === productId);
      setPreviewImage(prod?.main_image?.image_url ?? prod?.main_image?.thumbnail_url ?? null);
    },
    [products],
  );

  const mainItems = items.filter((r) => !r.is_bundle && !r.is_promo);
  const bundleItems = items.filter((r) => r.is_bundle);
  const promoItems = items.filter((r) => r.is_promo);

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
    fullImage: p.main_image?.image_url ?? null,
    stock: stockMap.get(p.id) ?? null,
  }));

  // ── Добавление строки по выбору товара (searchable-select над таблицей) ────

  const mainRowsRef = useRef<MainRowsHandle | null>(null);
  const addSelectRef = useRef<SearchableSelectHandle | null>(null);

  useImperativeHandle(ref, () => ({
    focusProductSearch: () => addSelectRef.current?.open(),
  }));

  const focusAddSelect = useCallback(() => {
    addSelectRef.current?.clear();
    addSelectRef.current?.open();
  }, []);

  const handleAddProduct = useCallback(
    (productId: number | null) => {
      if (!productId) return;
      const prod = products.find((p) => p.id === productId);
      if (!prod) return;

      // ✅ Товар уже есть в списке (обычная строка, не комплектующая/бонус) —
      // не создаём дубликат строки, а просто увеличиваем количество в существующей.
      const existingIndex = mainItems.findIndex((r) => r.product === prod.id);
      if (existingIndex !== -1) {
        const existingRow = mainItems[existingIndex];
        const newQty = String((parseFloat(existingRow.quantity) || 0) + 1);
        const autoDiscount = !existingRow.discount_manual ? resolveVolumeDiscount(prod, parseFloat(newQty), defaultPriceType ?? null) : null;

        setItems((prev) => {
          const mains = prev.filter((r) => !r.is_bundle && !r.is_promo);
          const auto = prev.filter((r) => r.is_bundle || r.is_promo);
          const updatedMains = mains.map((r) => (r._key === existingRow._key ? { ...r, quantity: newQty, discount_percent: autoDiscount ?? r.discount_percent } : r));
          return recalcAuto([...updatedMains, ...auto], products, defaultPriceType ?? null);
        });

        addSelectRef.current?.clear();
        notify("info", t("ProductQuantityMerged", { name: prod.name, qty: newQty }));
        setTimeout(() => mainRowsRef.current?.focusQty(existingIndex), 50);
        return;
      }

      let price = "0";
      if (defaultPriceType && prod.prices) {
        const pp = prod.prices.find((p) => p.price_type === defaultPriceType);
        if (pp) price = String(pp.price);
      }
      const autoDiscount = resolveVolumeDiscount(prod, 1, defaultPriceType ?? null);

      const row: ItemRow = {
        ...newItemRow(),
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

      const newIndex = mainItems.length;
      setItems((prev) => {
        const mains = prev.filter((r) => !r.is_bundle && !r.is_promo);
        const auto = prev.filter((r) => r.is_bundle || r.is_promo);
        return recalcAuto([...mains, row, ...auto], products, defaultPriceType ?? null);
      });

      addSelectRef.current?.clear();
      setTimeout(() => mainRowsRef.current?.focusQty(newIndex), 50);
    },
    [products, setItems, defaultPriceType, mainItems, notify, t],
  );

  // ── qty → пересчёт bundle/акций + скидки ─────────────────────────────────

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
        return recalcAuto(updated, products, defaultPriceType ?? null);
      });
    },
    [products, setItems, defaultPriceType],
  );

  // ── Удаление ──────────────────────────────────────────────────────────────

  const handleRemove = useCallback(
    (row: ItemRow) => {
      if (row.is_bundle || row.is_promo) {
        setItems((prev) => prev.filter((r) => r._key !== row._key));
        if (row.id) removeItem(row);
        return;
      }
      setItems((prev) => {
        const without = prev.filter((r) => r._key !== row._key && !r.is_bundle && !r.is_promo);
        return recalcAuto(without, products, defaultPriceType ?? null);
      });
      if (row.id) removeItem(row);
    },
    [removeItem, setItems, products, defaultPriceType],
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

  // ✅ Экран и печать/Excel управляются независимо (галочки "ЭКРАН"/"ПЕЧАТЬ" в кнопке
  // "Колонки") — рендерим объединение обоих множеств, а видимость в каждом режиме
  // регулируется per-cell через colVisibilityClass (см. Interface.ts).
  const renderedCols = columns.filter((c) => c.visibleScreen || c.visiblePrint);

  // ── Итого доход по всем строкам ───────────────────────────────────────────

  const totalIncome = mainItems.reduce((sum, row) => sum + calcRowIncome(row), 0);

  // ── Итого по физическим характеристикам (вес, объём, длина, ширина, высота) ─
  const sumField = (field: "weight" | "volume_m3" | "length" | "width" | "height") => mainItems.reduce((sum, row) => sum + (parseFloat(row[field] ?? "") || 0), 0);
  const totalWeight = sumField("weight");
  const totalVolume = sumField("volume_m3");
  const totalLength = sumField("length");
  const totalWidth = sumField("width");
  const totalHeight = sumField("height");

  // ── Рендер ───────────────────────────────────────────────────────────────

  if (disabled) {
    return (
      <div className="border border-gray-200 dark:border-slate-600 rounded-lg p-8 text-center">
        <p className="text-sm text-gray-400">{t("SelectBranchAndWarehouse")}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col border border-black rounded-lg overflow-hidden print:h-auto">
      {/* ── Заголовок блока ── */}
      <div className="shrink-0 flex items-center justify-between px-3 py-1.5 print:px-0 print:py-0.5 bg-gray-200 dark:bg-slate-700/50 print:bg-transparent border-b border-black">
        <h2 className="text-sm print:text-xs print:font-bold font-semibold text-gray-600 dark:text-gray-400">{t("Products")}</h2>
        <div className="flex items-center gap-2">
          <ColumnToggleDropdown columns={columns} onToggleScreen={toggleScreen} onTogglePrint={togglePrint} onReset={resetColumns} />
        </div>
      </div>

      {/* ── Добавление товара ── */}
      {!isPosted && (
        <div className="shrink-0 px-3 py-1.5 border-b border-black bg-gray-200 dark:bg-slate-800 print:hidden">
          <SearchableSelect
            ref={addSelectRef}
            options={productOptions}
            value={null}
            onChange={handleAddProduct}
            onArrowLeft={() => onBack?.()}
            onEnterWhenClosed={() => mainRowsRef.current?.focusQty(0)}
            placeholder={t("SelectProduct")}
            clearable={false}
            size="lg"
          />
        </div>
      )}

      {/* ── Таблица: единственная скроллируемая часть, шапка (thead) прилипает сверху ── */}
      <div
        ref={scrollContainerRef}
        onScroll={updateScrollShadows}
        className="flex-1 min-h-0 overflow-auto print:flex-none print:overflow-visible transition-shadow duration-150 print:!shadow-none"
        style={{ boxShadow: scrollShadow || "none" }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black divide-x divide-black">
              {renderedCols.map((col) => (
                <th
                  key={col.key}
                  className={`
                    sticky top-0 z-10 bg-gray-400 dark:bg-slate-700/60 print:bg-transparent
                    px-2 py-1.5 print:px-1 print:py-0.5 print:text-xs font-semibold text-gray-600 dark:text-gray-300
                    ${col.width ?? ""} print:!w-auto print:whitespace-normal print:break-words
                    ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"}
                    ${colVisibilityClass(col)}
                  `}
                >
                  {col.key === "index" ? "#" : t(col.label)}
                </th>
              ))}
              {!isPosted && <th className="sticky top-0 z-10 bg-gray-400 dark:bg-slate-700/60 w-8 print:hidden" />}
            </tr>
          </thead>

          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={renderedCols.length + (isPosted ? 0 : 1)} className="text-center py-6 text-gray-400 text-sm">
                  {t("NoRows")}
                </td>
              </tr>
            )}

            <MainRows
              ref={mainRowsRef}
              isPosted={isPosted}
              mainItems={mainItems}
              lineTotal={lineTotal}
              updateItem={updateItem}
              onQtyChange={handleMainQtyChange}
              onRemove={handleRemove}
              onFocusAddSelect={focusAddSelect}
              columns={renderedCols}
              stockMap={stockMap}
              selectedKey={selectedRowKey}
              onSelectRow={setSelectedRowKey}
              onPreviewImage={handlePreviewProductImage}
            />

            <BundleRows
              isPosted={isPosted}
              bundleItems={bundleItems}
              lineTotal={lineTotal}
              updateItem={updateItem}
              onRemove={handleRemove}
              columns={renderedCols}
              selectedKey={selectedRowKey}
              onSelectRow={setSelectedRowKey}
              onPreviewImage={handlePreviewProductImage}
            />

            <PromoRows
              isPosted={isPosted}
              promoItems={promoItems}
              lineTotal={lineTotal}
              onRemove={handleRemove}
              columns={renderedCols}
              selectedKey={selectedRowKey}
              onSelectRow={setSelectedRowKey}
              onPreviewImage={handlePreviewProductImage}
            />
          </tbody>

          <TableFooter
            isPosted={isPosted}
            subtotal={subtotal}
            discAmount={discAmount}
            total={total}
            totalIncome={totalIncome}
            totalWeight={totalWeight}
            totalVolume={totalVolume}
            totalLength={totalLength}
            totalWidth={totalWidth}
            totalHeight={totalHeight}
            columns={renderedCols}
          />
        </table>
      </div>

      <ImagePreview src={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
  );
});

ProductRow.displayName = "ProductRow";
export default ProductRow;
