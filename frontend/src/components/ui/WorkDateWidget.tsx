// src/components/ui/WorkDateWidget.tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { closedPeriodApi, userScopeApi } from "../../features/accounting/services/transactionApi";
import { useDateStore } from "../../core/store/dateStore";
import { useClosedPeriod } from "../../core/hooks/useClosedPeriod";
import { usePageAccess } from "../../core/hooks/usePageAccess";
import { RBACGuard } from "./RBACGuard";

export default function WorkDateWidget() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { canView, canPost, canPut } = usePageAccess("closedperiod");

  const { workDate, periodFrom, periodTo, workBranch, workWarehouse, setWorkDate, setPeriodFrom, setPeriodTo, setWorkBranch, setWorkWarehouse, setCurrentMonth, setCurrentYear, setCurrentDay } =
    useDateStore();

  // Scope пользователя
  const { data: scope } = useQuery({
    queryKey: ["my-scope"],
    queryFn: () => userScopeApi.getMyScope().then((r) => r.data),
    staleTime: 60_000,
  });

  const { isClosed, isLoading } = useClosedPeriod({
    branch: workBranch?.id,
    warehouse: workWarehouse?.id,
  });

  const closeMutation = useMutation({
    mutationFn: () =>
      closedPeriodApi.close(workDate, {
        branch: workBranch?.id,
        warehouse: workWarehouse?.id,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["closed-period-check"] }),
  });

  // Склады фильтруем по выбранному филиалу
  const filteredWarehouses = workBranch ? (scope?.warehouses ?? []).filter((w: any) => w.branch === workBranch.id) : (scope?.warehouses ?? []);

  const hasBranches = (scope?.branches?.length ?? 0) > 0;
  const hasWarehouses = (scope?.warehouses?.length ?? 0) > 0;

  const inputCls = `
    w-full px-2 py-1.5 rounded-lg border
    bg-slate-900 text-indigo-100
    border-indigo-900/50 focus:border-indigo-500/50 focus:outline-none
  `;

  const selectCls = `
    w-full px-2 py-1.5 rounded-lg border text-sm
    bg-slate-900 text-indigo-100
    border-indigo-900/50 focus:border-indigo-500/50 focus:outline-none
  `;

  return (
    <RBACGuard isLoading={isLoading} canView={canView} forbiddenText={t("NoViewRights")}>
      <div className="space-y-4">
        {/* Рабочая дата */}
        <div className="space-y-2">
          <h4 className="font-bold text-indigo-300 uppercase tracking-wider">{t("WorkDate")}</h4>
          <input tabIndex={0} type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} className={inputCls} disabled={!canPost || !canPut} />

          {/* Филиал */}
          {hasBranches && (
            <select
              value={workBranch?.id ?? ""}
              onChange={(e) => {
                if (!e.target.value) {
                  setWorkBranch(null);
                  return;
                }
                const b = scope?.branches.find((b) => b.id === Number(e.target.value));
                if (b) setWorkBranch({ id: b.id, name: b.name });
              }}
              className={selectCls}
              disabled={!canPost || !canPut}
            >
              <option value="">{scope?.is_global ? "— Все филиалы —" : "— Филиал —"}</option>
              {scope?.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}

          {/* Склад */}
          {hasWarehouses && (
            <select
              value={workWarehouse?.id ?? ""}
              onChange={(e) => {
                if (!e.target.value) {
                  setWorkWarehouse(null);
                  return;
                }
                const w = scope?.warehouses.find((w) => w.id === Number(e.target.value));
                if (w) setWorkWarehouse({ id: w.id, name: (w as any).name });
              }}
              className={selectCls}
              disabled={!canPost || !canPut}
            >
              <option value="">{scope?.is_global ? "— Все склады —" : "— Склад —"}</option>
              {filteredWarehouses.map((w: any) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}

          {/* Статус дня */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isLoading ? (
                <span className="text-indigo-400/60">...</span>
              ) : isClosed ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-red-400 font-medium">{t("DayClosed")}</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-green-400 font-medium">{t("DayOpen")}</span>
                </>
              )}
            </div>
            {/* Проверка прав: если нет прав, показываем сообщение, иначе кнопку */}
            {!isClosed &&
              (!canPost || !canPut ? (
                <div className="text-xs text-yellow-500 bg-yellow-900/20 px-2 py-0.5 rounded">{t("NoPermissionToModify")}</div>
              ) : (
                <button
                  tabIndex={0}
                  onClick={() => closeMutation.mutate()}
                  disabled={closeMutation.isPending}
                  className="px-2 py-0.5 rounded bg-red-900/40 text-red-400 hover:bg-red-900/60 transition"
                >
                  {t("Close")}
                </button>
              ))}
          </div>
        </div>

        <div className="border-t border-indigo-900/30" />

        {/* Период отчётов */}
        <div className="space-y-2">
          <h4 className="font-bold text-indigo-300 uppercase tracking-wider">{t("ReportPeriod")}</h4>
          <div className="space-y-1.5">
            <div>
              <label className="text-indigo-400/70 ml-1">{t("From")}</label>
              <input tabIndex={0} type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-indigo-400/70 ml-1">{t("To")}</label>
              <input tabIndex={0} type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="flex flex-wrap gap-1 pt-1">
            {[
              { label: t("Today"), fn: setCurrentDay },
              { label: t("Month"), fn: setCurrentMonth },
              { label: t("Year"), fn: setCurrentYear },
            ].map(({ label, fn }) => (
              <button tabIndex={0} key={label} onClick={fn} className="px-2 py-0.5 rounded bg-indigo-900/40 text-indigo-300 hover:bg-indigo-900/70 transition">
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </RBACGuard>
  );
}
