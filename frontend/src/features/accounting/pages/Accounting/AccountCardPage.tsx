// frontend/src/features/accounting/pages/Accounting/AccountCardPage.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual";
import { FileSpreadsheet, Search } from "lucide-react";
import { accountApi } from "../../services/accountingApi";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { useSidebar } from "../../../../core/context/SidebarRightContext";
import { useDateStore } from "../../../../core/store/dateStore";
import { useDebouncedValue } from "../../../../core/hooks/useDebouncedValue";
import { focusManager } from "../../../../core/utils/focusManager";
import { playClickSound } from "../../../../core/utils/sound";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import { HelpButton } from "../../../../components/ui/HelpButton";
import { Loader } from "../../../../components/ui/Loader";
import SearchableSelect, { type SelectOption } from "../../../../components/ui/SearchableSelect";
import { Button } from "../../../../components/ui/Button";
import { useCompany } from "../../../../core/context/CompanyContext";
import { useUser } from "../../../../core/context/UserContext";
import { ROUTES } from "../../../../core/router/routes";
import { exportAccountCardExcel } from "./exportAccountCardExcel";

interface AccountSubcontoOption {
  id: number;
  subconto_type: number;
  subconto_type_detail: { id: number; name: string; slug: string };
}

interface CardItem {
  id: number;
  date: string;
  journal_entry_id: number;
  document_id: number | null;
  comment: string;
  corr_account: string;
  debit: number;
  credit: number;
  balance: number;
}

interface AccountCard {
  account_id: number;
  account_code: string;
  account_name: string;
  items: CardItem[];
  opening_balance: number;
  closing_balance: number;
  total_debit: number;
  total_credit: number;
}

// ── Строки для виртуализированного рендера одной сквозной таблицы ──────────
type Row =
  | { kind: "header"; key: string; card: AccountCard }
  | { kind: "opening"; key: string; card: AccountCard }
  | { kind: "item"; key: number; card: AccountCard; item: CardItem; flatIdx: number }
  | { kind: "totals"; key: string; card: AccountCard }
  | { kind: "closing"; key: string; card: AccountCard };

const COLS = 7; // №, Дата, Корр.счёт, Комментарий, Дебет, Кредит, Сальдо

const fmt = (v: number | string) => Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 2 });
const td = "border border-black dark:border-gray-700 px-1.5 py-1 text-xs md:text-sm whitespace-nowrap";
const th = "border border-black dark:border-gray-600 px-1.5 py-1 text-xs md:text-sm font-semibold text-center whitespace-nowrap sticky top-0 z-10 bg-gray-100 dark:bg-gray-800";
const ring = (rowIdx: number, colIdx: number, selectedCell: { rowIdx: number; colIdx: number } | null) =>
  selectedCell?.rowIdx === rowIdx && selectedCell?.colIdx === colIdx ? "shadow-[inset_0_0_0_2px_#eab308] bg-yellow-100/70 dark:bg-yellow-500/10" : "";
const rowRing = (rowIdx: number, selectedCell: { rowIdx: number; colIdx: number } | null) =>
  selectedCell?.rowIdx === rowIdx ? "!bg-yellow-50 dark:!bg-yellow-500/5" : "";

const AccountCardPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { canView } = usePageAccess("journalentry");
  const { setSidebarContent } = useSidebar();
  const { company } = useCompany();
  const { user } = useUser();
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedCell, setSelectedCell] = useState<{ rowIdx: number; colIdx: number } | null>(null);

  const { periodFrom, periodTo, workBranch, workWarehouse } = useDateStore();
  const dateFrom = periodFrom ?? "";
  const dateTo = periodTo ?? "";
  const warehouse = workWarehouse?.id ? String(workWarehouse.id) : undefined;
  const branch = !workWarehouse?.id && workBranch?.id ? String(workBranch.id) : undefined;

  // ✅ Счёт НЕОБЯЗАТЕЛЕН — без него показываются карточки сразу по всем счетам
  // с активностью за период (как ProductTurnoverPage.tsx), выбор в сайдбаре
  // только сужает до одного счёта.
  const [accountId, setAccountId] = useState<number | null>(null);
  const [subcontoLinkId, setSubcontoLinkId] = useState<number | null>(null);
  const [subcontoValueId, setSubcontoValueId] = useState<number | null>(null);
  const [entryType, setEntryType] = useState<"all" | "manual" | "document">("all");
  const [showZero, setShowZero] = useState(false);
  // ✅ По умолчанию НИЧЕГО не грузится, пока не выбран счёт — карточка счёта это
  // инструмент точечного поиска (посмотреть историю ОДНОГО счёта), как в 1С, а
  // не общий обзорный отчёт вроде ОСВ; массовый показ карточек сразу по всем
  // счетам (тяжелее для бэкенда, избыточен визуально в 95% случаев) — теперь
  // отдельный явный переключатель, а не поведение по умолчанию.
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);

  const { data: accountsData } = useQuery({
    queryKey: ["accounts-postable"],
    queryFn: () => accountApi.getAccounts({ is_group: "false", is_active: "true" }),
    staleTime: 60_000,
    enabled: canView,
  });
  const accountOptions: SelectOption[] = useMemo(
    () => (accountsData ?? []).map((a: any) => ({ id: a.id, label: `${a.code} — ${a.name}` })),
    [accountsData],
  );

  const { data: accountDetail } = useQuery({
    queryKey: ["account-detail", accountId],
    queryFn: () => accountApi.getAccountDetail(accountId!),
    enabled: !!accountId && canView,
  });
  const subcontoTypes: AccountSubcontoOption[] = useMemo(() => accountDetail?.account_subcontos ?? [], [accountDetail]);
  const activeSubcontoType = subcontoTypes.find((s) => s.id === subcontoLinkId) ?? (subcontoTypes.length === 1 ? subcontoTypes[0] : null);

  const { data: subcontoRecords } = useQuery({
    queryKey: ["subconto-records", activeSubcontoType?.subconto_type],
    queryFn: () => accountApi.getSubcontoRecords(activeSubcontoType!.subconto_type),
    enabled: !!activeSubcontoType,
  });
  const subcontoValueOptions: SelectOption[] = useMemo(() => (subcontoRecords ?? []).map((r: any) => ({ id: r.id, label: r.name })), [subcontoRecords]);

  useEffect(() => {
    setSubcontoLinkId(null);
    setSubcontoValueId(null);
  }, [accountId]);

  useEffect(() => {
    setSubcontoValueId(null);
  }, [subcontoLinkId]);

  const filters = useMemo(
    () => ({
      date_from: dateFrom,
      date_to: dateTo,
      ...(accountId ? { account: String(accountId) } : {}),
      ...(warehouse ? { warehouse } : branch ? { branch } : {}),
      ...(activeSubcontoType && subcontoValueId ? { subconto_slug: activeSubcontoType.subconto_type_detail.slug, subconto_id: String(subcontoValueId) } : {}),
      ...(entryType !== "all" && { entry_type: entryType }),
      ...(debouncedSearch && { search: debouncedSearch }),
      show_zero: showZero,
    }),
    [accountId, dateFrom, dateTo, warehouse, branch, activeSubcontoType, subcontoValueId, entryType, debouncedSearch, showZero],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["account-card", filters],
    queryFn: () => accountApi.getAccountCard(filters as any),
    enabled: !!dateFrom && !!dateTo && canView && (!!accountId || showAll),
    placeholderData: (prev) => prev,
  });

  const cards: AccountCard[] = useMemo(() => data?.cards ?? [], [data]);

  // ✅ Тысячи строк проводок по всем счетам сразу рендерятся ОКНОМ (виртуализация,
  // @tanstack/react-virtual — тот же приём, что и в ProductTurnoverTable.tsx) — в
  // DOM попадают только видимые строки + overscan, а не вся история сразу, иначе
  // браузер тормозит на слабых ПК при большом числе счетов/проводок за период.
  // Единый сквозной индекс через ВСЕ карточки (flatRows/itemToGrouped) — тот же
  // принцип, что и в SubcontoBreakdownPage.tsx с groupByAgent: клавиатурная
  // навигация (Arrow/Enter) работает по ОДНОЙ последовательности проводок, а не
  // по изолированным мини-таблицам на счёт, даже когда строки физически относятся
  // к разным счетам в одной виртуализированной таблице.
  const { groupedRows, flatRows, itemToGrouped, cardHeaderIndex, cardFirstItemFlatIdx } = useMemo(() => {
    const grouped: Row[] = [];
    const flat: CardItem[] = [];
    const headerIdx: number[] = [];
    const firstItemIdx: (number | null)[] = [];
    cards.forEach((card) => {
      headerIdx.push(grouped.length);
      grouped.push({ kind: "header", key: `h-${card.account_id}`, card });
      grouped.push({ kind: "opening", key: `o-${card.account_id}`, card });
      let first: number | null = null;
      card.items.forEach((item) => {
        if (first === null) first = flat.length;
        grouped.push({ kind: "item", key: item.id, card, item, flatIdx: flat.length });
        flat.push(item);
      });
      firstItemIdx.push(first);
      grouped.push({ kind: "totals", key: `t-${card.account_id}`, card });
      grouped.push({ kind: "closing", key: `c-${card.account_id}`, card });
    });
    const itemToGroupedMap: number[] = [];
    grouped.forEach((r, gi) => {
      if (r.kind === "item") itemToGroupedMap[r.flatIdx] = gi;
    });
    return { groupedRows: grouped, flatRows: flat, itemToGrouped: itemToGroupedMap, cardHeaderIndex: headerIdx, cardFirstItemFlatIdx: firstItemIdx };
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
    estimateSize: (index) => (groupedRows[index]?.kind === "header" ? 30 : 28),
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

  // ✅ Целевая строка может быть за пределами текущего окна виртуализации и ещё не
  // существовать в DOM — сначала просим виртуализатор смонтировать/проскроллить к
  // её индексу (через itemToGrouped — индекс проводки внутри ОБЩЕГО списка строк
  // таблицы, не только проводок), и только затем уточняем позицию через сам DOM-узел.
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

  const jumpToCard = useCallback(
    (cardIdx: number) => {
      playClickSound();
      focusManager.setRegion("table");
      const headerGi = cardHeaderIndex[cardIdx];
      const firstItem = cardFirstItemFlatIdx[cardIdx];
      if (firstItem != null) {
        setSelectedCell({ rowIdx: firstItem, colIdx: 1 });
        scrollToCell(firstItem, 1);
      } else if (headerGi != null) {
        rowVirtualizer.scrollToIndex(headerGi, { align: "start" });
      }
    },
    [cardHeaderIndex, cardFirstItemFlatIdx, scrollToCell, rowVirtualizer],
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
    exportAccountCardExcel({ company, user, t, dateFrom, dateTo, cards });
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
          <h4 className="font-bold text-indigo-300 mb-2 text-xs uppercase tracking-wider">{t("Account")}</h4>
          <SearchableSelect options={accountOptions} value={accountId} onChange={setAccountId} placeholder={t("SelectAccount")} theme="sidebar" clearable />
          <label className="flex items-center gap-2 text-indigo-200 cursor-pointer mt-2">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-indigo-600" />
            {t("ShowAllAccountCards")}
          </label>
        </div>

        {subcontoTypes.length > 0 && (
          <div className="pt-4 border-t border-indigo-900/30">
            <h4 className="font-bold text-indigo-300 mb-2 text-xs uppercase tracking-wider">{t("NarrowBySubconto")}</h4>
            {subcontoTypes.length > 1 && (
              <div className="mb-2">
                <SearchableSelect
                  options={subcontoTypes.map((s) => ({ id: s.id, label: s.subconto_type_detail.name }))}
                  value={subcontoLinkId}
                  onChange={setSubcontoLinkId}
                  placeholder={t("SubcontoType")}
                  theme="sidebar"
                  clearable
                />
              </div>
            )}
            {activeSubcontoType && (
              <SearchableSelect options={subcontoValueOptions} value={subcontoValueId} onChange={setSubcontoValueId} placeholder={t("AllSubcontoValues")} theme="sidebar" clearable />
            )}
          </div>
        )}

        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2 text-xs uppercase tracking-wider">{t("EntryType")}</h4>
          <div className="flex flex-col gap-1">
            {(
              [
                { value: "all", label: t("All") },
                { value: "manual", label: t("ManualEntries") },
                { value: "document", label: t("DocumentEntries") },
              ] as const
            ).map((item) => (
              <Button key={item.value} onClick={() => setEntryType(item.value)} text={item.label} variant="ghost" dark isActive={entryType === item.value} className="w-full justify-start" />
            ))}
          </div>
        </div>

        {!accountId && showAll && (
          <div className="pt-4 border-t border-indigo-900/30">
            <label className="flex items-center gap-2 text-indigo-200 cursor-pointer">
              <input type="checkbox" checked={showZero} onChange={(e) => setShowZero(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-indigo-600" />
              {t("ShowZeroAccounts")}
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
  }, [setSidebarContent, cards.length, accountOptions, accountId, subcontoTypes, subcontoLinkId, activeSubcontoType, subcontoValueOptions, subcontoValueId, entryType, showZero, showAll, t]);

  const renderRow = (row: Row, groupedIdx: number) => {
    const measureProps = { "data-index": groupedIdx, ref: rowVirtualizer.measureElement };

    if (row.kind === "header") {
      return (
        <tr key={row.key} {...measureProps} className="font-bold bg-indigo-50 dark:bg-indigo-900/30">
          <td colSpan={COLS} className={`${td} border-t-2 border-t-indigo-300 dark:border-t-indigo-700`}>
            {row.card.account_code} {row.card.account_name}
          </td>
        </tr>
      );
    }
    if (row.kind === "opening") {
      return (
        <tr key={row.key} {...measureProps} className="bg-gray-50 dark:bg-gray-800 font-semibold">
          <td className={td} />
          <td className={td} colSpan={3}>{t("OpeningBalance")}</td>
          <td className={td} colSpan={2} />
          <td className={`${td} text-right`}>{fmt(row.card.opening_balance)}</td>
        </tr>
      );
    }
    if (row.kind === "totals") {
      return (
        <tr key={row.key} {...measureProps} className="bg-gray-100 dark:bg-gray-800 font-semibold">
          <td className={td} colSpan={4}>{t("TotalTurnover")}</td>
          <td className={`${td} text-right`}>{fmt(row.card.total_debit)}</td>
          <td className={`${td} text-right`}>{fmt(row.card.total_credit)}</td>
          <td className={td} />
        </tr>
      );
    }
    if (row.kind === "closing") {
      return (
        <tr key={row.key} {...measureProps} className="bg-emerald-100 dark:bg-emerald-900/40 font-semibold">
          <td className={td} />
          <td className={td} colSpan={3}>{t("ClosingBalance")}</td>
          <td className={td} colSpan={2} />
          <td className={`${td} text-right`}>{fmt(row.card.closing_balance)}</td>
        </tr>
      );
    }

    const { item, flatIdx } = row;
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
        {cell(2, `${td} text-center font-mono font-bold text-blue-600 dark:text-blue-400`, item.corr_account)}
        {cell(3, td, item.comment || "—")}
        {cell(4, `${td} text-right text-green-700 dark:text-green-400`, item.debit ? fmt(item.debit) : "—")}
        {cell(5, `${td} text-right text-red-700 dark:text-red-400`, item.credit ? fmt(item.credit) : "—")}
        {cell(6, `${td} text-right font-medium`, fmt(item.balance))}
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
            <h2 className="text-sm md:text-lg font-bold text-gray-800 dark:text-gray-100">{t("AccountCard")}</h2>
            <HelpButton title={t("AccountCard")}>
              <p>
                <b>Карточка счёта</b> — хронологический список всех проводок по счёту(-ам) за период, с бегущим остатком
                после каждой проводки — как в 1С.
              </p>
              <ul>
                <li>
                  <b>Счёт</b> выбирается в правом сайдбаре — без выбора отчёт пуст (карточка счёта нужна для поиска
                  истории ОДНОГО счёта, как в 1С). <b>«Показать все карточки»</b> — отдельный переключатель для редких
                  случаев (сверка/печать за период), когда нужны карточки сразу по всем счетам с активностью.
                </li>
                <li>
                  <b>«Уточнить по субконто»</b> — доступно только когда выбран один счёт с настроенным субконто (например
                  «Контрагент»).
                </li>
                <li>
                  <b>Тип проводки</b> — все / только ручные операции / только созданные документами.
                </li>
                <li>
                  <b>«Показать нулевые счета»</b> (только в режиме «все счета») — по умолчанию скрыты счета без начального
                  остатка, оборота и конечного остатка.
                </li>
                <li>
                  <b>Период, склад, филиал</b> берутся из виджета «Рабочая дата» в правом сайдбаре — те же, что и у других
                  отчётов.
                </li>
                <li>
                  Кнопки-чипы сверху (когда карточек несколько) быстро прокручивают к нужному счёту. Список рендерится
                  окном (видна только прокручиваемая часть) — большая история проводок не тормозит браузер.
                </li>
                <li>
                  Двойной клик по строке (или Enter, если выделена стрелками) открывает исходный документ — только если
                  проводка создана документом, а не вручную.
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
        ) : !accountId && !showAll ? (
          <div className="text-center py-12 text-gray-400">{t("SelectAccountOrShowAll")}</div>
        ) : isLoading ? (
          <Loader containerClass="py-12" text={t("LoadingReport")} progress="indeterminate" />
        ) : cards.length === 0 ? (
          <div className="text-center py-12 text-gray-400">{t("NoDataForPeriod")}</div>
        ) : (
          <>
            {cards.length > 1 && (
              // ✅ sticky top-0 — чипы всегда видны при прокрутке (не уезжают со
              // страницей). Непрозрачный фон обязателен — иначе строки таблицы
              // будут просвечивать под чипами при скролле.
              <div className="sticky top-0 z-20 flex flex-wrap gap-1.5 py-1.5 -mx-2 px-2 bg-white dark:bg-slate-900 print:hidden">
                {cards.map((c, i) => (
                  <button key={c.account_id} type="button" onClick={() => jumpToCard(i)} className="px-2 py-0.5 rounded-full text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors">
                    {c.account_code}
                  </button>
                ))}
              </div>
            )}

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
                    <th className={th}>{t("CorrAccount")}</th>
                    <th className={th}>{t("Comment")}</th>
                    <th className={th}>{t("Debit")}</th>
                    <th className={th}>{t("Credit")}</th>
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
          </>
        )}
      </div>
    </RBACGuard>
  );
};

export default AccountCardPage;
