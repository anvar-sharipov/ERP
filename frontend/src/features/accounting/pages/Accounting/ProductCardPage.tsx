// frontend/src/features/accounting/pages/Accounting/ProductCardPage.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual";
import { FileSpreadsheet, Search, ImageOff } from "lucide-react";
import { accountApi } from "../../services/accountingApi";
import { productApi, counterpartyApi } from "../../services/productApi";
import { agentApi } from "../../services/employeeApi";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { useSidebar } from "../../../../core/context/SidebarRightContext";
import { useDateStore } from "../../../../core/store/dateStore";
import { useDebouncedValue } from "../../../../core/hooks/useDebouncedValue";
import { focusManager } from "../../../../core/utils/focusManager";
import { playClickSound } from "../../../../core/utils/sound";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import { HelpButton } from "../../../../components/ui/HelpButton";
import { Loader } from "../../../../components/ui/Loader";
import { ImagePreview } from "../../../../components/ui/ImagePreview";
import SearchableSelect, { type SelectOption } from "../../../../components/ui/SearchableSelect";
import { Button } from "../../../../components/ui/Button";
import { useCompany } from "../../../../core/context/CompanyContext";
import { useUser } from "../../../../core/context/UserContext";
import { ROUTES } from "../../../../core/router/routes";
import { exportProductCardExcel } from "./exportProductCardExcel";

interface ProductCardRow {
  id: number;
  date: string;
  document_id: number;
  document_number: string;
  document_type: string;
  partner: string;
  note: string;
  price: number;
  in_qty: number; in_sum: number;
  return_qty: number; return_sum: number;
  out_qty: number; out_sum: number;
  balance_qty: number; balance_sum: number;
}

interface ProductCard {
  product_id: number;
  product_name: string;
  product_sku: string | null;
  product_unit: string;
  product_thumbnail_url: string | null;
  product_image_url: string | null;
  start_quantity: number;
  start_value: number;
  turnover: { in_qty: number; in_value: number; return_qty: number; return_value: number; out_qty: number; out_value: number };
  end: { quantity: number; value: number };
  rows: ProductCardRow[];
}

// ── Строки для виртуализированного рендера одной сквозной таблицы ──────────
type Row =
  | { kind: "header"; key: string; card: ProductCard }
  | { kind: "item"; key: number; card: ProductCard; item: ProductCardRow; flatIdx: number };

const DOC_TYPE_LABELS: Record<string, string> = {
  in: "Приход",
  out: "Расход",
  return_in: "Возврат клиента",
  return_out: "Возврат поставщику",
  move: "Перемещение",
};
const DOC_TYPE_COLORS: Record<string, string> = {
  in: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
  out: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  return_in: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  return_out: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400",
  move: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400",
};

const COLS = 10; // №, Дата, Тип, Документ, Контрагент, Примечание, Цена, Кол-во, Сумма, Остаток

const fmt = (v: number | string) => Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 2 });
const fmtQty = (v: number | string) => Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const movementQty = (r: ProductCardRow) => (Number(r.in_qty) ? Number(r.in_qty) : Number(r.return_qty) ? Number(r.return_qty) : -Number(r.out_qty || 0));
const movementSum = (r: ProductCardRow) => (Number(r.in_qty) ? Number(r.in_sum) : Number(r.return_qty) ? Number(r.return_sum) : -Number(r.out_sum || 0));

const td = "border border-black dark:border-gray-700 px-1.5 py-1 text-xs md:text-sm whitespace-nowrap";
const th = "border border-black dark:border-gray-600 px-1.5 py-1 text-xs md:text-sm font-semibold text-center whitespace-nowrap sticky top-0 z-10 bg-gray-100 dark:bg-gray-800";
const ring = (rowIdx: number, colIdx: number, selectedCell: { rowIdx: number; colIdx: number } | null) =>
  selectedCell?.rowIdx === rowIdx && selectedCell?.colIdx === colIdx ? "shadow-[inset_0_0_0_2px_#eab308] bg-yellow-100/70 dark:bg-yellow-500/10" : "";
const rowRing = (rowIdx: number, selectedCell: { rowIdx: number; colIdx: number } | null) =>
  selectedCell?.rowIdx === rowIdx ? "!bg-yellow-50 dark:!bg-yellow-500/5" : "";

const ProductCardPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { canView } = usePageAccess("document");
  const { setSidebarContent } = useSidebar();
  const { company } = useCompany();
  const { user } = useUser();
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedCell, setSelectedCell] = useState<{ rowIdx: number; colIdx: number } | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const { periodFrom, periodTo, workBranch, workWarehouse } = useDateStore();
  const dateFrom = periodFrom ?? "";
  const dateTo = periodTo ?? "";
  const warehouse = workWarehouse?.id ? String(workWarehouse.id) : undefined;
  const branch = !workWarehouse?.id && workBranch?.id ? String(workBranch.id) : undefined;

  // ✅ По умолчанию НИЧЕГО не грузится, пока не выбран товар — карточка товара
  // это инструмент точечного поиска (посмотреть движения ОДНОГО товара), а не
  // общий обзорный отчёт вроде «Оборот товаров». Массовый показ карточек сразу
  // по всем товарам (тяжелее для бэкенда, избыточен визуально в большинстве
  // случаев) — отдельный явный переключатель, а не поведение по умолчанию.
  const [productId, setProductId] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [partnerId, setPartnerId] = useState<number | null>(null);
  const [agentId, setAgentId] = useState<number | null>(null);
  const [docType, setDocType] = useState<"" | "in" | "out" | "return_in" | "return_out" | "move">("");
  const [showZero, setShowZero] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);

  const { data: productsData } = useQuery({
    queryKey: ["products-light-picker", warehouse, branch],
    queryFn: () => productApi.getAllLight({ warehouse: warehouse ? Number(warehouse) : undefined, branch: branch ? Number(branch) : undefined }),
    staleTime: 60_000,
    enabled: canView,
  });
  // ✅ Фото отдельно от getAllLight (см. ProductListSerializer/list_light_images
  // докстринг в product_serializers.py/product_views.py) — тут просто мёржим
  // обратно в опции пикера, без отдельного спиннера (миниатюра в выпадающем
  // списке не блокирует ничего критичного).
  const { data: imagesMap } = useQuery({
    queryKey: ["products-light-picker-images", warehouse, branch],
    queryFn: () => productApi.getListLightImages({ warehouse: warehouse ? Number(warehouse) : undefined, branch: branch ? Number(branch) : undefined }),
    staleTime: 60_000,
    enabled: canView,
  });
  const productOptions: SelectOption[] = useMemo(
    () =>
      (productsData ?? []).map((p: any) => ({
        id: p.id,
        label: p.sku ? `${p.name} (${p.sku})` : p.name,
        thumbnail: imagesMap?.[p.id]?.main_image?.thumbnail_url ?? null,
        fullImage: imagesMap?.[p.id]?.main_image?.image_url ?? null,
      })),
    [productsData, imagesMap],
  );

  const { data: partnersData } = useQuery({
    queryKey: ["counterparties-picker"],
    queryFn: () => counterpartyApi.getAll(),
    staleTime: 60_000,
    enabled: canView,
  });
  const partnerOptions: SelectOption[] = useMemo(() => (partnersData ?? []).map((c: any) => ({ id: c.id, label: c.name })), [partnersData]);

  const { data: agentsData } = useQuery({
    queryKey: ["agents-picker"],
    queryFn: () => agentApi.getAll(),
    staleTime: 60_000,
    enabled: canView,
  });
  const agentOptions: SelectOption[] = useMemo(() => (agentsData ?? []).map((a: any) => ({ id: a.id, label: a.display_name })), [agentsData]);

  const filters = useMemo(
    () => ({
      date_from: dateFrom,
      date_to: dateTo,
      ...(productId ? { product: String(productId) } : {}),
      ...(warehouse ? { warehouse } : branch ? { branch } : {}),
      ...(partnerId ? { partner: String(partnerId) } : {}),
      ...(agentId ? { agent: String(agentId) } : {}),
      ...(docType ? { document_type: docType } : {}),
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      show_zero: showZero,
    }),
    [productId, dateFrom, dateTo, warehouse, branch, partnerId, agentId, docType, debouncedSearch, showZero],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["product-card", filters],
    queryFn: () => accountApi.getProductCard(filters as any),
    enabled: !!dateFrom && !!dateTo && canView && (!!productId || showAll),
    placeholderData: (prev) => prev,
  });

  const cards: ProductCard[] = useMemo(() => (data?.cards ?? []) as ProductCard[], [data]);

  // ✅ Тысячи строк движений по всем товарам сразу рендерятся ОКНОМ (виртуализация,
  // @tanstack/react-virtual — тот же приём, что и в ProductTurnoverTable.tsx) — в
  // DOM попадают только видимые строки + overscan, а не всё сразу, иначе браузер
  // тормозит на слабых ПК при большом числе товаров/движений за период. Единый
  // сквозной индекс через ВСЕ карточки (flatRows/itemToGrouped) — та же логика,
  // что и в AccountCardPage.tsx/SubcontoBreakdownPage.tsx.
  const { groupedRows, flatRows, itemToGrouped } = useMemo(() => {
    const grouped: Row[] = [];
    const flat: ProductCardRow[] = [];
    cards.forEach((card) => {
      grouped.push({ kind: "header", key: `h-${card.product_id}`, card });
      card.rows.forEach((item) => {
        grouped.push({ kind: "item", key: item.id, card, item, flatIdx: flat.length });
        flat.push(item);
      });
    });
    const itemToGroupedMap: number[] = [];
    grouped.forEach((r, gi) => {
      if (r.kind === "item") itemToGroupedMap[r.flatIdx] = gi;
    });
    return { groupedRows: grouped, flatRows: flat, itemToGrouped: itemToGroupedMap };
  }, [cards]);

  const [isPrinting, setIsPrinting] = useState(false);
  useEffect(() => {
    const onBeforePrint = () => setIsPrinting(true);
    const onAfterPrint = () => setIsPrinting(false);
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint);
    return () => {
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
    };
  }, []);

  const rowVirtualizer = useVirtualizer({
    count: groupedRows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: (index) => (groupedRows[index]?.kind === "header" ? 34 : 28),
    overscan: 12,
  });

  useEffect(() => {
    setSelectedCell(flatRows.length ? { rowIdx: 0, colIdx: 1 } : null);
  }, [cards.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const openDocument = useCallback(
    (rowIdx: number) => {
      const row = flatRows[rowIdx];
      if (row?.document_id) navigate(ROUTES.APP.DOCUMENTS_VIEW.replace(":id", String(row.document_id)));
    },
    [flatRows, navigate],
  );

  const scrollToCell = useCallback(
    (rowIdx: number, colIdx: number) => {
      const gi = itemToGrouped[rowIdx];
      if (gi != null) rowVirtualizer.scrollToIndex(gi, { align: "auto" });
      requestAnimationFrame(() => {
        const cell = containerRef.current?.querySelector(`[data-row-idx="${rowIdx}"][data-col-idx="${colIdx}"]`);
        cell?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      });
    },
    [itemToGrouped, rowVirtualizer],
  );

  const selectCell = useCallback((rowIdx: number, colIdx: number) => {
    playClickSound();
    focusManager.setRegion("table");
    setSelectedCell({ rowIdx, colIdx });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (focusManager.getRegion() !== "table") return;
      if (!selectedCell || !flatRows.length) return;
      const { rowIdx, colIdx } = selectedCell;

      if (e.key === "ArrowDown") {
        const next = Math.min(rowIdx + 1, flatRows.length - 1);
        if (next !== rowIdx) {
          e.preventDefault();
          playClickSound();
          setSelectedCell({ rowIdx: next, colIdx });
          scrollToCell(next, colIdx);
        }
      } else if (e.key === "ArrowUp") {
        const prev = Math.max(rowIdx - 1, 0);
        if (prev !== rowIdx) {
          e.preventDefault();
          playClickSound();
          setSelectedCell({ rowIdx: prev, colIdx });
          scrollToCell(prev, colIdx);
        }
      } else if (e.key === "ArrowRight") {
        const next = Math.min(colIdx + 1, COLS - 1);
        if (next !== colIdx) {
          e.preventDefault();
          playClickSound();
          setSelectedCell({ rowIdx, colIdx: next });
          scrollToCell(rowIdx, next);
        }
      } else if (e.key === "ArrowLeft") {
        const prev = Math.max(colIdx - 1, 0);
        if (prev !== colIdx) {
          e.preventDefault();
          playClickSound();
          setSelectedCell({ rowIdx, colIdx: prev });
          scrollToCell(rowIdx, prev);
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        openDocument(rowIdx);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedCell, flatRows, scrollToCell, openDocument]);

  const handleExportExcel = useCallback(() => {
    if (!cards.length) return;
    exportProductCardExcel({ company, user, t, dateFrom, dateTo, cards });
  }, [cards, company, user, t, dateFrom, dateTo]);

  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <button
          type="button"
          onClick={handleExportExcel}
          disabled={cards.length === 0}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-medium text-sm hover:bg-emerald-500/20 hover:border-emerald-400/60 active:scale-95 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <FileSpreadsheet className="w-4 h-4" />
          {t("ExportToExcel")}
        </button>

        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2 text-xs uppercase tracking-wider">{t("Product")}</h4>
          <SearchableSelect options={productOptions} value={productId} onChange={setProductId} placeholder={t("SelectProduct")} theme="sidebar" clearable />
          <label className="flex items-center gap-2 text-indigo-200 cursor-pointer mt-2">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-indigo-600" />
            {t("ShowAllProductCards")}
          </label>
        </div>

        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2 text-xs uppercase tracking-wider">{t("Counterparty")}</h4>
          <SearchableSelect options={partnerOptions} value={partnerId} onChange={setPartnerId} placeholder={t("AllCounterparties")} theme="sidebar" clearable />
        </div>

        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2 text-xs uppercase tracking-wider">{t("Agent")}</h4>
          <SearchableSelect options={agentOptions} value={agentId} onChange={setAgentId} placeholder={t("AllAgents")} theme="sidebar" clearable />
        </div>

        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2 text-xs uppercase tracking-wider">{t("DocumentType")}</h4>
          <div className="flex flex-col gap-1">
            {(
              [
                { value: "", label: t("All") },
                { value: "in", label: DOC_TYPE_LABELS.in },
                { value: "out", label: DOC_TYPE_LABELS.out },
                { value: "return_in", label: DOC_TYPE_LABELS.return_in },
                { value: "return_out", label: DOC_TYPE_LABELS.return_out },
                { value: "move", label: DOC_TYPE_LABELS.move },
              ] as const
            ).map((item) => (
              <Button key={item.value} onClick={() => setDocType(item.value)} text={item.label} variant="ghost" dark isActive={docType === item.value} className="w-full justify-start" />
            ))}
          </div>
        </div>

        {!productId && showAll && (
          <div className="pt-4 border-t border-indigo-900/30">
            <label className="flex items-center gap-2 text-indigo-200 cursor-pointer">
              <input type="checkbox" checked={showZero} onChange={(e) => setShowZero(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-indigo-600" />
              {t("ShowZeroTurnover")}
            </label>
          </div>
        )}

        <div className="pt-4 border-t border-indigo-900/30 text-indigo-400/60 space-y-1">
          <p>{t("PeriodSetAbove")}</p>
          <p>{t("OnlyPostedTransactions")}</p>
        </div>
      </div>,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSidebarContent, cards.length, productOptions, productId, showAll, partnerOptions, partnerId, agentOptions, agentId, docType, showZero, t]);

  const renderRow = (row: Row, groupedIdx: number) => {
    const measureProps = { "data-index": groupedIdx, ref: rowVirtualizer.measureElement };

    if (row.kind === "header") {
      const card = row.card;
      return (
        <tr key={row.key} {...measureProps} className="bg-gray-100 dark:bg-gray-800">
          <td colSpan={COLS} className={`${td} border-t-2 border-t-indigo-300 dark:border-t-indigo-700`}>
            <div className="flex items-center gap-2 flex-wrap py-0.5">
              {card.product_thumbnail_url ? (
                <img
                  src={card.product_thumbnail_url}
                  alt={card.product_name}
                  className="w-7 h-7 rounded object-cover shrink-0 cursor-zoom-in"
                  onClick={() => setPreviewImage(card.product_image_url || card.product_thumbnail_url)}
                />
              ) : (
                <div className="w-7 h-7 rounded bg-gray-200 dark:bg-slate-700 shrink-0 flex items-center justify-center">
                  <ImageOff className="w-3.5 h-3.5 text-gray-400" />
                </div>
              )}
              <b>
                {card.product_name}
                {card.product_sku ? ` (${card.product_sku})` : ""}
              </b>
              <span className="text-gray-400">|</span>
              <span>{t("OpeningBalance")}: {fmtQty(card.start_quantity)} / {fmt(card.start_value)}</span>
              <span className="text-green-700 dark:text-green-400">{DOC_TYPE_LABELS.in}: {fmtQty(card.turnover.in_qty)} / {fmt(card.turnover.in_value)}</span>
              <span className="text-blue-700 dark:text-blue-400">{DOC_TYPE_LABELS.return_in}: {fmtQty(card.turnover.return_qty)} / {fmt(card.turnover.return_value)}</span>
              <span className="text-red-700 dark:text-red-400">{DOC_TYPE_LABELS.out}: {fmtQty(card.turnover.out_qty)} / {fmt(card.turnover.out_value)}</span>
              <span className="font-semibold">{t("ClosingBalance")}: {fmtQty(card.end.quantity)} / {fmt(card.end.value)}</span>
            </div>
          </td>
        </tr>
      );
    }

    const { item, flatIdx } = row;
    const q = movementQty(item);
    const s = movementSum(item);
    const cell = (colIdx: number, className: string, content: React.ReactNode) => (
      <td
        data-row-idx={flatIdx}
        data-col-idx={colIdx}
        onClick={() => selectCell(flatIdx, colIdx)}
        className={`${className} cursor-pointer ${ring(flatIdx, colIdx, selectedCell)}`}
      >
        {content}
      </td>
    );
    return (
      <tr
        key={row.key}
        {...measureProps}
        className={`hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors ${rowRing(flatIdx, selectedCell)}`}
        onDoubleClick={() => openDocument(flatIdx)}
      >
        {cell(0, `${td} text-center`, "")}
        {cell(1, td, new Date(item.date).toLocaleDateString("ru-RU"))}
        {cell(2, td, <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${DOC_TYPE_COLORS[item.document_type] ?? ""}`}>{DOC_TYPE_LABELS[item.document_type] ?? item.document_type}</span>)}
        {cell(3, td, item.document_number)}
        {cell(4, td, item.partner || "—")}
        {cell(5, td, item.note || "—")}
        {cell(6, `${td} text-right`, fmt(item.price))}
        {cell(7, `${td} text-right font-medium ${q >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`, fmtQty(q))}
        {cell(8, `${td} text-right ${s >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`, fmt(s))}
        {cell(9, `${td} text-right font-medium`, fmtQty(item.balance_qty))}
      </tr>
    );
  };

  const virtualItems: VirtualItem[] = isPrinting ? [] : rowVirtualizer.getVirtualItems();
  const renderedRows = isPrinting
    ? groupedRows.map((row, i) => ({ row, i }))
    : virtualItems.map((vr) => ({ row: groupedRows[vr.index], i: vr.index }));
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0 ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

  return (
    <RBACGuard isLoading={false} error={null} canView={canView} forbiddenText={t("ForbiddenText")}>
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm md:text-lg font-bold text-gray-800 dark:text-gray-100">{t("ProductCard")}</h2>
            <HelpButton title={t("ProductCard")}>
              <p>
                <b>Карточка товара</b> — хронологический список всех движений (приход/расход/возврат/перемещение) по
                товару(-ам) за период, с бегущим остатком (количество и сумма по текущей себестоимости) после каждой
                строки.
              </p>
              <ul>
                <li>
                  <b>Товар</b> выбирается в правом сайдбаре — без выбора отчёт пуст. <b>«Показать все карточки»</b> —
                  отдельный переключатель для редких случаев (сверка/печать за период), когда нужны карточки сразу по
                  всем товарам с движением.
                </li>
                <li>
                  <b>Контрагент / Агент / Тип документа</b> — необязательные фильтры; сужают только список показанных
                  строк, бегущий остаток при этом считается по полной (нефильтрованной) истории.
                </li>
                <li>
                  <b>Период, склад, филиал</b> берутся из виджета «Рабочая дата» в правом сайдбаре — те же, что и у других
                  отчётов.
                </li>
                <li>
                  Список рендерится окном (видна только прокручиваемая часть) — большая история движений не тормозит
                  браузер.
                </li>
                <li>
                  Двойной клик по строке (или Enter, если выделена стрелками) открывает исходный документ.
                </li>
              </ul>
            </HelpButton>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("SearchByComment")}
                className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-56"
              />
            </div>
            {dateFrom && dateTo && (
              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                {new Date(dateFrom).toLocaleDateString("ru-RU")} — {new Date(dateTo).toLocaleDateString("ru-RU")}
              </span>
            )}
          </div>
        </div>

        {!dateFrom || !dateTo ? (
          <div className="text-center py-12 text-gray-400">{t("SpecifyPeriod")}</div>
        ) : !productId && !showAll ? (
          <div className="text-center py-12 text-gray-400">{t("SelectProductOrShowAll")}</div>
        ) : isLoading ? (
          <Loader containerClass="py-12" text={t("LoadingReport")} progress="indeterminate" />
        ) : cards.length === 0 ? (
          <div className="text-center py-12 text-gray-400">{t("NoDataForPeriod")}</div>
        ) : (
          <div
            ref={containerRef}
            className="overflow-auto max-h-[72vh] print:max-h-none print:overflow-visible rounded-lg border border-black dark:border-gray-700"
            onFocus={() => focusManager.setRegion("table")}
            tabIndex={-1}
          >
            <table className="border-collapse w-full text-xs md:text-sm tabular-nums bg-white dark:bg-gray-900">
              <thead>
                <tr>
                  <th className={th}>№</th>
                  <th className={th}>{t("Date")}</th>
                  <th className={th}>{t("DocumentType")}</th>
                  <th className={th}>{t("InvoiceNumber")}</th>
                  <th className={th}>{t("Counterparty")}</th>
                  <th className={th}>{t("Comment")}</th>
                  <th className={th}>{t("Price")}</th>
                  <th className={th}>{t("Quantity")}</th>
                  <th className={th}>{t("Sum")}</th>
                  <th className={th}>{t("Balance")}</th>
                </tr>
              </thead>
              <tbody>
                {!isPrinting && paddingTop > 0 && (
                  <tr aria-hidden>
                    <td colSpan={COLS} style={{ height: paddingTop, padding: 0, border: "none" }} />
                  </tr>
                )}
                {renderedRows.map(({ row, i }) => renderRow(row, i))}
                {!isPrinting && paddingBottom > 0 && (
                  <tr aria-hidden>
                    <td colSpan={COLS} style={{ height: paddingBottom, padding: 0, border: "none" }} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ImagePreview src={previewImage} onClose={() => setPreviewImage(null)} />
    </RBACGuard>
  );
};

export default ProductCardPage;
