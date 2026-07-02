// frontend/src/features/admin/components/AdminPanel.tsx
import React, { useEffect, useState } from "react";
import { adminCompanyApi } from "../services/adminCompanyApi";
import { useNotify } from "../../../core/context/NotificationContext";

export const AdminPanel: React.FC = () => {
  const [companyList, setCompanyList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const notify = useNotify();

  const loadCompanies = async () => {
    setLoading(true);
    try {
      const data = await adminCompanyApi.getList();
      setCompanyList(data);
    } catch (err: any) {
      if (!(err as any)._handled) {
        notify("error", "Произошла ошибка при загрузке данных");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompanies();
  }, []);

  const handleToggleActive = async (company: any) => {
    setTogglingId(company.id);
    try {
      await adminCompanyApi.toggleActive(company.id, !company.is_active);
      setCompanyList((prev) => prev.map((c) => (c.id === company.id ? { ...c, is_active: !c.is_active } : c)));
      notify("success", `Компания ${!company.is_active ? "активирована" : "заблокирована"}`);
    } catch (err: any) {
      if (!(err as any)._handled) {
        notify("error", "Не удалось изменить статус компании");
      }
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-6">Список организаций</h2>

      {loading ? (
        <div className="text-slate-500">Загрузка...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {companyList.map((company) => (
            <div key={company.id} className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100">{company.name}</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${company.is_active ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}`}>
                  {company.is_active ? "Активна" : "Заблокирована"}
                </span>
              </div>

              <p className="text-sm text-slate-500 mt-1 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded inline-block">{company.schema_name}.localhost</p>

              <div className="mt-4 flex gap-2">
                <button className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500">Войти</button>
                <button
                  onClick={() => handleToggleActive(company)}
                  disabled={togglingId === company.id}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                    company.is_active
                      ? "border-rose-300 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                      : "border-emerald-300 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                  }`}
                >
                  {togglingId === company.id ? "..." : company.is_active ? "Заблокировать" : "Активировать"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// // frontend/src/features/admin/components/AdminPanel.tsx
// import React, { useEffect, useState } from "react";
// import { api } from "../../../core/api/axiosInstance";
// // import { Button } from "../../../components/ui/Button";
// import { useNotify } from "../../../core/context/NotificationContext";

// export const AdminPanel: React.FC = () => {
//   const [companyList, setCompanyList] = useState<any[]>([]);
//   const [loading, setLoading] = useState(false);
//   const notify = useNotify();

//   useEffect(() => {
//     const getCompanies = async () => {
//       setLoading(true);
//       try {
//         const res = await api.get("/companies/list/");
//         setCompanyList(res.data);
//       } catch (err: any) {
//         if (!(err as any)._handled) {
//           notify("error", "Произошла ошибка при загрузке данных");
//         }
//       } finally {
//         setLoading(false);
//       }
//     };
//     getCompanies();
//   }, []);

//   return (
//     <div className="p-6 max-w-5xl mx-auto">
//       <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-6">Список организаций</h2>

//       {loading ? (
//         <div className="text-slate-500">Загрузка...</div>
//       ) : (
//         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
//           {companyList.map((company) => (
//             <div key={company.id} className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm hover:shadow-md transition-shadow">
//               <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100">{company.name}</h3>
//               <p className="text-sm text-slate-500 mt-1 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded inline-block">{company.schema_name}.localhost</p>
//               <div className="mt-4 flex gap-2">
//                 <button className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500">Войти</button>
//                 {/* <Button text="Войти tt" /> */}
//               </div>
//             </div>
//           ))}
//         </div>
//       )}
//     </div>
//   );
// };
