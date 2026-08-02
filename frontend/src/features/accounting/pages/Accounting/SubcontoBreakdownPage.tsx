// frontend/src/features/accounting/pages/Accounting/SubcontoBreakdownPage.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FileSpreadsheet } from "lucide-react";
import { accountApi } from "../../services/accountingApi";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { useRestoreScroll } from "../../../../core/hooks/useRestoreScroll";
import { useSidebar } from "../../../../core/context/SidebarRightContext";
import { useDateStore } from "../../../../core/store/dateStore";
import { focusManager } from "../../../../core/utils/focusManager";
import { playClickSound } from "../../../../core/utils/sound";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import { HelpButton } from "../../../../components/ui/HelpButton";
import { BackButton } from "../../../../components/ui/BackButton";
import { Button } from "../../../../components/ui/Button";
import { Loader } from "../../../../components/ui/Loader";
import SearchableSelect, { type SelectOption } from "../../../../components/ui/SearchableSelect";
import { useCompany } from "../../../../core/context/CompanyContext";
import { useUser } from "../../../../core/context/UserContext";
import { ROUTES } from "../../../../core/router/routes";
import { exportSubcontoBreakdownExcel } from "./exportSubcontoBreakdownExcel";

const COLS = 8; // №, субконто, Дт/Кт открыт., Дт/Кт оборот, Дт/Кт закрыт — 8 "колонок" для навигации
const NO_AGENT_KEY = "__no_agent__";

interface BreakdownRow {
  subconto_id: number | null;
  subconto_label: string;
  opening_debit: number;
  opening_credit: number;
  debit_turnover: number;
  credit_turnover: number;
  closing_debit: number;
  closing_credit: number;
  agent_id: number | null;
  agent_label: string | null;
}

interface BreakdownResponse {
  items: BreakdownRow[];
  totals: Totals;
  account_code: string;
  account_name: string;
  subconto_name: string;
}

interface AccountSubcontoOption {
  id: number;
  subconto_type: number;
  subconto_type_detail: { id: number; name: string; slug: string };
}

interface Totals {
  opening_debit: number; opening_credit: number;
  debit_turnover: number; credit_turnover: number;
  closing_debit: number; closing_credit: number;
}

const ZERO_TOTALS: Totals = { opening_debit: 0, opening_credit: 0, debit_turnover: 0, credit_turnover: 0, closing_debit: 0, closing_credit: 0 };

const sumRows = (rows: BreakdownRow[]): Totals =>
  rows.reduce(
    (acc, r) => ({
      opening_debit: acc.opening_debit + r.opening_debit,
      opening_credit: acc.opening_credit + r.opening_credit,
      debit_turnover: acc.debit_turnover + r.debit_turnover,
      credit_turnover: acc.credit_turnover + r.credit_turnover,
      closing_debit: acc.closing_debit + r.closing_debit,
      closing_credit: acc.closing_credit + r.closing_credit,
    }),
    { ...ZERO_TOTALS },
  );

const fmt = (v: number | string) => {
  const n = Number(v) || 0;
  return n === 0 ? "—" : n.toLocaleString("ru-RU", { minimumFractionDigits: 2 });
};

const td = "border border-black dark:border-gray-700 px-1.5 py-1 text-xs md:text-sm whitespace-nowrap";
const th = "border border-black dark:border-gray-600 px-1.5 py-1 text-xs md:text-sm font-semibold text-center whitespace-nowrap";
const ring = (rowIdx: number, colIdx: number, selectedCell: { rowIdx: number; colIdx: number } | null) =>
  selectedCell?.rowIdx === rowIdx && selectedCell?.colIdx === colIdx ? "shadow-[inset_0_0_0_2px_#eab308] bg-yellow-100/70 dark:bg-yellow-500/10" : "";
const rowRing = (rowIdx: number, selectedCell: { rowIdx: number; colIdx: number } | null) =>
  selectedCell?.rowIdx === rowIdx ? "!bg-yellow-50 dark:!bg-yellow-500/5" : "";

const SubcontoBreakdownPage = () => {
  const { t } = useTranslation();
  const { accountId } = useParams<{ accountId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { canView } = usePageAccess("journalentry");
  const { company } = useCompany();
  const { user } = useUser();
  const { setSidebarContent } = useSidebar();
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedCell, setSelectedCell] = useState<{ rowIdx: number; colIdx: number } | null>(null);
  const [showZero, setShowZero] = useState(false);
  const [groupByAgent, setGroupByAgent] = useState(false);
  const [agentFilter, setAgentFilter] = useState<number | null>(null);
  const restoredRef = useRef(false);

  const { getBackProps } = useRestoreScroll("selectedOsvAccountId", () => {});

  // ✅ Живое чтение из useDateStore(), а не замороженные значения из URL —
  // см. CLAUDE.md: drill-down отчёты обязаны реагировать на WorkDateWidget
  // так же, как и страница, с которой на них перешли.
  const { periodFrom, periodTo, workBranch, workWarehouse } = useDateStore();
  const dateFrom = periodFrom ?? "";
  const dateTo = periodTo ?? "";
  const warehouse = workWarehouse?.id ? String(workWarehouse.id) : undefined;
  const branch = !workWarehouse?.id && workBranch?.id ? String(workBranch.id) : undefined;

  const subcontoSlug = searchParams.get("subconto_slug") ?? "";

  const { data: accountDetail } = useQuery({
    queryKey: ["account-detail", accountId],
    queryFn: () => accountApi.getAccountDetail(Number(accountId)),
    enabled: !!accountId && canView,
  });

  const subcontoOptions: AccountSubcontoOption[] = accountDetail?.account_subcontos ?? [];

  // ✅ Если в URL ещё нет subconto_slug (первый заход по ссылке из ОСВ) — как
  // только узнали список субконто счёта, подставляем первый по order.
  useEffect(() => {
    if (!subcontoSlug && subcontoOptions.length > 0) {
      const next = new URLSearchParams(searchParams);
      next.set("subconto_slug", subcontoOptions[0].subconto_type_detail.slug);
      setSearchParams(next, { replace: true });
    }
  }, [subcontoSlug, subcontoOptions, searchParams, setSearchParams]);

  const { data, isLoading } = useQuery<BreakdownResponse>({
    queryKey: ["subconto-breakdown", accountId, subcontoSlug, dateFrom, dateTo, warehouse, branch, showZero],
    queryFn: () =>
      accountApi.getSubcontoBreakdown({
        account: accountId!,
        subconto_slug: subcontoSlug,
        date_from: dateFrom,
        date_to: dateTo,
        warehouse,
        branch,
        show_zero: showZero,
      }),
    enabled: !!accountId && !!subcontoSlug && !!dateFrom && !!dateTo && canView,
  });

  // ✅ Группировка/фильтр по агенту доступны только если субконто этого счёта
  // реально ссылается на модель с полем agent (Counterparty) — иначе backend
  // всегда отдаёт agent_id=null для всех строк.
  const supportsAgentGrouping = useMemo(() => (data?.items ?? []).some((r) => r.agent_id !== null), [data]);

  const agentOptions: SelectOption[] = useMemo(() => {
    if (!data) return [];
    const map = new Map<number, string>();
    for (const r of data.items) {
      if (r.agent_id != null) map.set(r.agent_id, r.agent_label ?? String(r.agent_id));
    }
    return [...map.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [data]);

  const filteredItems = useMemo(() => {
    if (!data) return [];
    return agentFilter != null ? data.items.filter((r) => r.agent_id === agentFilter) : data.items;
  }, [data, agentFilter]);

  const grandTotals = useMemo(() => sumRows(filteredItems), [filteredItems]);

  // ✅ Один и тот же порядок/нумерация строк лежит в основе и клавиатурной
  // навигации (единая последовательность на весь список, включая все группы —
  // см. CLAUDE.md: "grouped view" не освобождает от focus-поведения как в
  // Table.tsx), и визуальной разбивки на отдельные таблицы по агенту ниже.
  const flatRows: BreakdownRow[] = useMemo(() => {
    if (!groupByAgent) return filteredItems;
    return [...filteredItems].sort((a, b) => {
      const la = a.agent_label ?? t("NoAgent");
      const lb = b.agent_label ?? t("NoAgent");
      return la !== lb ? la.localeCompare(lb) : a.subconto_label.localeCompare(b.subconto_label);
    });
  }, [filteredItems, groupByAgent, t]);

  // ✅ Только для визуальной разбивки на отдельные таблицы (не влияет на нумерацию
  // rowIdx — она общая на весь flatRows).
  const groupSegments = useMemo(() => {
    if (!groupByAgent) return null;
    const segments: { label: string; startIdx: number; endIdx: number; totals: Totals }[] = [];
    let current: (typeof segments)[number] | null = null;
    let currentKey: string | null = null;
    flatRows.forEach((row, idx) => {
      const key = row.agent_id != null ? String(row.agent_id) : NO_AGENT_KEY;
      if (key !== currentKey) {
        current = { label: row.agent_label ?? t("NoAgent"), startIdx: idx, endIdx: idx, totals: { ...ZERO_TOTALS } };
        segments.push(current);
        currentKey = key;
      }
      current!.endIdx = idx;
    });
    for (const seg of segments) {
      seg.totals = sumRows(flatRows.slice(seg.startIdx, seg.endIdx + 1));
    }
    return segments;
  }, [flatRows, groupByAgent, t]);

  const openCard = useCallback(
    (row: BreakdownRow) => {
      if (row.subconto_id == null) return;
      sessionStorage.setItem("selectedSubcontoBreakdownRow", String(row.subconto_id));
      const params = new URLSearchParams({ subconto_slug: subcontoSlug });
      navigate(
        `${ROUTES.APP.ACCOUNTING_SUBCONTO_CARD.replace(":accountId", String(accountId)).replace(":subcontoId", String(row.subconto_id))}?${params.toString()}`,
      );
    },
    [accountId, subcontoSlug, navigate],
  );

  const scrollToCell = useCallback((rowIdx: number, colIdx: number) => {
    requestAnimationFrame(() => {
      const cell = containerRef.current?.querySelector(`[data-row-idx="${rowIdx}"][data-col-idx="${colIdx}"]`);
      cell?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    });
  }, []);

  // ✅ Только выбирает строку (визуальная подсветка + стартовая точка для
  // будущей навигации стрелками) — НЕ трогает focusManager.setRegion(). Регион
  // должен меняться исключительно по настоящему фокусу (см. onFocus на
  // контейнере ниже и правило в CLAUDE.md), а не как побочный эффект пересчёта
  // данных. Раньше здесь безусловно стоял setRegion("table") — этот эффект
  // перезапускается и при смене groupByAgent/agentFilter, которые переключаются
  // чекбоксами В САЙДБАРЕ, поэтому клик по чекбоксу сам же откатывал регион
  // обратно на "table" сразу после того, как сайдбар его корректно захватил.
  useEffect(() => {
    if (!flatRows.length || restoredRef.current) return;
    restoredRef.current = true;
    const savedId = sessionStorage.getItem("selectedSubcontoBreakdownRow");
    if (savedId) {
      sessionStorage.removeItem("selectedSubcontoBreakdownRow");
      const idx = flatRows.findIndex((r) => String(r.subconto_id) === savedId);
      if (idx !== -1) {
        setSelectedCell({ rowIdx: idx, colIdx: 1 });
        scrollToCell(idx, 1);
        return;
      }
    }
    setSelectedCell({ rowIdx: 0, colIdx: 1 });
  }, [flatRows, scrollToCell]);

  // ✅ Сброс на пересборку списка (смена группировки/фильтра/периода) — иначе
  // restoredRef держит старое выделение, привязанное к другому flatRows.
  useEffect(() => {
    restoredRef.current = false;
  }, [groupByAgent, agentFilter, dateFrom, dateTo, warehouse, branch, subcontoSlug]);

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
        const row = flatRows[rowIdx];
        if (row) openCard(row);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedCell, flatRows, scrollToCell, openCard]);

  const handleExportExcel = useCallback(() => {
    if (!data) return;
    // ✅ Экспорт воспроизводит ровно то, что настроено на странице (см. CLAUDE.md:
    // экран/печать/Excel не должны расходиться) — если включена группировка по
    // агенту, передаём те же сегменты (label+rows+totals), что рисуются отдельными
    // таблицами на экране, а не плоский список.
    const exportSegments = groupByAgent && groupSegments
      ? groupSegments.map((seg) => ({
          label: seg.label,
          rows: flatRows.slice(seg.startIdx, seg.endIdx + 1),
          totals: seg.totals,
        }))
      : null;
    exportSubcontoBreakdownExcel({
      company,
      user,
      t,
      dateFrom,
      dateTo,
      accountCode: data.account_code,
      accountName: data.account_name,
      subcontoName: data.subconto_name,
      rows: filteredItems,
      totals: grandTotals,
      groupSegments: exportSegments,
    });
  }, [data, filteredItems, grandTotals, groupByAgent, groupSegments, flatRows, company, user, t, dateFrom, dateTo]);

  // ✅ Фильтры/настройки отчёта — в правом сайдбаре (как ProductTurnoverPage.tsx/OSVPage.tsx).
  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <button
          type="button"
          onClick={handleExportExcel}
          disabled={!data}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-medium text-sm hover:bg-emerald-500/20 hover:border-emerald-400/60 active:scale-95 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <FileSpreadsheet className="w-4 h-4" />
          {t("ExportToExcel")}
        </button>

        {subcontoOptions.length > 1 && (
          <div className="pt-4 border-t border-indigo-900/30">
            <h4 className="font-bold text-indigo-300 mb-2 uppercase tracking-wider">{t("SubcontoType")}</h4>
            <div className="flex flex-col gap-1">
              {subcontoOptions.map((opt) => (
                <Button
                  key={opt.id}
                  variant="ghost"
                  dark
                  isActive={subcontoSlug === opt.subconto_type_detail.slug}
                  className="w-full justify-start"
                  text={opt.subconto_type_detail.name}
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    next.set("subconto_slug", opt.subconto_type_detail.slug);
                    setSearchParams(next);
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {supportsAgentGrouping && (
          <div className="pt-4 border-t border-indigo-900/30">
            <h4 className="font-bold text-indigo-300 mb-2 uppercase tracking-wider">{t("Agent")}</h4>
            <SearchableSelect theme="sidebar" options={agentOptions} value={agentFilter} onChange={setAgentFilter} placeholder={t("All")} />
          </div>
        )}

        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2 uppercase tracking-wider">{t("Settings")}</h4>
          <label className="flex items-center gap-2 text-indigo-200 cursor-pointer">
            <input type="checkbox" checked={showZero} onChange={(e) => setShowZero(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-indigo-600" />
            {t("ShowZeroAccounts")}
          </label>
          {supportsAgentGrouping && (
            <label className="flex items-center gap-2 text-indigo-200 cursor-pointer mt-2">
              <input type="checkbox" checked={groupByAgent} onChange={(e) => setGroupByAgent(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-indigo-600" />
              {t("GroupByAgent")}
            </label>
          )}
        </div>

        <div className="pt-2 border-t border-indigo-900/30 text-indigo-400/60 space-y-1">
          <p>{t("PeriodSetAbove")}</p>
        </div>
      </div>,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSidebarContent, data, showZero, groupByAgent, agentFilter, agentOptions, supportsAgentGrouping, subcontoOptions, subcontoSlug, t]);

  const renderHeaderRow = () => (
    <thead>
      <tr className="bg-gray-100 dark:bg-gray-800">
        <th rowSpan={2} className={th}>№</th>
        <th rowSpan={2} className={th}>{data?.subconto_name}</th>
        <th colSpan={2} className={th}>{t("OpeningBalance")}</th>
        <th colSpan={2} className={th}>{t("PeriodTurnover")}</th>
        <th colSpan={2} className={th}>{t("ClosingBalance")}</th>
      </tr>
      <tr className="bg-gray-50 dark:bg-gray-800/60">
        <th className={th}>{t("Debit")}</th><th className={th}>{t("Credit")}</th>
        <th className={th}>{t("Debit")}</th><th className={th}>{t("Credit")}</th>
        <th className={th}>{t("Debit")}</th><th className={th}>{t("Credit")}</th>
      </tr>
    </thead>
  );

  const renderRow = (r: BreakdownRow, rowIdx: number) => {
    const cell = (colIdx: number, className: string, content: React.ReactNode) => (
      <td
        data-row-idx={rowIdx}
        data-col-idx={colIdx}
        onClick={() => selectCell(rowIdx, colIdx)}
        className={`${className} cursor-pointer ${ring(rowIdx, colIdx, selectedCell)}`}
      >
        {content}
      </td>
    );
    return (
      <tr
        key={r.subconto_id ?? rowIdx}
        className={`hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors ${rowRing(rowIdx, selectedCell)}`}
        onDoubleClick={() => openCard(r)}
      >
        {cell(0, `${td} text-center`, rowIdx + 1)}
        {cell(1, td, r.subconto_label)}
        {cell(2, `${td} text-right`, fmt(r.opening_debit))}
        {cell(3, `${td} text-right`, fmt(r.opening_credit))}
        {cell(4, `${td} text-right text-green-700 dark:text-green-400`, fmt(r.debit_turnover))}
        {cell(5, `${td} text-right text-red-700 dark:text-red-400`, fmt(r.credit_turnover))}
        {cell(6, `${td} text-right font-medium`, fmt(r.closing_debit))}
        {cell(7, `${td} text-right font-medium`, fmt(r.closing_credit))}
      </tr>
    );
  };

  const renderTotalsRow = (label: string, totals: Totals, emphasize = false) => (
    <tr className={emphasize ? "bg-gray-100 dark:bg-gray-800 font-semibold" : "bg-gray-50 dark:bg-gray-800/60 font-medium"}>
      <td className={td} colSpan={2}>{label}</td>
      <td className={`${td} text-right`}>{fmt(totals.opening_debit)}</td>
      <td className={`${td} text-right`}>{fmt(totals.opening_credit)}</td>
      <td className={`${td} text-right`}>{fmt(totals.debit_turnover)}</td>
      <td className={`${td} text-right`}>{fmt(totals.credit_turnover)}</td>
      <td className={`${td} text-right`}>{fmt(totals.closing_debit)}</td>
      <td className={`${td} text-right`}>{fmt(totals.closing_credit)}</td>
    </tr>
  );

  return (
    <RBACGuard isLoading={false} error={null} canView={canView} forbiddenText={t("ForbiddenText")}>
      <div className="space-y-3 p-2">
        <div className="flex items-center gap-2">
          <BackButton id={Number(accountId) || 0} getBackProps={getBackProps} />
          <h2 className="text-sm md:text-lg font-bold text-gray-800 dark:text-gray-100">
            {t("AccountCard")}: {data?.account_code ?? accountDetail?.code} {data?.account_name ?? accountDetail?.name}
          </h2>
          <HelpButton title={t("AccountCard")}>
            <p>
              <b>{t("AccountCard")}</b> — детализация счёта по субконто: по каждому значению (например, по каждому
              контрагенту) — начальное сальдо, обороты за период и конечное сальдо. Двойной клик по строке (или
              Enter на выделенной) открывает полную карточку — список всех проводок именно по этому значению с
              бегущим остатком.
            </p>
            <ul>
              <li>
                <b>Период</b> и <b>склад/филиал</b> — из виджета «Период отчётов» в правом сайдбаре, как и везде;
                смените их там — отчёт обновится сам.
              </li>
              {subcontoOptions.length > 1 && (
                <li>
                  <b>Вид субконто</b> (правый сайдбар) — у этого счёта настроено несколько видов субконто;
                  переключайтесь между ними, чтобы посмотреть детализацию по другому разрезу.
                </li>
              )}
              <li>
                <b>«Показать нулевые»</b> (правый сайдбар) — включает строки, у которых все суммы за период равны нулю
                (по умолчанию скрыты).
              </li>
              {supportsAgentGrouping && (
                <>
                  <li>
                    <b>Фильтр «Агент»</b> (правый сайдбар) — сужает список до клиентов только одного агента.
                  </li>
                  <li>
                    <b>«Группировать по агенту»</b> (правый сайдбар) — разбивает список на отдельные таблицы по агенту,
                    назначенному каждому контрагенту (см. карточку контрагента → поле «Агент»), с подытогом под каждой
                    таблицей. Стрелками/Enter можно перемещаться по всему списку сквозным образом, как в обычном режиме.
                  </li>
                </>
              )}
            </ul>
          </HelpButton>
        </div>

        {dateFrom && dateTo && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {t("Period")}: {new Date(dateFrom).toLocaleDateString("ru-RU")} — {new Date(dateTo).toLocaleDateString("ru-RU")}
          </span>
        )}

        {isLoading ? (
          <Loader containerClass="py-12" text={t("LoadingReport")} progress="indeterminate" />
        ) : !data || flatRows.length === 0 ? (
          <div className="text-center py-12 text-gray-400">{t("NoDataForPeriod")}</div>
        ) : (
          <div ref={containerRef} onFocus={() => focusManager.setRegion("table")} tabIndex={-1}>
            {groupByAgent && groupSegments ? (
              <div className="space-y-4">
                {groupSegments.map((seg) => (
                  <div key={seg.label} className="overflow-x-auto rounded-lg border border-black dark:border-gray-700">
                    <div className="px-2 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 font-semibold text-xs md:text-sm text-gray-800 dark:text-gray-200">
                      {seg.label}
                    </div>
                    <table className="border-collapse w-full text-xs md:text-sm tabular-nums bg-white dark:bg-gray-900">
                      {renderHeaderRow()}
                      <tbody>
                        {flatRows.slice(seg.startIdx, seg.endIdx + 1).map((r, i) => renderRow(r, seg.startIdx + i))}
                      </tbody>
                      <tfoot>{renderTotalsRow(`${t("Total")}: ${seg.label}`, seg.totals)}</tfoot>
                    </table>
                  </div>
                ))}
                <div className="overflow-x-auto rounded-lg border border-black dark:border-gray-700">
                  <table className="border-collapse w-full text-xs md:text-sm tabular-nums bg-white dark:bg-gray-900">
                    <tbody>{renderTotalsRow(t("GrandTotal"), grandTotals, true)}</tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-black dark:border-gray-700">
                <table className="border-collapse w-full text-xs md:text-sm tabular-nums bg-white dark:bg-gray-900">
                  {renderHeaderRow()}
                  <tbody>{flatRows.map((r, i) => renderRow(r, i))}</tbody>
                  <tfoot>{renderTotalsRow(t("GrandTotal"), grandTotals, true)}</tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </RBACGuard>
  );
};

export default SubcontoBreakdownPage;
