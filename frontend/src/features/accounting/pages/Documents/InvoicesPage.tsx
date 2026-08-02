// frontend/src/features/accounting/pages/Documents/InvoicesPage.tsx
import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus, Percent, Gift, Package } from "lucide-react";

import { documentApi } from "../../services/documentApi";
import { useNotify } from "../../../../core/context/NotificationContext";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { useSidebar } from "../../../../core/context/SidebarRightContext";
import { usePageHotkeys } from "../../../../core/hooks/usePageHotkeys";
import { useDebouncedValue } from "../../../../core/hooks/useDebouncedValue";

import { Table, type Column } from "../../../../components/ui/Table/Table";
import { Button } from "../../../../components/ui/Button";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { ConfirmModal } from "../../../../components/ui/Modal/ConfirmModal";
import { ImagePreview } from "../../../../components/ui/ImagePreview";
import SearchableSelect from "../../../../components/ui/SearchableSelect";

import type { DocumentList } from "../../../../core/types";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "../../../../core/router/routes";
import { useDateStore } from "../../../../core/store/dateStore";
import { useRestoreScroll } from "../../../../core/hooks/useRestoreScroll";
import { shortDocumentNumber } from "../../../../core/utils/documentNumber";

// Приходная = "in", Расходная = "out"
// Эта страница показывает оба типа (накладные)
const INVOICE_TYPES = ["in", "out", "move", "return_in", "return_out"];

// ✅ Цветовая подсветка строк по типу документа — так удобнее глазами отличать
// приход/расход/возврат в общем списке, не читая колонку "Тип" на каждой строке.
// "move" не входит ни в одну из этих трёх смысловых групп — остаётся без подсветки.
const DOC_TYPE_ROW_COLOR: Record<string, string> = {
  out: "bg-green-100/80 dark:bg-green-800/30 hover:bg-green-200 dark:hover:bg-green-800/50 border-l-4 border-green-500",
  return_in: "bg-red-100/80 dark:bg-red-800/30 hover:bg-red-200 dark:hover:bg-red-800/50 border-l-4 border-red-500",
  return_out: "bg-red-100/80 dark:bg-red-800/30 hover:bg-red-200 dark:hover:bg-red-800/50 border-l-4 border-red-500",
  in: "bg-blue-100/80 dark:bg-blue-800/30 hover:bg-blue-200 dark:hover:bg-blue-800/50 border-l-4 border-blue-500",
};

// ✅ Серверная пагинация (см. CLAUDE.md) — Table.tsx видит только уже загруженную
// с бэкенда страницу, поэтому его собственный "переключиться на страницу с нужной
// строкой" (см. Table.tsx::selectedRowId-эффект по sortedData) для неё не работает:
// нужной строки просто нет в текущих данных, если она была на другой странице.
// Страницу, с которой открыли конкретный документ, HeaderPage.tsx проактивно
// пишет в sessionStorage (см. её собственный комментарий) — но ТОЛЬКО когда документ
// открыт двойным кликом по строке этого списка (через location.state.fromInvoicesPage,
// см. onRowDoubleClick ниже), а не при любом уходе со страницы. Читаем и сразу же
// удаляем ключ (одноразовое потребление, как selectedDocumentId в useRestoreScroll) —
// иначе он остался бы "прилипшим" навсегда и подставлялся бы при любом случайном
// повторном заходе на список, а не только при возврате именно с того документа.
const RETURN_PAGE_STORAGE_KEY = "invoices_list_return_page";
const consumeSessionPage = (): number | null => {
  try {
    const v = sessionStorage.getItem(RETURN_PAGE_STORAGE_KEY);
    if (!v) return null;
    sessionStorage.removeItem(RETURN_PAGE_STORAGE_KEY);
    return Number(v);
  } catch {
    return null;
  }
};

// ✅ Страница (см. выше) восстанавливалась при возврате с документа, а сами
// фильтры/поиск/сортировка — нет (чистый локальный useState, обнуляющийся при
// любом размонтировании страницы). Из-за этого на восстановленной странице
// оказывался уже другой набор строк (фильтр сброшен на "все"), нужного документа
// там не было — и подсветка (см. useRestoreScroll выше) молча "терялась" вместе
// с фильтром. Как и страница — это ОДНОРАЗОВОЕ потребление, привязанное именно к
// открытию документа двойным кликом по строке этого списка (см. onRowDoubleClick
// ниже и HeaderPage.tsx): переход на любую ДРУГУЮ вкладку/страницу приложения и
// обратно на список НЕ должен подставлять старые фильтры — только настоящий
// "туда и обратно" с конкретного документа.
const FILTERS_STORAGE_KEY = "invoices_list_filters";
type InvoiceTypeFilter = "all" | "in" | "out" | "move" | "return_in" | "return_out";
type InvoiceStatusFilter = "all" | "draft" | "posted";
type PersistedInvoiceFilters = {
  searchQuery: string;
  typeFilter: InvoiceTypeFilter;
  statusFilter: InvoiceStatusFilter;
  giftFilter: boolean;
  bundleFilter: boolean;
  createdByFilter: number | null;
  postedByFilter: number | null;
  sortBy: string | null;
  sortDir: "asc" | "desc";
};
const consumePersistedFilters = (): Partial<PersistedInvoiceFilters> => {
  try {
    const raw = sessionStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) return {};
    sessionStorage.removeItem(FILTERS_STORAGE_KEY);
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const InvoicesPage = () => {
  const { t } = useTranslation();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { setSidebarContent } = useSidebar();
  const { canView, canPost, canDelete } = usePageAccess("document");

  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const {} = useRestoreScroll("selectedDocumentId", setHighlightedId);
  const [persistedFilters] = useState(consumePersistedFilters);
  const [searchQuery, setSearchQuery] = useState(persistedFilters.searchQuery ?? "");
  const [typeFilter, setTypeFilter] = useState<InvoiceTypeFilter>(persistedFilters.typeFilter ?? "all");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatusFilter>(persistedFilters.statusFilter ?? "all");
  const [giftFilter, setGiftFilter] = useState(persistedFilters.giftFilter ?? false);
  const [bundleFilter, setBundleFilter] = useState(persistedFilters.bundleFilter ?? false);
  const [createdByFilter, setCreatedByFilter] = useState<number | null>(persistedFilters.createdByFilter ?? null);
  const [postedByFilter, setPostedByFilter] = useState<number | null>(persistedFilters.postedByFilter ?? null);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  // ✅ Раньше "Провести"/"Распровести" срабатывали сразу по клику, без
  // подтверждения (в отличие от удаления и от DocumentFormPage, где есть
  // ConfirmModal) — легко случайно провести не тот документ.
  const [postConfirmId, setPostConfirmId] = useState<number | null>(null);
  const [unpostConfirmId, setUnpostConfirmId] = useState<number | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  // ✅ Сортировка при server-пагинации — храним здесь, а не в Table.tsx, потому что
  // именно эта страница знает, что реально нужно переспросить с бэкенда с новым
  // ordering (см. document_views.py::DOCUMENT_ORDERING_FIELDS). Ключ — accessor
  // колонки из columns ниже (совпадает 1:1 с ключами DOCUMENT_ORDERING_FIELDS).
  const [sortBy, setSortBy] = useState<string | null>(persistedFilters.sortBy ?? null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(persistedFilters.sortDir ?? "asc");
  const navigate = useNavigate();
  // ✅ Раньше эта страница смотрела только на branch/warehouse из WorkDateWidget,
  // но не на periodFrom/periodTo — список накладных не реагировал на диапазон
  // дат в правом сайдбаре вообще (см. CLAUDE.md: любой контент, показывающий
  // данные, обязан фильтроваться и по датам, и по branch/warehouse из WorkDateWidget).
  const { workWarehouse, workBranch, periodFrom, periodTo } = useDateStore();
  const canCreateInvoice = canPost && !!workBranch && !!workWarehouse;

  // ── Пагинация на бэкенде — накладных может быть многие сотни/тысячи, поэтому
  // список всегда отдаётся страницами (см. config/pagination.py::StandardPagination),
  // а не целиком. Фильтры (тип/статус/скидка/подарок/комплектующие) тоже уходят
  // на сервер как query-параметры — иначе они бы работали только в пределах одной
  // уже загруженной страницы, а не по всем накладным (см. document_views.py::DocumentViewSet.get_queryset).
  const [page, setPage] = useState(() => consumeSessionPage() ?? 1);
  const [pageSize, setPageSize] = useState(() => {
    try {
      const saved = localStorage.getItem("table:invoices_list:pageSize");
      return saved ? Number(saved) : 25;
    } catch {
      return 25;
    }
  });

  // ✅ Дебаунс поиска — раньше поиск фильтровал только уже загруженную с бэкенда
  // страницу (useTableFilter), из-за чего документ мог реально существовать, но
  // не находиться, если попадал на другую страницу. Теперь уходит в бэкенд как
  // query-параметр (см. document_views.py), поэтому нужен дебаунс, чтобы не
  // слать запрос на каждое нажатие клавиши.
  const debouncedSearch = useDebouncedValue(searchQuery, 350);

  // ✅ armedRef — сброс страницы на 1 при смене фильтров не активируется первые
  // ~800мс после монтирования. За это время может незаметно "устаканиться" что
  // угодно асинхронное, что меняет значения этих же зависимостей САМО ПО СЕБЕ, без
  // участия пользователя (например useDateStore — zustand+persist — отдаёт
  // дефолтные workBranch/workWarehouse/periodFrom/periodTo на первом рендере и
  // подменяет их на реально сохранённые чуть позже, асинхронно). Флага "не первый
  // рендер" одного недостаточно — он гасит только САМЫЙ первый прогон эффекта, а
  // любое такое "устаканивание" бьёт вторым, уже неотличимым от настоящего
  // изменения фильтра — и без задержки восстановленная из sessionStorage страница
  // тут же сбрасывалась обратно на 1.
  const armedRef = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      armedRef.current = true;
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (!armedRef.current) return;
    setPage(1);
  }, [typeFilter, statusFilter, giftFilter, bundleFilter, createdByFilter, postedByFilter, workWarehouse?.id, workBranch?.id, periodFrom, periodTo, sortBy, sortDir, debouncedSearch]);

  // ✅ Списки для фильтров "Создал"/"Провёл" — только пользователи, реально
  // фигурирующие в документах текущего scope (см. DocumentViewSet.filter_users),
  // а не весь справочник пользователей (не требует отдельного RBAC-права "user").
  const { data: filterUsersData } = useQuery({
    queryKey: ["documents", "filter-users"],
    queryFn: documentApi.getFilterUsers,
    enabled: canView,
    staleTime: 5 * 60 * 1000,
  });
  // ✅ "filterUsersData ?? []" деструктуризацией (data: filterUsers = []) создавал
  // бы НОВУЮ ссылку на каждый рендер, пока запрос ещё грузится (data===undefined) —
  // useMemo ниже эту нестабильность не спасал, т.к. сам зависел от уже нестабильного
  // filterUsers. useMemo здесь кэширует и сам fallback, пока filterUsersData не
  // изменится по ===, устраняя нестабильность на входе.
  const filterUsers = useMemo(() => filterUsersData ?? [], [filterUsersData]);
  // ✅ Обязательно useMemo, а не просто .map() на каждый рендер — этот массив
  // используется в deps эффекта setSidebarContent ниже; setSidebarContent меняет
  // context state (даже при визуально том же JSX, т.к. JSX — всегда новый объект),
  // из-за чего InvoicesPage перерендеривается → без мемоизации userOptions получал
  // бы новую ссылку на каждый такой рендер → эффект срабатывал бы снова → бесконечный
  // цикл (Maximum update depth exceeded).
  const userOptions = useMemo(() => filterUsers.map((u) => ({ id: u.id, label: u.name })), [filterUsers]);

  const queryParams = {
    document_type__in: INVOICE_TYPES.join(","),
    page: String(page),
    page_size: String(pageSize),
    ...(typeFilter !== "all" ? { document_type: typeFilter } : {}),
    ...(statusFilter !== "all" ? { status: statusFilter } : {}),
    ...(giftFilter ? { has_gift: "true" } : {}),
    ...(bundleFilter ? { has_bundle: "true" } : {}),
    ...(createdByFilter ? { created_by: String(createdByFilter) } : {}),
    ...(postedByFilter ? { posted_by: String(postedByFilter) } : {}),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    // Фильтр по складу если выбран
    ...(workWarehouse?.id ? { warehouse: String(workWarehouse.id) } : {}),
    // Фильтр по филиалу если выбран (и склад не выбран)
    ...(workBranch?.id && !workWarehouse?.id ? { branch: String(workBranch.id) } : {}),
    // ✅ Диапазон дат из WorkDateWidget (periodFrom/periodTo) — см. document_views.py,
    // уже поддерживает date_from/date_to, фронт просто не передавал их.
    ...(periodFrom ? { date_from: periodFrom } : {}),
    ...(periodTo ? { date_to: periodTo } : {}),
    // ✅ Сортировка — уходит на бэкенд, а не сортируется на клиенте (клиент видит
    // только одну страницу, локальная сортировка отсортировала бы только её).
    ...(sortBy ? { ordering: sortDir === "desc" ? `-${sortBy}` : sortBy } : {}),
  };

  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["documents", "invoices", queryParams],
    queryFn: () => documentApi.getAll(queryParams),
    enabled: canView,
    placeholderData: (prev) => prev,
    retry: false,
  });

  const invoices: DocumentList[] = Array.isArray(data) ? data : (data?.results ?? []);
  const totalCount: number = Array.isArray(data) ? data.length : (data?.count ?? 0);

  const postMutation = useMutation({
    mutationFn: (id: number) => documentApi.post(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      notify("success", t("DocumentPosted"));
      setHighlightedId(id);
      setPostConfirmId(null);
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", err.response?.data?.detail || t("ErrorPosting"));
      setPostConfirmId(null);
    },
  });

  const unpostMutation = useMutation({
    mutationFn: (id: number) => documentApi.unpost(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      notify("success", t("DocumentUnposted"));
      setHighlightedId(id);
      setUnpostConfirmId(null);
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", err.response?.data?.detail || t("ErrorUnposting"));
      setUnpostConfirmId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => documentApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      notify("success", t("SuccessDeleted"));
      setDeleteId(null);
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", err.response?.data?.detail || t("ErrorDeleting"));
    },
  });

  usePageHotkeys({
    canPost,
    onInsert: () => {
      if (!workBranch || !workWarehouse) {
        notify("error", t("SelectBranchAndWarehouse"));
        return;
      }
      navigate(ROUTES.APP.DOCUMENTS_CREATE);
    },
  });

  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <h4 className="font-bold text-indigo-300">{t("Actions")}</h4>
        <Button
          disabled={!canCreateInvoice}
          title={!canCreateInvoice ? t("SelectBranchAndWarehouse") : undefined}
          text={t("AddInvoice")}
          className="w-full"
          dark={true}
          icon={<Plus className="w-4 h-4" />}
          onClick={() => navigate(ROUTES.APP.DOCUMENTS_CREATE)}
        />

        {/* Фильтр по типу */}
        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2">{t("Type")}</h4>
          <div className="flex flex-col gap-1">
            {(["all", "in", "out", "move", "return_in", "return_out"] as const).map((type) => (
              <Button
                key={type}
                variant="ghost"
                dark={true}
                isActive={typeFilter === type}
                className="w-full justify-start"
                text={type === "all" ? t("All") : type === "in" ? t("Incoming") : type === "out" ? t("Outgoing") : type === "move" ? t("Move") : type === "return_in" ? t("ReturnIn") : t("ReturnOut")}
                onClick={() => setTypeFilter(type)}
              />
            ))}
          </div>
        </div>

        {/* Фильтр по статусу */}
        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2">{t("Status")}</h4>
          <div className="flex flex-col gap-1">
            {(["all", "draft", "posted"] as const).map((s) => (
              <Button
                key={s}
                variant="ghost"
                dark={true}
                isActive={statusFilter === s}
                className="w-full justify-start"
                text={s === "all" ? t("AllStatuses") : s === "draft" ? t("Draft") : t("Posted")}
                onClick={() => setStatusFilter(s)}
              />
            ))}
          </div>
        </div>

        {/* Фильтр по особым отметкам */}
        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2">{t("SpecialMarks")}</h4>
          <div className="flex flex-col gap-1">
            <Button
              variant="ghost"
              dark={true}
              isActive={bundleFilter}
              className="w-full justify-start"
              icon={<Package className="w-4 h-4" />}
              text={t("OnlyWithBundle")}
              onClick={() => setBundleFilter((v) => !v)}
            />
            <Button
              variant="ghost"
              dark={true}
              isActive={giftFilter}
              className="w-full justify-start"
              icon={<Gift className="w-4 h-4" />}
              text={t("OnlyWithGift")}
              onClick={() => setGiftFilter((v) => !v)}
            />
          </div>
        </div>

        {/* Фильтр по пользователям */}
        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2">{t("CreatedBy")}</h4>
          <SearchableSelect
            theme="sidebar"
            options={userOptions}
            value={createdByFilter}
            onChange={setCreatedByFilter}
            placeholder={t("AllUsers")}
          />
        </div>

        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2">{t("PostedByLabel")}</h4>
          <SearchableSelect
            theme="sidebar"
            options={userOptions}
            value={postedByFilter}
            onChange={setPostedByFilter}
            placeholder={t("AllUsers")}
          />
        </div>
      </div>,
    );
  }, [setSidebarContent, canCreateInvoice, t, typeFilter, statusFilter, giftFilter, bundleFilter, createdByFilter, postedByFilter, userOptions]);

  const toDelete = invoices.find((d) => d.id === deleteId);

  const columns: Column<DocumentList>[] = [
    // { header: t("Number"), accessor: "number", sortable: true, excelWidth: 14 },
    // {
    //   header: t("Number"),
    //   accessor: "number",
    //   sortable: true,
    //   excelWidth: 14,
    //   render: (item) => (
    //     <div className="flex items-center gap-2">
    //       {/* <span className={`w-2 h-2 rounded-full ${item.status === "posted" ? "bg-green-500" : "bg-red-500"}`} /> */}
    //       <StatusBadge isActive={item.status === "posted"} activeLabel={t("Posted")} inactiveLabel={t("Draft")} onlyIcon={true} />
    //       <span>{item.number}</span>
    //     </div>
    //   ),
    // },
    {
      header: t("Counterparty"),
      accessor: "counterparty_detail",
      sortable: true,
      excelWidth: 25,
      sortValue: (item) => item.counterparty_detail?.name ?? "",
      excelValue: (item) =>
        item.counterparty_detail ? `${item.counterparty_detail.name}${item.counterparty_detail.phone ? ` (${item.counterparty_detail.phone})` : ""}` : "",
      render: (item) => {
        const cp = item.counterparty_detail;
        if (!cp) return "—";
        return (
          <div className="flex items-center gap-2">
            {cp.photo_thumbnail ? (
              <img
                src={cp.photo_thumbnail}
                alt={cp.name}
                className="w-8 h-8 rounded-full object-cover shrink-0 cursor-zoom-in print:hidden"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewImage(cp.photo || cp.photo_thumbnail || null);
                }}
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-slate-700 shrink-0 print:hidden" />
            )}
            <div className="flex flex-col leading-tight">
              <span className="font-semibold text-gray-900 dark:text-white">{cp.name}</span>
              {cp.phone && <span className="text-xs text-gray-500 dark:text-gray-400">{cp.phone}</span>}
            </div>
          </div>
        );
      },
    },
    {
      header: t("Type"),
      accessor: "document_type_display",
      sortable: true,
      excelWidth: 20,
      render: (item) => `${t(item.document_type)}`,
    },
    { header: t("Date"), accessor: "date", sortable: true, excelWidth: 12, render: (item) => new Date(item.date).toLocaleDateString("ru-RU") },
    {
      header: t("Number"),
      accessor: "number",
      sortable: true,
      excelWidth: 14,
      render: (item) => (
        <div className="flex items-center gap-2">
          <StatusBadge isActive={item.status === "posted"} onlyIcon />

          <span>{shortDocumentNumber(item.number)}</span>
        </div>
      ),
    },
    {
      header: t("Branch"),
      accessor: "branch_detail",
      sortable: true,
      excelWidth: 20,
      excelValue: (item) => item.branch_detail?.name ?? "",
      sortValue: (item) => item.branch_detail?.name ?? "",
      render: (item) => item.branch_detail?.name ?? "—",
    },
    {
      header: t("Total"),
      accessor: "total",
      sortable: true,
      excelWidth: 14,
      render: (item) => (
        <span className="inline-block px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-900/30 font-mono font-bold text-sm text-indigo-700 dark:text-indigo-300">
          {Number(item.total).toLocaleString("ru-RU", {
            minimumFractionDigits: 2,
          })}
        </span>
      ),
    },
    {
      header: t("Note"),
      accessor: "note",
      sortable: false,
      excelWidth: 24,
      excelWrapText: true,
      excelValue: (item) => item.note ?? "",
      render: (item) => <span className="text-xs md:text-sm text-gray-500 dark:text-gray-400">{item.note || "—"}</span>,
    },
    {
      header: t("Marks"),
      excelWidth: 16,
      excelValue: (item) =>
        [item.has_discount && t("Discount"), item.has_gift && t("WithGift"), item.has_bundle && t("WithBundle")].filter(Boolean).join(", "),
      render: (item) => (
        <div className="flex items-center gap-1.5">
          {item.has_discount && (
            <span title={t("Discount")}>
              <Percent className="w-4 h-4 text-amber-500" />
            </span>
          )}
          {item.has_gift && (
            <span title={t("WithGift")}>
              <Gift className="w-4 h-4 text-pink-500" />
            </span>
          )}
          {item.has_bundle && (
            <span title={t("WithBundle")}>
              <Package className="w-4 h-4 text-blue-500" />
            </span>
          )}
        </div>
      ),
    },
    {
      header: t("Status"),
      accessor: "status",
      sortable: true,
      excelWidth: 10,
      sortValue: (item) => item.status,
      excelValue: (item) => (item.status === "posted" ? t("Posted") : t("Draft")),
      // (i.is_active ? "+" : ""),
      render: (item) => <StatusBadge isActive={item.status === "posted"} activeLabel={t("Posted")} inactiveLabel={t("Draft")} />,
    },
    {
      header: t("Warehouse"),
      accessor: "warehouse_detail",
      sortable: true,
      excelWidth: 20,
      excelValue: (item) => item.warehouse_detail?.name ?? "",
      sortValue: (item) => item.warehouse_detail?.name ?? "",
      render: (item) => item.warehouse_detail?.name ?? "—",
    },
    {
      // ✅ driver_name — вычисляемое поле (участник накладной с ролью "водитель",
      // см. DocumentListSerializer.get_driver_name), не колонка БД — сортировка
      // через серверную пагинацию (DOCUMENT_ORDERING_FIELDS) для него не заведена,
      // поэтому sortable не ставим, чтобы не обещать нерабочую сортировку.
      header: t("Driver"),
      accessor: "driver_name",
      excelWidth: 18,
      excelValue: (item) => item.driver_name ?? "",
      render: (item) => item.driver_name ?? "—",
    },
    {
      header: t("CreatedBy"),
      accessor: "created_by_name",
      sortable: true,
      excelWidth: 18,
      excelValue: (item) => item.created_by_name ?? "",
      sortValue: (item) => item.created_by_name ?? "",
      render: (item) => item.created_by_name ?? "—",
    },
    {
      header: t("PostedByLabel"),
      accessor: "posted_by_name",
      sortable: true,
      excelWidth: 18,
      excelValue: (item) => item.posted_by_name ?? "",
      sortValue: (item) => item.posted_by_name ?? "",
      render: (item) => item.posted_by_name ?? "—",
    },
    {
      header: t("Actions"),
      isActionColumn: true,
      hideInPrint: true,
      render: (item) => (
        <div className="flex gap-1">
          {/* Провести / Распровести */}
          {item.status === "draft" ? (
            <Button
              disabled={!canPost}
              variant="1c"
              icon={<span>✅</span>}
              className="md:h-6 md:px-2 md:!py-0 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                setPostConfirmId(item.id);
              }}
            />
          ) : (
            <Button
              disabled={!canPost}
              variant="1c"
              icon={<span>↩️</span>}
              className="md:h-6 md:px-2 md:!py-0 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                setUnpostConfirmId(item.id);
              }}
            />
          )}
          {/* Удалить */}
          <Button
            disabled={!canDelete || item.status === "posted"}
            variant="1c"
            icon={<span>🗑️</span>}
            className="md:h-6 md:w-8 md:!p-0"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteId(item.id);
              setDeleteModal(true);
            }}
          />
        </div>
      ),
    },
  ];

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText={t("ForbiddenText")}>
      <Table
        columns={columns}
        data={invoices}
        tableId="invoices_list"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        rowClassName={(item) => DOC_TYPE_ROW_COLOR[item.document_type] ?? ""}
        onRowDoubleClick={(item) => {
          navigate(ROUTES.APP.DOCUMENTS_EDIT.replace(":id", String(item.id)), {
            state: {
              fromInvoicesPage: page,
              fromInvoicesFilters: { searchQuery, typeFilter, statusFilter, giftFilter, bundleFilter, createdByFilter, postedByFilter, sortBy, sortDir },
            },
          });
        }}
        selectedRowId={highlightedId}
        onHighlightConsumed={() => setHighlightedId(null)}
        pagination={{
          mode: "server",
          page,
          pageSize,
          total: totalCount,
          onPageChange: setPage,
          onPageSizeChange: (size) => {
            setPageSize(size);
            setPage(1);
            try {
              localStorage.setItem("table:invoices_list:pageSize", String(size));
            } catch {}
          },
          sortBy,
          sortDir,
          onSortChange: (key, direction) => {
            setSortBy(key);
            setSortDir(direction);
          },
        }}
        onFetchAllData={async () => {
          const res = await documentApi.getAll({ ...queryParams, page: "1", page_size: "10000" });
          return Array.isArray(res) ? res : (res.results ?? []);
        }}
      />

      <ConfirmModal
        isOpen={deleteModal}
        type="delete"
        title={`DELETE — ${t("Delete")}`}
        message={t("DeleteDocument", { number: toDelete?.number })}
        onClose={() => setDeleteModal(false)}
        onConfirm={() => {
          if (deleteId) {
            deleteMutation.mutate(deleteId);
            setDeleteModal(false);
          }
        }}
      />

      <ConfirmModal
        isOpen={postConfirmId !== null}
        type="info"
        variant="danger"
        title={t("PostDocument")}
        message={t("PostDocumentConfirm")}
        onClose={() => setPostConfirmId(null)}
        onConfirm={() => {
          if (postConfirmId) postMutation.mutate(postConfirmId);
        }}
      />

      <ConfirmModal
        isOpen={unpostConfirmId !== null}
        type="info"
        variant="danger"
        title={t("UnpostDocument")}
        message={t("UnpostDocumentConfirm")}
        onClose={() => setUnpostConfirmId(null)}
        onConfirm={() => {
          if (unpostConfirmId) unpostMutation.mutate(unpostConfirmId);
        }}
      />

      <ImagePreview src={previewImage} onClose={() => setPreviewImage(null)} />
    </RBACGuard>
  );
};

export default InvoicesPage;
