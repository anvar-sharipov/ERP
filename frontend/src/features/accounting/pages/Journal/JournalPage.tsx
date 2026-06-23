// // src/features/accounting/pages/Journal/JournalPage.tsx
// src/features/accounting/pages/Journal/JournalPage.tsx
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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
import JournalEntryForm from "./JournalEntryForm";
import { Plus } from "lucide-react";
import { usePageHotkeys } from "../../../../core/hooks/usePageHotkeys";
import { useTableFilter } from "../../../../core/hooks/useTableFilter";

// import { useHotkeys } from "../../../../core/hooks/useHotkeys";

export default function JournalPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { setSidebarContent } = useSidebar();

  const { canView, canPost, canPut, canDelete } = usePageAccess("journalentry");
  const { isClosed } = useClosedPeriod();

  // Берём период из глобального стора
  const { periodFrom, periodTo } = useDateStore();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
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
  const filters: Record<string, string> = {
    ...(statusFilter && { status: statusFilter }),
    ...(periodFrom && { date_from: periodFrom }),
    ...(periodTo && { date_to: periodTo }),
  };

  const { data: rawEntries = [], isLoading } = useQuery({
    queryKey: ["journal-entries", filters],
    queryFn: () => journalApi.list(filters).then((r) => r.data),
    enabled: canView,
  });

  // Локальная фильтрация по поиску
  const entries = useTableFilter(rawEntries, {
    search,
    searchFields: ["number", "description", "debit_accounts", "credit_accounts"],
  });

  const postMutation = useMutation({
    mutationFn: (id: number) => journalApi.post(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal-entries"] });
      setConfirmPost(null);
    },
  });
  const unpostMutation = useMutation({
    mutationFn: (id: number) => journalApi.unpost(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal-entries"] });
      setConfirmUnpost(null);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => journalApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal-entries"] });
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
      </div>,
    );
  }, [setSidebarContent, canPost, isClosed, statusFilter, t]);

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
          {canPost && item.status === "draft" && (
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
          {canPost && item.status === "posted" && (
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
          {canPut && item.status === "draft" && (
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
          {canDelete && item.status === "draft" && (
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
// import { useEffect, useState } from "react";
// import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
// import { useTranslation } from "react-i18next";
// import { journalApi, type JournalEntry } from "../../services/transactionApi";
// import { Table, type Column } from "../../../../components/ui/Table/Table";
// import { Button } from "../../../../components/ui/Button";
// import { Modal } from "../../../../components/ui/Modal/Modal";
// import { ConfirmModal } from "../../../../components/ui/Modal/ConfirmModal";
// import { StatusBadge } from "../../../../components/ui/StatusBadge";
// import { usePageAccess } from "../../../../core/hooks/usePageAccess";
// import { useSidebar } from "../../../../core/context/SidebarRightContext";
// import { useDateStore } from "../../../../core/store/dateStore";
// import { useClosedPeriod } from "../../../../core/hooks/useClosedPeriod";
// import JournalEntryForm from "./JournalEntryForm";
// import { Plus } from "lucide-react";
// import { usePageHotkeys } from "../../../../core/hooks/usePageHotkeys";
// import { useTableFilter } from "../../../../core/hooks/useTableFilter";

// // import { useHotkeys } from "../../../../core/hooks/useHotkeys";

// export default function JournalPage() {
//   const { t } = useTranslation();
//   const qc = useQueryClient();
//   const { setSidebarContent } = useSidebar();

//   const { canView, canPost, canPut, canDelete } = usePageAccess("journalentry");
//   const { isClosed } = useClosedPeriod();

//   // Берём период из глобального стора
//   const { periodFrom, periodTo } = useDateStore();

//   const [search, setSearch] = useState("");
//   const [statusFilter, setStatusFilter] = useState("");
//   const [formOpen, setFormOpen] = useState(false);
//   const [editEntry, setEditEntry] = useState<JournalEntry | null>(null);
//   const [confirmPost, setConfirmPost] = useState<JournalEntry | null>(null);
//   const [confirmUnpost, setConfirmUnpost] = useState<JournalEntry | null>(null);
//   const [confirmDelete, setConfirmDelete] = useState<JournalEntry | null>(null);

//   // // Фильтры — дата из стора, статус и поиск локальные
//   // const filters: Record<string, string> = {
//   //   ...(statusFilter && { status: statusFilter }),
//   //   ...(periodFrom && { date_from: periodFrom }),
//   //   ...(periodTo && { date_to: periodTo }),
//   //   // ...(search && { search }),
//   // };

//   // const { data: entries = [], isLoading } = useQuery({
//   //   queryKey: ["journal-entries", filters],
//   //   queryFn: () => journalApi.list(filters).then((r) => r.data),
//   //   enabled: canView,
//   // });

//   // Убираем search из filters
//   const filters: Record<string, string> = {
//     ...(statusFilter && { status: statusFilter }),
//     ...(periodFrom && { date_from: periodFrom }),
//     ...(periodTo && { date_to: periodTo }),
//   };

//   const { data: rawEntries = [], isLoading } = useQuery({
//     queryKey: ["journal-entries", filters],
//     queryFn: () => journalApi.list(filters).then((r) => r.data),
//     enabled: canView,
//   });

//   // Локальная фильтрация по поиску
//   const entries = useTableFilter(rawEntries, {
//     search,
//     searchFields: ["number", "description", "debit_accounts", "credit_accounts"],
//   });

//   const postMutation = useMutation({
//     mutationFn: (id: number) => journalApi.post(id),
//     onSuccess: () => {
//       qc.invalidateQueries({ queryKey: ["journal-entries"] });
//       setConfirmPost(null);
//     },
//   });
//   const unpostMutation = useMutation({
//     mutationFn: (id: number) => journalApi.unpost(id),
//     onSuccess: () => {
//       qc.invalidateQueries({ queryKey: ["journal-entries"] });
//       setConfirmUnpost(null);
//     },
//   });
//   const deleteMutation = useMutation({
//     mutationFn: (id: number) => journalApi.delete(id),
//     onSuccess: () => {
//       qc.invalidateQueries({ queryKey: ["journal-entries"] });
//       setConfirmDelete(null);
//     },
//   });

//   const handleEdit = async (entry: JournalEntry) => {
//     const { data } = await journalApi.retrieve(entry.id);
//     setEditEntry(data);
//     setFormOpen(true);
//   };

//   usePageHotkeys({
//     canPost,
//     onInsert: () => {
//       setEditEntry(null); // create mode
//       setFormOpen(true); // открыть форму
//     },
//   });

//   // Sidebar — кнопка + фильтр статуса
//   useEffect(() => {
//     setSidebarContent(
//       <div className="space-y-4">
//         <div>
//           <h4 className="font-bold text-indigo-300 mb-2 text-xs uppercase tracking-wider">Действия</h4>
//           <Button
//             disabled={!canPost || isClosed}
//             text="Новая операция"
//             className="w-full"
//             dark
//             icon={<Plus className="w-4 h-4" />}
//             title={isClosed ? "День закрыт" : undefined}
//             onClick={() => {
//               setEditEntry(null);
//               setFormOpen(true);
//             }}
//           />
//           {isClosed && <p className="text-xs text-red-400 mt-1 text-center">День закрыт</p>}
//         </div>

//         <div className="pt-4 border-t border-indigo-900/30">
//           <h4 className="font-bold text-indigo-300 mb-2 text-xs uppercase tracking-wider">Статус</h4>
//           <div className="flex flex-col gap-1">
//             {(
//               [
//                 { value: "", label: "Все" },
//                 { value: "draft", label: "Черновик" },
//                 { value: "posted", label: "Проведён" },
//               ] as const
//             ).map((item) => (
//               <Button key={item.value} onClick={() => setStatusFilter(item.value)} text={item.label} variant="ghost" dark isActive={statusFilter === item.value} className="w-full justify-start" />
//             ))}
//           </div>
//         </div>
//       </div>,
//     );
//   }, [setSidebarContent, canPost, isClosed, statusFilter]);

//   console.log("entries", entries);

//   const columns: Column<JournalEntry>[] = [
//     {
//       header: "Дата",
//       accessor: "date",
//       width: "80px",
//       excelWidth: 12,
//       sortable: true,
//       render: (item) => new Date(item.date).toLocaleDateString("ru-RU"),
//       excelValue: (item) =>
//         new Date(item.date).toLocaleString("ru-RU", {
//           day: "2-digit",
//           month: "2-digit",
//           year: "numeric",
//         }),
//     },
//     {
//       header: "№",
//       accessor: "number",
//       width: "80px",
//       sortable: true,
//       render: (item) => (
//         <span className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline" onClick={() => handleEdit(item)}>
//           {item.number}
//         </span>
//       ),
//     },
//     {
//       header: "Содержание",
//       accessor: "description",
//       sortable: true,
//       render: (item) => <span className="text-sm">{item.description || "—"}</span>,
//     },
//     {
//       header: t("Dt"),
//       accessor: "debit_accounts",
//       sortable: true,
//       render: (item) => <span className="font-mono text-blue-600 dark:text-blue-400">{item.debit_accounts || "—"}</span>,
//     },
//     {
//       header: "Дт субконто 1",
//       accessor: "debit_subconto1",
//       render: (item) => item.debit_subconto1 || "—",
//     },
//     {
//       header: "Дт субконто 2",
//       accessor: "debit_subconto2",
//       render: (item) => item.debit_subconto2 || "—",
//     },
//     {
//       header: "Дт субконто 3",
//       accessor: "debit_subconto3",
//       render: (item) => item.debit_subconto3 || "—",
//     },
//     {
//       header: t("Kt"),
//       accessor: "credit_accounts",
//       sortable: true,
//       render: (item) => <span className="font-mono text-red-500 dark:text-red-400">{item.credit_accounts || "—"}</span>,
//     },
//     {
//       header: "Кт субконто 1",
//       accessor: "credit_subconto1",
//       render: (item) => item.credit_subconto1 || "—",
//     },
//     {
//       header: "Кт субконто 2",
//       accessor: "credit_subconto2",
//       render: (item) => item.credit_subconto2 || "—",
//     },
//     {
//       header: "Кт субконто 3",
//       accessor: "credit_subconto3",
//       render: (item) => item.credit_subconto3 || "—",
//     },
//     // {
//     //   header: t("Dt"),
//     //   accessor: "debit_accounts",
//     //   sortable: true,
//     //   render: (item) => (
//     //     <div className="flex flex-col gap-0.5">
//     //       <span className="font-mono text-blue-600 dark:text-blue-400 text-xs font-medium">{item.debit_accounts}</span>
//     //       {item.debit_subcontos && <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[150px]">{item.debit_subcontos}</span>}
//     //     </div>
//     //   ),
//     // },
//     // {
//     //   header: t("Kt"),
//     //   accessor: "credit_accounts",
//     //   sortable: true,
//     //   render: (item) => (
//     //     <div className="flex flex-col gap-0.5">
//     //       <span className="font-mono text-red-500 dark:text-red-400 text-xs font-medium">{item.credit_accounts}</span>
//     //       {item.credit_subcontos && <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[150px]">{item.credit_subcontos}</span>}
//     //     </div>
//     //   ),
//     // },
//     {
//       header: "Сумма",
//       accessor: "debit_total",
//       // width: "130px",
//       sortable: true,
//       excelWidth: 15,
//       render: (item) => <span className="font-mono text-sm">{item.debit_total ? Number(item.debit_total).toLocaleString("ru-RU", { minimumFractionDigits: 2 }) : "—"}</span>,
//     },
//     {
//       header: t("Status"),
//       accessor: "status",
//       // width: "120px",
//       excelWidth: 12,
//       sortable: true,
//       render: (item) => <StatusBadge isActive={item.status === "posted"} activeLabel={t("Posted")} inactiveLabel={t("Draft")} />,
//       excelValue: (item) => (item.status === "posted" ? t("Posted") : t("Draft")),
//     },
//     {
//       header: "Автор",
//       accessor: "created_by_name",
//       // width: "150px",
//       sortable: true,
//       render: (item) => <span className="text-sm text-gray-500">{item.created_by_name || "—"}</span>,
//     },
//     {
//       header: "Дата создания",
//       accessor: "created_at",
//       width: "80px",
//       excelWidth: 12,
//       sortable: true,
//       render: (item) =>
//         new Date(item.created_at).toLocaleString("ru-RU", {
//           day: "2-digit",
//           month: "2-digit",
//           year: "numeric",
//           hour: "2-digit",
//           minute: "2-digit",
//         }),
//       excelValue: (item) =>
//         new Date(item.created_at).toLocaleString("ru-RU", {
//           day: "2-digit",
//           month: "2-digit",
//           year: "numeric",
//           hour: "2-digit",
//           minute: "2-digit",
//         }),
//     },
//     {
//       header: t("Actions"),
//       isActionColumn: true,
//       hideInPrint: true,
//       render: (item) => (
//         <div className="flex gap-1">
//           {canPost && item.status === "draft" && (
//             <Button
//               variant="1c"
//               title="Провести"
//               text="✓"
//               className="md:h-6 md:!px-2 text-green-700 dark:text-green-400"
//               onClick={(e) => {
//                 e.stopPropagation();
//                 setConfirmPost(item);
//               }}
//             />
//           )}
//           {canPost && item.status === "posted" && (
//             <Button
//               variant="1c"
//               title="Отменить проведение"
//               text="↩"
//               className="md:h-6 md:!px-2 text-yellow-700 dark:text-yellow-400"
//               onClick={(e) => {
//                 e.stopPropagation();
//                 setConfirmUnpost(item);
//               }}
//             />
//           )}
//           {canPut && item.status === "draft" && (
//             <Button
//               variant="1c"
//               title={`F2 - ${t("Edit")}`}
//               icon={<span>✏️</span>}
//               className="md:h-6 md:w-8 md:!p-0"
//               onClick={(e) => {
//                 e.stopPropagation();
//                 handleEdit(item);
//               }}
//             />
//           )}
//           {canDelete && item.status === "draft" && (
//             <Button
//               variant="1c"
//               title={`DELETE - ${t("Delete")}`}
//               icon={<span>🗑️</span>}
//               className="md:h-6 md:w-8 md:!p-0"
//               onClick={(e) => {
//                 e.stopPropagation();
//                 setConfirmDelete(item);
//               }}
//             />
//           )}
//         </div>
//       ),
//     },
//   ];

//   return (
//     <div className="space-y-4">
//       <Table
//         columns={columns}
//         data={entries}
//         tableId="journal_entries"
//         searchQuery={search}
//         onSearchChange={setSearch}
//         isLoading={isLoading}
//         onRowDoubleClick={(item) => canPut && item.status === "draft" && handleEdit(item)}
//       />

//       <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={editEntry ? `Операция №${editEntry.number}` : "Новая операция"} closeOnOutsideClick={false} size="xl">
//         <JournalEntryForm
//           initial={editEntry}
//           onSuccess={() => {
//             setFormOpen(false);
//             qc.invalidateQueries({ queryKey: ["journal-entries"] });
//           }}
//           onCancel={() => setFormOpen(false)}
//         />
//       </Modal>

//       <ConfirmModal
//         isOpen={!!confirmPost}
//         type="warning"
//         title="Провести операцию?"
//         message={`Операция №${confirmPost?.number} будет проведена. После этого её нельзя редактировать.`}
//         confirmText="Провести"
//         onClose={() => setConfirmPost(null)}
//         onConfirm={() => confirmPost && postMutation.mutate(confirmPost.id)}
//       />
//       <ConfirmModal
//         isOpen={!!confirmUnpost}
//         type="warning"
//         title="Отменить проведение?"
//         message={`Операция №${confirmUnpost?.number} вернётся в статус «Черновик».`}
//         confirmText="Отменить проведение"
//         onClose={() => setConfirmUnpost(null)}
//         onConfirm={() => confirmUnpost && unpostMutation.mutate(confirmUnpost.id)}
//       />
//       <ConfirmModal
//         isOpen={!!confirmDelete}
//         type="delete"
//         title={`DELETE - ${t("Delete")}`}
//         message={`Операция №${confirmDelete?.number} будет удалена безвозвратно.`}
//         confirmText={t("Delete")}
//         onClose={() => setConfirmDelete(null)}
//         onConfirm={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
//       />
//     </div>
//   );
// }
