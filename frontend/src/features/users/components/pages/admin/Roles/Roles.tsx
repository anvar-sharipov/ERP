// frontend/src/features/users/pages/Roles.tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rolesApi } from "../../../../../accounting/services/rolesApi";
import { useSidebar } from "../../../../../../core/context/SidebarRightContext";
import { useEffect, useState } from "react";
import { Button } from "../../../../../../components/ui/Button";
import { Plus, ShieldCheck } from "lucide-react";
import { Table, type Column } from "../../../../../../components/ui/Table/Table";
import { Modal } from "../../../../../../components/ui/Modal/Modal";

import { useTranslation } from "react-i18next";
import { useNotify } from "../../../../../../core/context/NotificationContext";
import { Badge } from "../../../../../../components/ui/Badge";
import { RBACGuard } from "../../../../../../components/ui/RBACGuard";
import { usePageAccess } from "../../../../../../core/hooks/usePageAccess";
import { useTableFilter } from "../../../../../../core/hooks/useTableFilter";
import { type Role } from "../../../../../../core/types";
import { PageHeaderText } from "../../../../../../components/ui/Tabs/PageHeaderText";

import { useNavigate } from "react-router-dom";
import { ROUTES } from "../../../../../../core/router/routes";
import { useRestoreScroll } from "../../../../../../core/hooks/useRestoreScroll";
import { usePageHotkeys } from "../../../../../../core/hooks/usePageHotkeys";

const Roles = () => {
  const { setSidebarContent } = useSidebar();
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const { t } = useTranslation();
  const [deleteModal, setDeleteModal] = useState(false);
  const notify = useNotify();
  // const { hasPermission } = useAccess();
  // const canViewPage = hasPermission("role", "GET");
  const { canView, canPost, canPut, canDelete } = usePageAccess("role");
  // const [highlightedId, setHighlightedId] = useState<number | null>(null);

  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const {} = useRestoreScroll("selectedRoleId", setHighlightedId);

  const navigate = useNavigate();

  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setSidebarContent(
      <div className="space-y-2">
        <h4 className="font-bold text-indigo-300">{t("Actions")}</h4>
        <Button
          disabled={!canPost}
          text={t("CreateRole")}
          // onClick={() => setIsModalOpen(true)}
          onClick={() => navigate(ROUTES.COMPANY_ADMIN.ROLES_CREATE)}
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
      notify("success", `${t("RoleDeleted")} ${editingRole?.name}`);
    },
    onError: (error: any) => {
      if (error._handled) return;
      notify("error", t("ErrorDeleting"));
    },
  });

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

  usePageHotkeys({
    canPost,
    onInsert: () => {
      const isOnCreatePage = location.pathname.includes("create");
      const isOnEditPage = location.pathname.includes("edit");
      if (isOnCreatePage || isOnEditPage) return;
      navigate(ROUTES.COMPANY_ADMIN.ROLES_CREATE);
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
            title={`Enter - ${t("Edit")}`}
            disabled={!canPut}
            variant="1c"
            icon={<span>✏️</span>}
            className="md:h-6 md:w-8 md:!p-0"
            onClick={(e) => {
              e.stopPropagation();
              navigate(ROUTES.COMPANY_ADMIN.ROLES_EDIT.replace(":id", String(role.id)));
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

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText={t("NoViewRights")}>
      <PageHeaderText title={t("Roles")} />
      <Table
        columns={columns}
        data={filteredRoles}
        tableId="roles"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRowDoubleClick={(role) => navigate(ROUTES.COMPANY_ADMIN.ROLES_EDIT.replace(":id", String(role.id)))}
        selectedRowId={highlightedId}
        onHighlightConsumed={() => setHighlightedId(null)}
      />

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
