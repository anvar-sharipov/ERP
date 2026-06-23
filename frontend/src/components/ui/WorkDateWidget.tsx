// // src/components/ui/WorkDateWidget.tsx
// src/components/ui/WorkDateWidget.tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { closedPeriodApi } from "../../features/accounting/services/transactionApi";
import { useDateStore } from "../../core/store/dateStore";
import { useClosedPeriod } from "../../core/hooks/useClosedPeriod";

export default function WorkDateWidget() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { workDate, periodFrom, periodTo, setWorkDate, setPeriodFrom, setPeriodTo, setCurrentMonth, setCurrentYear, setCurrentDay } = useDateStore();

  const { isClosed, isLoading } = useClosedPeriod();

  const closeMutation = useMutation({
    mutationFn: () => closedPeriodApi.close(workDate),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["closed-period-check"] }),
  });

  const openMutation = useMutation({
    mutationFn: () => closedPeriodApi.open(workDate),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["closed-period-check"] }),
  });

  const inputCls = `
    w-full px-2 py-1.5 rounded-lg border
    bg-slate-900 text-indigo-100
    border-indigo-900/50 focus:border-indigo-500/50 focus:outline-none
  `;

  return (
    <div className="space-y-4">
      {/* Рабочая дата */}
      <div className="space-y-2">
        <h4 className="font-bold text-indigo-300 uppercase tracking-wider">{t("WorkDate")}</h4>
        <input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} className={inputCls} />

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
          {isClosed ? (
            <button onClick={() => openMutation.mutate()} disabled={openMutation.isPending} className="px-2 py-0.5 rounded bg-yellow-900/40 text-yellow-400 hover:bg-yellow-900/60 transition">
              {t("Open")}
            </button>
          ) : (
            <button onClick={() => closeMutation.mutate()} disabled={closeMutation.isPending} className="px-2 py-0.5 rounded bg-red-900/40 text-red-400 hover:bg-red-900/60 transition">
              {t("Close")}
            </button>
          )}
        </div>
      </div>

      <div className="border-t border-indigo-900/30" />

      {/* Период отчётов */}
      <div className="space-y-2">
        <h4 className="font-bold text-indigo-300 uppercase tracking-wider">{t("ReportPeriod")}</h4>
        <div className="space-y-1.5">
          <div>
            <label className="text-indigo-400/70 ml-1">{t("From")}</label>
            <input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-indigo-400/70 ml-1">{t("To")}</label>
            <input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="flex flex-wrap gap-1 pt-1">
          {[
            { label: t("Today"), fn: setCurrentDay },
            { label: t("Month"), fn: setCurrentMonth },
            { label: t("Year"), fn: setCurrentYear },
          ].map(({ label, fn }) => (
            <button key={label} onClick={fn} className="px-2 py-0.5 rounded bg-indigo-900/40 text-indigo-300 hover:bg-indigo-900/70 transition">
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// import { useMutation, useQueryClient } from "@tanstack/react-query";
// import { closedPeriodApi } from "../../features/accounting/services/transactionApi";
// import { useDateStore } from "../../core/store/dateStore";
// import { useClosedPeriod } from "../../core/hooks/useClosedPeriod";

// export default function WorkDateWidget() {
//   const qc = useQueryClient();

//   const { workDate, periodFrom, periodTo, setWorkDate, setPeriodFrom, setPeriodTo, setCurrentMonth, setCurrentYear, setCurrentDay } = useDateStore();

//   const { isClosed, isLoading } = useClosedPeriod();

//   const closeMutation = useMutation({
//     mutationFn: () => closedPeriodApi.close(workDate),
//     onSuccess: () => qc.invalidateQueries({ queryKey: ["closed-period-check"] }),
//   });

//   const openMutation = useMutation({
//     mutationFn: () => closedPeriodApi.open(workDate),
//     onSuccess: () => qc.invalidateQueries({ queryKey: ["closed-period-check"] }),
//   });

//   const inputCls = `
//     w-full px-2 py-1.5 rounded-lg border
//     bg-slate-900 text-indigo-100
//     border-indigo-900/50 focus:border-indigo-500/50 focus:outline-none
//   `;

//   return (
//     <div className="space-y-4">
//       {/* Рабочая дата */}
//       <div className="space-y-2">
//         <h4 className="font-bold text-indigo-300 uppercase tracking-wider">Рабочая дата</h4>
//         <input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} className={inputCls} />

//         <div className="flex items-center justify-between">
//           <div className="flex items-center gap-2">
//             {isLoading ? (
//               <span className="text-indigo-400/60">...</span>
//             ) : isClosed ? (
//               <>
//                 <span className="w-2 h-2 rounded-full bg-red-500" />
//                 <span className="text-red-400 font-medium">День закрыт</span>
//               </>
//             ) : (
//               <>
//                 <span className="w-2 h-2 rounded-full bg-green-500" />
//                 <span className="text-green-400 font-medium">День открыт</span>
//               </>
//             )}
//           </div>
//           {isClosed ? (
//             <button onClick={() => openMutation.mutate()} disabled={openMutation.isPending} className="px-2 py-0.5 rounded bg-yellow-900/40 text-yellow-400 hover:bg-yellow-900/60 transition">
//               Открыть
//             </button>
//           ) : (
//             <button onClick={() => closeMutation.mutate()} disabled={closeMutation.isPending} className="px-2 py-0.5 rounded bg-red-900/40 text-red-400 hover:bg-red-900/60 transition">
//               Закрыть
//             </button>
//           )}
//         </div>
//       </div>

//       <div className="border-t border-indigo-900/30" />

//       {/* Период отчётов */}
//       <div className="space-y-2">
//         <h4 className="font-bold text-indigo-300 uppercase tracking-wider">Период отчётов</h4>
//         <div className="space-y-1.5">
//           <div>
//             <label className="text-indigo-400/70 ml-1">С</label>
//             <input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} className={inputCls} />
//           </div>
//           <div>
//             <label className="text-indigo-400/70 ml-1">По</label>
//             <input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} className={inputCls} />
//           </div>
//         </div>
//         <div className="flex flex-wrap gap-1 pt-1">
//           {[
//             { label: "Сегодня", fn: setCurrentDay },
//             { label: "Месяц", fn: setCurrentMonth },
//             { label: "Год", fn: setCurrentYear },
//           ].map(({ label, fn }) => (
//             <button key={label} onClick={fn} className="px-2 py-0.5 rounded bg-indigo-900/40 text-indigo-300 hover:bg-indigo-900/70 transition">
//               {label}
//             </button>
//           ))}
//         </div>
//       </div>
//     </div>
//   );
// }
