// frontend/src/components/ui/WorkDateWidget.tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { closedPeriodApi, userScopeApi } from "../../features/accounting/services/transactionApi";
import { useDateStore } from "../../core/store/dateStore";
import { useClosedPeriod, useBranchWarehousesClosed } from "../../core/hooks/useClosedPeriod";
import { usePageAccess } from "../../core/hooks/usePageAccess";
import { RBACGuard } from "./RBACGuard";
import { ConfirmModal } from "./Modal/ConfirmModal";
import { useShallow } from "zustand/react/shallow";
import { useMemo } from "react";
import { formatDateDisplay } from "../../core/utils/formatDate";

export default function WorkDateWidget() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { canView, canPost, canPut } = usePageAccess("closedperiod");
  const [confirmOpen, setConfirmOpen] = useState<"close" | "reopen" | null>(null);

  const { workDate, periodFrom, periodTo, workBranch, workWarehouse, setWorkDate, setPeriodFrom, setPeriodTo, setWorkBranch, setWorkWarehouse, setCurrentMonth, setCurrentYear, setCurrentDay } =
    useDateStore(
      useShallow((s) => ({
        workDate: s.workDate,
        periodFrom: s.periodFrom,
        periodTo: s.periodTo,
        workBranch: s.workBranch,
        workWarehouse: s.workWarehouse,
        setWorkDate: s.setWorkDate,
        setPeriodFrom: s.setPeriodFrom,
        setPeriodTo: s.setPeriodTo,
        setWorkBranch: s.setWorkBranch,
        setWorkWarehouse: s.setWorkWarehouse,
        setCurrentMonth: s.setCurrentMonth,
        setCurrentYear: s.setCurrentYear,
        setCurrentDay: s.setCurrentDay,
      })),
    );

  const { data: scope } = useQuery({
    queryKey: ["my-scope"],
    queryFn: () => userScopeApi.getMyScope().then((r) => r.data),
    staleTime: 60_000,
  });

  const filteredWarehouses = workBranch ? (scope?.warehouses ?? []).filter((w: any) => w.branch === workBranch.id) : [];

  // Сброс склада, если он больше не относится к выбранному филиалу / филиал сброшен
  // useMemo(() => {
  //   if (!workBranch && workWarehouse) {
  //     setWorkWarehouse(null);
  //     return;
  //   }
  //   if (workBranch && workWarehouse) {
  //     const stillValid = filteredWarehouses.some((w: any) => w.id === workWarehouse.id);
  //     if (!stillValid) setWorkWarehouse(null);
  //   }
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, [workBranch]);
  
  useEffect(() => {
    if (!scope) return; // scope ещё не загрузился — ничего не трогаем

    if (!workBranch) {
      if (workWarehouse) setWorkWarehouse(null);
      return;
    }

    const stillValid = filteredWarehouses.some((w: any) => w.id === workWarehouse?.id);
    if (workWarehouse && !stillValid) {
      setWorkWarehouse(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workBranch?.id, scope]);

  const hasBranches = (scope?.branches?.length ?? 0) > 0;
  const hasWarehouses = (scope?.warehouses?.length ?? 0) > 0;

  // Может ли пользователь переоткрывать день (без warehouse-scope)
  const canReopen = !!scope?.is_global;

  // const { isClosed, isLoading } = useClosedPeriod(workWarehouse?.id);
  const { isClosed, isLoading, closedPeriodId } = useClosedPeriod(workWarehouse?.id);

  const branchWarehouseIds = filteredWarehouses.map((w: any) => w.id);
  const { allClosed: branchFullyClosed, isLoading: branchCheckLoading } = useBranchWarehousesClosed(!workWarehouse ? branchWarehouseIds : []);

  const closeMutation = useMutation({
    mutationFn: () => closedPeriodApi.close(workDate, workWarehouse!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["closed-period-check"] });
      qc.invalidateQueries({ queryKey: ["closed-period-branch-check"] });
      setConfirmOpen(null);
    },
  });

  // Нужен id текущей закрытой записи для reopen — тянем check без флага, отдельно
  const { data: closedRecord } = useQuery({
    queryKey: ["closed-period-record", workDate, workWarehouse?.id],
    queryFn: () => closedPeriodApi.checkWarehouses(workDate, [workWarehouse!.id]).then((r) => r.data[0] ?? null),
    enabled: !!workDate && !!workWarehouse && isClosed,
  });

  const reopenMutation = useMutation({
    // mutationFn: () => closedPeriodApi.reopen(closedRecord!.id),
    mutationFn: () => closedPeriodApi.reopen(closedPeriodId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["closed-period-check"] });
      qc.invalidateQueries({ queryKey: ["closed-period-branch-check"] });
      setConfirmOpen(null);
    },
    onError: (err: any) => {
      // сюда придёт detail из backend (например "есть закрытый день позже")
      setConfirmOpen(null);
      alert(err.response?.data?.detail || t("Error"));
    },
  });

  const inputCls = `w-full px-2 py-1.5 rounded-lg border bg-slate-900 text-indigo-100 border-indigo-900/50 focus:border-indigo-500/50 focus:outline-none`;
  const selectCls = `w-full px-2 py-1.5 rounded-lg border text-sm bg-slate-900 text-indigo-100 border-indigo-900/50 focus:border-indigo-500/50 focus:outline-none`;

  return (
    <RBACGuard isLoading={isLoading} canView={canView} forbiddenText={t("NoViewRights")}>
      <div className="space-y-4">
        <div className="space-y-2">
          <h4 className="font-bold text-indigo-300 uppercase tracking-wider">{t("WorkDate")}</h4>
          <input tabIndex={0} type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} className={inputCls} disabled={!canPost || !canPut} />

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
              <option value="">{scope?.is_global ? t("AllBranchesWithDash") : t("BranchWithDash")}</option>
              {scope?.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}

          {hasWarehouses && (
            <select
              value={workWarehouse?.id ?? ""}
              onChange={(e) => {
                if (!e.target.value) {
                  setWorkWarehouse(null);
                  return;
                }
                const w = filteredWarehouses.find((w: any) => w.id === Number(e.target.value));
                if (w) setWorkWarehouse({ id: w.id, name: (w as any).name });
              }}
              className={selectCls}
              disabled={!canPost || !canPut || !workBranch}
            >
              <option value="">{workBranch ? t("WarehouseWithDash") : t("SelectBranchFirstWithDash")}</option>
              {filteredWarehouses.map((w: any) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}

          {/* Статус дня — три состояния */}
          {!workBranch && !workWarehouse ? null : !workWarehouse ? (
            // выбран только филиал — инфо без кнопки
            !branchCheckLoading &&
            branchWarehouseIds.length > 0 && (
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${branchFullyClosed ? "bg-red-500" : "bg-green-500"}`} />
                <span className={branchFullyClosed ? "text-red-400 font-medium" : "text-indigo-400/60"}>{branchFullyClosed ? t("BranchClosed") : t("BranchPartlyOpen")}</span>
              </div>
            )
          ) : (
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

              {!isLoading &&
                !isClosed &&
                (!canPost || !canPut ? (
                  <div className="text-xs text-yellow-500 bg-yellow-900/20 px-2 py-0.5 rounded">{t("NoPermissionToModify")}</div>
                ) : (
                  <button tabIndex={0} onClick={() => setConfirmOpen("close")} className="px-2 py-0.5 rounded bg-red-900/40 text-red-400 hover:bg-red-900/60 transition">
                    {t("Close")}
                  </button>
                ))}

              {!isLoading && isClosed && canReopen && (
                <button tabIndex={0} onClick={() => setConfirmOpen("reopen")} className="px-2 py-0.5 rounded bg-green-900/40 text-green-400 hover:bg-green-900/60 transition">
                  {t("Reopen")}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-indigo-900/30" />

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

      <ConfirmModal
        isOpen={confirmOpen === "close"}
        type="warning"
        title={t("CloseDayTitle")}
        message={t("CloseDayMessage", { date: formatDateDisplay(workDate), warehouse: workWarehouse?.name })}
        confirmText={t("Close")}
        loading={closeMutation.isPending}
        onClose={() => setConfirmOpen(null)}
        onConfirm={() => closeMutation.mutate()}
      />

      <ConfirmModal
        isOpen={confirmOpen === "reopen"}
        type="warning"
        title={t("ReopenDayTitle")}
        message={t("ReopenDayMessage", { date: formatDateDisplay(workDate), warehouse: workWarehouse?.name })}
        confirmText={t("Reopen")}
        loading={reopenMutation.isPending}
        onClose={() => setConfirmOpen(null)}
        onConfirm={() => reopenMutation.mutate()}
      />
    </RBACGuard>
  );
}
