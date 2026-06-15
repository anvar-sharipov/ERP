import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useSidebar } from "../../../../core/context/SidebarRightContext";
import { directoryApi } from "../../services/usersApi";
import { useNotify } from "../../../../core/context/NotificationContext";
import { getIconByName, DIRECTORY_ICONS } from "../../../../core/utils/icons";
import { Table, type Column } from "../../../../components/ui/Table/Table";
import { Button } from "../../../../components/ui/Button";
import { Input } from "../../../../components/ui/Input";
import { TextArea } from "../../../../components/ui/TextArea";
import { IconPicker } from "../../../../components/ui/Icon/IconPicker";
import { ColorPicker } from "../../../../components/ui/Icon/ColorPicker";
import { ConfirmModal } from "../../../../components/ui/Modal/ConfirmModal";
import { Modal } from "../../../../components/ui/Modal/Modal";
import { Plus } from "lucide-react";
import { slugify } from "../../../../core/utils/slugify";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";

interface DirectoryFormData {
  name: string;
  slug: string;
  icon: string;
  color: string;
  description: string;
  is_active: boolean;
}

const emptyForm: DirectoryFormData = {
  name: "",
  slug: "",
  icon: "Warehouse",
  color: "#3b82f6",
  description: "",
  is_active: true,
};

const CreateField = () => {
  const { setSidebarContent } = useSidebar();
  const queryClient = useQueryClient();
  const notify = useNotify();
  // const { hasPermission } = useAccess();

  const [selectedDirId, setSelectedDirId] = useState<number | null>(null);

  const { canView, canPost, canPut, canDelete } = usePageAccess("directoryfield");

  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Форма создания/редактирования
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingDir, setEditingDir] = useState<any | null>(null);
  const [formData, setFormData] = useState<DirectoryFormData>(emptyForm);
  const [nameSlugEdited, setNameSlugEdited] = useState(false);

  // Подтверждения
  const [confirmModal, setConfirmModal] = useState(false); // create/edit confirm
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  // const canViewDirectory = hasPermission("directory", "GET");

  const {
    data: directories,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["directories"],
    queryFn: directoryApi.getDirectory,
    enabled: canView,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  // Заполнение формы при редактировании
  useEffect(() => {
    if (editingDir) {
      setFormData({
        name: editingDir.name || "",
        slug: editingDir.slug || "",
        icon: editingDir.icon || "Warehouse",
        color: editingDir.color || "#3b82f6",
        description: editingDir.description || "",
        is_active: editingDir.is_active ?? true,
      });
      setNameSlugEdited(true);
    } else {
      setFormData(emptyForm);
      setNameSlugEdited(false);
    }
  }, [editingDir]);

  // Создание/обновление справочника
  const saveMutation = useMutation({
    mutationFn: (data: DirectoryFormData) => {
      if (!canPost || !canPut || !data) throw new Error("У вас нет прав на редактирование");
      return directoryApi.saveDirectory(editingDir?.id || null, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["directories"] });
      notify("success", `Справочник ${editingDir ? "обновлён" : "создан"}`);
      setFormModalOpen(false);
      setEditingDir(null);
      setFormData(emptyForm);
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", err.message || "Произошла ошибка при сохранении");
    },
  });

  // Удаление справочника
  const deleteMutation = useMutation({
    mutationFn: (id: number) => directoryApi.deleteDirectory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["directories"] });
      setDeleteTargetId(null);
      notify("success", "Справочник удалён");
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", "Ошибка при удалении справочника");
    },
  });

  // Фильтрация по статусу + поиск
  const filteredDirectories = useMemo(() => {
    if (!directories) return [];

    let result = directories;

    if (activeFilter === "active") result = result.filter((d: any) => d.is_active);
    if (activeFilter === "inactive") result = result.filter((d: any) => !d.is_active);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((d: any) => d.name?.toLowerCase().includes(q) || d.slug?.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q));
    }

    return result;
  }, [directories, activeFilter, searchQuery]);

  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <div>
          <h4 className="font-bold text-indigo-300 mb-2">Действия</h4>
          <Button
            disabled={!canPost}
            text="Создать справочник"
            className="w-full"
            dark={true}
            icon={<Plus className="w-4 h-4" />}
            onClick={() => {
              setEditingDir(null);
              setFormModalOpen(true);
            }}
          />
        </div>

        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2">Фильтр статуса</h4>
          <div className="flex flex-col gap-1">
            {(["all", "active", "inactive"] as const).map((status) => (
              <Button
                key={status}
                onClick={() => setActiveFilter(status)}
                text={status === "all" ? "Все справочники" : status === "active" ? "Только активные" : "Только неактивные"}
                variant="ghost"
                dark={true}
                isActive={activeFilter === status}
                className="w-full justify-start"
                icon={status !== "all" ? <span className={`w-2 h-2 rounded-full ${status === "active" ? "bg-green-500" : "bg-red-500"}`} /> : undefined}
              />
            ))}
          </div>
        </div>
      </div>,
    );
  }, [setSidebarContent, activeFilter, canPost]);

  const columns: Column<any>[] = [
    {
      header: "ID",
      excelWidth: 5,
      accessor: "id",
      excelAlign: "center",
      sortable: true,
    },
    {
      header: "svg",
      width: "15px",
      excelWidth: 4,
      excelIcon: (item) => ({ iconName: item.icon, color: item.color }),
      render: (item) => {
        const IconComponent = getIconByName(item.icon);
        return (
          <div className="flex items-center gap-2">
            <IconComponent size={20} style={{ color: item.color }} />
          </div>
        );
      },
    },
    {
      header: "Название",
      excelWidth: 30,
      accessor: "name",
      sortable: true,
    },
    {
      header: "Описание",
      excelWidth: 20,
      accessor: "description",
      sortable: true,
    },
    {
      header: "Статус",
      excelWidth: 5,
      excelAlign: "center",
      accessor: "is_active",
      excelValue: (i) => (i.is_active ? "+" : ""),
      sortable: true,
      sortValue: (item) => (item.is_active ? 1 : 0),
      render: (item) => (
        <div className="flex items-center justify-center gap-2 print:block">
          <span className={`w-2 h-2 rounded-full ${item.is_active ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-gray-700 text-xs">{item.is_active ? "Активен" : "Неактивен"}</span>
        </div>
      ),
    },
    {
      header: "Slug",
      excelWidth: 20,
      accessor: "slug",
      sortable: true,
    },
    {
      header: "Действия",
      hideInPrint: true,
      render: (item) => (
        <div className="flex gap-2">
          <Button
            disabled={!canPut}
            variant="1c"
            icon={<span>✏️</span>}
            className="md:h-6 md:w-8 md:!p-0"
            onClick={(e) => {
              e.stopPropagation();
              setEditingDir(item);
              setFormModalOpen(true);
            }}
          />
          <Button
            disabled={!canDelete}
            variant="1c"
            icon={<span>🗑️</span>}
            className="md:h-6 md:w-8 md:!p-0"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTargetId(Number(item.id));
              setDeleteModal(true);
            }}
          />
        </div>
      ),
    },
  ];

  const dirToDelete = directories?.find((d: any) => d.id === deleteTargetId);

  // Внутри CompanyAdminUser
  //   if (isLoading) return <Loader containerClass="mx-auto mt-20" />;

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText="У вас нет прав на просмотр справочников">
      <h1 className="text-2xl font-bold mb-4">Список справочников</h1>

      <Table
        columns={columns}
        data={filteredDirectories || []}
        tableId="directories_list"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRowClick={(item) => setSelectedDirId(item.id)}
        onRowDoubleClick={(user) => {
          setEditingDir(user);
          setFormModalOpen(true);
        }}
      />

      {selectedDirId && <div className="mt-6">{/* Здесь логика полей для выбранного справочника */}</div>}

      {/* Модалка формы создания/редактирования */}
      <Modal isOpen={formModalOpen} onClose={() => setFormModalOpen(false)} title={editingDir ? "Редактирование справочника" : "Создание справочника"} closeOnOutsideClick={false}>
        <div className="space-y-4">
          <Input
            label="Название"
            value={formData.name}
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
            label="Slug"
            value={formData.slug}
            onChange={(e) => {
              setFormData((prev) => ({ ...prev, slug: e.target.value }));
              setNameSlugEdited(true);
            }}
          />

          <TextArea
            label="Описание"
            rows={3}
            value={formData.description}
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="Введите описание справочника..."
          />

          <ColorPicker selectedColor={formData.color} onSelect={(color) => setFormData((prev) => ({ ...prev, color }))} />

          <IconPicker label="Иконка справочника" options={DIRECTORY_ICONS} selectedIcon={formData.icon} onSelect={(icon) => setFormData((prev) => ({ ...prev, icon }))} />

          <label className="flex items-center gap-2 font-medium text-gray-700">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Активный справочник
          </label>

          <div className="flex justify-end gap-2">
            <Button text="Отмена" onClick={() => setFormModalOpen(false)} />
            <Button text={editingDir ? "Сохранить" : "Создать"} onClick={() => setConfirmModal(true)} />
          </div>
        </div>
      </Modal>

      {/* Подтверждение создания/редактирования */}
      <ConfirmModal
        isOpen={confirmModal}
        type={editingDir ? "warning" : "create"}
        title={editingDir ? "Изменение справочника" : "Создание справочника"}
        message={editingDir ? `Сохранить изменения справочника "${formData.name}"?` : `Создать справочник "${formData.name}"?`}
        confirmText={editingDir ? "Сохранить" : "Создать"}
        onClose={() => setConfirmModal(false)}
        onConfirm={() => {
          saveMutation.mutate(formData);
          setConfirmModal(false);
        }}
      />

      {/* Подтверждение удаления */}
      <ConfirmModal
        isOpen={deleteModal}
        type="delete"
        title="Удаление справочника"
        message={`Удалить справочник "${dirToDelete?.name}"?`}
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

export default CreateField;
