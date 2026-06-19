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

  // Фильтры — дата из стора, статус и поиск локальные
  const filters: Record<string, string> = {
    ...(statusFilter && { status: statusFilter }),
    ...(periodFrom && { date_from: periodFrom }),
    ...(periodTo && { date_to: periodTo }),
    ...(search && { search }),
  };

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["journal-entries", filters],
    queryFn: () => journalApi.list(filters).then((r) => r.data),
    enabled: canView,
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

  // Sidebar — кнопка + фильтр статуса
  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <div>
          <h4 className="font-bold text-indigo-300 mb-2 text-xs uppercase tracking-wider">Действия</h4>
          <Button
            disabled={!canPost || isClosed}
            text="Новая операция"
            className="w-full"
            dark
            icon={<Plus className="w-4 h-4" />}
            title={isClosed ? "День закрыт" : undefined}
            onClick={() => {
              setEditEntry(null);
              setFormOpen(true);
            }}
          />
          {isClosed && <p className="text-xs text-red-400 mt-1 text-center">День закрыт</p>}
        </div>

        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2 text-xs uppercase tracking-wider">Статус</h4>
          <div className="flex flex-col gap-1">
            {(
              [
                { value: "", label: "Все" },
                { value: "draft", label: "Черновик" },
                { value: "posted", label: "Проведён" },
              ] as const
            ).map((item) => (
              <Button key={item.value} onClick={() => setStatusFilter(item.value)} text={item.label} variant="ghost" dark isActive={statusFilter === item.value} className="w-full justify-start" />
            ))}
          </div>
        </div>
      </div>,
    );
  }, [setSidebarContent, canPost, isClosed, statusFilter]);

  const columns: Column<JournalEntry>[] = [
    {
      header: "№",
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
      header: "Дата",
      accessor: "date",
      width: "110px",
      sortable: true,
      render: (item) => new Date(item.date).toLocaleDateString("ru-RU"),
    },
    {
      header: "Статус",
      accessor: "status",
      width: "120px",
      sortable: true,
      render: (item) => <StatusBadge isActive={item.status === "posted"} activeLabel="Проведён" inactiveLabel="Черновик" />,
    },
    {
      header: "Содержание",
      accessor: "description",
      sortable: true,
      render: (item) => <span className="text-sm">{item.description || "—"}</span>,
    },
    {
      header: "Сумма",
      accessor: "debit_total",
      width: "130px",
      sortable: true,
      excelWidth: 15,
      render: (item) => <span className="font-mono text-sm">{item.debit_total ? Number(item.debit_total).toLocaleString("ru-RU", { minimumFractionDigits: 2 }) : "—"}</span>,
    },
    {
      header: "Автор",
      accessor: "created_by_name",
      width: "150px",
      sortable: true,
      render: (item) => <span className="text-sm text-gray-500">{item.created_by_name || "—"}</span>,
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
              title="Провести"
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
              title="Отменить проведение"
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
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-medium">Журнал операций</h1>
      </div>

      <Table
        columns={columns}
        data={entries}
        tableId="journal_entries"
        searchQuery={search}
        onSearchChange={setSearch}
        isLoading={isLoading}
        onRowDoubleClick={(item) => canPut && item.status === "draft" && handleEdit(item)}
      />

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={editEntry ? `Операция №${editEntry.number}` : "Новая операция"} closeOnOutsideClick={false} size="xl">
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
        title="Провести операцию?"
        message={`Операция №${confirmPost?.number} будет проведена. После этого её нельзя редактировать.`}
        confirmText="Провести"
        onClose={() => setConfirmPost(null)}
        onConfirm={() => confirmPost && postMutation.mutate(confirmPost.id)}
      />
      <ConfirmModal
        isOpen={!!confirmUnpost}
        type="warning"
        title="Отменить проведение?"
        message={`Операция №${confirmUnpost?.number} вернётся в статус «Черновик».`}
        confirmText="Отменить проведение"
        onClose={() => setConfirmUnpost(null)}
        onConfirm={() => confirmUnpost && unpostMutation.mutate(confirmUnpost.id)}
      />
      <ConfirmModal
        isOpen={!!confirmDelete}
        type="delete"
        title={`DELETE - ${t("Delete")}`}
        message={`Операция №${confirmDelete?.number} будет удалена безвозвратно.`}
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
// import { transactionApi, type JournalEntry } from "../../services/transactionApi";
// import { Table, type Column } from "../../../../components/ui/Table/Table";
// import { Button } from "../../../../components/ui/Button";
// import { Modal } from "../../../../components/ui/Modal/Modal";
// import { ConfirmModal } from "../../../../components/ui/Modal/ConfirmModal";
// import { StatusBadge } from "../../../../components/ui/StatusBadge";
// import { usePageAccess } from "../../../../core/hooks/usePageAccess";
// import JournalEntryForm from "./JournalEntryForm";
// import { useSidebar } from "../../../../core/context/SidebarRightContext";

// export default function JournalPage() {
//   const { t } = useTranslation();
//   const qc = useQueryClient();

//   const { canView, canPost, canPut, canDelete } = usePageAccess("journal");

//   const [filters, setFilters] = useState<Record<string, string>>({});
//   const [formOpen, setFormOpen] = useState(false);
//   const [editEntry, setEditEntry] = useState<JournalEntry | null>(null);
//   const [confirmPost, setConfirmPost] = useState<JournalEntry | null>(null);
//   const [confirmUnpost, setConfirmUnpost] = useState<JournalEntry | null>(null);
//   const [confirmDelete, setConfirmDelete] = useState<JournalEntry | null>(null);
//   const { setSidebarContent } = useSidebar();

//   const { data: entries = [], isLoading } = useQuery({
//     queryKey: ["journal-entries", filters],
//     queryFn: () => transactionApi.list(filters).then((r) => r.data),
//     enabled: canView,
//   });

//   console.log("entries", entries);

//   const postMutation = useMutation({
//     mutationFn: (id: number) => transactionApi.post(id),
//     onSuccess: () => {
//       qc.invalidateQueries({ queryKey: ["journal-entries"] });
//       setConfirmPost(null);
//     },
//   });

//   const unpostMutation = useMutation({
//     mutationFn: (id: number) => transactionApi.unpost(id),
//     onSuccess: () => {
//       qc.invalidateQueries({ queryKey: ["journal-entries"] });
//       setConfirmUnpost(null);
//     },
//   });

//   const deleteMutation = useMutation({
//     mutationFn: (id: number) => transactionApi.delete(id),
//     onSuccess: () => {
//       qc.invalidateQueries({ queryKey: ["journal-entries"] });
//       setConfirmDelete(null);
//     },
//   });

//   const handleEdit = async (entry: JournalEntry) => {
//     const { data } = await transactionApi.retrieve(entry.id);
//     setEditEntry(data);
//     setFormOpen(true);
//   };

//   useEffect(() => {
//       setSidebarContent(<div>JournalPage</div>);
//     }, [setSidebarContent]);

//   const columns: Column<JournalEntry>[] = [
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
//       header: "Дата",
//       accessor: "date",
//       width: "110px",
//       sortable: true,
//       render: (item) => new Date(item.date).toLocaleDateString("ru-RU"),
//     },
//     {
//       header: "Статус",
//       accessor: "status",
//       width: "120px",
//       sortable: true,
//       render: (item) => <StatusBadge isActive={item.status === "posted"} activeLabel="Проведён" inactiveLabel="Черновик" />,
//     },
//     {
//       header: "Содержание",
//       accessor: "description",
//       sortable: true,
//       render: (item) => <span className="text-sm">{item.description || "—"}</span>,
//     },
//     {
//       header: "Сумма",
//       accessor: "debit_total",
//       width: "130px",
//       sortable: true,
//       excelWidth: 15,
//       render: (item) => <span className="font-mono text-sm">{item.debit_total ? Number(item.debit_total).toLocaleString("ru-RU", { minimumFractionDigits: 2 }) : "—"}</span>,
//     },
//     {
//       header: "Автор",
//       accessor: "created_by_name",
//       width: "150px",
//       sortable: true,
//       render: (item) => <span className="text-sm text-gray-500">{item.created_by_name || "—"}</span>,
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
//     <div className="p-4 space-y-4">
//       <div className="flex items-center justify-between">
//         <h1 className="text-xl font-medium">Журнал операций</h1>
//         {canPost && (
//           <Button
//             text="+ Новая операция"
//             onClick={() => {
//               setEditEntry(null);
//               setFormOpen(true);
//             }}
//           />
//         )}
//       </div>

//       {/* Фильтры */}
//       <div className="flex flex-wrap gap-2">
//         <select className="text-sm border rounded px-2 py-1 dark:bg-gray-800 dark:border-gray-600" value={filters.status || ""} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
//           <option value="">Все статусы</option>
//           <option value="draft">Черновик</option>
//           <option value="posted">Проведён</option>
//         </select>
//         <input
//           type="date"
//           className="text-sm border rounded px-2 py-1 dark:bg-gray-800 dark:border-gray-600"
//           value={filters.date_from || ""}
//           onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))}
//         />
//         <input
//           type="date"
//           className="text-sm border rounded px-2 py-1 dark:bg-gray-800 dark:border-gray-600"
//           value={filters.date_to || ""}
//           onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))}
//         />
//         <input
//           type="text"
//           className="text-sm border rounded px-2 py-1 dark:bg-gray-800 dark:border-gray-600"
//           value={filters.search || ""}
//           placeholder="Поиск..."
//           onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
//         />
//         {Object.values(filters).some(Boolean) && (
//           <button onClick={() => setFilters({})} className="text-sm text-gray-400 hover:text-gray-600">
//             Сбросить
//           </button>
//         )}
//       </div>

//       <Table columns={columns} data={entries} tableId="journal_entries" searchQuery={filters.search || ""} onRowDoubleClick={(item) => canPut && item.status === "draft" && handleEdit(item)} />

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
