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

  // ✅ Привязка к ПК (см. companies/middleware.py) — галочка выключена по
  // умолчанию, тогда HOST_COMPUTERNAME вообще не проверяется.
  const handleTogglePcLock = async (company: any) => {
    try {
      await adminCompanyApi.updatePcLock(company.id, { pc_lock_enabled: !company.pc_lock_enabled });
      setCompanyList((prev) => prev.map((c) => (c.id === company.id ? { ...c, pc_lock_enabled: !c.pc_lock_enabled } : c)));
    } catch (err: any) {
      if (!(err as any)._handled) {
        notify("error", "Не удалось изменить привязку к ПК");
      }
    }
  };

  // ✅ Company.allow_branch_creation — скрывает/показывает кнопку "Добавить
  // филиал" (Branchs.tsx) для ВСЕХ пользователей этого tenant'а, независимо
  // от их RBAC-прав. По умолчанию true (разрешено) — ничего не меняется,
  // пока это явно не отключат здесь.
  const handleToggleBranchCreation = async (company: any) => {
    try {
      await adminCompanyApi.updatePcLock(company.id, { allow_branch_creation: !company.allow_branch_creation });
      setCompanyList((prev) => prev.map((c) => (c.id === company.id ? { ...c, allow_branch_creation: !c.allow_branch_creation } : c)));
    } catch (err: any) {
      if (!(err as any)._handled) {
        notify("error", "Не удалось изменить настройку добавления филиалов");
      }
    }
  };

  // ✅ Общий обработчик для обоих текстовых полей привязки к ПК (имя
  // компьютера + ID железа) — оба сохраняются одинаково, по onBlur.
  const handlePcLockFieldChange = (companyId: number, field: "allowed_computer_name" | "allowed_hardware_id", value: string) => {
    setCompanyList((prev) => prev.map((c) => (c.id === companyId ? { ...c, [field]: value } : c)));
  };

  const handlePcLockFieldSave = async (company: any, field: "allowed_computer_name" | "allowed_hardware_id") => {
    try {
      await adminCompanyApi.updatePcLock(company.id, { [field]: company[field] });
      notify("success", "Сохранено");
    } catch (err: any) {
      if (!(err as any)._handled) {
        notify("error", "Не удалось сохранить");
      }
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

              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input type="checkbox" checked={!!company.pc_lock_enabled} onChange={() => handleTogglePcLock(company)} />
                  Работать только на указанном ПК
                </label>
                {/* ✅ Поля показываются ВСЕГДА, не только когда галочка уже включена —
                    иначе курица-яйцо: сервер не даёт включить галочку с пустыми
                    полями (см. CompanySerializer.py::validate), а поля без включённой
                    галочки были не видны, то есть заполнить их было невозможно до
                    первой (обречённой на ошибку) попытки включить галочку. */}
                <input
                  type="text"
                  value={company.allowed_computer_name || ""}
                  onChange={(e) => handlePcLockFieldChange(company.id, "allowed_computer_name", e.target.value)}
                  onBlur={() => handlePcLockFieldSave(company, "allowed_computer_name")}
                  placeholder="Имя компьютера (COMPUTERNAME)"
                  className="mt-2 w-full text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
                {/* ✅ Второй, более "железный" идентификатор — см. tools/licensing/collect_hardware_id.ps1 */}
                <input
                  type="text"
                  value={company.allowed_hardware_id || ""}
                  onChange={(e) => handlePcLockFieldChange(company.id, "allowed_hardware_id", e.target.value)}
                  onBlur={() => handlePcLockFieldSave(company, "allowed_hardware_id")}
                  placeholder="ID железа (UUID материнской платы)"
                  className="mt-2 w-full text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input type="checkbox" checked={company.allow_branch_creation ?? false} onChange={() => handleToggleBranchCreation(company)} />
                  Разрешено добавлять филиалы
                </label>
              </div>

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
