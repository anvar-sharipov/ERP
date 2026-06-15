import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useSidebar } from "../../../../../core/context/SidebarRightContext";
import { directoryApi } from "../../../services/usersApi";
import { useNotify } from "../../../../../core/context/NotificationContext";
import { getIconByName, DIRECTORY_ICONS } from "../../../../../core/utils/icons";
import { Table, type Column } from "../../../../../components/ui/Table/Table";
import { Button } from "../../../../../components/ui/Button";
import { Input } from "../../../../../components/ui/Input";
import { TextArea } from "../../../../../components/ui/TextArea";
import { IconPicker } from "../../../../../components/ui/Icon/IconPicker";
import { ColorPicker } from "../../../../../components/ui/Icon/ColorPicker";
import { ConfirmModal } from "../../../../../components/ui/Modal/ConfirmModal";
import { Modal } from "../../../../../components/ui/Modal/Modal";
import { Plus, Settings } from "lucide-react";
import { slugify } from "../../../../../core/utils/slugify";
import { RBACGuard } from "../../../../../components/ui/RBACGuard";
import { usePageAccess } from "../../../../../core/hooks/usePageAccess";
import { useTranslation } from "react-i18next";
import { StatusBadge } from "../../../../../components/ui/StatusBadge";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "../../../../../core/router/routes";
import { useRestoreScroll } from "../../../../../core/hooks/useRestoreScroll";

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
  const { t } = useTranslation();
  const { setSidebarContent } = useSidebar();
  const queryClient = useQueryClient();
  const notify = useNotify();

  const { canView, canPost, canPut, canDelete } = usePageAccess("directoryfield");

  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingDir, setEditingDir] = useState<any | null>(null);
  const [formData, setFormData] = useState<DirectoryFormData>(emptyForm);
  const [nameSlugEdited, setNameSlugEdited] = useState(false);

  const [confirmModal, setConfirmModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  const [selectedDirId, setSelectedDirId] = useState<number | null>(null);
  const navigate = useNavigate();
  useRestoreScroll("reselectDirId", setSelectedDirId);

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

  const saveMutation = useMutation({
    mutationFn: (data: DirectoryFormData) => {
      if (!canPost || !canPut || !data) throw new Error(t("ErrorNoRights"));
      return directoryApi.saveDirectory(editingDir?.id || null, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["directories"] });
      notify("success", editingDir ? t("SuccessUpdated") : t("SuccessCreated"));
      setFormModalOpen(false);
      setEditingDir(null);
      setFormData(emptyForm);
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", err.message || t("ErrorSaving"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => directoryApi.deleteDirectory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["directories"] });
      setDeleteTargetId(null);
      notify("success", t("SuccessDeleted")); // Добавь этот ключ в JSON
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", t("ErrorDeleting"));
    },
  });

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
          <h4 className="font-bold text-indigo-300 mb-2">{t("Actions")}</h4>
          <Button
            disabled={!canPost}
            text={t("CreateDirectory")}
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
          <h4 className="font-bold text-indigo-300 mb-2">{t("StatusFilter")}</h4>
          <div className="flex flex-col gap-1">
            {(["all", "active", "inactive"] as const).map((status) => (
              <Button
                key={status}
                onClick={() => setActiveFilter(status)}
                text={status === "all" ? t("AllDirectories") : status === "active" ? t("OnlyActive") : t("OnlyInactive")}
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
  }, [setSidebarContent, activeFilter, canPost, t]);

  const columns: Column<any>[] = [
    { header: t("ID"), excelWidth: 5, accessor: "id", excelAlign: "center", sortable: true },
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
    { header: t("Name"), excelWidth: 30, accessor: "name", sortable: true },
    { header: t("Description"), excelWidth: 20, accessor: "description", sortable: true },
    {
      header: t("Status"),
      excelWidth: 5,
      excelAlign: "center",
      accessor: "is_active",
      excelValue: (i) => (i.is_active ? "+" : ""),
      sortable: true,
      sortValue: (item) => (item.is_active ? 1 : 0),
      render: (item) => <StatusBadge isActive={item.is_active} activeLabel={t("Active")} inactiveLabel={t("Inactive")} />,
    },
    { header: t("Slug"), excelWidth: 20, accessor: "slug", sortable: true },
    {
      header: t("Actions"),
      hideInPrint: true,
      render: (item) => (
        <div className="flex gap-2">
          <Button
            variant="1c"
            icon={<Settings size={14} />}
            className="md:h-6 md:w-8 md:!p-0"
            title={t("DirectoryFields")}
            onClick={(e) => {
              e.stopPropagation();
              navigate(ROUTES.APP.DIRECTORY_FIELDS.replace(":id", String(item.id)));
            }}
          />
          <Button
            title={t("Edit")}
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
            title={t("Delete")}
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

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText={t("ForbiddenText")}>
      <Table
        columns={columns}
        data={filteredDirectories || []}
        tableId="directories_list"
        searchQuery={searchQuery}
        selectedRowId={selectedDirId}
        onSearchChange={setSearchQuery}
        onRowClick={(item) => setSelectedDirId(item.id)}
        onRowDoubleClick={(user) => {
          setEditingDir(user);
          setFormModalOpen(true);
        }}
      />

      {selectedDirId && <div className="mt-6">{/* Здесь логика полей для выбранного справочника */}</div>}

      <Modal isOpen={formModalOpen} onClose={() => setFormModalOpen(false)} title={editingDir ? t("EditDirectory") : t("NewDirectory")} closeOnOutsideClick={false}>
        <div className="space-y-4">
          <Input
            label={t("Name")}
            value={formData.name}
            onChange={(e) => {
              const value = e.target.value;
              setFormData((prev) => ({ ...prev, name: value, slug: nameSlugEdited ? prev.slug : slugify(value) }));
            }}
          />
          <Input
            label={t("Slug")}
            value={formData.slug}
            onChange={(e) => {
              setFormData((prev) => ({ ...prev, slug: e.target.value }));
              setNameSlugEdited(true);
            }}
          />
          <TextArea
            label={t("DescriptionLabel")}
            rows={3}
            value={formData.description}
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            placeholder={t("DescriptionPlaceholder")}
          />
          <ColorPicker selectedColor={formData.color} onSelect={(color) => setFormData((prev) => ({ ...prev, color }))} />
          <IconPicker label={t("IconLabel")} options={DIRECTORY_ICONS} selectedIcon={formData.icon} onSelect={(icon) => setFormData((prev) => ({ ...prev, icon }))} />
          <label className="flex items-center gap-2 font-medium text-gray-700">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            {t("IsActive")}
          </label>
          <div className="flex justify-end gap-2">
            <Button text={t("Cancel")} onClick={() => setFormModalOpen(false)} />
            <Button text={editingDir ? t("Save") : t("Create")} onClick={() => setConfirmModal(true)} />
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={confirmModal}
        type={editingDir ? "warning" : "create"}
        title={editingDir ? t("ConfirmEditTitle") : t("ConfirmCreateTitle")}
        message={editingDir ? t("ConfirmEditMessage", { name: formData.name }) : t("ConfirmCreateMessage", { name: formData.name })}
        confirmText={editingDir ? t("Save") : t("Create")}
        onClose={() => setConfirmModal(false)}
        onConfirm={() => {
          saveMutation.mutate(formData);
          setConfirmModal(false);
        }}
      />

      <ConfirmModal
        isOpen={deleteModal}
        type="delete"
        title={t("DeleteTitle")}
        message={t("DeleteMessage", { name: dirToDelete?.name })}
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
