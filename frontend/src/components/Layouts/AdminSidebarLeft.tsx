// frontend/src/components/Layouts/AdminSidebarLeft.tsx
import React from "react";
import { NavLink } from "react-router-dom";

export const AdminSidebarLeft: React.FC = () => {
  const menuItems = [
    { name: "Company list", path: "/admin-panel", icon: "📊" },
    { name: "Create company", path: "/create-company", icon: "📊" },
    { name: "Компании (Тенанты)", path: "/admin/companies", icon: "🏢" },
    { name: "Тарифы и Лицензии", path: "/admin/billing", icon: "💳" },
    { name: "Логи и Мониторинг", path: "/admin/logs", icon: "🛠️" },
  ];

  return (
    // Убрали жесткую высоту, сайдбар просто занимает оставшееся место по вертикали
    <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col border-r border-slate-800">
      {/* Навигационное меню (логотип отсюда убран, он переезжает в AdminHeader) */}
      <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                isActive ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/10" : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              }`
            }
          >
            <span className="text-base">{item.icon}</span>
            <span>{item.name}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800 bg-slate-950 text-xs text-slate-500 text-center">v1.0.0 (2026)</div>
    </aside>
  );
};
