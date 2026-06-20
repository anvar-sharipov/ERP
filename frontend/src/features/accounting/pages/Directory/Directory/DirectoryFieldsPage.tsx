// frontend/src/features/accounting/pages/Directory/DirectoryFieldsPage.tsx
import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { directoryApi, directoryFieldApi } from "../../../services/directoryApi";
import { useNotify } from "../../../../../core/context/NotificationContext";
import { usePageAccess } from "../../../../../core/hooks/usePageAccess";
import { useSidebar } from "../../../../../core/context/SidebarRightContext";
import { Table, type Column } from "../../../../../components/ui/Table/Table";
import { Button } from "../../../../../components/ui/Button";
import { Input } from "../../../../../components/ui/Input";
import { Modal } from "../../../../../components/ui/Modal/Modal";
import { ConfirmModal } from "../../../../../components/ui/Modal/ConfirmModal";
import { RBACGuard } from "../../../../../components/ui/RBACGuard";
import { slugify } from "../../../../../core/utils/slugify";
import { useTranslation } from "react-i18next";
import { useRestoreScroll } from "../../../../../core/hooks/useRestoreScroll";
import { BackButton } from "../../../../../components/ui/BackButton";
import { Plus } from "lucide-react";
import { usePageHotkeys } from "../../../../../core/hooks/usePageHotkeys";

const FIELD_TYPES = [
  { value: "text", label: "Текст" },
  { value: "number", label: "Число" },
  { value: "date", label: "Дата" },
  { value: "boolean", label: "Да/Нет" },
  { value: "ref", label: "Ссылка на справочник" },
];

interface FieldFormData {
  name: string;
  slug: string;
  field_type: string;
  ref_directory: number | null;
  is_required: boolean;
  order: number;
}

const EMPTY_FORM: FieldFormData = {
  name: "",
  slug: "",
  field_type: "text",
  ref_directory: null,
  is_required: false,
  order: 0,
};

const DirectoryFieldsPage = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { setSidebarContent } = useSidebar();
  const { canView, canPost, canPut, canDelete } = usePageAccess("directoryfield");

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<any | null>(null);
  const [formData, setFormData] = useState<FieldFormData>(EMPTY_FORM);
  const [nameSlugEdited, setNameSlugEdited] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { getBackProps } = useRestoreScroll("reselectDirId", () => {});

  //   const navigate = useNavigate();
  const directoryId = Number(id);

  // Загружаем сам справочник (для заголовка)
  const { data: directory } = useQuery({
    queryKey: ["directory", directoryId],
    queryFn: async () => {
      const res = await directoryApi.getDirectory();
      return res.find((d: any) => d.id === directoryId) ?? null;
    },
    enabled: !!directoryId,
  });

  // Загружаем поля справочника
  const {
    data: fields = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["directory-fields", directoryId],
    queryFn: () => directoryFieldApi.getFields(directoryId),
    enabled: !!directoryId && canView,
    retry: false,
  });

  const { data: directories = [] } = useQuery({
    queryKey: ["directories"],
    queryFn: directoryApi.getDirectory,
  });

  // Заполняем форму при редактировании
  useEffect(() => {
    if (editingField) {
      setFormData({
        name: editingField.name,
        slug: editingField.slug,
        field_type: editingField.field_type,
        ref_directory: editingField.ref_directory ?? null,
        is_required: editingField.is_required,
        order: editingField.order,
      });
      setNameSlugEdited(true);
    } else {
      setFormData({ ...EMPTY_FORM, order: fields.length });
      setNameSlugEdited(false);
    }
  }, [editingField, fields.length]);

  const saveMutation = useMutation({
    mutationFn: (data: FieldFormData) =>
      directoryFieldApi.saveField(editingField?.id ?? null, {
        ...data,
        directory: directoryId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["directory-fields", directoryId] });
      notify("success", editingField ? "Поле обновлено" : "Поле создано");
      setFormModalOpen(false);
      setEditingField(null);
    },
    onError: (err: any) => {
      if (err._handled) return;
      const msg = err.response?.data?.slug?.[0] || err.response?.data?.detail || "Ошибка сохранения";
      notify("error", msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => directoryFieldApi.deleteField(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["directory-fields", directoryId] });
      notify("success", "Поле удалено");
      setDeleteTargetId(null);
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", "Ошибка при удалении");
    },
  });

  // Sidebar
  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <div>
          <h4 className="font-bold text-indigo-300 mb-2">Действия</h4>
          <Button
            title={`Insert - ${t("AddField")}`}
            disabled={!canPost}
            text={t("AddField")}
            className="w-full"
            dark={true}
            icon={<Plus className="w-4 h-4" />}
            onClick={() => {
              setEditingField(null);
              setFormModalOpen(true);
            }}
          />
        </div>
        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2">Типы полей</h4>
          <div className="flex flex-col gap-1 text-indigo-200 text-sm">
            {FIELD_TYPES.map((ft) => (
              <div key={ft.value} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-400" />
                {ft.label}
              </div>
            ))}
          </div>
        </div>
      </div>,
    );
  }, [setSidebarContent, canPost]);

  const fieldToDelete = fields.find((f: any) => f.id === deleteTargetId);

  const filteredFields = useMemo(() => {
    if (!searchQuery.trim()) return fields;
    const q = searchQuery.toLowerCase();
    return fields.filter((f: any) => f.name?.toLowerCase().includes(q) || f.slug?.toLowerCase().includes(q));
  }, [fields, searchQuery]);

  usePageHotkeys({
    canPost,
    onInsert: () => {
      setEditingField(null);
      setFormModalOpen(true);
    },
  });

  const columns: Column<any>[] = [
    { header: "ID", accessor: "id", sortable: true, excelWidth: 5 },
    { header: "Название", accessor: "name", sortable: true, excelWidth: 25 },
    { header: "Slug", accessor: "slug", sortable: true, excelWidth: 20 },
    {
      header: "Тип",
      accessor: "field_type_display",
      sortable: true,
      excelWidth: 15,
    },
    {
      header: "Обязательное",
      accessor: "is_required",
      sortable: true,
      excelWidth: 10,
      render: (item) => <span className={item.is_required ? "text-green-600 font-medium" : "text-gray-400"}>{item.is_required ? "Да" : "Нет"}</span>,
    },
    { header: "Порядок", accessor: "order", sortable: true, excelWidth: 8 },
    {
      header: "Действия",
      hideInPrint: true,
      render: (item) => (
        <div className="flex gap-2">
          <Button
            title={`F2 - ${t("Edit")}`}
            disabled={!canPut}
            variant="1c"
            icon={<span>✏️</span>}
            className="md:h-6 md:w-8 md:!p-0"
            onClick={(e) => {
              e.stopPropagation();
              setEditingField(item);
              setFormModalOpen(true);
            }}
          />
          <Button
            title={`DELETE - ${t("Delete")}`}
            disabled={!canDelete}
            variant="1c"
            icon={<span>🗑️</span>}
            className="md:h-6 md:w-8 md:!p-0"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTargetId(item.id);
              setDeleteModal(true);
            }}
          />
        </div>
      ),
    },
  ];

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText="Нет прав на просмотр полей">
      {/* Шапка с кнопкой назад */}
      <div className="flex items-center gap-3 mb-4">
        <BackButton id={directoryId} getBackProps={getBackProps} className="!px-2" />
        <div>
          <h1 className="text-xl font-bold">Поля справочника: {directory?.name ?? `#${id}`}</h1>
          <p className="text-sm text-gray-500">
            {fields.length} {fields.length === 1 ? "поле" : "полей"}
          </p>
        </div>
      </div>

      <Table
        columns={columns}
        data={filteredFields}
        tableId={`directory_fields_${id}`}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRowDoubleClick={(field) => {
          setEditingField(field);
          setFormModalOpen(true);
        }}
      />

      {/* Модалка создания/редактирования */}
      <Modal
        isOpen={formModalOpen}
        onClose={() => {
          setFormModalOpen(false);
          setEditingField(null);
        }}
        title={editingField ? "Редактировать поле" : "Добавить поле"}
        closeOnOutsideClick={false}
      >
        <div className="space-y-4">
          <Input
            label="Название поля"
            value={formData.name}
            placeholder="например: ИНН"
            onChange={(e) => {
              const value = e.target.value;
              setFormData((prev) => ({
                ...prev,
                name: value,
                slug: nameSlugEdited ? prev.slug : slugify(value),
              }));
            }}
          />
          <Input
            label="Slug (ключ в JSON)"
            value={formData.slug}
            placeholder="например: inn"
            onChange={(e) => {
              setFormData((prev) => ({ ...prev, slug: e.target.value }));
              setNameSlugEdited(true);
            }}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Тип поля</label>
            <select
              value={formData.field_type}
              onChange={(e) => setFormData((prev) => ({ ...prev, field_type: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {FIELD_TYPES.map((ft) => (
                <option key={ft.value} value={ft.value}>
                  {ft.label}
                </option>
              ))}
            </select>
          </div>

          {formData.field_type === "ref" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Связанный справочник</label>
              <select
                value={formData.ref_directory ?? ""}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    ref_directory: e.target.value ? Number(e.target.value) : null,
                  }))
                }
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">— выберите справочник —</option>
                {directories.map((d: any) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Input label="Порядок" type="number" value={String(formData.order)} onChange={(e) => setFormData((prev) => ({ ...prev, order: Number(e.target.value) }))} />
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_required}
              onChange={(e) => setFormData((prev) => ({ ...prev, is_required: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Обязательное поле
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              text="Отмена"
              onClick={() => {
                setFormModalOpen(false);
                setEditingField(null);
              }}
            />
            <Button text={saveMutation.isPending ? "Сохранение..." : editingField ? "Сохранить" : "Создать"} onClick={() => saveMutation.mutate(formData)} />
          </div>
        </div>
      </Modal>

      {/* Модалка удаления */}
      <ConfirmModal
        isOpen={deleteModal}
        type="delete"
        title="Удалить поле?"
        message={`Удалить поле "${fieldToDelete?.name}"? Данные в записях справочника по этому ключу останутся в JSONB, но станут недоступны через UI.`}
        onClose={() => setDeleteModal(false)}
        onConfirm={() => {
          if (deleteTargetId) {
            deleteMutation.mutate(deleteTargetId);
            setDeleteModal(false);
          }
        }}
      />
    </RBACGuard>
  );
};

export default DirectoryFieldsPage;
