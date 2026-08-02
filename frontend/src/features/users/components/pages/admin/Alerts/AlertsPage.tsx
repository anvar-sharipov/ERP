// frontend/src/features/users/components/pages/admin/Alerts/AlertsPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { alertApi, type SystemAlert } from "../../../../../accounting/services/alertApi";
import { usePageAccess } from "../../../../../../core/hooks/usePageAccess";
import { useSidebar } from "../../../../../../core/context/SidebarRightContext";
import { RBACGuard } from "../../../../../../components/ui/RBACGuard";
import { PageHeaderText } from "../../../../../../components/ui/Tabs/PageHeaderText";
import { HelpButton } from "../../../../../../components/ui/HelpButton";
import { Button } from "../../../../../../components/ui/Button";
import { Modal } from "../../../../../../components/ui/Modal/Modal";
import { Table, type Column } from "../../../../../../components/ui/Table/Table";
import { useNotify } from "../../../../../../core/context/NotificationContext";

type LevelFilter = "all" | "warning" | "critical";
type TypeFilter = "all" | "snapshot_mismatch" | "low_stock";

// ✅ Форма одного элемента extra_data.mismatches у SNAPSHOT_MISMATCH — см.
// accounting/tasks.py::_check_warehouse_snapshots.
interface SnapshotMismatch {
  product_id: number;
  product_name: string;
  fresh_qty: string;
  stored_qty: string;
  fresh_value: string;
  stored_value: string;
}

// ✅ Страница полной истории SystemAlert (см. accounting/tasks.py::run_daily_checks) —
// колокольчик в хедере (AlertBell.tsx) намеренно показывает только непогашенные
// критические алерты, здесь — вся история любого уровня/типа, с деталями из
// extra_data и ручным "отметить решённым". Без scope (см. SystemAlertViewSet —
// алерты не привязаны к branch/warehouse полем, это сводка для роли с правом
// systemalert, а не то, что режется по scope конкретного пользователя), поэтому
// WorkDateWidget (branch/warehouse/период) здесь сознательно не подключаем.
export default function AlertsPage() {
  const { t } = useTranslation();
  const { canView } = usePageAccess("systemalert");
  const { setSidebarContent } = useSidebar();
  const queryClient = useQueryClient();
  const notify = useNotify();

  const [unresolvedOnly, setUnresolvedOnly] = useState(true);
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [detailAlert, setDetailAlert] = useState<SystemAlert | null>(null);

  const { data: alerts = [], isLoading, error } = useQuery({
    queryKey: ["system-alerts-full", unresolvedOnly, levelFilter],
    queryFn: () => alertApi.getAll(unresolvedOnly, levelFilter === "all" ? undefined : levelFilter),
    enabled: canView,
  });

  const resolveMutation = useMutation({
    mutationFn: (id: number) => alertApi.resolve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-alerts-full"] });
      queryClient.invalidateQueries({ queryKey: ["system-alerts-count"] });
      queryClient.invalidateQueries({ queryKey: ["system-alerts-list"] });
      notify("success", t("SuccessUpdated"));
    },
    onError: () => notify("error", t("Error")),
  });

  const filteredAlerts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return alerts.filter((a) => {
      if (typeFilter !== "all" && a.type !== typeFilter) return false;
      if (!q) return true;
      return a.title.toLowerCase().includes(q) || a.message.toLowerCase().includes(q);
    });
  }, [alerts, typeFilter, searchQuery]);

  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <div>
          <h4 className="font-bold text-indigo-300 mb-2">{t("AlertLevelFilter")}</h4>
          <div className="flex flex-col gap-1">
            <Button text={t("All")} variant="ghost" dark isActive={levelFilter === "all"} className="w-full justify-start" onClick={() => setLevelFilter("all")} />
            <Button text={t("AlertLevelCritical")} variant="ghost" dark isActive={levelFilter === "critical"} className="w-full justify-start" onClick={() => setLevelFilter("critical")} />
            <Button text={t("AlertLevelWarning")} variant="ghost" dark isActive={levelFilter === "warning"} className="w-full justify-start" onClick={() => setLevelFilter("warning")} />
          </div>
        </div>

        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2">{t("AlertTypeFilter")}</h4>
          <div className="flex flex-col gap-1">
            <Button text={t("All")} variant="ghost" dark isActive={typeFilter === "all"} className="w-full justify-start" onClick={() => setTypeFilter("all")} />
            <Button text={t("AlertTypeSnapshotMismatch")} variant="ghost" dark isActive={typeFilter === "snapshot_mismatch"} className="w-full justify-start" onClick={() => setTypeFilter("snapshot_mismatch")} />
            <Button text={t("AlertTypeLowStock")} variant="ghost" dark isActive={typeFilter === "low_stock"} className="w-full justify-start" onClick={() => setTypeFilter("low_stock")} />
          </div>
        </div>

        <div className="pt-4 border-t border-indigo-900/30">
          <label className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
            <input type="checkbox" checked={unresolvedOnly} onChange={(e) => setUnresolvedOnly(e.target.checked)} />
            {t("AlertUnresolvedOnly")}
          </label>
        </div>
      </div>,
    );
  }, [setSidebarContent, levelFilter, typeFilter, unresolvedOnly, t]);

  const columns: Column<SystemAlert>[] = [
    {
      header: t("Level"),
      accessor: "level_display",
      render: (a) => (
        <span className="inline-flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${a.level === "critical" ? "bg-red-500" : "bg-yellow-500"}`} />
          {a.level_display}
        </span>
      ),
    },
    { header: t("AlertType"), accessor: "type_display" },
    { header: t("AlertTitle"), accessor: "title" },
    { header: t("Message"), accessor: "message" },
    {
      header: t("Time"),
      accessor: "created_at",
      render: (a) => new Date(a.created_at).toLocaleString("ru-RU"),
    },
    {
      header: t("Status"),
      accessor: "is_resolved",
      render: (a) => (a.is_resolved ? `${t("AlertResolved")} (${a.resolved_at ? new Date(a.resolved_at).toLocaleString("ru-RU") : "—"})` : t("AlertActive")),
    },
    {
      header: t("Actions"),
      isActionColumn: true,
      render: (a) => (
        <div className="flex items-center gap-2">
          {!!(a.extra_data && Object.keys(a.extra_data).length > 0) && (
            <Button text={t("Details")} variant="ghost" onClick={() => setDetailAlert(a)} />
          )}
          {!a.is_resolved && (
            <Button
              text={t("Dismiss")}
              variant="secondary"
              disabled={resolveMutation.isPending}
              onClick={() => resolveMutation.mutate(a.id)}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText={t("ForbiddenText")} loadingText={t("LoadingAlerts")} loadingProgress="indeterminate">
      <PageHeaderText
        title={t("SystemAlerts")}
        actions={
          <HelpButton title={t("SystemAlerts")}>
            <p>
              Эта страница показывает <b>всю историю системных алертов</b> — критических и предупреждающих сигналов, которые
              заводит ежедневная фоновая проверка (расхождение снапшота остатков с проводками, остаток товара ниже минимального).
            </p>
            <ul>
              <li>
                <b>Колокольчик в хедере</b> показывает только непогашенные критические алерты — здесь видна вся история,
                включая уже решённые и предупреждения (например «Мало товара»).
              </li>
              <li>
                <b>«Подробнее»</b> — открывает детали алерта (например список конкретных товаров с расхождением снапшота).
              </li>
              <li>
                <b>«Отклонить»</b> — вручную помечает алерт решённым. Если условие всё ещё актуально, следующая ежедневная
                проверка заведёт его заново.
              </li>
              <li>Фильтры по уровню, типу и «только активные» — в правой панели.</li>
            </ul>
          </HelpButton>
        }
      />

      <Table
        columns={columns}
        data={filteredAlerts}
        tableId="system_alerts"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <Modal isOpen={!!detailAlert} onClose={() => setDetailAlert(null)} title={detailAlert?.title} size="lg">
        {detailAlert?.type === "snapshot_mismatch" && Array.isArray(detailAlert.extra_data?.mismatches) ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs md:text-sm">
              <thead>
                <tr className="text-left border-b border-gray-300 dark:border-slate-600">
                  <th className="py-1 pr-2">{t("Product")}</th>
                  <th className="py-1 pr-2">{t("AlertQtyFreshVsStored")}</th>
                  <th className="py-1 pr-2">{t("AlertValueFreshVsStored")}</th>
                </tr>
              </thead>
              <tbody>
                {(detailAlert.extra_data.mismatches as SnapshotMismatch[]).map((m, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-slate-700/50">
                    <td className="py-1 pr-2">{m.product_name || `#${m.product_id}`}</td>
                    <td className="py-1 pr-2">
                      {m.fresh_qty} <span className="text-gray-400">({t("Was")}: {m.stored_qty})</span>
                    </td>
                    <td className="py-1 pr-2">
                      {m.fresh_value} <span className="text-gray-400">({t("Was")}: {m.stored_value})</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify(detailAlert?.extra_data, null, 2)}</pre>
        )}
      </Modal>
    </RBACGuard>
  );
}
