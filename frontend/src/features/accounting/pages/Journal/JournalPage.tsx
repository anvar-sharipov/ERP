// // src/features/accounting/pages/Journal/JournalPage.tsx
// src/features/accounting/pages/Journal/JournalPage.tsx
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { X } from "lucide-react";
import { journalApi, type JournalEntry } from "../../services/transactionApi";
import { Table, type Column } from "../../../../components/ui/Table/Table";
import { Button } from "../../../../components/ui/Button";
import { Modal } from "../../../../components/ui/Modal/Modal";
import { ConfirmModal } from "../../../../components/ui/Modal/ConfirmModal";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { useSidebar } from "../../../../core/context/SidebarRightContext";
import { useDateStore } from "../../../../core/store/dateStore";
import { useClosedPeriod } from "../../../../core/hooks/useClosedPeriod";
import { useNotify } from "../../../../core/context/NotificationContext";
import JournalEntryForm from "./JournalEntryForm";
import { Plus } from "lucide-react";
import { usePageHotkeys } from "../../../../core/hooks/usePageHotkeys";
import { useTableFilter } from "../../../../core/hooks/useTableFilter";


export default function JournalPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { setSidebarContent } = useSidebar();

  const { canView, canPost, canPut, canDelete } = usePageAccess("journalentry");
  const { isClosed } = useClosedPeriod();
  const notify = useNotify();

  // Берём период из глобального стора
  const { periodFrom, periodTo, workBranch, workWarehouse } = useDateStore();

  // ✅ Drill-down из ОСВ — двойной клик по счёту в ОСВ ведёт сюда с ?account=<id>,
  // period уже совпадает сам собой (тот же глобальный periodFrom/periodTo).
  // account_code/account_name — только для баннера-подсказки, в фильтр не идут.
  const [searchParams, setSearchParams] = useSearchParams();
  const accountFilter = searchParams.get("account");
  const accountLabel = searchParams.get("account_code") ? `${searchParams.get("account_code")} — ${searchParams.get("account_name") ?? ""}` : null;

  const clearAccountFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("account");
    next.delete("account_code");
    next.delete("account_name");
    setSearchParams(next);
  };

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  // ✅ Ручные vs сгенерированные документом проводки — по умолчанию только ручные
  // (см. обсуждение: document-проводки правятся только через сам документ, поэтому
  // в журнале по умолчанию не мешаются с ручными и не создают соблазна их трогать).
  const [entryTypeFilter, setEntryTypeFilter] = useState<"manual" | "document" | "all">("manual");
  const [formOpen, setFormOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<JournalEntry | null>(null);
  const [confirmPost, setConfirmPost] = useState<JournalEntry | null>(null);
  const [confirmUnpost, setConfirmUnpost] = useState<JournalEntry | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<JournalEntry | null>(null);

  // // Фильтры — дата из стора, статус и поиск локальные
  // const filters: Record<string, string> = {
  //   ...(statusFilter && { status: statusFilter }),
  //   ...(periodFrom && { date_from: periodFrom }),
  //   ...(periodTo && { date_to: periodTo }),
  //   // ...(search && { search }),
  // };

  // const { data: entries = [], isLoading } = useQuery({
  //   queryKey: ["journal-entries", filters],
  //   queryFn: () => journalApi.list(filters).then((r) => r.data),
  //   enabled: canView,
  // });

  // Убираем search из filters
  // ✅ Склад в приоритете над филиалом (тот же принцип, что и в OSV/Product Turnover —
  // см. CLAUDE.md: "все отчёты должны смотреть на branch, warehouse, date_range"):
  // выбран конкретный склад — фильтруем только по нему; выбран только филиал (без
  // склада) — по всем складам этого филиала (см. get_queryset на бэкенде); не выбрано
  // ничего — не сужаем сверх RBAC-scope пользователя.
  const filters: Record<string, string> = {
    ...(statusFilter && { status: statusFilter }),
    ...(periodFrom && { date_from: periodFrom }),
    ...(periodTo && { date_to: periodTo }),
    ...(workWarehouse?.id ? { warehouse: String(workWarehouse.id) } : workBranch?.id ? { branch: String(workBranch.id) } : {}),
    ...(accountFilter && { account: accountFilter }),
    ...(entryTypeFilter !== "all" && { entry_type: entryTypeFilter }),
  };

  const { data: rawEntries = [], isLoading } = useQuery({
    queryKey: ["journal-entries", filters, workBranch?.id, workWarehouse?.id, accountFilter, entryTypeFilter],
    queryFn: () => journalApi.list(filters).then((r) => r.data),
    enabled: canView,
  });

  // Локальная фильтрация по поиску
  const entries = useTableFilter(rawEntries, {
    search,
    searchFields: ["number", "description", "debit_accounts", "credit_accounts"],
  });

  // ✅ Раньше здесь не было onError вообще — ошибка (например "период закрыт",
  // см. utils.py::check_period_open) молча проглатывалась, кнопка "Провести"
  // просто ничего не делала без единого сообщения. Backend отдаёт понятный
  // текст в {detail: ...} (см. transaction_views.py::_get_error_detail).
  const postMutation = useMutation({
    mutationFn: (id: number) => journalApi.post(id),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["journal-entries"] });
      setConfirmPost(null);
      notify("success", res?.data?.detail || t("EntryPosted"));
    },
    onError: (err: any) => {
      notify("error", err?.response?.data?.detail || t("ErrorPosting"));
      setConfirmPost(null);
    },
  });
  const unpostMutation = useMutation({
    mutationFn: (id: number) => journalApi.unpost(id),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["journal-entries"] });
      setConfirmUnpost(null);
      notify("success", res?.data?.detail || t("EntryUnposted"));
    },
    onError: (err: any) => {
      notify("error", err?.response?.data?.detail || t("ErrorUnposting"));
      setConfirmUnpost(null);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => journalApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal-entries"] });
      setConfirmDelete(null);
      notify("success", t("SuccessDeleted"));
    },
    onError: (err: any) => {
      notify("error", err?.response?.data?.detail || t("ErrorDeleting"));
      setConfirmDelete(null);
    },
  });

  const handleEdit = async (entry: JournalEntry) => {
    const { data } = await journalApi.retrieve(entry.id);
    setEditEntry(data);
    setFormOpen(true);
  };

  usePageHotkeys({
    canPost,
    onInsert: () => {
      setEditEntry(null); // create mode
      setFormOpen(true); // открыть форму
    },
  });

  // Sidebar — кнопка + фильтр статуса
  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <div>
          <h4 className="font-bold text-indigo-300 mb-2 text-xs uppercase tracking-wider">{t("Actions")}</h4>
          <Button
            disabled={!canPost || isClosed}
            text={t("AddEntry")}
            className="w-full"
            dark
            icon={<Plus className="w-4 h-4" />}
            title={isClosed ? t("DayClosed") : undefined}
            onClick={() => {
              setEditEntry(null);
              setFormOpen(true);
            }}
          />
          {isClosed && <p className="text-xs text-red-400 mt-1 text-center">{t("DayClosed")}</p>}
        </div>

        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2 text-xs uppercase tracking-wider">{t("Status")}</h4>
          <div className="flex flex-col gap-1">
            {(
              [
                { value: "", label: t("All") },
                { value: "draft", label: t("Draft") },
                { value: "posted", label: t("Posted") },
              ] as const
            ).map((item) => (
              <Button key={item.value} onClick={() => setStatusFilter(item.value)} text={item.label} variant="ghost" dark isActive={statusFilter === item.value} className="w-full justify-start" />
            ))}
          </div>
        </div>

        {/* ✅ Ручные vs сгенерированные документом проводки — по умолчанию "Ручные"
            (см. обсуждение: document-проводки нельзя менять напрямую из журнала,
            поэтому по умолчанию они не мешаются в список). */}
        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2 text-xs uppercase tracking-wider">{t("EntryType")}</h4>
          <div className="flex flex-col gap-1">
            {(
              [
                { value: "manual", label: t("ManualEntries") },
                { value: "document", label: t("DocumentEntries") },
                { value: "all", label: t("All") },
              ] as const
            ).map((item) => (
              <Button key={item.value} onClick={() => setEntryTypeFilter(item.value)} text={item.label} variant="ghost" dark isActive={entryTypeFilter === item.value} className="w-full justify-start" />
            ))}
          </div>
        </div>
      </div>,
    );
  }, [setSidebarContent, canPost, isClosed, statusFilter, entryTypeFilter, t]);

  console.log("entries", entries);

  const columns: Column<JournalEntry>[] = [
    {
      header: t("Date"),
      accessor: "date",
      width: "80px",
      excelWidth: 12,
      sortable: true,
      render: (item) => new Date(item.date).toLocaleDateString("ru-RU"),
      excelValue: (item) =>
        new Date(item.date).toLocaleString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }),
    },
    {
      header: t("Number"),
      accessor: "number",
      width: "80px",
      sortable: true,
      render: (item) => (
        <span className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline" onClick={() => handleEdit(item)}>
          {item.number}
        </span>
      ),
    },
    {
      header: t("Description"),
      accessor: "description",
      sortable: true,
      render: (item) => <span className="text-sm">{item.description || "—"}</span>,
    },
    {
      header: t("Dt"),
      accessor: "debit_accounts",
      sortable: true,
      render: (item) => <span className="font-mono text-blue-600 dark:text-blue-400">{item.debit_accounts || "—"}</span>,
    },
    {
      header: t("DebitSubconto1"),
      accessor: "debit_subconto1",
      render: (item) => item.debit_subconto1 || "—",
    },
    {
      header: t("DebitSubconto2"),
      accessor: "debit_subconto2",
      render: (item) => item.debit_subconto2 || "—",
    },
    {
      header: t("DebitSubconto3"),
      accessor: "debit_subconto3",
      render: (item) => item.debit_subconto3 || "—",
    },
    {
      header: t("Kt"),
      accessor: "credit_accounts",
      sortable: true,
      render: (item) => <span className="font-mono text-red-500 dark:text-red-400">{item.credit_accounts || "—"}</span>,
    },
    {
      header: t("CreditSubconto1"),
      accessor: "credit_subconto1",
      render: (item) => item.credit_subconto1 || "—",
    },
    {
      header: t("CreditSubconto2"),
      accessor: "credit_subconto2",
      render: (item) => item.credit_subconto2 || "—",
    },
    {
      header: t("CreditSubconto3"),
      accessor: "credit_subconto3",
      render: (item) => item.credit_subconto3 || "—",
    },
    // {
    //   header: t("Dt"),
    //   accessor: "debit_accounts",
    //   sortable: true,
    //   render: (item) => (
    //     <div className="flex flex-col gap-0.5">
    //       <span className="font-mono text-blue-600 dark:text-blue-400 text-xs font-medium">{item.debit_accounts}</span>
    //       {item.debit_subcontos && <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[150px]">{item.debit_subcontos}</span>}
    //     </div>
    //   ),
    // },
    // {
    //   header: t("Kt"),
    //   accessor: "credit_accounts",
    //   sortable: true,
    //   render: (item) => (
    //     <div className="flex flex-col gap-0.5">
    //       <span className="font-mono text-red-500 dark:text-red-400 text-xs font-medium">{item.credit_accounts}</span>
    //       {item.credit_subcontos && <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[150px]">{item.credit_subcontos}</span>}
    //     </div>
    //   ),
    // },
    {
      header: t("Amount"),
      accessor: "debit_total",
      // width: "130px",
      sortable: true,
      excelWidth: 15,
      render: (item) => <span className="font-mono text-sm">{item.debit_total ? Number(item.debit_total).toLocaleString("ru-RU", { minimumFractionDigits: 2 }) : "—"}</span>,
    },
    {
      header: t("Status"),
      accessor: "status",
      // width: "120px",
      excelWidth: 12,
      sortable: true,
      render: (item) => <StatusBadge isActive={item.status === "posted"} activeLabel={t("Posted")} inactiveLabel={t("Draft")} />,
      excelValue: (item) => (item.status === "posted" ? t("Posted") : t("Draft")),
    },
    {
      header: t("Author"),
      accessor: "created_by_name",
      // width: "150px",
      sortable: true,
      render: (item) => <span className="text-sm text-gray-500">{item.created_by_name || "—"}</span>,
    },
    {
      header: t("CreatedAt"),
      accessor: "created_at",
      width: "80px",
      excelWidth: 12,
      sortable: true,
      render: (item) =>
        new Date(item.created_at).toLocaleString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      excelValue: (item) =>
        new Date(item.created_at).toLocaleString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
    },
    {
      header: t("Actions"),
      isActionColumn: true,
      hideInPrint: true,
      render: (item) => (
        <div className="flex gap-1">
          {/* ✅ Проводки, сгенерированные документом (item.is_manual === false), нельзя
              проводить/распроводить/редактировать/удалять из журнала напрямую —
              см. обсуждение: это делается только через сам документ. Бэкенд это
              уже блокирует (JournalEntryViewSet._reject_if_document_entry), но кнопки
              скрываем и здесь, чтобы не предлагать действие, которое всё равно упадёт. */}
          {canPost && item.status === "draft" && item.is_manual && (
            <Button
              variant="1c"
              title={t("Post")}
              text="✓"
              className="md:h-6 md:!px-2 text-green-700 dark:text-green-400"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmPost(item);
              }}
            />
          )}
          {canPost && item.status === "posted" && item.is_manual && (
            <Button
              variant="1c"
              title={t("Unpost")}
              text="↩"
              className="md:h-6 md:!px-2 text-yellow-700 dark:text-yellow-400"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmUnpost(item);
              }}
            />
          )}
          {canPut && item.status === "draft" && item.is_manual && (
            <Button
              variant="1c"
              title={`F2 - ${t("Edit")}`}
              icon={<span>✏️</span>}
              className="md:h-6 md:w-8 md:!p-0"
              onClick={(e) => {
                e.stopPropagation();
                handleEdit(item);
              }}
            />
          )}
          {canDelete && item.status === "draft" && item.is_manual && (
            <Button
              variant="1c"
              title={`DELETE - ${t("Delete")}`}
              icon={<span>🗑️</span>}
              className="md:h-6 md:w-8 md:!p-0"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDelete(item);
              }}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {accountFilter && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 text-sm text-indigo-700 dark:text-indigo-300 w-fit">
          <span>
            {t("FilteredByAccount")}: <b>{accountLabel ?? accountFilter}</b>
          </span>
          <button type="button" onClick={clearAccountFilter} className="hover:text-red-500 transition-colors" title={t("ClearFilter")}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <Table
        columns={columns}
        data={entries}
        tableId="journal_entries"
        searchQuery={search}
        onSearchChange={setSearch}
        isLoading={isLoading}
        onRowDoubleClick={(item) => canPut && item.status === "draft" && handleEdit(item)}
      />

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={editEntry ? `${t("Entry")} №${editEntry.number}` : t("AddEntry")} closeOnOutsideClick={false} size="xl">
        <JournalEntryForm
          initial={editEntry}
          onSuccess={() => {
            setFormOpen(false);
            qc.invalidateQueries({ queryKey: ["journal-entries"] });
          }}
          onCancel={() => setFormOpen(false)}
        />
      </Modal>

      <ConfirmModal
        isOpen={!!confirmPost}
        type="warning"
        title={t("PostOperation")}
        message={t("ConfirmPost", { number: confirmPost?.number })}
        confirmText={t("Post")}
        onClose={() => setConfirmPost(null)}
        onConfirm={() => confirmPost && postMutation.mutate(confirmPost.id)}
      />
      <ConfirmModal
        isOpen={!!confirmUnpost}
        type="warning"
        title={t("UnpostOperation")}
        message={t("ConfirmUnpost", { number: confirmUnpost?.number })}
        confirmText={t("Unpost")}
        onClose={() => setConfirmUnpost(null)}
        onConfirm={() => confirmUnpost && unpostMutation.mutate(confirmUnpost.id)}
      />
      <ConfirmModal
        isOpen={!!confirmDelete}
        type="delete"
        title={`DELETE - ${t("Delete")}`}
        message={t("ConfirmDelete", { number: confirmDelete?.number })}
        confirmText={t("Delete")}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
      />
    </div>
  );
}

