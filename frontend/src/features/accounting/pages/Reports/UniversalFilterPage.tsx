// frontend/src/features/accounting/pages/Reports/UniversalFilterPage.tsx
import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { FileSpreadsheet } from "lucide-react";
import { accountApi } from "../../services/accountingApi";
import { warehouseApi, counterpartyApi, productApi } from "../../services/productApi";
import { employeeApi } from "../../services/employeeApi";
import { useDateStore } from "../../../../core/store/dateStore";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import { Loader } from "../../../../components/ui/Loader";
import { useSidebar } from "../../../../core/context/SidebarRightContext";
import { useCompany } from "../../../../core/context/CompanyContext";
import { useUser } from "../../../../core/context/UserContext";
import { HelpButton } from "../../../../components/ui/HelpButton";
import { ROUTES } from "../../../../core/router/routes";
import { UniversalFilterTable } from "../../../../components/ui/Table/UniversalFilterTable";
import MultiSearchableSelect from "../../../../components/ui/MultiSearchableSelect";
import { type SelectOption } from "../../../../components/ui/SearchableSelect";
import { type UniversalFilterGroupBy, type UniversalFilterRow, documentTypeLabel } from "./universalFilterColumns";
import { exportUniversalFilterExcel } from "./exportUniversalFilterExcel";

const ALL_DOCUMENT_TYPES = ["in", "out", "move", "return_in", "return_out"] as const;
const GROUP_BY_OPTIONS: UniversalFilterGroupBy[] = ["none", "product", "counterparty", "employee", "warehouse", "document_type"];

const UniversalFilterPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { periodFrom, periodTo, workBranch, workWarehouse } = useDateStore();
  const { canView } = usePageAccess("document");
  const { setSidebarContent } = useSidebar();
  const { company } = useCompany();
  const { user } = useUser();

  const [documentTypes, setDocumentTypes] = useState<string[]>([...ALL_DOCUMENT_TYPES]);
  const [status, setStatus] = useState<"posted" | "draft" | "all">("posted");
  const [groupBy, setGroupBy] = useState<UniversalFilterGroupBy>("none");
  const [warehouseIds, setWarehouseIds] = useState<number[]>([]);
  const [warehouseToIds, setWarehouseToIds] = useState<number[]>([]);
  const [counterpartyIds, setCounterpartyIds] = useState<number[]>([]);
  const [employeeIds, setEmployeeIds] = useState<number[]>([]);
  const [productIds, setProductIds] = useState<number[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // ✅ Лёгкий debounce на текстовый поиск — иначе каждый набранный символ
  // сразу переоткрывает запрос (search стоит в queryKey ниже).
  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const toggleDocumentType = (type: string) => {
    setDocumentTypes((prev) => (prev.includes(type) ? prev.filter((t2) => t2 !== type) : [...prev, type]));
  };

  // ── Справочники для мультиселектов ──────────────────────────────────────

  const { data: warehousesData } = useQuery({ queryKey: ["universal-filter-warehouses"], queryFn: () => warehouseApi.getAll(), staleTime: 5 * 60 * 1000 });
  const { data: counterpartiesData } = useQuery({ queryKey: ["universal-filter-counterparties"], queryFn: () => counterpartyApi.getAll(), staleTime: 5 * 60 * 1000 });
  const { data: employeesData } = useQuery({ queryKey: ["universal-filter-employees"], queryFn: () => employeeApi.getAll(), staleTime: 5 * 60 * 1000 });
  const { data: productsData } = useQuery({ queryKey: ["universal-filter-products"], queryFn: () => productApi.getAllLight(), staleTime: 5 * 60 * 1000 });

  const warehouseOptions: SelectOption[] = useMemo(() => (warehousesData ?? []).map((w: { id: number; name: string }) => ({ id: w.id, label: w.name })), [warehousesData]);
  const counterpartyOptions: SelectOption[] = useMemo(() => (counterpartiesData ?? []).map((c: { id: number; name: string }) => ({ id: c.id, label: c.name })), [counterpartiesData]);
  const employeeOptions: SelectOption[] = useMemo(() => (employeesData ?? []).map((e: { id: number; full_name: string }) => ({ id: e.id, label: e.full_name })), [employeesData]);
  const productOptions: SelectOption[] = useMemo(() => (productsData ?? []).map((p: { id: number; name: string }) => ({ id: p.id, label: p.name })), [productsData]);

  // ── Данные отчёта ────────────────────────────────────────────────────────

  const warehouseParam = warehouseIds.length > 0 ? warehouseIds.join(",") : workWarehouse?.id ? String(workWarehouse.id) : undefined;
  const branchParam = warehouseIds.length > 0 ? undefined : !workWarehouse?.id && workBranch?.id ? String(workBranch.id) : undefined;

  const { data, isLoading } = useQuery({
    queryKey: [
      "universal-filter", periodFrom, periodTo, documentTypes.join(","), status, groupBy,
      warehouseParam, branchParam, warehouseToIds.join(","), counterpartyIds.join(","),
      employeeIds.join(","), productIds.join(","), search,
    ],
    queryFn: () =>
      accountApi.getUniversalFilter({
        date_from: periodFrom!, date_to: periodTo!,
        document_type: documentTypes.join(","), status, group_by: groupBy,
        ...(warehouseParam ? { warehouse: warehouseParam } : {}),
        ...(branchParam ? { branch: branchParam } : {}),
        ...(warehouseToIds.length > 0 ? { warehouse_to: warehouseToIds.join(",") } : {}),
        ...(counterpartyIds.length > 0 ? { counterparty: counterpartyIds.join(",") } : {}),
        ...(employeeIds.length > 0 ? { employee: employeeIds.join(",") } : {}),
        ...(productIds.length > 0 ? { product: productIds.join(",") } : {}),
        ...(search ? { search } : {}),
      }),
    enabled: !!periodFrom && !!periodTo && canView,
  });

  const rows = useMemo<UniversalFilterRow[]>(() => data?.rows ?? [], [data]);
  const totals = useMemo<UniversalFilterRow>(() => data?.totals ?? {}, [data]);
  const hasProfit = data?.has_profit ?? false;

  // ✅ Drill-down "внутри страницы": Enter/F2 на групповой строке сужает
  // фильтр до этого измерения и переключает группировку на 'none' — не уходим
  // на отдельную под-страницу под каждое измерение (см. план фичи).
  const handleDrillDown = useCallback(
    (row: UniversalFilterRow) => {
      const id = row.group_id;
      if (id == null) return;
      if (groupBy === "product") setProductIds([Number(id)]);
      else if (groupBy === "counterparty") setCounterpartyIds([Number(id)]);
      else if (groupBy === "employee") setEmployeeIds([Number(id)]);
      else if (groupBy === "warehouse") setWarehouseIds([Number(id)]);
      else if (groupBy === "document_type") setDocumentTypes([String(id)]);
      setGroupBy("none");
    },
    [groupBy],
  );

  const handleOpenDocument = useCallback(
    (documentId: number) => navigate(ROUTES.APP.DOCUMENTS_VIEW.replace(":id", String(documentId))),
    [navigate],
  );

  const handleExportExcel = () => {
    if (!periodFrom || !periodTo || rows.length === 0) return;
    exportUniversalFilterExcel({ company, user, t, periodFrom, periodTo, groupBy, hasProfit, rows, totals });
  };

  // ── Сайдбар — все фильтры + экспорт ─────────────────────────────────────

  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <button
          type="button"
          onClick={handleExportExcel}
          disabled={rows.length === 0}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-medium text-sm hover:bg-emerald-500/20 hover:border-emerald-400/60 active:scale-95 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <FileSpreadsheet className="w-4 h-4" />
          {t("ExportToExcel")}
        </button>

        <div>
          <h4 className="font-bold text-indigo-300 mb-2 uppercase tracking-wider text-xs">{t("DocumentType")}</h4>
          <div className="flex flex-wrap gap-2">
            {ALL_DOCUMENT_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-indigo-900 bg-slate-900 text-indigo-200 text-xs cursor-pointer">
                <input type="checkbox" checked={documentTypes.includes(type)} onChange={() => toggleDocumentType(type)} className="w-3.5 h-3.5 rounded" />
                {documentTypeLabel(t, type)}
              </label>
            ))}
          </div>
        </div>

        <div>
          <h4 className="font-bold text-indigo-300 mb-1 uppercase tracking-wider text-xs">{t("Status")}</h4>
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="w-full px-2 py-1.5 rounded-lg border border-indigo-900 bg-slate-900 text-indigo-200 text-sm">
            <option value="posted">{t("Posted")}</option>
            <option value="draft">{t("Draft")}</option>
            <option value="all">{t("AllStatuses")}</option>
          </select>
        </div>

        <div>
          <h4 className="font-bold text-indigo-300 mb-1 uppercase tracking-wider text-xs">{t("GroupBy")}</h4>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as UniversalFilterGroupBy)} className="w-full px-2 py-1.5 rounded-lg border border-indigo-900 bg-slate-900 text-indigo-200 text-sm">
            {GROUP_BY_OPTIONS.map((gb) => (
              <option key={gb} value={gb}>
                {t(`GroupBy_${gb}`)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <h4 className="font-bold text-indigo-300 mb-1 uppercase tracking-wider text-xs">{t("Warehouse")}</h4>
          <MultiSearchableSelect options={warehouseOptions} value={warehouseIds} onChange={setWarehouseIds} placeholder={t("SelectWarehouses")} theme="sidebar" />
        </div>

        {documentTypes.includes("move") && (
          <div>
            <h4 className="font-bold text-indigo-300 mb-1 uppercase tracking-wider text-xs">{t("WarehouseTo")}</h4>
            <MultiSearchableSelect options={warehouseOptions} value={warehouseToIds} onChange={setWarehouseToIds} placeholder={t("SelectWarehouses")} theme="sidebar" />
          </div>
        )}

        <div>
          <h4 className="font-bold text-indigo-300 mb-1 uppercase tracking-wider text-xs">{t("Counterparty")}</h4>
          <MultiSearchableSelect options={counterpartyOptions} value={counterpartyIds} onChange={setCounterpartyIds} placeholder={t("SelectCounterparties")} theme="sidebar" />
        </div>

        <div>
          <h4 className="font-bold text-indigo-300 mb-1 uppercase tracking-wider text-xs">{t("Employee")}</h4>
          <MultiSearchableSelect options={employeeOptions} value={employeeIds} onChange={setEmployeeIds} placeholder={t("SelectEmployees")} theme="sidebar" />
        </div>

        <div>
          <h4 className="font-bold text-indigo-300 mb-1 uppercase tracking-wider text-xs">{t("Product")}</h4>
          <MultiSearchableSelect options={productOptions} value={productIds} onChange={setProductIds} placeholder={t("SelectProducts")} theme="sidebar" />
        </div>

        <div>
          <h4 className="font-bold text-indigo-300 mb-1 uppercase tracking-wider text-xs">{t("Search")}</h4>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("SearchByNumberOrNote")}
            className="w-full px-2 py-1.5 rounded-lg border border-indigo-900 bg-slate-900 text-indigo-200 text-sm placeholder-indigo-500/50"
          />
        </div>
      </div>,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    setSidebarContent, t, rows.length, documentTypes, status, groupBy,
    warehouseIds, warehouseToIds, counterpartyIds, employeeIds, productIds, searchInput,
    warehouseOptions, counterpartyOptions, employeeOptions, productOptions,
  ]);

  return (
    <RBACGuard isLoading={false} error={null} canView={canView} forbiddenText={t("ForbiddenText")}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm md:text-lg font-bold text-gray-800 dark:text-gray-100">{t("UniversalFilterTitle")}</h2>
            <HelpButton title={t("UniversalFilterTitle")}>
              <p>
                <b>{t("UniversalFilterTitle")}</b> — гибкий отчёт-конструктор по документам: тип документа, склад(-ы)/филиал,
                контрагент, сотрудник-участник, товар, текстовый поиск — любая комбинация, плюс группировка.
              </p>
              <ul>
                <li>
                  <b>Период и склад/филиал по умолчанию</b> берутся из виджета «Период отчётов» в правом сайдбаре — те же,
                  что и у других отчётов. Мультивыбор склада/контрагента/сотрудника/товара в сайдбаре сужает результат
                  дополнительно, поверх этого выбора.
                </li>
                <li>
                  <b>Группировка</b> (сайдбар) — «Без группировки» показывает построчно каждую строку документа; остальные
                  варианты суммируют по товару / контрагенту / сотруднику / складу / типу документа.
                </li>
                <li>
                  <b>Колонка «Прибыль»</b> появляется только когда выбраны исключительно «продажные» типы документа
                  (Расход/Возврат от покупателя) — для Прихода/Перемещения/Возврата поставщику прибыль не считается.
                </li>
                <li>
                  <b>Двойной клик / Enter / F2</b> на строке: в группированном режиме — «спускается» внутрь этой группы
                  (группировка переключается на «Без группировки», фильтр сужается); в построчном режиме — открывает сам
                  документ (только просмотр).
                </li>
                <li>
                  <b>«Экспорт в Excel»</b> (правый сайдбар) выгружает ровно то, что видно на экране, для текущей
                  группировки.
                </li>
              </ul>
            </HelpButton>
          </div>
          {periodFrom && periodTo && (
            <span className="text-gray-500 dark:text-gray-400 text-xs md:text-sm">
              {new Date(periodFrom).toLocaleDateString("ru-RU")} — {new Date(periodTo).toLocaleDateString("ru-RU")}
            </span>
          )}
        </div>

        {!periodFrom || !periodTo ? (
          <div className="text-center py-12 text-gray-400">{t("SpecifyPeriod")}</div>
        ) : isLoading ? (
          <Loader containerClass="py-12" text={t("LoadingReport")} progress="indeterminate" />
        ) : (
          <UniversalFilterTable rows={rows} groupBy={groupBy} hasProfit={hasProfit} totals={totals} onDrillDown={handleDrillDown} onOpenDocument={handleOpenDocument} />
        )}
      </div>
    </RBACGuard>
  );
};

export default UniversalFilterPage;
