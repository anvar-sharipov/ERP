// // frontend/src/features/accounting/pages/Accounting/SubcontoTypesPage.tsx
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNotify } from "../../../../core/context/NotificationContext";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { accountApi } from "../../services/accountingApi";
import { Table, type Column } from "../../../../components/ui/Table/Table";
import { Modal } from "../../../../components/ui/Modal/Modal";
import { Button } from "../../../../components/ui/Button";
import { Input } from "../../../../components/ui/Input";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import { useSidebar } from "../../../../core/context/SidebarRightContext";
import { Plus } from "lucide-react";
import { usePageHotkeys } from "../../../../core/hooks/usePageHotkeys";

interface SubcontoType {
  id: number;
  name: string;
  slug: string;
  directory: number | null;
  directory_name: string | null;
  content_type: number;
  content_type_detail: {
    id: number;
    app_label: string;
    model: string;
    label: string;
  };
}

interface FormData {
  name: string;
  slug: string;
  directory: number | null;
  content_type: number | null;
}

const EMPTY: FormData = {
  name: "",
  slug: "",
  directory: null,
  content_type: null,
};

const SubcontoTypesPage = () => {
  const { t } = useTranslation();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { setSidebarContent } = useSidebar();
  const { canView, canPost, canPut, canDelete } = usePageAccess("account");

  const [formModal, setFormModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [editing, setEditing] = useState<SubcontoType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SubcontoType | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedId, setHighlightedId] = useState<number | null>(null);

  const {
    data: subcontoTypes = [],
    isLoading,
    error,
  } = useQuery<SubcontoType[]>({
    queryKey: ["subconto-types"],
    queryFn: accountApi.getSubcontoTypes,
    enabled: canView,
  });

  const { data: contentTypes = [] } = useQuery({
    queryKey: ["content-types"],
    queryFn: accountApi.getContentTypes,
    enabled: canView,
  });

  const { data: directories = [] } = useQuery({
    queryKey: ["directories"],
    queryFn: accountApi.getDirectories,
    enabled: canView,
  });

  const saveMutation = useMutation({
    mutationFn: (data: FormData) => accountApi.saveSubcontoType(editing?.id ?? null, data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["subconto-types"] });
      setFormModal(false);
      notify("success", editing ? t("SuccessUpdated") : t("SuccessCreated"));
      setHighlightedId(res.data.id);
    },
    onError: (err: any) => {
      const msg =
        Object.values(err.response?.data || {})
          .flat()
          .join(", ") || t("ErrorSaving");
      notify("error", msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => accountApi.deleteSubcontoType(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subconto-types"] });
      setDeleteModal(false);
      setDeleteTarget(null);
      notify("success", t("SuccessDeleted"));
    },
    onError: (err: any) => {
      notify("error", err.response?.data?.detail || t("ErrorDeleting"));
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setFormModal(true);
  };

  const openEdit = (item: SubcontoType) => {
    setEditing(item);
    setForm({
      name: item.name,
      slug: item.slug,
      directory: item.directory,
      content_type: item.content_type,
    });
    setFormModal(true);
  };

  usePageHotkeys({ canPost, onInsert: openCreate });

  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <div>
          <h4 className="font-bold text-indigo-300 mb-2">{t("Actions")}</h4>
          <Button text={t("AddSubcontoType")} onClick={openCreate} className="w-full" icon={<Plus size={16} />} dark={true} disabled={!canPost} />
        </div>
        <div className="pt-4 border-t border-indigo-900/30 text-xs text-indigo-300/60 space-y-1">
          <p>{t("SubcontoTypesDescription")}</p>
          <p>{t("SubcontoTypesHint")}</p>
        </div>
      </div>,
    );
  }, [setSidebarContent, canPost, t]);

  const columns: Column<SubcontoType>[] = [
    { header: t("ID"), accessor: "id", sortable: true, excelWidth: 5 },
    { header: t("Name"), accessor: "name", sortable: true, excelWidth: 25 },
    {
      header: t("Slug"),
      accessor: "slug",
      sortable: true,
      excelWidth: 20,
      render: (i) => <span className="font-mono text-xs text-gray-500">{i.slug}</span>,
    },
    {
      header: t("Source"),
      accessor: "content_type",
      excelWidth: 20,
      render: (i) =>
        i.directory_name ? (
          <span className="text-indigo-600 dark:text-indigo-400">📁 {i.directory_name}</span>
        ) : (
          <span className="text-gray-600 dark:text-gray-400">🗄️ {i.content_type_detail?.label ?? "—"}</span>
        ),
    },
    {
      header: t("Actions"),
      isActionColumn: true,
      render: (i) => (
        <div className="flex gap-2">
          <Button
            variant="1c"
            icon={<span>✏️</span>}
            className="md:h-6 md:w-8 md:!p-0"
            disabled={!canPut}
            onClick={(e) => {
              e.stopPropagation();
              openEdit(i);
            }}
          />
          <Button
            variant="1c"
            icon={<span>🗑️</span>}
            className="md:h-6 md:w-8 md:!p-0"
            disabled={!canDelete}
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget(i);
              setDeleteModal(true);
            }}
          />
        </div>
      ),
    },
  ];

  // Источник данных — либо directory либо content_type (не оба)
  // const sourceMode = form.directory ? "directory" : "model";

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText={t("ForbiddenText")}>
      <Table
        columns={columns}
        data={subcontoTypes}
        tableId="subconto-types"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRowDoubleClick={openEdit}
        selectedRowId={highlightedId}
        onHighlightConsumed={() => setHighlightedId(null)}
      />

      {/* Форма создания/редактирования */}
      <Modal isOpen={formModal} onClose={() => setFormModal(false)} title={editing ? `${t("Edit")}: ${editing.name}` : t("AddSubcontoType")} closeOnOutsideClick={false}>
        <div className="space-y-4">
          <Input label={t("Name")} placeholder={t("NamePlaceholder")} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          <Input label={t("Slug")} placeholder={t("SlugPlaceholder")} value={form.slug} onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))} />

          {/* Источник: системная модель ИЛИ справочник */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("DataSource")}</p>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t("SystemModel")}</label>
              <select
                value={form.content_type ?? ""}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    content_type: e.target.value ? Number(e.target.value) : null,
                    directory: null, // сбрасываем directory
                  }))
                }
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">{t("SelectModel")}</option>
                {(contentTypes as any[]).map((ct) => (
                  <option key={ct.id} value={ct.id}>
                    {ct.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-400">
              <div className="flex-1 h-px bg-gray-200 dark:bg-slate-600" />
              {t("Or")}
              <div className="flex-1 h-px bg-gray-200 dark:bg-slate-600" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t("CustomDirectory")}</label>
              <select
                value={form.directory ?? ""}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    directory: e.target.value ? Number(e.target.value) : null,
                    content_type: null, // сбрасываем content_type
                  }))
                }
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">{t("SelectDirectory")}</option>
                {(directories as any[]).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button text={t("Cancel")} onClick={() => setFormModal(false)} />
            <Button text={saveMutation.isPending ? t("Saving") : editing ? t("Save") : t("Create")} variant="danger" onClick={() => saveMutation.mutate(form)} />
          </div>
        </div>
      </Modal>

      {/* Модалка удаления */}
      <Modal isOpen={deleteModal} onClose={() => setDeleteModal(false)} size="sm" title={t("DeleteSubcontoType")}>
        <p className="mb-4 text-gray-700 dark:text-gray-300">
          <span className="font-bold">{deleteTarget?.name}</span> {t("DeleteSubcontoTypeMessage")}
        </p>
        <div className="flex justify-end gap-2">
          <Button text={t("Cancel")} onClick={() => setDeleteModal(false)} />
          <Button text={deleteMutation.isPending ? t("Deleting") : t("Delete")} variant="danger" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} />
        </div>
      </Modal>
    </RBACGuard>
  );
};

export default SubcontoTypesPage;

// import { useState, useEffect } from "react";
// import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
// import { useTranslation } from "react-i18next";
// import { useNotify } from "../../../../core/context/NotificationContext";
// import { usePageAccess } from "../../../../core/hooks/usePageAccess";
// import { accountApi } from "../../services/accountingApi";
// import { Table, type Column } from "../../../../components/ui/Table/Table";
// import { Modal } from "../../../../components/ui/Modal/Modal";
// import { Button } from "../../../../components/ui/Button";
// import { Input } from "../../../../components/ui/Input";
// import { RBACGuard } from "../../../../components/ui/RBACGuard";
// import { useSidebar } from "../../../../core/context/SidebarRightContext";
// import { Plus } from "lucide-react";
// import { usePageHotkeys } from "../../../../core/hooks/usePageHotkeys";

// interface SubcontoType {
//   id: number;
//   name: string;
//   slug: string;
//   directory: number | null;
//   directory_name: string | null;
//   content_type: number;
//   content_type_detail: {
//     id: number;
//     app_label: string;
//     model: string;
//     label: string;
//   };
// }

// interface FormData {
//   name: string;
//   slug: string;
//   directory: number | null;
//   content_type: number | null;
// }

// const EMPTY: FormData = {
//   name: "",
//   slug: "",
//   directory: null,
//   content_type: null,
// };

// const SubcontoTypesPage = () => {
//   const { t } = useTranslation();
//   const notify = useNotify();
//   const queryClient = useQueryClient();
//   const { setSidebarContent } = useSidebar();
//   const { canView, canPost, canPut, canDelete } = usePageAccess("account");

//   const [formModal, setFormModal] = useState(false);
//   const [deleteModal, setDeleteModal] = useState(false);
//   const [editing, setEditing] = useState<SubcontoType | null>(null);
//   const [deleteTarget, setDeleteTarget] = useState<SubcontoType | null>(null);
//   const [form, setForm] = useState<FormData>(EMPTY);
//   const [searchQuery, setSearchQuery] = useState("");
//   const [highlightedId, setHighlightedId] = useState<number | null>(null);

//   const {
//     data: subcontoTypes = [],
//     isLoading,
//     error,
//   } = useQuery<SubcontoType[]>({
//     queryKey: ["subconto-types"],
//     queryFn: accountApi.getSubcontoTypes,
//     enabled: canView,
//   });

//   const { data: contentTypes = [] } = useQuery({
//     queryKey: ["content-types"],
//     queryFn: accountApi.getContentTypes,
//     enabled: canView,
//   });

//   const { data: directories = [] } = useQuery({
//     queryKey: ["directories"],
//     queryFn: accountApi.getDirectories,
//     enabled: canView,
//   });

//   const saveMutation = useMutation({
//     mutationFn: (data: FormData) => accountApi.saveSubcontoType(editing?.id ?? null, data),
//     onSuccess: (res) => {
//       queryClient.invalidateQueries({ queryKey: ["subconto-types"] });
//       setFormModal(false);
//       notify("success", editing ? "Обновлено" : "Создано");
//       setHighlightedId(res.data.id);
//     },
//     onError: (err: any) => {
//       const msg =
//         Object.values(err.response?.data || {})
//           .flat()
//           .join(", ") || "Ошибка";
//       notify("error", msg);
//     },
//   });

//   const deleteMutation = useMutation({
//     mutationFn: (id: number) => accountApi.deleteSubcontoType(id),
//     onSuccess: () => {
//       queryClient.invalidateQueries({ queryKey: ["subconto-types"] });
//       setDeleteModal(false);
//       setDeleteTarget(null);
//       notify("success", "Удалено");
//     },
//     onError: (err: any) => {
//       notify("error", err.response?.data?.detail || "Ошибка удаления");
//     },
//   });

//   const openCreate = () => {
//     setEditing(null);
//     setForm(EMPTY);
//     setFormModal(true);
//   };

//   const openEdit = (item: SubcontoType) => {
//     setEditing(item);
//     setForm({
//       name: item.name,
//       slug: item.slug,
//       directory: item.directory,
//       content_type: item.content_type,
//     });
//     setFormModal(true);
//   };

//   usePageHotkeys({ canPost, onInsert: openCreate });

//   useEffect(() => {
//     setSidebarContent(
//       <div className="space-y-4">
//         <div>
//           <h4 className="font-bold text-indigo-300 mb-2">Действия</h4>
//           <Button text="Добавить вид субконто" onClick={openCreate} className="w-full" icon={<Plus size={16} />} dark={true} disabled={!canPost} />
//         </div>
//         <div className="pt-4 border-t border-indigo-900/30 text-xs text-indigo-300/60 space-y-1">
//           <p>Виды субконто определяют аналитику счетов.</p>
//           <p>Привяжите их к счетам в разделе «План счетов».</p>
//         </div>
//       </div>,
//     );
//   }, [setSidebarContent, canPost]);

//   const columns: Column<SubcontoType>[] = [
//     { header: "ID", accessor: "id", sortable: true, excelWidth: 5 },
//     { header: "Название", accessor: "name", sortable: true, excelWidth: 25 },
//     {
//       header: "Slug",
//       accessor: "slug",
//       sortable: true,
//       excelWidth: 20,
//       render: (i) => <span className="font-mono text-xs text-gray-500">{i.slug}</span>,
//     },
//     {
//       header: "Источник",
//       accessor: "content_type",
//       excelWidth: 20,
//       render: (i) =>
//         i.directory_name ? (
//           <span className="text-indigo-600 dark:text-indigo-400">📁 {i.directory_name}</span>
//         ) : (
//           <span className="text-gray-600 dark:text-gray-400">🗄️ {i.content_type_detail?.label ?? "—"}</span>
//         ),
//     },
//     {
//       header: "Действия",
//       isActionColumn: true,
//       render: (i) => (
//         <div className="flex gap-2">
//           <Button
//             variant="1c"
//             icon={<span>✏️</span>}
//             className="md:h-6 md:w-8 md:!p-0"
//             disabled={!canPut}
//             onClick={(e) => {
//               e.stopPropagation();
//               openEdit(i);
//             }}
//           />
//           <Button
//             variant="1c"
//             icon={<span>🗑️</span>}
//             className="md:h-6 md:w-8 md:!p-0"
//             disabled={!canDelete}
//             onClick={(e) => {
//               e.stopPropagation();
//               setDeleteTarget(i);
//               setDeleteModal(true);
//             }}
//           />
//         </div>
//       ),
//     },
//   ];

//   // Источник данных — либо directory либо content_type (не оба)
//   const sourceMode = form.directory ? "directory" : "model";

//   return (
//     <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText="Нет прав">
//       <Table
//         columns={columns}
//         data={subcontoTypes}
//         tableId="subconto-types"
//         searchQuery={searchQuery}
//         onSearchChange={setSearchQuery}
//         onRowDoubleClick={openEdit}
//         selectedRowId={highlightedId}
//         onHighlightConsumed={() => setHighlightedId(null)}
//       />

//       {/* Форма создания/редактирования */}
//       <Modal isOpen={formModal} onClose={() => setFormModal(false)} title={editing ? `Редактировать: ${editing.name}` : "Новый вид субконто"} closeOnOutsideClick={false}>
//         <div className="space-y-4">
//           <Input label="Название" placeholder="Контрагенты" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
//           <Input label="Slug (системный код)" placeholder="kontragenty" value={form.slug} onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))} />

//           {/* Источник: системная модель ИЛИ справочник */}
//           <div className="space-y-3">
//             <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Источник данных</p>

//             <div>
//               <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Системная модель</label>
//               <select
//                 value={form.content_type ?? ""}
//                 onChange={(e) =>
//                   setForm((p) => ({
//                     ...p,
//                     content_type: e.target.value ? Number(e.target.value) : null,
//                     directory: null, // сбрасываем directory
//                   }))
//                 }
//                 className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
//               >
//                 <option value="">— выберите модель —</option>
//                 {(contentTypes as any[]).map((ct) => (
//                   <option key={ct.id} value={ct.id}>
//                     {ct.label}
//                   </option>
//                 ))}
//               </select>
//             </div>

//             <div className="flex items-center gap-2 text-xs text-gray-400">
//               <div className="flex-1 h-px bg-gray-200 dark:bg-slate-600" />
//               или
//               <div className="flex-1 h-px bg-gray-200 dark:bg-slate-600" />
//             </div>

//             <div>
//               <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Пользовательский справочник</label>
//               <select
//                 value={form.directory ?? ""}
//                 onChange={(e) =>
//                   setForm((p) => ({
//                     ...p,
//                     directory: e.target.value ? Number(e.target.value) : null,
//                     content_type: null, // сбрасываем content_type
//                   }))
//                 }
//                 className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
//               >
//                 <option value="">— выберите справочник —</option>
//                 {(directories as any[]).map((d) => (
//                   <option key={d.id} value={d.id}>
//                     {d.name}
//                   </option>
//                 ))}
//               </select>
//             </div>
//           </div>

//           <div className="flex justify-end gap-2 pt-2">
//             <Button text="Отмена" onClick={() => setFormModal(false)} />
//             <Button text={saveMutation.isPending ? "Сохранение..." : editing ? "Сохранить" : "Создать"} variant="danger" onClick={() => saveMutation.mutate(form)} />
//           </div>
//         </div>
//       </Modal>

//       {/* Модалка удаления */}
//       <Modal isOpen={deleteModal} onClose={() => setDeleteModal(false)} size="sm" title="Удалить вид субконто?">
//         <p className="mb-4 text-gray-700 dark:text-gray-300">
//           <span className="font-bold">{deleteTarget?.name}</span> будет удалён. Все привязки к счетам тоже удалятся.
//         </p>
//         <div className="flex justify-end gap-2">
//           <Button text="Отмена" onClick={() => setDeleteModal(false)} />
//           <Button text={deleteMutation.isPending ? "Удаление..." : "Удалить"} variant="danger" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} />
//         </div>
//       </Modal>
//     </RBACGuard>
//   );
// };

// export default SubcontoTypesPage;
