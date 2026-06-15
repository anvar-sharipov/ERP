// frontend/src/components/Layouts/AdminHeader.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { ThemeToggle } from "../ui/ThemeToggle";
import { logoutRequest } from "../../features/auth/services/authApi";
import { ROUTES } from "../../core/router/routes";


export const AdminHeader: React.FC = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logoutRequest();
    // localStorage.removeItem("access_token");
    // localStorage.removeItem("refresh_token");
    // navigate("/Login", { replace: true });
    navigate(ROUTES.AUTH.LOGIN, { replace: true });
  };

  return (
    <header className="h-16 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between px-6 z-10">
      <div className="flex items-center space-x-6">
        {/* Добавили аккуратный брендинг для админки, соразмерный ширине сайдбара */}
        <div className="flex items-center min-w-[208px]">
          <span className="text-xl font-black tracking-wider text-indigo-600 dark:text-indigo-400">CORE SaaS</span>
          <span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded uppercase">Admin</span>
        </div>

        <div className="w-[1px] h-6 bg-gray-200 dark:bg-slate-700" />
        <h1 className="text-sm font-medium tracking-tight text-gray-500 dark:text-slate-400">Панель Управления Платформой</h1>
      </div>

      <div className="flex items-center space-x-4">
        <ThemeToggle />
        <div className="flex items-center space-x-3 border-l border-gray-200 dark:border-slate-700 pl-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-semibold">Глобальный Админ</p>
            <p className="text-[10px] text-rose-500 font-medium">Root Access</p>
          </div>
          <button onClick={handleLogout} className="p-2 text-gray-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 transition-colors" title="Выйти из системы">
            🚪
          </button>
        </div>
      </div>
    </header>
  );
};
