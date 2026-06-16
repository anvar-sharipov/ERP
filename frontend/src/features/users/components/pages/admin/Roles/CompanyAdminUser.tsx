// // // frontend/src/features/accounting/pages/admin/CompanyAdminUser.tsx

// // frontend/src/features/accounting/pages/admin/CompanyAdminUser.tsx
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { usersApi } from "../../../../services/userApi";
import { useSidebar } from "../../../../../../core/context/SidebarRightContext";
import { useEffect, useState, useMemo } from "react";
import { Button } from "../../../../../../components/ui/Button";
import { Plus, User as UserIcon } from "lucide-react";
import { Input } from "../../../../../../components/ui/Input";
import { Table, type Column } from "../../../../../../components/ui/Table/Table";
import { type User as UserInterface } from "../../../../../../core/types";
import { Modal } from "../../../../../../components/ui/Modal/Modal";
import { ImagePreview } from "../../../../../../components/ui/ImagePreview";
import { AssignRolesModal } from "./AssignRolesModal";
import { Avatar } from "../../../../../../components/ui/Avatar";
import { useNotify } from "../../../../../../core/context/NotificationContext";
import { RBACGuard } from "../../../../../../components/ui/RBACGuard";
import { Badge } from "../../../../../../components/ui/Badge";
import { usePageAccess } from "../../../../../../core/hooks/usePageAccess";
import { useTranslation } from "react-i18next";

const CompanyAdminUser = () => {
  const { t } = useTranslation();
  const { setSidebarContent } = useSidebar();
  const [userModalOpen, setUserModalOpen] = useState(false);
  const notify = useNotify();
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");

  const { canView, canPost, canPut, canDelete } = usePageAccess("user");

  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingUser, setEditingUser] = useState<UserInterface | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [assignModal, setAssignModal] = useState<{ isOpen: boolean; userId: number | null; roles: number[] }>({
    isOpen: false,
    userId: null,
    roles: [],
  });

  const [formData, setFormData] = useState({ username: "", first_name: "", last_name: "", phone: "", position: "", is_active: true, password: "" });
  const queryClient = useQueryClient();

  const userMutation = useMutation({
    mutationFn: (data: any) => {
      const payload: any = {
        username: data.username,
        first_name: data.first_name,
        last_name: data.last_name,
        phone: data.phone,
        position: data.position,
        is_active: data.is_active,
      };
      if (data.password && data.password.trim() !== "") {
        payload.password = data.password;
      }
      const userId = editingUser?.id ? Number(editingUser.id) : null;
      return usersApi.saveUser(userId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setUserModalOpen(false);
      setFormData({ username: "", first_name: "", last_name: "", phone: "", position: "", is_active: true, password: "" });
      notify("success", `${t("Success")}: ${editingUser ? t("Edit") : t("Create")}`);
    },
    onError: (error: any) => {
      if (error._handled) return;
      const message = error.response?.data?.message || error.message || t("Error");
      notify("error", `${t("Error")}: ${message}`);
    },
  });

  useEffect(() => {
    if (editingUser) {
      setFormData({
        username: editingUser.username || "",
        first_name: editingUser.first_name || "",
        last_name: editingUser.last_name || "",
        phone: editingUser.phone || "",
        position: editingUser.position || "",
        is_active: editingUser.is_active ?? true,
        password: "",
      });
    } else {
      setFormData({ username: "", first_name: "", last_name: "", phone: "", position: "", is_active: true, password: "" });
    }
  }, [editingUser]);

  const deleteUserMutation = useMutation({
    mutationFn: (id: number) => usersApi.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setDeleteModal(false);
      setDeleteTargetId(null);
      notify("success", t("UserDeleted"));
    },
    onError: () => notify("error", t("Error")),
  });

  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <div>
          <h4 className="font-bold text-indigo-300 mb-2">{t("Actions")}</h4>
          <Button
            disabled={!canPost}
            text={t("AddUser")}
            onClick={() => {
              setEditingUser(null);
              setUserModalOpen(true);
            }}
            className="w-full"
            icon={
              <div className="flex items-center gap-1">
                <UserIcon className="w-5 h-5" />
                <Plus className="w-3 h-3" />
              </div>
            }
            dark={true}
          />
        </div>
        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2">{t("StatusFilter")}</h4>
          <div className="flex flex-col gap-1">
            {(["all", "active", "inactive"] as const).map((status) => (
              <Button
                key={status}
                onClick={() => setActiveFilter(status)}
                text={status === "all" ? t("AllUsers") : status === "active" ? t("OnlyActive") : t("OnlyInactive")}
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

  const {
    data: users,
    isLoading,
    error,
  } = useQuery<UserInterface[]>({
    queryKey: ["users"],
    queryFn: usersApi.getUsers,
    enabled: canView,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    let result = users;
    if (activeFilter === "active") result = result.filter((u) => u.is_active);
    if (activeFilter === "inactive") result = result.filter((u) => !u.is_active);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((u) => u.full_name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q) || u.position?.toLowerCase().includes(q) || u.phone?.toLowerCase().includes(q));
    }
    return result;
  }, [users, activeFilter, searchQuery]);

  const columns: Column<UserInterface>[] = [
    { header: t("Actions"), accessor: "id", sortable: true, excelWidth: 8, excelAlign: "center" },
    { header: t("FullName"), accessor: "full_name", sortable: true, excelWidth: 30 },
    { header: t("Position"), accessor: "position", sortable: true, excelWidth: 15 },
    { header: t("Login"), accessor: "username", sortable: true, excelWidth: 15 },
    {
      header: t("Photo"),
      excelWidth: 6,
      excelImageUrl: (user) => user.photo_thumbnail || null,
      render: (user) => (
        <div className="flex justify-center">
          <Avatar src={user.photo_thumbnail} fallbackText={user.username} onClick={() => user.photo && setSelectedImage(user.photo)} />
        </div>
      ),
    },
    {
      header: t("Status"),
      excelWidth: 13,
      accessor: "is_active",
      excelValue: (u) => (u.is_active ? t("Active") : t("Inactive")),
      sortable: true,
      sortValue: (u) => (u.is_active ? 1 : 0),
      render: (u) => (
        <div className="flex items-center justify-center gap-2 print:block">
          <span className={`w-2 h-2 rounded-full ${u.is_active ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-gray-700 text-xs">{u.is_active ? t("Active") : t("Inactive")}</span>
        </div>
      ),
    },
    {
      header: t("Roles"),
      excelWidth: 20,
      sortable: true,
      accessor: "roles",
      excelValue: (u) => u.roles?.map((r) => r.name).join(", ") || "—",
      sortValue: (u) =>
        u.roles
          ?.map((r) => r.name)
          .sort()
          .join(", ") || "",
      render: (u) => (u.roles && u.roles.length > 0 ? u.roles.map((r) => <Badge key={r.id} text={r.name} text_position="start" />) : <div>-</div>),
    },
    { header: t("Phone"), accessor: "phone", sortable: true, excelWidth: 18 },
    {
      header: t("Actions"),
      hideInPrint: true,
      render: (u) => (
        <div className="flex gap-2">
          <Button
          title={t("Edit")}
            disabled={!canPut}
            variant="1c"
            icon={<span>✏️</span>}
            className="md:h-6 md:w-8 md:!p-0"
            onClick={(e) => {
              e.stopPropagation();
              setEditingUser(u);
              setUserModalOpen(true);
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
              setDeleteTargetId(Number(u.id));
              setDeleteModal(true);
            }}
          />
          
          <Button
          title={t("EditRoles")}
            disabled={!canPut}
            variant="1c"
            icon={<span>🛡️</span>}
            className="md:h-6 md:w-8 md:!p-0"
            onClick={(e) => {
              e.stopPropagation();
              setAssignModal({ isOpen: true, userId: Number(u.id), roles: u.roles.map((r) => r.id) });
            }}
          />
        </div>
      ),
    },
  ];

  const userToDelete = users?.find((u) => u.id === deleteTargetId);

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText={t("NoRights")}>
      <Table
        columns={columns}
        data={filteredUsers || []}
        tableId="users"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRowDoubleClick={(u) => {
          setEditingUser(u);
          setUserModalOpen(true);
        }}
      />

      <Modal isOpen={userModalOpen} onClose={() => setUserModalOpen(false)} title={editingUser ? t("Edit") : t("Create")} closeOnOutsideClick={false}>
        <div className="space-y-4">
          <Input label={t("Username")} value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} />
          <Input
            label={editingUser ? t("NewPassword") : t("Password")}
            type="password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          />
          <Input label={t("FirstName")} value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} />
          <Input label={t("LastName")} value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} />
          <Input label={t("Phone")} value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
          <Input label={t("Position")} value={formData.position} onChange={(e) => setFormData({ ...formData, position: e.target.value })} />
          <label className="flex items-center gap-2 font-medium text-gray-700">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            {t("IsActive")}
          </label>
          <div className="flex justify-end gap-2">
            <Button text={t("Cancel")} onClick={() => setUserModalOpen(false)} />
            <Button text={t("Save")} onClick={() => userMutation.mutate(formData)} variant="danger" />
          </div>
        </div>
      </Modal>

      <ImagePreview src={selectedImage} onClose={() => setSelectedImage(null)} />
      <AssignRolesModal isOpen={assignModal.isOpen} userId={assignModal.userId} currentRoles={assignModal.roles} onClose={() => setAssignModal({ isOpen: false, userId: null, roles: [] })} />

      <Modal isOpen={deleteModal} onClose={() => setDeleteModal(false)} size="sm">
        <div className="mb-6">
          <p>{t("DeleteConfirm")}</p>
          <p className="font-bold text-gray-900 dark:text-gray-200 mt-2">
            {userToDelete?.last_name} {userToDelete?.first_name} ({userToDelete?.username})
          </p>
          <p className="text-red-500 mt-4">{t("Irreversible")}</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button text={t("Cancel")} onClick={() => setDeleteModal(false)} />
          <Button
            variant="danger"
            text={t("Delete")}
            onClick={() => {
              if (deleteTargetId) deleteUserMutation.mutate(deleteTargetId);
            }}
          />
        </div>
      </Modal>
    </RBACGuard>
  );
};

export default CompanyAdminUser;
