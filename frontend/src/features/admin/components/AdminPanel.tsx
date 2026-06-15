// frontend/src/features/admin/components/AdminPanel.tsx
import React, { useEffect, useState } from "react";
import { api } from "../../../core/api/axiosInstance";
// import { Button } from "../../../components/ui/Button";
import { useNotify } from "../../../core/context/NotificationContext";

export const AdminPanel: React.FC = () => {
  const [companyList, setCompanyList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const notify = useNotify();

  useEffect(() => {
    const getCompanies = async () => {
      setLoading(true);
      try {
        const res = await api.get("/companies/list/");
        setCompanyList(res.data);
      } catch (err: any) {
        if (!(err as any)._handled) {
          notify("error", "Произошла ошибка при загрузке данных");
        }
      } finally {
        setLoading(false);
      }
    };
    getCompanies();
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-6">Список организаций</h2>

      {loading ? (
        <div className="text-slate-500">Загрузка...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {companyList.map((company) => (
            <div key={company.id} className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm hover:shadow-md transition-shadow">
              <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100">{company.name}</h3>
              <p className="text-sm text-slate-500 mt-1 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded inline-block">{company.schema_name}.localhost</p>
              <div className="mt-4 flex gap-2">
                <button className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500">Войти</button>
                {/* <Button text="Войти tt" /> */}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
