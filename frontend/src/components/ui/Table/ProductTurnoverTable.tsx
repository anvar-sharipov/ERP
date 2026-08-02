// frontend/src/components/ui/Table/ProductTurnoverTable.tsx
import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual";
import { ImageOff } from "lucide-react";
import { playClickSound } from "../../../core/utils/sound";
import { focusManager } from "../../../core/utils/focusManager";

export interface ProductTurnoverRow {
  id: number;
  sku: string | null;
  name: string;
  unit: string;
  category_id: number | null;
  category_name: string;
  brand_id: number | null;
  brand_name: string;
  cost_price: string;
  thumbnail_url: string | null;
  image_url: string | null;
  opening_qty: string; opening_value: string;
  in_qty: string; in_value: string;
  return_in_qty: string; return_in_value: string;
  out_qty: string; out_before_discount: string; out_discount: string; out_after_discount: string;
  return_out_qty: string; return_out_value: string;
  move_qty: string; move_value: string;
  closing_qty: string; closing_value: string;
}

// ── Строки-группы для рендера (категория/товар/итог по категории/общий итог) ──
export type GroupedRow =
  | { type: "category"; id: string; name: string }
  | ({ type: "product"; displayNumber: number } & ProductTurnoverRow)
  | { type: "subtotal"; id: string; totals: Totals }
  | { type: "grand_total"; id: string; totals: Totals };

interface Totals {
  opening_qty: number; opening_value: number;
  in_qty: number; in_value: number;
  return_in_qty: number; return_in_value: number;
  out_qty: number; out_before_discount: number; out_discount: number; out_after_discount: number;
  return_out_qty: number; return_out_value: number;
  move_qty: number; move_value: number;
  closing_qty: number; closing_value: number;
}

export const emptyTotals = (): Totals => ({
  opening_qty: 0, opening_value: 0,
  in_qty: 0, in_value: 0,
  return_in_qty: 0, return_in_value: 0,
  out_qty: 0, out_before_discount: 0, out_discount: 0, out_after_discount: 0,
  return_out_qty: 0, return_out_value: 0,
  move_qty: 0, move_value: 0,
  closing_qty: 0, closing_value: 0,
});

export const addToTotals = (t: Totals, r: ProductTurnoverRow) => {
  t.opening_qty += Number(r.opening_qty); t.opening_value += Number(r.opening_value);
  t.in_qty += Number(r.in_qty); t.in_value += Number(r.in_value);
  t.return_in_qty += Number(r.return_in_qty); t.return_in_value += Number(r.return_in_value);
  t.out_qty += Number(r.out_qty); t.out_before_discount += Number(r.out_before_discount);
  t.out_discount += Number(r.out_discount); t.out_after_discount += Number(r.out_after_discount);
  t.return_out_qty += Number(r.return_out_qty); t.return_out_value += Number(r.return_out_value);
  t.move_qty += Number(r.move_qty); t.move_value += Number(r.move_value);
  t.closing_qty += Number(r.closing_qty); t.closing_value += Number(r.closing_value);
};

interface Props {
  rows: GroupedRow[];
  separateReturnOut: boolean;
  groupMode?: "category" | "brand";
  onRowDoubleClick?: (row: ProductTurnoverRow) => void;
  onPreviewImage?: (url: string | null) => void;
  // ✅ Товар, к которому нужно вернуться/подсветить при возврате с детализации
  // (см. ProductTurnoverPage.tsx::useRestoreScroll) — используется один раз при
  // первом появлении данных, дальше выделение работает как обычно (первая строка).
  initialSelectedProductId?: number | null;
}

const fmt = (v: number | string) => Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 2 });
const fmtQty = (v: number | string) => Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 3 });

// ✅ Первые 2 колонки (№ и Наименование+фото) закреплены при горизонтальном скролле —
// ширины нужны явно, чтобы вторая колонка знала свой left-отступ (= ширина первой).
// table-layout:fixed + <colgroup> (а не только width на отдельных <td>) — иначе браузер
// в auto-layout может отрисовать реальную ширину колонки №/Наименование иначе, чем
// ожидает sticky-left офсет, и следующая колонка (Ед.) визуально "уезжает" под них.
const COL1_W = 44;
const COL2_W = 260;
const UNIT_W = 56;
// ✅ Ширины чуть увеличены (были 74/100) под нормальный размер шрифта ниже —
// см. CLAUDE.md про text-xs md:text-sm как стандарт для отчётов/таблиц.
const QTY_COL_W = 84;
const VAL_COL_W = 112;

// ✅ Раньше здесь был захардкожен text-[11px] прямо на каждой ячейке — он перебивал
// text-xs md:text-sm, заданный на самом <table> (см. ниже), и реальный размер шрифта
// на экране застревал на 11px без какой-либо адаптации под экран. Теперь ячейки
// наследуют размер от <table>, отдельно только print остаётся мельче для бумаги.
const th = "border border-black dark:border-gray-600 px-1 py-1 font-semibold text-center print:text-[9px] print:whitespace-nowrap bg-gray-100 dark:bg-gray-800";
const thSub = "border border-black dark:border-gray-600 px-1 py-1 font-semibold text-center print:text-[9px] print:whitespace-nowrap bg-gray-50 dark:bg-gray-800/60";
const td = "border border-black dark:border-gray-700 px-1 py-0.5 whitespace-nowrap print:text-[9px]";

// Числовые колонки (после закреплённых №/Наименование и обычной Ед.) — единый список
// нужен и для рендера тела/итогов, и для границ клавиатурной навигации.
type NumKey =
  | "opening_qty" | "opening_value" | "in_qty" | "in_value" | "return_in_qty" | "return_in_value"
  | "out_qty" | "out_before_discount" | "out_discount" | "out_after_discount"
  | "return_out_qty" | "return_out_value" | "move_qty" | "move_value" | "closing_qty" | "closing_value";

export const ProductTurnoverTable = ({ rows, separateReturnOut, groupMode = "category", onRowDoubleClick, onPreviewImage, initialSelectedProductId }: Props) => {
  const { t } = useTranslation();
  const groupLabel = groupMode === "brand" ? t("Brand") : t("Category");
  const totalLabel = groupMode === "brand" ? t("BrandTotal") : t("CategoryTotal");
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedCell, setSelectedCell] = useState<{ rowIdx: number; colIdx: number } | null>(null);

  // ✅ Строка "Итого" закреплена снизу контейнера (sticky bottom-0), чтобы быть видна
  // постоянно при скролле, как и шапка сверху. У sticky-элемента такой отступ снизу
  // не резервируется автоматически — без него последняя строка товара при скролле до
  // конца оказывается ПОД закреплённой строкой итога, а не над ней. Меряем реальную
  // высоту строки итога (по <tr>, а не по <tfoot> — у внутренних table-элементов вроде
  // table-footer-group ResizeObserver в части браузеров отдаёт нулевой contentRect) и
  // резервируем под неё такой же отступ в конце тела таблицы. Стартовое значение — не 0,
  // а разумный дефолт на случай, если ResizeObserver ещё не успел сработать к первому
  // скроллу до конца.
  const footerRowRef = useRef<HTMLTableRowElement>(null);
  const [footerRowHeight, setFooterRowHeight] = useState(40);
  useEffect(() => {
    const el = footerRowRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const h = entries[0].contentRect.height;
      if (h > 0) setFooterRowHeight(h);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [rows]);

  const bodyRows = rows.filter((r) => r.type !== "grand_total");
  const grandTotalRow = rows.find((r) => r.type === "grand_total") as Extract<GroupedRow, { type: "grand_total" }> | undefined;

  // ✅ Тысячи строк отчёта рендерятся окном (виртуализация) — в DOM попадают только
  // видимые строки + overscan, а не весь список сразу, иначе браузер тормозит на
  // больших периодах/складах. При Ctrl+P рендерим весь список как обычно — иначе
  // распечатается только то, что попало в окно скролла на момент печати (см. CLAUDE.md
  // про то, что экран/печать/Excel не должны расходиться).
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
    count: bodyRows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: (index: number) => (bodyRows[index]?.type === "product" ? 34 : 30),
    overscan: 12,
  });

  const numKeys: NumKey[] = [
    "opening_qty", "opening_value", "in_qty", "in_value", "return_in_qty", "return_in_value",
    "out_qty", "out_before_discount", "out_discount", "out_after_discount",
    ...(separateReturnOut ? (["return_out_qty", "return_out_value"] as NumKey[]) : []),
    "move_qty", "move_value", "closing_qty", "closing_value",
  ];
  const totalCols = 3 + numKeys.length; // №, Наименование, Ед. + числовые
  const colSpanRest = 1 + numKeys.length; // Ед. + числовые, для строк-разделителей

  // ✅ react-query делает фоновый refetch при каждом монтировании — это меняет
  // ссылку на `rows` ещё раз уже ПОСЛЕ восстановления выделения из sessionStorage,
  // и без этого флага восстанавливающий эффект срабатывал бы повторно и сбрасывал
  // выделение обратно на первую строку при каждом изменении фильтров (см. тот же
  // приём в ProductTurnoverDetailPage.tsx). Помечаем "восстановлено" только когда
  // реально нашли и применили id — НЕ безусловно на первый же прогон, иначе гонка
  // эффектов ломает восстановление: React коммитит эффекты снизу вверх (дочерние
  // раньше родительских), и если данные отчёта уже в кэше react-query, эта таблица
  // монтируется в том же коммите, что и родительская ProductTurnoverPage — то есть
  // ЭТОТ эффект успевает отработать раньше, чем родительский useRestoreScroll вообще
  // прочитает sessionStorage и передаст initialSelectedProductId (он ещё null).
  // Если бы флаг ставился безусловно здесь, второй проход (когда проп уже пришёл)
  // просто не запустился бы повторно. Эффект теперь явно зависит от
  // initialSelectedProductId, чтобы перезапуститься, когда родитель его обновит.
  const restoredRef = useRef(false);

  // При первом появлении данных — восстанавливаем товар, с которого ушли на
  // детализацию (если есть), иначе выделяем первую строку-товар.
  useEffect(() => {
    if (!bodyRows.length) return;
    if (!restoredRef.current && initialSelectedProductId != null) {
      const idx = bodyRows.findIndex((r) => r.type === "product" && r.id === initialSelectedProductId);
      if (idx !== -1) {
        restoredRef.current = true;
        setSelectedCell({ rowIdx: idx, colIdx: 1 });
        focusManager.setRegion("table");
        rowVirtualizer.scrollToIndex(idx, { align: "center" });
        return;
      }
    }
    const firstProductIdx = bodyRows.findIndex((r) => r.type === "product");
    if (firstProductIdx !== -1) {
      setSelectedCell({ rowIdx: firstProductIdx, colIdx: 1 });
      focusManager.setRegion("table");
      rowVirtualizer.scrollToIndex(firstProductIdx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length, initialSelectedProductId]);

  // ✅ Целевая строка может быть за пределами текущего окна виртуализации и ещё не
  // существовать в DOM — сначала просим виртуализатор смонтировать/проскроллить к
  // её индексу, и только затем (когда она уже в DOM) уточняем позицию/горизонтальный
  // скролл через сам DOM-узел ячейки.
  const scrollToCell = useCallback((rowIdx: number, colIdx: number) => {
    rowVirtualizer.scrollToIndex(rowIdx, { align: "auto" });
    requestAnimationFrame(() => {
      const cell = containerRef.current?.querySelector(`[data-row-idx="${rowIdx}"][data-col-idx="${colIdx}"]`);
      cell?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    });
  }, [rowVirtualizer]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (focusManager.getRegion() !== "table") return;
      if (!selectedCell) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      const { rowIdx, colIdx } = selectedCell;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(rowIdx + 1, bodyRows.length - 1);
        if (next !== rowIdx) { playClickSound(); setSelectedCell({ rowIdx: next, colIdx }); scrollToCell(next, colIdx); }
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = Math.max(rowIdx - 1, 0);
        if (prev !== rowIdx) { playClickSound(); setSelectedCell({ rowIdx: prev, colIdx }); scrollToCell(prev, colIdx); }
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const next = Math.min(colIdx + 1, totalCols - 1);
        if (next !== colIdx) { playClickSound(); setSelectedCell({ rowIdx, colIdx: next }); scrollToCell(rowIdx, next); }
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const prev = Math.max(colIdx - 1, 0);
        if (prev !== colIdx) { playClickSound(); setSelectedCell({ rowIdx, colIdx: prev }); scrollToCell(rowIdx, prev); }
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const row = bodyRows[rowIdx];
        if (row?.type === "product" && onRowDoubleClick) onRowDoubleClick(row);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedCell, bodyRows, totalCols, onRowDoubleClick, scrollToCell]);

  const selectCell = (rowIdx: number, colIdx: number) => {
    playClickSound();
    setSelectedCell({ rowIdx, colIdx });
    focusManager.setRegion("table");
  };

  const ring = (rowIdx: number, colIdx: number) =>
    selectedCell?.rowIdx === rowIdx && selectedCell?.colIdx === colIdx
      ? "shadow-[inset_0_0_0_2px_#eab308] bg-yellow-100/70 dark:bg-yellow-500/10"
      : "";

  // ✅ Вся строка чуть подсвечена, когда в ней выделена ячейка (как в Table.tsx) —
  // используется !important, чтобы перебить odd/even-полосатость строки товара.
  const rowRing = (rowIdx: number) =>
    selectedCell?.rowIdx === rowIdx ? "!bg-yellow-50 dark:!bg-yellow-500/5" : "";

  const renderNumericCells = (rowIdx: number, values: number[], colorClasses: (string | undefined)[]) =>
    values.map((v, i) => {
      const isQty = i % 2 === 0;
      const colIdx = 3 + i;
      return (
        <td
          key={i}
          data-row-idx={rowIdx}
          data-col-idx={colIdx}
          onClick={() => selectCell(rowIdx, colIdx)}
          className={`${td} text-right font-mono tabular-nums cursor-pointer ${colorClasses[i] ?? ""} ${ring(rowIdx, colIdx)}`}
        >
          {isQty ? fmtQty(v) : fmt(v)}
        </td>
      );
    });

  const outColors = ["text-red-700 dark:text-red-400", "text-red-700 dark:text-red-400", "text-gray-500", "text-red-700 dark:text-red-400"];
  const buildColorClasses = () => [
    undefined, undefined, // opening
    "text-green-700 dark:text-green-400", "text-green-700 dark:text-green-400", // in
    "text-blue-700 dark:text-blue-400", "text-blue-700 dark:text-blue-400", // return_in
    ...outColors, // out
    ...(separateReturnOut ? ["text-orange-700 dark:text-orange-400", "text-orange-700 dark:text-orange-400"] : []),
    undefined, undefined, // move
    "font-semibold", "font-semibold", // closing
  ];

  // ✅ Тело одной строки вынесено в функцию — используется и виртуализированным
  // рендером на экране, и полным списком при печати (см. isPrinting выше). `ref`
  // на data-index нужен виртуализатору, чтобы измерить реальную высоту строки
  // (категория/подытог короче строки товара) и скорректировать позиции окна.
  const renderRow = (row: Exclude<GroupedRow, { type: "grand_total" }>, rowIdx: number) => {
    const measureProps = { "data-index": rowIdx, ref: rowVirtualizer.measureElement };

    if (row.type === "category") {
      return (
        <tr key={row.id} {...measureProps} className="font-semibold">
          <td className="border border-black dark:border-gray-700 sticky left-0 z-10 bg-indigo-50 dark:bg-indigo-900/30" />
          <td
            className={`${td} sticky z-10 bg-indigo-50 dark:bg-indigo-900/30 text-left`}
            style={{ left: COL1_W }}
          >
            {groupLabel}: {row.name}
          </td>
          <td colSpan={colSpanRest} className={`${td} bg-indigo-50 dark:bg-indigo-900/30`} />
        </tr>
      );
    }

    if (row.type === "subtotal") {
      const outQty = row.totals.out_qty + (!separateReturnOut ? row.totals.return_out_qty : 0);
      const outBefore = row.totals.out_before_discount + (!separateReturnOut ? row.totals.return_out_value : 0);
      const outAfter = row.totals.out_after_discount + (!separateReturnOut ? row.totals.return_out_value : 0);
      const values = [
        row.totals.opening_qty, row.totals.opening_value,
        row.totals.in_qty, row.totals.in_value,
        row.totals.return_in_qty, row.totals.return_in_value,
        outQty, outBefore, row.totals.out_discount, outAfter,
        ...(separateReturnOut ? [row.totals.return_out_qty, row.totals.return_out_value] : []),
        row.totals.move_qty, row.totals.move_value,
        row.totals.closing_qty, row.totals.closing_value,
      ];
      return (
        <tr key={row.id} {...measureProps} className="font-semibold bg-gray-200 dark:bg-gray-700">
          <td className="border border-black dark:border-gray-700 sticky left-0 z-10 bg-gray-200 dark:bg-gray-700" />
          <td className={`${td} sticky z-10 bg-gray-200 dark:bg-gray-700 text-right`} style={{ left: COL1_W }}>
            {totalLabel}:
          </td>
          <td className={td} />
          {renderNumericCells(rowIdx, values, values.map(() => undefined))}
        </tr>
      );
    }

    const r = row;
    const outQty = Number(r.out_qty) + (!separateReturnOut ? Number(r.return_out_qty) : 0);
    const outBefore = Number(r.out_before_discount) + (!separateReturnOut ? Number(r.return_out_value) : 0);
    const outAfter = Number(r.out_after_discount) + (!separateReturnOut ? Number(r.return_out_value) : 0);
    const values = [
      Number(r.opening_qty), Number(r.opening_value),
      Number(r.in_qty), Number(r.in_value),
      Number(r.return_in_qty), Number(r.return_in_value),
      outQty, outBefore, Number(r.out_discount), outAfter,
      ...(separateReturnOut ? [Number(r.return_out_qty), Number(r.return_out_value)] : []),
      Number(r.move_qty), Number(r.move_value),
      Number(r.closing_qty), Number(r.closing_value),
    ];
    const rowBg = "odd:bg-white even:bg-gray-50 dark:odd:bg-gray-900 dark:even:bg-gray-800";

    return (
      <tr
        key={r.id}
        {...measureProps}
        className={`${rowBg} hover:bg-indigo-50 dark:hover:bg-indigo-900/20 cursor-pointer ${rowRing(rowIdx)}`}
        onDoubleClick={() => onRowDoubleClick?.(r)}
      >
        <td
          data-row-idx={rowIdx}
          data-col-idx={0}
          onClick={() => selectCell(rowIdx, 0)}
          className={`${td} sticky left-0 z-10 bg-inherit text-center ${ring(rowIdx, 0)}`}
        >
          {r.displayNumber}
        </td>
        <td
          data-row-idx={rowIdx}
          data-col-idx={1}
          onClick={() => selectCell(rowIdx, 1)}
          className={`${td} sticky z-10 bg-inherit ${ring(rowIdx, 1)}`}
          style={{ left: COL1_W }}
        >
          <div className="flex items-center gap-2">
            {r.thumbnail_url ? (
              <img
                src={r.thumbnail_url}
                alt={r.name}
                className="w-7 h-7 rounded object-cover shrink-0 cursor-zoom-in print:hidden"
                onClick={(e) => {
                  e.stopPropagation();
                  onPreviewImage?.(r.image_url || r.thumbnail_url);
                }}
              />
            ) : (
              <div className="w-7 h-7 rounded bg-gray-200 dark:bg-slate-700 shrink-0 flex items-center justify-center print:hidden">
                <ImageOff className="w-3.5 h-3.5 text-gray-400" />
              </div>
            )}
            <span className="truncate">{r.name}</span>
          </div>
        </td>
        <td
          data-row-idx={rowIdx}
          data-col-idx={2}
          onClick={() => selectCell(rowIdx, 2)}
          className={`${td} text-center cursor-pointer ${ring(rowIdx, 2)}`}
        >
          {r.unit}
        </td>
        {renderNumericCells(rowIdx, values, buildColorClasses())}
      </tr>
    );
  };

  const virtualItems: VirtualItem[] = isPrinting ? [] : rowVirtualizer.getVirtualItems();
  const renderedRows = isPrinting
    ? bodyRows.map((row, rowIdx) => ({ row, rowIdx }))
    : virtualItems.map((vr) => ({ row: bodyRows[vr.index], rowIdx: vr.index }));
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0 ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

  return (
    <div
      ref={containerRef}
      className="overflow-auto max-h-[72vh] print:max-h-none print:overflow-visible rounded-lg border border-black dark:border-gray-700"
      onFocus={() => focusManager.setRegion("table")}
      tabIndex={-1}
    >
      <table className="table-fixed border-collapse w-full text-xs md:text-sm tabular-nums bg-white dark:bg-gray-900">
        <colgroup>
          <col style={{ width: COL1_W }} />
          <col style={{ width: COL2_W }} />
          <col style={{ width: UNIT_W }} />
          {numKeys.map((k, i) => (
            <col key={k} style={{ width: i % 2 === 0 ? QTY_COL_W : VAL_COL_W }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2} className={`${th} sticky top-0 left-0 z-30`}>№</th>
            <th rowSpan={2} className={`${th} sticky top-0 z-30 text-left`} style={{ left: COL1_W }}>{t("Name")}</th>
            <th rowSpan={2} className={`${th} sticky top-0 z-20`}>{t("Unit")}</th>
            <th colSpan={2} className={`${th} sticky top-0 z-20`}>{t("OpeningBalance")}</th>
            <th colSpan={2} className={`${th} sticky top-0 z-20`}>{t("Incoming")}</th>
            <th colSpan={2} className={`${th} sticky top-0 z-20`}>{t("ReturnIn")}</th>
            <th colSpan={4} className={`${th} sticky top-0 z-20`}>{t("Outgoing")}</th>
            {separateReturnOut && <th colSpan={2} className={`${th} sticky top-0 z-20`}>{t("ReturnToSupplier")}</th>}
            <th colSpan={2} className={`${th} sticky top-0 z-20`}>{t("Move")}</th>
            <th colSpan={2} className={`${th} sticky top-0 z-20`}>{t("ClosingBalance")}</th>
          </tr>
          <tr>
            <th className={`${thSub} sticky z-20`} style={{ top: 34 }}>{t("Quantity")}</th><th className={`${thSub} sticky z-20`} style={{ top: 34 }}>{t("Total")}</th>
            <th className={`${thSub} sticky z-20`} style={{ top: 34 }}>{t("Quantity")}</th><th className={`${thSub} sticky z-20`} style={{ top: 34 }}>{t("Total")}</th>
            <th className={`${thSub} sticky z-20`} style={{ top: 34 }}>{t("Quantity")}</th><th className={`${thSub} sticky z-20`} style={{ top: 34 }}>{t("Total")}</th>
            <th className={`${thSub} sticky z-20`} style={{ top: 34 }}>{t("Quantity")}</th><th className={`${thSub} sticky z-20`} style={{ top: 34 }}>{t("Total")} до %</th><th className={`${thSub} sticky z-20`} style={{ top: 34 }}>{t("Discount")}</th><th className={`${thSub} sticky z-20`} style={{ top: 34 }}>{t("Total")} после %</th>
            {separateReturnOut && (<><th className={`${thSub} sticky z-20`} style={{ top: 34 }}>{t("Quantity")}</th><th className={`${thSub} sticky z-20`} style={{ top: 34 }}>{t("Total")}</th></>)}
            <th className={`${thSub} sticky z-20`} style={{ top: 34 }}>{t("Quantity")}</th><th className={`${thSub} sticky z-20`} style={{ top: 34 }}>{t("Total")}</th>
            <th className={`${thSub} sticky z-20`} style={{ top: 34 }}>{t("Quantity")}</th><th className={`${thSub} sticky z-20`} style={{ top: 34 }}>{t("Total")}</th>
          </tr>
        </thead>
        <tbody>
          {!isPrinting && paddingTop > 0 && (
            <tr aria-hidden>
              <td colSpan={totalCols} style={{ height: paddingTop, padding: 0, border: "none" }} />
            </tr>
          )}
          {renderedRows.map(({ row, rowIdx }) => renderRow(row, rowIdx))}
          {!isPrinting && paddingBottom > 0 && (
            <tr aria-hidden>
              <td colSpan={totalCols} style={{ height: paddingBottom, padding: 0, border: "none" }} />
            </tr>
          )}
          {!isPrinting && grandTotalRow && (
            <tr aria-hidden>
              <td colSpan={totalCols} style={{ height: footerRowHeight, padding: 0, border: "none" }} />
            </tr>
          )}
        </tbody>
        {grandTotalRow && (() => {
          const totals = grandTotalRow.totals;
          const outQty = totals.out_qty + (!separateReturnOut ? totals.return_out_qty : 0);
          const outBefore = totals.out_before_discount + (!separateReturnOut ? totals.return_out_value : 0);
          const outAfter = totals.out_after_discount + (!separateReturnOut ? totals.return_out_value : 0);
          const values = [
            totals.opening_qty, totals.opening_value,
            totals.in_qty, totals.in_value,
            totals.return_in_qty, totals.return_in_value,
            outQty, outBefore, totals.out_discount, outAfter,
            ...(separateReturnOut ? [totals.return_out_qty, totals.return_out_value] : []),
            totals.move_qty, totals.move_value,
            totals.closing_qty, totals.closing_value,
          ];
          return (
            <tfoot>
              <tr ref={footerRowRef} className="font-bold bg-emerald-100 dark:bg-emerald-900/50">
                <td className="border border-black dark:border-gray-700 sticky bottom-0 left-0 z-30 bg-emerald-100 dark:bg-emerald-900/50" />
                <td className={`${td} sticky bottom-0 z-30 bg-emerald-100 dark:bg-emerald-900/50 text-right`} style={{ left: COL1_W }}>
                  {t("GrandTotal")}:
                </td>
                <td className={`${td} sticky bottom-0 z-20 bg-emerald-100 dark:bg-emerald-900/50`} />
                {values.map((v, i) => (
                  <td key={i} className={`${td} sticky bottom-0 z-20 bg-emerald-100 dark:bg-emerald-900/50 text-right font-mono tabular-nums`}>
                    {i % 2 === 0 ? fmtQty(v) : fmt(v)}
                  </td>
                ))}
              </tr>
            </tfoot>
          );
        })()}
      </table>
    </div>
  );
};
