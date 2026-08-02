// src/features/users/components/pages/admin/Roles/RoleFormPage.tsx
import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
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
import { Loader } from "../../../../../../components/ui/Loader";

type Tab = "Основное" | "Права";
const TABS: Tab[] = ["Основное", "Права"];

// ✅ sync_permissions (backend/users/management/commands/sync_permissions.py) всегда
// создаёт ровно эти 5 действий на каждый resource — матрица всегда прямоугольная,
// поэтому колонки фиксированы и не нужно их вычислять из данных.
const ACTIONS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type PermAction = (typeof ACTIONS)[number];
interface PermEntry {
  id: number;
  action: PermAction;
}

// ── Таб: Матрица прав ────────────────────────────────────────────────────────
// ✅ Компактная таблица (модели — строки, GET/POST/PUT/PATCH/DELETE — колонки) в
// духе диалога "Свойства → Безопасность" в Windows, вместо прежнего "стога карточек"
// с кнопками-пилюлями — тот же набор данных, но без прокрутки на каждый resource
// по отдельности и с реальными чекбоксами. Поиск фильтрует строки по названию
// модели (переведённому и техническому), чекбоксы в шапке колонки массово
// переключают это действие по всем ВИДИМЫМ (отфильтрованным) строкам — так поиск
// и массовое переключение работают согласованно (сузили список — переключили то,
// что видно), а не тихо трогают то, что сейчас скрыто фильтром.

interface PermissionsTabProps {
  matrix: Record<string, PermEntry[]> | undefined;
  matrixLoading: boolean;
  selectedPerms: number[];
  onToggle: (id: number) => void;
  onBulkToggle: (ids: number[], select: boolean) => void;
  onToggleAll: (select: boolean) => void;
}

const PermissionsTab = ({ matrix, matrixLoading, selectedPerms, onToggle, onBulkToggle, onToggleAll }: PermissionsTabProps) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  const resourceEntries = useMemo(() => Object.entries(matrix ?? {}), [matrix]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return resourceEntries;
    return resourceEntries.filter(([resource]) => resource.toLowerCase().includes(q) || t(resource).toLowerCase().includes(q));
  }, [resourceEntries, search, t]);

  if (matrixLoading) return <Loader containerClass="py-10" text={t("LoadingPerms")} progress="indeterminate" />;

  return (
    <div className="space-y-3">
      {/* ── Панель инструментов: поиск + глобальные кнопки ── */}
      <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch("")} placeholder={t("SearchResource")} leftIcon={<Search size={15} />} className="!w-56" />
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {selectedPerms.length} {t("PermissionsSelected")}
        </span>
        <div className="flex-1" />
        <Button size="sm" variant="secondary" text={t("SelectAll")} onClick={() => onToggleAll(true)} />
        <Button size="sm" variant="secondary" text={t("ResetAll")} onClick={() => onToggleAll(false)} />
      </div>

      {/* ── Компактная сетка-таблица, как окно "Разрешения" в Windows ── */}
      <div className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-inner overflow-hidden">
        <div className="max-h-[55vh] overflow-auto">
          <table className="w-full text-xs md:text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-600">
                <th className="text-left px-3 py-2 font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">{t("Resource")}</th>
                {ACTIONS.map((action) => {
                  const colIds = filtered.flatMap(([, actions]) => actions.filter((p) => p.action === action).map((p) => p.id));
                  const allChecked = colIds.length > 0 && colIds.every((id) => selectedPerms.includes(id));
                  return (
                    <th key={action} className="px-2 py-1.5 text-center font-semibold text-slate-600 dark:text-slate-300 border-l border-slate-200 dark:border-slate-700">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[10px] md:text-xs tracking-wide">{t(action)}</span>
                        <span className="text-[9px] text-slate-400 dark:text-slate-500 font-mono">({action})</span>
                        <input
                          type="checkbox"
                          checked={allChecked}
                          onChange={() => onBulkToggle(colIds, !allChecked)}
                          disabled={colIds.length === 0}
                          className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
                          title={`${t(action)} — ${allChecked ? t("DeselectAllResource") : t("SelectAllResource")}`}
                        />
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filtered.map(([resource, actions], idx) => {
                const allSelected = actions.every((p) => selectedPerms.includes(p.id));
                return (
                  <tr
                    key={resource}
                    className={`border-b border-slate-100 dark:border-slate-800 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/20 ${idx % 2 === 1 ? "bg-slate-50/70 dark:bg-slate-800/30" : ""}`}
                  >
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={() => onBulkToggle(actions.map((p) => p.id), !allSelected)}
                          className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer shrink-0"
                          title={allSelected ? t("DeselectAllResource") : t("SelectAllResource")}
                        />
                        <span className="font-medium text-slate-700 dark:text-slate-200">{t(resource)}</span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">({resource})</span>
                      </label>
                    </td>
                    {ACTIONS.map((action) => {
                      const perm = actions.find((p) => p.action === action);
                      if (!perm) return <td key={action} className="text-center text-slate-300 dark:text-slate-700 border-l border-slate-100 dark:border-slate-800">—</td>;
                      const checked = selectedPerms.includes(perm.id);
                      return (
                        <td key={action} className="text-center border-l border-slate-100 dark:border-slate-800">
                          <input type="checkbox" checked={checked} onChange={() => onToggle(perm.id)} className="w-4 h-4 accent-indigo-600 cursor-pointer" />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={ACTIONS.length + 1} className="text-center py-8 text-slate-400 dark:text-slate-500">
                    {t("NotFound")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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

  // ✅ Общий батч-переключатель — используется и для чекбокса строки (все действия
  // одной модели), и для чекбокса в шапке колонки (одно действие по всем видимым
  // моделям после фильтра поиска, см. PermissionsTab).
  const bulkToggle = (ids: number[], select: boolean) => {
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
      <div className="space-y-6">
        {/* Шапка */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BackButton id={roleId ?? 0} getBackProps={getBackProps} className="!px-2" />

            <div>
              <h1 className="text-2xl font-bold">{isEdit ? role?.name : t("NewRole")}</h1>

              <p className="text-sm text-slate-500">
                {selectedPerms.length} {t("PermissionsSelected")}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button text={t("Cancel")} onClick={() => navigate(ROUTES.COMPANY_ADMIN.ROLES)} variant="secondary" />

            <Button text={saveMutation.isPending ? t("Saving") : t("Save")} onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} />
          </div>
        </div>

        <SegmentedControl
          options={TABS.map((s) => ({
            value: s,
            label: s,
          }))}
          value={activeTab}
          onChange={(v) => setActiveTab(v as Tab)}
        />

        {/* Контент */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
          {activeTab === "Основное" && (
            <div className="max-w-xl space-y-6">
              <Input label={t("RoleName")} value={roleName} onChange={(e) => setRoleName(e.target.value)} />
            </div>
          )}

          {activeTab === "Права" && (
            <PermissionsTab matrix={matrix} matrixLoading={matrixLoading} selectedPerms={selectedPerms} onToggle={togglePerm} onBulkToggle={bulkToggle} onToggleAll={toggleAll} />
          )}
        </div>
      </div>
    </RBACGuard>
  );
};

export default RoleFormPage;
