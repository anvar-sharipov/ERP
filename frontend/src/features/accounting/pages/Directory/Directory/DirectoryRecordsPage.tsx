// frontend/src/features/accounting/pages/Directory/Directory/DirectoryRecordsPage.tsx
import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { directoryApi, directoryFieldApi, directoryRecordApi } from "../../../services/directoryApi";
import { useNotify } from "../../../../../core/context/NotificationContext";
import { usePageAccess } from "../../../../../core/hooks/usePageAccess";
import { useSidebar } from "../../../../../core/context/SidebarRightContext";
import { Table, type Column } from "../../../../../components/ui/Table/Table";
import { Button } from "../../../../../components/ui/Button";
import { Input } from "../../../../../components/ui/Input";
import { Modal } from "../../../../../components/ui/Modal/Modal";
import { ConfirmModal } from "../../../../../components/ui/Modal/ConfirmModal";
import { RBACGuard } from "../../../../../components/ui/RBACGuard";
import { StatusBadge } from "../../../../../components/ui/StatusBadge";
import { BackButton } from "../../../../../components/ui/BackButton";
import { useRestoreScroll } from "../../../../../core/hooks/useRestoreScroll";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { usePageHotkeys } from "../../../../../core/hooks/usePageHotkeys";

// ─── типы ────────────────────────────────────────────────────────────────────

interface DirectoryField {
  id: number;
  name: string;
  slug: string;
  field_type: string; // text | number | date | boolean | ref
  field_type_display: string;
  is_required: boolean;
  order: number;
  ref_directory: number | null;
}

interface DirectoryRecord {
  id: number;
  directory: number;
  name: string;
  data: Record<string, any>;
  is_active: boolean;
  created_at: string;
}

interface RecordFormData {
  name: string;
  is_active: boolean;
  data: Record<string, any>;
}

// ─── хелперы ─────────────────────────────────────────────────────────────────

const buildEmptyData = (fields: DirectoryField[]): Record<string, any> => Object.fromEntries(fields.map((f) => [f.slug, f.field_type === "boolean" ? false : ""]));

const formatCellValue = (value: any, fieldType: string): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (fieldType === "boolean") return value ? "Да" : "Нет";
  if (fieldType === "date") return new Date(value).toLocaleDateString("ru-RU");
  return String(value);
};

// ─── компонент поля формы ────────────────────────────────────────────────────

interface FieldInputProps {
  field: DirectoryField;
  value: any;
  onChange: (slug: string, value: any) => void;
  // для ref — список записей другого справочника
  refOptions?: { id: number; name: string }[];
}

const FieldInput = ({ field, value, onChange, refOptions = [] }: FieldInputProps) => {
  const base =
    "w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg " +
    "bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 " +
    "focus:outline-none focus:ring-2 focus:ring-indigo-500";

  switch (field.field_type) {
    case "boolean":
      return (
        <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(field.slug, e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
          {field.name}
        </label>
      );

    case "date":
      return <input type="date" value={value || ""} onChange={(e) => onChange(field.slug, e.target.value)} className={base} />;

    case "number":
      return <input type="number" value={value || ""} onChange={(e) => onChange(field.slug, e.target.value)} className={base} />;

    case "ref":
      return (
        <select value={value || ""} onChange={(e) => onChange(field.slug, e.target.value)} className={base}>
          <option value="">— не выбрано —</option>
          {refOptions.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.name}
            </option>
          ))}
        </select>
      );

    default: // text
      return <input type="text" value={value || ""} onChange={(e) => onChange(field.slug, e.target.value)} className={base} />;
  }
};

// ─── основная страница ────────────────────────────────────────────────────────

const DirectoryRecordsPage = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { setSidebarContent } = useSidebar();
  const { canView, canPost, canPut, canDelete } = usePageAccess("directoryrecord");

  const directoryId = Number(id);

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DirectoryRecord | null>(null);
  const [formData, setFormData] = useState<RecordFormData>({ name: "", is_active: true, data: {} });
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { getBackProps } = useRestoreScroll("reselectDirId", () => {});

  // ── запросы ────────────────────────────────────────────────────────────────

  // заголовок страницы
  const { data: directory } = useQuery({
    queryKey: ["directory", directoryId],
    queryFn: async () => {
      const res = await directoryApi.getDirectory();
      return res.find((d: any) => d.id === directoryId) ?? null;
    },
    enabled: !!directoryId,
  });

  // поля справочника — из них строим колонки и форму
  const { data: fields = [] } = useQuery<DirectoryField[]>({
    queryKey: ["directory-fields", directoryId],
    queryFn: () => directoryFieldApi.getFields(directoryId),
    enabled: !!directoryId,
  });

  // записи
  const {
    data: records = [],
    isLoading,
    error,
  } = useQuery<DirectoryRecord[]>({
    queryKey: ["directory-records", directoryId],
    queryFn: () => directoryRecordApi.getRecords(directoryId),
    enabled: !!directoryId && canView,
    retry: false,
  });

  // для ref-полей загружаем записи связанных справочников
  const refDirectoryIds = useMemo(() => [...new Set(fields.filter((f) => f.field_type === "ref" && f.ref_directory).map((f) => f.ref_directory as number))], [fields]);

  const refQueries = useQuery({
    queryKey: ["directory-records-refs", refDirectoryIds],
    queryFn: async () => {
      const results: Record<number, { id: number; name: string }[]> = {};
      await Promise.all(
        refDirectoryIds.map(async (refId) => {
          const data = await directoryRecordApi.getRecords(refId);
          results[refId] = data.map((r: DirectoryRecord) => ({ id: r.id, name: r.name }));
        }),
      );
      return results;
    },
    enabled: refDirectoryIds.length > 0,
  });

  const refOptions = refQueries.data ?? {};

  // ── форма ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (editingRecord) {
      setFormData({
        name: editingRecord.name,
        is_active: editingRecord.is_active,
        data: { ...editingRecord.data },
      });
    } else {
      setFormData({ name: "", is_active: true, data: buildEmptyData(fields) });
    }
  }, [editingRecord, fields]);

  const setFieldValue = (slug: string, value: any) => {
    setFormData((prev) => ({ ...prev, data: { ...prev.data, [slug]: value } }));
  };

  // ── мутации ────────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: (data: RecordFormData) =>
      directoryRecordApi.saveRecord(editingRecord?.id ?? null, {
        ...data,
        directory: directoryId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["directory-records", directoryId] });
      notify("success", editingRecord ? "Запись обновлена" : "Запись создана");
      setFormModalOpen(false);
      setEditingRecord(null);
    },
    onError: (err: any) => {
      if (err._handled) return;
      const dataErrors = err.response?.data?.data;
      if (dataErrors && typeof dataErrors === "object") {
        const msg = Object.values(dataErrors).flat().join(", ");
        notify("error", msg);
      } else {
        notify("error", err.response?.data?.detail || "Ошибка сохранения");
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => directoryRecordApi.deleteRecord(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["directory-records", directoryId] });
      notify("success", "Запись удалена");
      setDeleteTargetId(null);
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", "Ошибка при удалении");
    },
  });

  // ── сайдбар ────────────────────────────────────────────────────────────────

  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <div>
          <h4 className="font-bold text-indigo-300 mb-2">{t("Actions")}</h4>
          <Button
            title={`Insert - ${t("AddRecord")}`}
            disabled={!canPost}
            text={t("AddRecord")}
            className="w-full"
            dark={true}
            icon={<Plus className="w-4 h-4" />}
            onClick={() => {
              setEditingRecord(null);
              setFormModalOpen(true);
            }}
          />
        </div>
        {fields.length > 0 && (
          <div className="pt-4 border-t border-indigo-900/30">
            <h4 className="font-bold text-indigo-300 mb-2">Поля справочника</h4>
            <div className="flex flex-col gap-1 text-indigo-200 text-sm">
              {fields.map((f) => (
                <div key={f.id} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
                  <span>{f.name}</span>
                  <span className="text-indigo-400 text-xs ml-auto">{f.field_type_display}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>,
    );
  }, [setSidebarContent, canPost, fields]);

  // ── колонки ────────────────────────────────────────────────────────────────

  usePageHotkeys({
    canPost,
    onInsert: () => {
      setEditingRecord(null);
      setFormModalOpen(true);
    },
  });

  const dynamicColumns: Column<DirectoryRecord>[] = fields.map((field) => ({
    header: field.name,
    excelWidth: 20,
    sortable: true,
    sortValue: (item) => item.data?.[field.slug] ?? "",
    render: (item) => {
      const value = item.data?.[field.slug];

      if (field.field_type === "boolean") {
        return <StatusBadge isActive={!!value} activeLabel="Да" inactiveLabel="Нет" />;
      }

      if (field.field_type === "ref" && field.ref_directory) {
        const opts = refOptions[field.ref_directory] ?? [];
        const found = opts.find((o) => String(o.id) === String(value));
        return <span>{found?.name ?? value ?? "—"}</span>;
      }

      return <span>{formatCellValue(value, field.field_type)}</span>;
    },
    excelValue: (item) => formatCellValue(item.data?.[field.slug], field.field_type),
  }));

  const columns: Column<DirectoryRecord>[] = [
    { header: "ID", accessor: "id", sortable: true, excelWidth: 5 },
    { header: "Название", accessor: "name", sortable: true, excelWidth: 25 },
    ...dynamicColumns,
    {
      header: "Статус",
      excelWidth: 8,
      sortable: true,
      sortValue: (item) => (item.is_active ? 1 : 0),
      excelValue: (item) => (item.is_active ? "+" : ""),
      render: (item) => <StatusBadge isActive={item.is_active} activeLabel="Активна" inactiveLabel="Неактивна" />,
    },
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
              setEditingRecord(item);
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

  // ── фильтрация ─────────────────────────────────────────────────────────────

  const filteredRecords = useMemo(() => {
    if (!searchQuery.trim()) return records;
    const q = searchQuery.toLowerCase();
    return records.filter((r) => {
      if (r.name?.toLowerCase().includes(q)) return true;
      return Object.values(r.data ?? {}).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [records, searchQuery]);

  const recordToDelete = records.find((r) => r.id === deleteTargetId);

  // ── рендер ─────────────────────────────────────────────────────────────────

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText="Нет прав на просмотр записей">
      {/* Шапка */}
      <div className="flex items-center gap-3 mb-4">
        <BackButton id={directoryId} getBackProps={getBackProps} className="!px-2" />
        <div>
          <h1 className="text-xl font-bold">Записи: {directory?.name ?? `#${id}`}</h1>
          <p className="text-sm text-gray-500">
            {records.length} {records.length === 1 ? "запись" : records.length < 5 ? "записи" : "записей"}
          </p>
        </div>
      </div>

      <Table
        columns={columns}
        data={filteredRecords}
        tableId={`directory_records_${id}`}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRowDoubleClick={(record) => {
          setEditingRecord(record);
          setFormModalOpen(true);
        }}
      />

      {/* Модалка создания/редактирования */}
      <Modal
        isOpen={formModalOpen}
        onClose={() => {
          setFormModalOpen(false);
          setEditingRecord(null);
        }}
        title={editingRecord ? "Редактировать запись" : "Добавить запись"}
        closeOnOutsideClick={false}
      >
        <div className="space-y-4">
          {/* Основное поле — название */}
          <Input label="Название *" value={formData.name} placeholder="например: ООО Ромашка" onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))} />

          {/* Динамические поля из DirectoryField */}
          {fields.map((field) => (
            <div key={field.id}>
              {field.field_type !== "boolean" && (
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {field.name}
                  {field.is_required && <span className="text-red-500 ml-1">*</span>}
                  <span className="text-xs text-gray-400 ml-2">({field.field_type_display})</span>
                </label>
              )}
              <FieldInput field={field} value={formData.data[field.slug]} onChange={setFieldValue} refOptions={field.ref_directory ? (refOptions[field.ref_directory] ?? []) : []} />
            </div>
          ))}

          {/* Статус */}
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Активна
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              text="Отмена"
              onClick={() => {
                setFormModalOpen(false);
                setEditingRecord(null);
              }}
            />
            <Button text={saveMutation.isPending ? "Сохранение..." : editingRecord ? "Сохранить" : "Создать"} onClick={() => saveMutation.mutate(formData)} variant="danger" />
          </div>
        </div>
      </Modal>

      {/* Модалка удаления */}
      <ConfirmModal
        isOpen={deleteModal}
        type="delete"
        title="Удалить запись?"
        message={`Удалить запись "${recordToDelete?.name}"?`}
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

export default DirectoryRecordsPage;
