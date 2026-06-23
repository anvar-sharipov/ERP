// src/features/users/components/pages/admin/Roles/RoleFormPage.tsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNotify } from "../../../../../../core/context/NotificationContext";
import { usePageAccess } from "../../../../../../core/hooks/usePageAccess";
import { useSidebar } from "../../../../../../core/context/SidebarRightContext";
import { rolesApi } from "../../../../../accounting/services/rolesApi";
import { api } from "../../../../../../core/api/axiosInstance";
import { ROUTES } from "../../../../../../core/router/routes";
import { Button } from "../../../../../../components/ui/Button";
import { Input } from "../../../../../../components/ui/Input";
import { RBACGuard } from "../../../../../../components/ui/RBACGuard";
import { BackButton } from "../../../../../../components/ui/BackButton";
import { SegmentedControl } from "../../../../../../components/ui/Tabs/SegmentedControl";
import { useRestoreScroll } from "../../../../../../core/hooks/useRestoreScroll";

type Tab = "Основное" | "Права";
const TABS: Tab[] = ["Основное", "Права"];

// ── Таб: Матрица прав ────────────────────────────────────────────────────────

interface PermissionsTabProps {
  matrix: Record<string, any[]> | undefined;
  matrixLoading: boolean;
  selectedPerms: number[];
  onToggle: (id: number) => void;
  onToggleResource: (actions: any[], select: boolean) => void;
  onToggleAll: (select: boolean) => void;
}

const PermissionsTab = ({ matrix, matrixLoading, selectedPerms, onToggle, onToggleResource, onToggleAll }: PermissionsTabProps) => {
  const { t } = useTranslation();

  if (matrixLoading) return <p className="text-sm text-gray-400">{t("LoadingPerms")}</p>;

  return (
    <div className="space-y-3">
      {/* Глобальные кнопки */}
      <div className="flex gap-2 pb-2 border-b dark:border-slate-700">
        <Button text={t("SelectAll")} onClick={() => onToggleAll(true)} />
        <Button text={t("ResetAll")} onClick={() => onToggleAll(false)} />
      </div>

      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
        {Object.entries(matrix || {}).map(([resource, actions]) => {
          const allSelected = actions.every((p: any) => selectedPerms.includes(p.id));
          return (
            <div key={resource} className="border-b border-slate-200 dark:border-slate-700 pb-3">
              <div className="flex items-center gap-3 mb-2">
                <Button variant="1c" size="sm" text={allSelected ? t("DeselectAllResource") : t("SelectAllResource")} onClick={() => onToggleResource(actions, !allSelected)} />
                <h4 className="font-bold capitalize text-indigo-400 text-sm">
                  {t(resource)} <span className="text-xs font-normal text-gray-400">({resource})</span>
                </h4>
              </div>
              <div className="flex flex-wrap gap-4">
                {actions.map((perm: any) => (
                  <label key={perm.id} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input type="checkbox" checked={selectedPerms.includes(perm.id)} onChange={() => onToggle(perm.id)} className="w-4 h-4 rounded border-gray-300 text-indigo-600" />
                    <span>{t(perm.action)}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Главный компонент ─────────────────────────────────────────────────────────

const RoleFormPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const notify = useNotify();
  const qc = useQueryClient();
  const { setSidebarContent } = useSidebar();
  const { canPost, canPut } = usePageAccess("role");
  const { getBackProps } = useRestoreScroll("selectedRoleId", () => {});

  const isEdit = !!id;
  const roleId = id ? Number(id) : null;

  const [activeTab, setActiveTab] = useState<Tab>("Основное");
  const [roleName, setRoleName] = useState("");
  const [selectedPerms, setSelectedPerms] = useState<number[]>([]);

  // ── Запросы ──────────────────────────────────────────────────────────────────

  const { data: matrix, isLoading: matrixLoading } = useQuery({
    queryKey: ["permissionsMatrix"],
    queryFn: rolesApi.getPermissionsMatrix,
  });

  const {
    data: role,
    isLoading: roleLoading,
    error: roleError,
  } = useQuery({
    queryKey: ["role", roleId],
    queryFn: () => api.get(`/users/roles/${roleId}/`).then((r) => r.data),
    enabled: isEdit,
  });

  // Заполняем форму при загрузке роли
  useEffect(() => {
    if (role) {
      setRoleName(role.name ?? "");
      setSelectedPerms(role.current_permissions ?? []);
    }
  }, [role]);

  // ── Сайдбар ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <div>
          <h4 className="font-bold text-indigo-300 mb-2 text-xs uppercase tracking-wider">Информация</h4>
          {isEdit && role && (
            <div className="text-xs text-indigo-200 space-y-1">
              <div>
                ID: <span className="font-mono">{role.id}</span>
              </div>
              <div>
                Название: <span className="font-medium">{role.name}</span>
              </div>
              <div>
                Прав выбрано: <span className="font-medium text-indigo-400">{selectedPerms.length}</span>
              </div>
            </div>
          )}
        </div>
      </div>,
    );
  }, [setSidebarContent, isEdit, role, selectedPerms.length]);

  // ── Мутация сохранения ───────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: () => rolesApi.saveRole(roleId, { name: roleName, permissions: selectedPerms }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      qc.invalidateQueries({ queryKey: ["role", roleId] });
      notify("success", isEdit ? t("SuccessUpdated") : t("SuccessCreated"));
      if (!isEdit) {
        navigate(ROUTES.COMPANY_ADMIN.ROLES_EDIT.replace(":id", String(res.data.id)));
      }
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", err?.response?.data?.detail ?? t("ErrorSaving"));
    },
  });

  // ── Хелперы прав ─────────────────────────────────────────────────────────────

  const togglePerm = (id: number) => setSelectedPerms((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

  const toggleResource = (actions: any[], select: boolean) => {
    const ids = actions.map((p: any) => p.id);
    setSelectedPerms((prev) => (select ? Array.from(new Set([...prev, ...ids])) : prev.filter((id) => !ids.includes(id))));
  };

  const toggleAll = (select: boolean) => {
    if (!select) {
      setSelectedPerms([]);
      return;
    }
    const allIds = Object.values(matrix || {})
      .flat()
      .map((p: any) => p.id);
    setSelectedPerms(allIds);
  };

  // ── Рендер ───────────────────────────────────────────────────────────────────

  return (
    <RBACGuard isLoading={isEdit ? roleLoading : false} error={isEdit ? roleError : null} canView={isEdit ? canPut : canPost} forbiddenText={t("ForbiddenText")}>
      {/* Шапка */}
      <div className="flex items-center gap-3 mb-4">
        <BackButton id={roleId ?? 0} getBackProps={getBackProps} className="!px-2" />
        <h1 className="text-xl font-bold">{isEdit ? `Роль: ${role?.name ?? "..."}` : "Новая роль"}</h1>
      </div>

      {/* Табы */}
      <SegmentedControl options={TABS.map((s) => ({ value: s, label: s }))} value={activeTab} onChange={(v) => setActiveTab(v as Tab)} />

      <div className="mt-4 max-w-3xl">
        {/* Таб: Основное */}
        {activeTab === "Основное" && (
          <div className="space-y-4">
            <Input label={t("RoleName")} value={roleName} onChange={(e) => setRoleName(e.target.value)} />
            <div className="flex gap-2 mt-4">
              <Button text={saveMutation.isPending ? t("Saving") : isEdit ? t("Save") : t("Create")} onClick={() => saveMutation.mutate()} disabled={!roleName.trim() || saveMutation.isPending} variant="danger" />
              <Button text={t("Cancel")} variant="ghost" onClick={() => navigate(ROUTES.COMPANY_ADMIN.ROLES)} />
            </div>
          </div>
        )}

        {/* Таб: Права */}
        {activeTab === "Права" && (
          <div className="space-y-4">
            <PermissionsTab matrix={matrix} matrixLoading={matrixLoading} selectedPerms={selectedPerms} onToggle={togglePerm} onToggleResource={toggleResource} onToggleAll={toggleAll} />
            <div className="flex gap-2 pt-2">
              <Button text={saveMutation.isPending ? t("Saving") : t("Save")} onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} variant="danger" />
              <Button text={t("Cancel")} variant="ghost" onClick={() => navigate(ROUTES.COMPANY_ADMIN.ROLES)} />
            </div>
          </div>
        )}
      </div>
    </RBACGuard>
  );
};

export default RoleFormPage;
