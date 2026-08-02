// frontend/src/components/ui/AlertBell.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { alertApi } from "../../features/accounting/services/alertApi";
import { usePageAccess } from "../../core/hooks/usePageAccess";
import { useNotify } from "../../core/context/NotificationContext";

// ✅ Колокольчик системных алертов (см. accounting/tasks.py::run_daily_checks —
// расхождение снапшота с проводками, остаток товара ниже минимального). Без
// WebSocket-инфраструктуры под это (как и AuditLogPage.tsx) — просто поллинг,
// алертов мало и не критично увидеть их с задержкой в минуту, а не мгновенно.
// ✅ Показываем только level=critical (сейчас это только расхождение снапшота
// с проводками) — "Мало товара" (warning) сюда сознательно не попадает, это
// отдельная эксплуатационная сигнализация про дозаказ, не про целостность
// данных; см. обсуждение в CLAUDE.md.
export const AlertBell = () => {
  const { t } = useTranslation();
  const { canView } = usePageAccess("systemalert");
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const notify = useNotify();

  const { data: count = 0 } = useQuery({
    queryKey: ["system-alerts-count"],
    queryFn: () => alertApi.getUnresolvedCount("critical"),
    enabled: canView,
    refetchInterval: 60_000,
  });

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["system-alerts-list"],
    queryFn: () => alertApi.getAll(true, "critical"),
    enabled: canView && open,
  });

  const resolveMutation = useMutation({
    mutationFn: (id: number) => alertApi.resolve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-alerts-count"] });
      queryClient.invalidateQueries({ queryKey: ["system-alerts-list"] });
    },
  });

  // ✅ Только для тестирования — синхронная проверка по клику, минуя обычное
  // расписание Celery Beat (раз в 24 часа, см. bootstrap_daily_checks_schedule) —
  // не заменяет его, просто чтобы не ждать при ручной проверке.
  const checkNowMutation = useMutation({
    mutationFn: alertApi.checkNow,
    onSuccess: (newCount) => {
      queryClient.invalidateQueries({ queryKey: ["system-alerts-count"] });
      queryClient.invalidateQueries({ queryKey: ["system-alerts-list"] });
      notify("success", t("AlertsCheckDone", { count: newCount }));
    },
    onError: () => notify("error", t("Error")),
  });

  if (!canView) return null;

  return (
    <div className="relative flex items-center gap-1">
      <button
        onClick={() => checkNowMutation.mutate()}
        disabled={checkNowMutation.isPending}
        className="p-2 text-gray-400 hover:text-white transition-colors rounded hover:bg-slate-700 disabled:opacity-50"
        title={t("CheckAlertsNowTest")}
      >
        <RefreshCw className={`w-4 h-4 ${checkNowMutation.isPending ? "animate-spin" : ""}`} />
      </button>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 text-gray-400 hover:text-white transition-colors rounded hover:bg-slate-700"
        title={t("SystemAlerts")}
      >
        <Bell className="w-5 h-5" />
        <AnimatePresence>
          {count > 0 && (
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 25 }}
              className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center bg-red-500 shadow-lg"
            >
              {count > 99 ? "99+" : count}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {open && (
        <>
          {/* ✅ Клик мимо — закрыть панель, тот же приём, что и у выпадающих
              списков в проекте (SearchableSelect и т.п.). */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* ✅ Без top-full панель не имела вертикального якоря вообще (только
              mt-2) — absolute-элемент без top/bottom вычисляет "статическую"
              позицию, которая здесь совпадала примерно с верхом маленькой
              relative-обёртки кнопок, а не с низом хедера, из-за чего список
              рендерился слишком высоко и вылезал за пределы вьюпорта. */}
          <div className="absolute top-full right-0 mt-2 w-96 max-h-[28rem] overflow-y-auto rounded-lg shadow-xl border border-slate-700 bg-slate-800 z-50">
            <div className="px-4 py-2 border-b border-slate-700 font-bold text-sm text-white sticky top-0 bg-slate-800">{t("SystemAlerts")}</div>
            {isLoading ? (
              <div className="p-4 text-sm text-gray-400">{t("Loading")}</div>
            ) : alerts.length === 0 ? (
              <div className="p-4 text-sm text-gray-400">{t("NoAlerts")}</div>
            ) : (
              alerts.map((a) => (
                <div key={a.id} className="px-4 py-3 border-b border-slate-700/50 flex items-start gap-2">
                  <span className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${a.level === "critical" ? "bg-red-500" : "bg-yellow-500"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white">{a.title}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{a.message}</div>
                  </div>
                  <button
                    disabled={resolveMutation.isPending}
                    onClick={() => resolveMutation.mutate(a.id)}
                    className="shrink-0 text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-gray-300 disabled:opacity-50"
                  >
                    {t("Dismiss")}
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};
