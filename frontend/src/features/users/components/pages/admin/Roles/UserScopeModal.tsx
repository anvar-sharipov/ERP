// frontend/src/features/users/components/pages/admin/Roles/UserScopeModal.tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Trash2, Plus } from "lucide-react";
import { Modal } from "../../../../../../components/ui/Modal/Modal";
import { Button } from "../../../../../../components/ui/Button";
import { useNotify } from "../../../../../../core/context/NotificationContext";
import { api } from "../../../../../../core/api/axiosInstance";
import { Select } from "../../../../../../components/ui/Select/Select";

// ── API ───────────────────────────────────────────────────────────────────────

const userScopeApi = {
  getByUser: async (userId: number) => {
    const res = await api.get("/accounting/user-scopes/", { params: { user: userId } });
    return res.data;
  },
  add: async (data: { user: number; branch?: number | null; warehouse?: number | null }) => {
    return api.post("/accounting/user-scopes/", data);
  },
  remove: async (id: number) => {
    return api.delete(`/accounting/user-scopes/${id}/`);
  },
};

const warehouseApi = {
  getAll: async () => {
    const res = await api.get("/accounting/warehouses/");
    return Array.isArray(res.data) ? res.data : (res.data.results ?? []);
  },
};

const branchApi = {
  getAll: async () => {
    const res = await api.get("/accounting/branches/");
    return Array.isArray(res.data) ? res.data : (res.data.results ?? []);
  },
};

// ── Типы ──────────────────────────────────────────────────────────────────────

interface ScopeRow {
  id: number;
  user: number;
  branch: number | null;
  branch_name: string | null;
  warehouse: number | null;
  warehouse_name: string | null;
}

interface Props {
  isOpen: boolean;
  userId: number | null;
  userName: string;
  onClose: () => void;
}

// const selectCls =
//   "w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg " +
//   "bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 " +
//   "focus:outline-none focus:ring-2 focus:ring-indigo-500";

// ── Компонент ─────────────────────────────────────────────────────────────────

const UserScopeModal = ({ isOpen, userId, userName, onClose }: Props) => {
  const { t } = useTranslation();
  const notify = useNotify();
  const queryClient = useQueryClient();

  const [newBranch, setNewBranch] = useState<number | null>(null);
  const [newWarehouse, setNewWarehouse] = useState<number | null>(null);

  // Текущий scope пользователя
  const { data: scopes = [], isLoading } = useQuery<ScopeRow[]>({
    queryKey: ["user-scopes", userId],
    queryFn: () => userScopeApi.getByUser(userId!),
    enabled: isOpen && !!userId,
  });

  // Склады и филиалы для выбора
  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses"],
    queryFn: warehouseApi.getAll,
    enabled: isOpen,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ["branches"],
    queryFn: branchApi.getAll,
    enabled: isOpen,
  });

  const addMutation = useMutation({
    mutationFn: () =>
      userScopeApi.add({
        user: userId!,
        branch: newBranch || null,
        warehouse: newWarehouse || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-scopes", userId] });
      queryClient.invalidateQueries({ queryKey: ["my-scope"] });
      notify("success", t("ScopeAdded"));
      setNewBranch(null);
      setNewWarehouse(null);
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", err.response?.data?.non_field_errors?.[0] || t("Error"));
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => userScopeApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-scopes", userId] });
      queryClient.invalidateQueries({ queryKey: ["my-scope"] });
      notify("success", t("ScopeRemoved"));
    },
    onError: () => notify("error", t("ErrorDeleting")),
  });

  // Склады фильтруем по выбранному филиалу
  // ID складов, уже прикреплённых к пользователю (чтобы не дублировать в списке)
  const attachedWarehouseIds = new Set(scopes.map((s) => s.warehouse).filter((id): id is number => id != null));

  // Склады фильтруем по выбранному филиалу и убираем уже прикреплённые
  const filteredWarehouses = (newBranch ? (warehouses as any[]).filter((w: any) => w.branch === newBranch) : (warehouses as any[])).filter((w: any) => !attachedWarehouseIds.has(w.id));

  const isAddDisabled = addMutation.isPending || !newBranch || !newWarehouse;

  const handleAdd = () => {
    if (!newBranch || !newWarehouse) {
      notify("error", t("SelectBranchOrWarehouse"));
      return;
    }
    addMutation.mutate();
  };

  useEffect(() => {
    setNewBranch(null);
    setNewWarehouse(null);
  }, [userId, isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${t("Access")}: ${userName}`} closeOnOutsideClick={false}>
      <div className="space-y-4">
        {/* Подсказка */}
        <p className="text-xs text-gray-500 dark:text-gray-400">{t("ScopeHint")}</p>

        {/* Текущий scope */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{t("CurrentAccess")}</h4>

          {isLoading ? (
            <p className="text-sm text-gray-400">{t("Loading")}</p>
          ) : scopes.length === 0 ? (
            <p className="text-sm text-green-500">✅ {t("GlobalAccess")}</p>
          ) : (
            <div className="space-y-1">
              {scopes.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/50">
                  <div className="text-sm">
                    {s.branch_name && (
                      <span className="text-indigo-600 dark:text-indigo-400">
                        {t("Branch")}: {s.branch_name}
                      </span>
                    )}
                    {s.branch_name && s.warehouse_name && <span className="text-gray-400 mx-1">|</span>}
                    {s.warehouse_name && (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {t("Warehouse")}: {s.warehouse_name}
                      </span>
                    )}
                  </div>
                  <button onClick={() => removeMutation.mutate(s.id)} className="p-1 text-red-400 hover:text-red-600 transition-colors" title={t("Delete")}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Добавить scope */}
        <div className="pt-3 border-t border-gray-200 dark:border-slate-600">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{t("AddAccess")}</h4>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Select
              label={t("Branch")}
              value={newBranch ?? ""}
              placeholder={t("NotSelected")}
              options={(branches as any[]).map((b: any) => ({
                value: b.id,
                label: b.name,
              }))}
              onChange={(value) => {
                setNewBranch(value ? Number(value) : null);
                setNewWarehouse(null);
              }}
            />
            <Select
              label={t("Warehouse")}
              value={newWarehouse ?? ""}
              placeholder={t("NotSelected")}
              options={filteredWarehouses.map((w: any) => ({
                value: w.id,
                label: w.name,
              }))}
              onChange={(value) => setNewWarehouse(value ? Number(value) : null)}
            />
          </div>
          {/* <Button text={addMutation.isPending ? t("Adding") : t("Add")} icon={<Plus className="w-4 h-4" />} onClick={handleAdd} disabled={addMutation.isPending} variant="danger" /> */}
          <Button text={addMutation.isPending ? t("Adding") : t("Add")} icon={<Plus className="w-4 h-4" />} onClick={handleAdd} disabled={isAddDisabled} />
        </div>

        <div className="flex justify-end pt-2">
          <Button text={t("Close")} onClick={onClose} />
        </div>
      </div>
    </Modal>
  );
};

export default UserScopeModal;
