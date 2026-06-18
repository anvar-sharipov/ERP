// frontend/src/features/users/pages/Roles.tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rolesApi } from "../../../../../accounting/services/rolesApi";
import { useSidebar } from "../../../../../../core/context/SidebarRightContext";
import { useEffect, useState } from "react";
import { Button } from "../../../../../../components/ui/Button";
import { Plus, ShieldCheck } from "lucide-react";
import { Table, type Column } from "../../../../../../components/ui/Table/Table";
import { Modal } from "../../../../../../components/ui/Modal/Modal";
import { Input } from "../../../../../../components/ui/Input";
import { api } from "../../../../../../core/api/axiosInstance";
import { useTranslation } from "react-i18next";
import { useNotify } from "../../../../../../core/context/NotificationContext";
import { Badge } from "../../../../../../components/ui/Badge";
import { RBACGuard } from "../../../../../../components/ui/RBACGuard";
import { usePageAccess } from "../../../../../../core/hooks/usePageAccess";
import { useTableFilter } from "../../../../../../core/hooks/useTableFilter";
import { type Role } from "../../../../../../core/types";
import { PageHeaderText } from "../../../../../../components/ui/Tabs/PageHeaderText";


const Roles = () => {
  const { setSidebarContent } = useSidebar();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const { t } = useTranslation();
  const [deleteModal, setDeleteModal] = useState(false);
  const notify = useNotify();
  // const { hasPermission } = useAccess();
  // const canViewPage = hasPermission("role", "GET");
  const { canView, canPost, canPut, canDelete } = usePageAccess("role");
  const [highlightedId, setHighlightedId] = useState<number | null>(null);

  const [roleName, setRoleName] = useState("");
  const [selectedPerms, setSelectedPerms] = useState<number[]>([]);
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: matrix, isLoading: matrixIsLoading } = useQuery({
    queryKey: ["permissionsMatrix"],
    queryFn: rolesApi.getPermissionsMatrix,
    enabled: isModalOpen,
  });

  useEffect(() => {
    setSidebarContent(
      <div className="space-y-2">
        <h4 className="font-bold text-indigo-300">{t("Actions")}</h4>
        <Button
          disabled={!canPost}
          text={t("CreateRole")}
          // onClick={() => setIsModalOpen(true)}
          onClick={() => {
            setEditingRole(null);
            setIsModalOpen(true);
          }}
          className="w-full"
          icon={
            <div className="flex items-center gap-1">
              <ShieldCheck className="w-5 h-5" />
              <Plus className="w-3 h-3" />
            </div>
          }
          dark={true}
        />
      </div>,
    );
    return () => setSidebarContent(null);
  }, [setSidebarContent, canPost, t]);

  const deleteRoleMutation = useMutation({
    mutationFn: (id: number) => {
      if (!canDelete) throw new Error(t("InsufficientRights"));
      return rolesApi.deleteRoles(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      setDeleteModal(false);
      setEditingRole(null);
      setRoleName("");
      setSelectedPerms([]);
      notify("success", `${t("RoleDeleted")} ${editingRole?.name}`);
    },
    onError: (error: any) => {
      if (error._handled) return;
      notify("error", t("ErrorDeleting"));
    },
  });

  useEffect(() => {
    if (editingRole) {
      setRoleName(editingRole.name);
      // Делаем запрос к конкретной роли
      api
        .get(`/users/roles/${editingRole.id}/`)
        .then((res) => {
          setSelectedPerms(res.data.current_permissions);
        })
        .catch((error: any) => {
          if (!error._handled) notify("error", t("ErrorLoading"));
        });
    } else {
      setRoleName("");
      setSelectedPerms([]);
    }
  }, [editingRole]);

  const {
    data: roles,
    isLoading,
    error,
  } = useQuery<Role[]>({
    queryKey: ["roles"],
    queryFn: rolesApi.getRoles,
    enabled: canView,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  const togglePerm = (id: number) => {
    setSelectedPerms((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const saveRoleMutation = useMutation({
    mutationFn: (data: { name: string; permissions: number[] }) => {
      if (editingRole) {
        if (!canPut) throw new Error(t("no_edit_rights"));
        return rolesApi.saveRole(editingRole.id, data);
      }
      if (!canPost) throw new Error(t("InsufficientRights"));
      return rolesApi.saveRole(null, data);
    },
    onSuccess: (res) => {
      setIsModalOpen(false);
      setEditingRole(null);
      setRoleName("");
      setSelectedPerms([]);
      notify("success", t("SaveSuccess"));
      setHighlightedId(res.data.id);

      queryClient.invalidateQueries({ queryKey: ["roles"] }); // Обновить список ролей
    },
    onError: (error: any) => {
      if (error._handled) return;
      notify("error", t("ErrorSaving"));
    },
  });

  const columns: Column<Role>[] = [
    { header: "ID", accessor: "id", sortable: true, excelWidth: 8, excelAlign: "center" },
    // { header: "Название роли", accessor: "name", sortable: true },
    { header: t("RoleName"), sortable: true, excelWidth: 20, excelValue: (role) => role.name, render: (role) => <Badge text={role.name} text_position="start" /> },
    {
      header: t("Actions"),
      isActionColumn: true,
      render: (role) => (
        <div className="flex gap-2">
          <Button
            title={`F2 - ${t("Edit")}`}
            disabled={!canPut}
            variant="1c"
            icon={<span>✏️</span>}
            className="md:h-6 md:w-8 md:!p-0"
            onClick={() => {
              setEditingRole(role); // Запоминаем роль
              setIsModalOpen(true); // Открываем модалку
            }}
          />
          <Button
            title={`DELETE - ${t("Delete")}`}
            disabled={!canDelete}
            variant="1c"
            icon={<span>🗑️</span>}
            className="md:h-6 md:w-8 md:!p-0"
            onClick={() => {
              setEditingRole(role);
              setDeleteModal(true);
            }}
          />
        </div>
      ),
    },
  ];


  const filteredRoles = useTableFilter(roles || [], {
    search: searchQuery,
    searchFields: ["name"],
  });

  // Выбрать/отменить все права для конкретного ресурса
  const toggleResource = (actions: any[], select: boolean) => {
    const actionIds = actions.map((p) => p.id);
    setSelectedPerms(
      (prev) =>
        select
          ? Array.from(new Set([...prev, ...actionIds])) // Добавить
          : prev.filter((id) => !actionIds.includes(id)), // Удалить
    );
  };

  // Выбрать/отменить вообще все права
  const toggleAll = (matrix: any, select: boolean) => {
    if (!select) {
      setSelectedPerms([]);
      return;
    }
    const allIds = Object.values(matrix)
      .flat()
      .map((p: any) => p.id);
    setSelectedPerms(allIds);
  };

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText={t("NoViewRights")}>
      <PageHeaderText title={t("Roles")} />
      <Table
        columns={columns}
        data={filteredRoles}
        tableId="roles"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRowDoubleClick={(user) => {
          // Твоя логика открытия модалки:
          setEditingRole(user);
          setIsModalOpen(true);
        }}
        selectedRowId={highlightedId}
        onHighlightConsumed={() => setHighlightedId(null)}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingRole(null);
        }}
        title={editingRole ? t("EditRole") : t("NewRole")}
        size="xl"
        // closeOnOutsideClick={false}
      >
        <div className="space-y-6">
          <Input label={t("RoleName")} value={roleName} onChange={(e) => setRoleName(e.target.value)} />

          {/* Кнопки общего управления */}
          <div className="flex gap-4 mb-2">
            <Button text={t("SelectAll")} onClick={() => toggleAll(matrix || {}, true)} />
            <Button text={t("ResetAll")} onClick={() => toggleAll(matrix || {}, false)} />
          </div>

          <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
            {matrixIsLoading ? (
              <p>{t("LoadingPerms")}</p>
            ) : (
              Object.entries(matrix || {}).map(([resource, actions]: [string, any]) => {
                const isResourceSelected = actions.every((p: any) => selectedPerms.includes(p.id));

                return (
                  <div key={resource} className="border-b border-slate-200 dark:border-slate-700 pb-3">
                    <div className="flex items-center gap-3 mb-2">
                      <Button variant="1c" text={isResourceSelected ? t("DeselectAllResource") : t("SelectAllResource")} onClick={() => toggleResource(actions, !isResourceSelected)} size="sm" />

                      <h4 className="font-bold capitalize text-indigo-400">
                        {t(resource)} <span className="text-sm font-normal">({resource})</span>
                      </h4>
                    </div>
                    <div className="flex flex-wrap gap-4">
                      {actions.map((perm: any) => (
                        <label key={perm.id} className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={selectedPerms.includes(perm.id)} onChange={() => togglePerm(perm.id)} />
                          <span>{t(perm.action)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button text={t("cancel")} onClick={() => setIsModalOpen(false)} />
            <Button text={t("Save")} onClick={() => saveRoleMutation.mutate({ name: roleName, permissions: selectedPerms })} />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={deleteModal}
        onClose={() => {
          setDeleteModal(false);
          setEditingRole(null);
        }}
        title={`${t("DeleteConfirm")} ${editingRole?.name}`}
        size="lg"
      >
        <div className="flex justify-end gap-2">
          <Button text={t("cancel")} onClick={() => setDeleteModal(false)} />
          <Button
            text={t("Delete")}
            onClick={() => {
              if (editingRole?.id) {
                deleteRoleMutation.mutate(editingRole.id);
              }
            }}
          />
        </div>
      </Modal>
    </RBACGuard>
  );
};

export default Roles;
