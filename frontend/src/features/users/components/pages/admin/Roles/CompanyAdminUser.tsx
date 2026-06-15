// // frontend/src/features/accounting/pages/admin/CompanyAdminUser.tsx
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { usersApi } from "../../../../../accounting/services/usersApi";
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
// import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
// import { usersApi } from "../../../../../accounting/services/usersApi";
// import { useSidebar } from "../../../../../../core/context/SidebarRightContext";
// import { useEffect, useState, useMemo } from "react";
// import { Button } from "../../../../../../components/ui/Button";
// import { Plus, User as UserIcon } from "lucide-react";
// import { Input } from "../../../../../../components/ui/Input";
// import { Table, type Column } from "../../../../../../components/ui/Table/Table";
// import { type User as UserInterface } from "../../../../../../core/types";
// import { Modal } from "../../../../../../components/ui/Modal/Modal";
// import { ImagePreview } from "../../../../../../components/ui/ImagePreview";
// import { AssignRolesModal } from "./AssignRolesModal";
// import { Avatar } from "../../../../../../components/ui/Avatar";
// import { useNotify } from "../../../../../../core/context/NotificationContext";
// import { RBACGuard } from "../../../../../../components/ui/RBACGuard";
// import { Badge } from "../../../../../../components/ui/Badge";
// import { usePageAccess } from "../../../../../../core/hooks/usePageAccess";
// import { useTranslation } from "react-i18next";

// const CompanyAdminUser = () => {
//   const { setSidebarContent } = useSidebar();
//   const [userModalOpen, setUserModalOpen] = useState(false);
//   const notify = useNotify();
//   const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
//   const { t } = useTranslation();

//   // const { hasPermission } = useAccess();
//   // const canViewPage = hasPermission("user", "GET");
//   const { canView, canPost, canPut, canDelete } = usePageAccess("user");

//   const [deleteModal, setDeleteModal] = useState(false);
//   const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

//   const [searchQuery, setSearchQuery] = useState("");

//   // const [editingUser, setEditingUser] = useState(null);
//   const [editingUser, setEditingUser] = useState<UserInterface | null>(null);
//   // const [selectedImage, setSelectedImage] = useState(null);
//   const [selectedImage, setSelectedImage] = useState<string | null>(null);
//   const [assignModal, setAssignModal] = useState<{ isOpen: boolean; userId: number | null; roles: number[] }>({
//     isOpen: false,
//     userId: null,
//     roles: [],
//   });

//   const [formData, setFormData] = useState({ username: "", first_name: "", last_name: "", phone: "", position: "", is_active: true, password: "" });
//   const queryClient = useQueryClient();

//   const userMutation = useMutation({
//     mutationFn: (data: any) => {
//       if (editingUser && !canPut) throw new Error("Нет прав на редактирование");
//       if (!editingUser && !canPost) throw new Error("Нет прав на создание");
//       // ВАЖНО: Отправляй только то, что есть в Meta.fields сериализатора
//       const payload = {
//         username: data.username,
//         first_name: data.first_name,
//         last_name: data.last_name,
//         phone: data.phone,
//         position: data.position,
//         is_active: data.is_active,
//         ...(data.password && { password: data.password }),
//         // email: data.email || "",
//       };

//       // Добавляем пароль только если он есть
//       // if (data.password) {
//       //   payload.password = data.password;
//       // }
//       // 2. Добавляем пароль ТОЛЬКО если он был введен
//       if (data.password && data.password.trim() !== "") {
//         payload.password = data.password;
//       }

//       const userId = editingUser?.id ? Number(editingUser.id) : null;
//       return usersApi.saveUser(userId, data);
//     },
//     onSuccess: () => {
//       queryClient.invalidateQueries({ queryKey: ["users"] });
//       setUserModalOpen(false);
//       setFormData({ username: "", first_name: "", last_name: "", phone: "", position: "", is_active: true, password: "" });
//       notify("success", `Success ${editingUser ? "updated" : "created"} user ${editingUser?.username || formData.username}`);
//     },
//     // --- ЛОВИМ ОШИБКУ ТУТ ---
//     onError: (error: any) => {
//       if (error._handled) return; // уже показали уведомление глобально
//       const message = error.response?.data?.message || error.message || "Произошла ошибка";
//       notify("error", `Ошибка: ${message}`);
//     },
//   });

//   useEffect(() => {
//     if (editingUser) {
//       setFormData({
//         username: editingUser.username || "",
//         // Если у вас в User есть только full_name, разбейте его или используйте отдельные поля
//         first_name: editingUser.first_name || "",
//         last_name: editingUser.last_name || "",
//         phone: editingUser.phone || "",
//         position: editingUser.position || "",
//         is_active: editingUser.is_active ?? true, // Используем ?? для проверки на undefined
//         password: "", // Пароль всегда пустой при редактировании
//       });
//     } else {
//       // Сброс формы
//       setFormData({
//         username: "",
//         first_name: "",
//         last_name: "",
//         phone: "",
//         position: "",
//         is_active: true,
//         password: "",
//       });
//     }
//   }, [editingUser]);

//   // delete user
//   const deleteUserMutation = useMutation({
//     // Теперь вызываем метод из сервиса
//     mutationFn: (id: number) => {
//       if (!canDelete) throw new Error("Нет прав на удаление");
//       return usersApi.deleteUser(id);
//     },
//     onSuccess: () => {
//       queryClient.invalidateQueries({ queryKey: ["users"] });
//       setDeleteModal(false);
//       setDeleteTargetId(null);
//       notify("success", "Пользователь успешно удален");
//     },
//     onError: (error: any) => {
//       if (error._handled) return;
//       notify("error", "Ошибка при удалении пользователя");
//     },
//   });

//   // Установка контекстных действий в Right Sidebar
//   useEffect(() => {
//     setSidebarContent(
//       <div className="space-y-4">
//         {/* Кнопка Добавить (теперь она сверху) */}
//         <div>
//           <h4 className="font-bold text-indigo-300 mb-2">Действия</h4>
//           <Button
//             disabled={!canPost}
//             text="Добавить пользователя"
//             onClick={() => {
//               setEditingUser(null);
//               setUserModalOpen(true);
//             }}
//             className="w-full"
//             icon={
//               <div className="flex items-center gap-1">
//                 <UserIcon className="w-5 h-5" />
//                 <Plus className="w-3 h-3" />
//               </div>
//             }
//             // variant="1c" // или используйте dark={true}, если это предусмотрено стилями
//             dark={true}
//           />
//         </div>

//         {/* Фильтр статуса */}
//         <div className="pt-4 border-t border-indigo-900/30">
//           <h4 className="font-bold text-indigo-300 mb-2">Фильтр статуса</h4>
//           <div className="flex flex-col gap-1">
//             {(["all", "active", "inactive"] as const).map((status) => (
//               <Button
//                 key={status}
//                 onClick={() => setActiveFilter(status)}
//                 text={status === "all" ? "Все пользователи" : status === "active" ? "Только активные" : "Только неактивные"}
//                 variant="ghost"
//                 dark={true}
//                 isActive={activeFilter === status}
//                 className="w-full justify-start"
//                 icon={status !== "all" ? <span className={`w-2 h-2 rounded-full ${status === "active" ? "bg-green-500" : "bg-red-500"}`} /> : undefined}
//               />
//             ))}
//           </div>
//         </div>
//       </div>,
//     );
//   }, [setSidebarContent, activeFilter, canPost]); // Добавьте activeFilter в зависимости

//   // Хук автоматически управляет загрузкой и ошибками
//   const {
//     data: users, // Здесь TypeScript сейчас думает, что это 'any'
//     isLoading,
//     error,
//   } = useQuery<UserInterface[]>({
//     // <-- Укажите тип массива пользователей здесь
//     queryKey: ["users"],
//     queryFn: usersApi.getUsers,
//     enabled: canView,
//     retry: false,
//     staleTime: 1000 * 60 * 5,
//   });

//   const filteredUsers = useMemo(() => {
//     if (!users) return [];

//     // 1. Фильтр по статусу
//     let result = users;
//     if (activeFilter === "active") result = result.filter((u) => u.is_active);
//     if (activeFilter === "inactive") result = result.filter((u) => !u.is_active);

//     // 2. Поиск
//     if (searchQuery.trim()) {
//       const q = searchQuery.toLowerCase();
//       result = result.filter(
//         (u) =>
//           u.full_name?.toLowerCase().includes(q) || // Ищем по ФИО
//           u.username?.toLowerCase().includes(q) || // Ищем по логину
//           u.position?.toLowerCase().includes(q) || // Ищем по должности
//           u.phone?.toLowerCase().includes(q), // Ищем по телефону
//       );
//     }

//     return result;
//   }, [users, activeFilter, searchQuery]);

//   const columns: Column<UserInterface>[] = [
//     { header: "ID", accessor: "id", sortable: true, excelWidth: 8, excelAlign: "center" },
//     // { header: "ФИО", render: (user) => <div>{[user.last_name, user.first_name].filter(Boolean).join(" ")}</div>, sortable: true },
//     { header: t("FullName"), accessor: "full_name", sortable: true, excelWidth: 30 },
//     { header: t("Position"), accessor: "position", sortable: true, excelWidth: 15 },
//     { header: t("Login"), accessor: "username", sortable: true, excelWidth: 15 },
//     {
//       header: t("Photo"),
//       excelWidth: 6,
//       excelImageUrl: (user) => user.photo_thumbnail || null,
//       render: (user) => {
//         return (
//           <div className="flex justify-center">
//             <Avatar src={user.photo_thumbnail} fallbackText={user.username} onClick={() => user.photo && setSelectedImage(user.photo)} />
//           </div>
//         );
//       },
//     },
//     {
//       header: t("Status"),
//       excelWidth: 13,
//       accessor: "is_active", // используем ключ для работы сортировки
//       excelValue: (u) => (u.is_active ? t("Active") : t("Inactive")), // dlya excel
//       sortable: true,
//       sortValue: (user) => (user.is_active ? 1 : 0), // Активные (1) будут выше/ниже неактивных (0)
//       render: (user) => (
//         <div className="flex items-center justify-center gap-2 print:block">
//           <span className={`w-2 h-2 rounded-full ${user.is_active ? "bg-green-500" : "bg-red-500"}`} />
//           <span className="text-gray-700 text-xs">{user.is_active ? t("Active") : t("Inactive")}</span>
//         </div>
//       ),
//     },
//     {
//       header: t("Roles"),
//       excelWidth: 20,
//       sortable: true,
//       accessor: "roles", // Указываем ключ для триггера сортировки
//       excelValue: (user) => user.roles?.map((r) => r.name).join(", ") || "—",
//       sortValue: (user) =>
//         user.roles
//           ?.map((r) => r.name)
//           .sort()
//           .join(", ") || "", // Сортируем по строке имен ролей
//       render: (user) => (user.roles && user.roles.length > 0 ? user.roles.map((role) => <Badge key={role.id} text={role.name} text_position="start" />) : <div>-</div>),
//     },
//     { header: t("Phone"), accessor: "phone", sortable: true, excelWidth: 18 },
//     {
//       header: t("Actions"),
//       hideInPrint: true,
//       render: (user) => (
//         <div className="flex gap-2">
//           <Button
//             disabled={!canPut}
//             variant="1c"
//             icon={<span>✏️</span>}
//             className="md:h-6 md:w-8 md:!p-0"
//             onClick={(e) => {
//               e.stopPropagation();
//               setEditingUser(user);
//               setUserModalOpen(true);
//             }}
//           />
//           <Button
//             disabled={!canDelete}
//             variant="1c"
//             icon={<span>🗑️</span>}
//             className="md:h-6 md:w-8 md:!p-0"
//             onClick={(e) => {
//               e.stopPropagation();
//               // Используем Number(), чтобы гарантировать передачу числа
//               setDeleteTargetId(Number(user.id));
//               setDeleteModal(true);
//             }}
//           />

//           <Button
//             disabled={!canPut}
//             variant="1c"
//             icon={<span>🛡️</span>}
//             className="md:h-6 md:w-8 md:!p-0"
//             onClick={(e) => {
//               e.stopPropagation();
//               setAssignModal({
//                 isOpen: true,
//                 userId: Number(user.id), // Приводим к типу number
//                 roles: user.roles.map((r) => r.id),
//               });
//             }}
//           />
//         </div>
//       ),
//     },
//   ];

//   const userToDelete = users?.find((u) => u.id === deleteTargetId);

//   return (
//     <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText="У вас нет прав на просмотр пользователей">
//       <div>
//         <Table
//           columns={columns}
//           data={filteredUsers || []}
//           tableId="users"
//           // ПЕРЕДАЕМ поиск в таблицу
//           searchQuery={searchQuery}
//           onSearchChange={setSearchQuery}
//           onRowDoubleClick={(user) => {
//             // Твоя логика открытия модалки:
//             setEditingUser(user);
//             setUserModalOpen(true);
//           }}
//         />
//       </div>

//       <Modal isOpen={userModalOpen} onClose={() => setUserModalOpen(false)} title={editingUser ? "Редактирование" : "Создание"} closeOnOutsideClick={false}>
//         <div className="space-y-4">
//           <Input label="Логин" value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} />

//           {/* Поле пароля */}
//           <Input
//             label={editingUser ? "Новый пароль (оставьте пустым, если не меняете)" : "Пароль"}
//             type="password"
//             value={formData.password}
//             onChange={(e) => setFormData({ ...formData, password: e.target.value })}
//           />

//           <Input label="Имя" value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} />
//           <Input label="Фамилия" value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} />
//           <Input label="Телефон" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
//           <Input label="Должность" value={formData.position} onChange={(e) => setFormData({ ...formData, position: e.target.value })} />

//           <label className="flex items-center gap-2 font-medium text-gray-700">
//             <input
//               type="checkbox"
//               checked={formData.is_active}
//               onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
//               className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
//             />
//             Активный пользователь
//           </label>

//           <div className="flex justify-end gap-2">
//             <Button
//               text="Отмена"
//               onClick={() => {
//                 // setFormData({ username: "", first_name: "", last_name: "", phone: "", position: "", is_active: true, password: "" })
//                 setUserModalOpen(false);
//               }}
//             />
//             <Button text="Сохранить" onClick={() => userMutation.mutate(formData)} variant="danger" />
//           </div>
//         </div>
//       </Modal>

//       <ImagePreview src={selectedImage} onClose={() => setSelectedImage(null)} />

//       <AssignRolesModal isOpen={assignModal.isOpen} userId={assignModal.userId} currentRoles={assignModal.roles} onClose={() => setAssignModal({ isOpen: false, userId: null, roles: [] })} />

//       {/* delete user */}
//       <Modal isOpen={deleteModal} onClose={() => setDeleteModal(false)} size="sm">
//         <div className="mb-6">
//           <p>Вы действительно хотите удалить пользователя:</p>
//           {/* Выводим ФИО и логин */}
//           <p className="font-bold text-gray-900 dark:text-gray-200 mt-2">
//             {userToDelete?.last_name} {userToDelete?.first_name} ({userToDelete?.username})
//           </p>
//           <p className="text-red-500 mt-4">Это действие нельзя будет отменить.</p>
//         </div>

//         <div className="flex justify-end gap-2">
//           <Button text="Отмена" onClick={() => setDeleteModal(false)} />
//           <Button
//             variant="danger"
//             text="Удалить"
//             onClick={() => {
//               if (deleteTargetId) {
//                 deleteUserMutation.mutate(deleteTargetId);
//                 setDeleteModal(false);
//               }
//             }}
//           />
//         </div>
//       </Modal>
//     </RBACGuard>
//   );
// };

// export default CompanyAdminUser;
