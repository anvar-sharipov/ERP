// frontend/src/features/accointing/pages/Accounting/AccountingLayout.tsx
import { Outlet, NavLink } from "react-router-dom";

const AccountingLayout = () => {
  return (
    <div className="flex h-full">
      {/* Внутреннее меню бухгалтерии (Sub-sidebar) */}
      <aside className="w-48 bg-slate-100 border-r border-slate-200 p-4">
        <nav className="space-y-2">
          <NavLink to="/accounting/journal" className="block p-2 hover:bg-slate-200 rounded">Журнал проводок</NavLink>
          <NavLink to="/accounting/reports" className="block p-2 hover:bg-slate-200 rounded">Отчеты</NavLink>
          <NavLink to="/accounting/settings" className="block p-2 hover:bg-slate-200 rounded">Настройки учета</NavLink>
        </nav>
      </aside>

      {/* Основной контент раздела */}
      <main className="flex-1 p-6">
        <Outlet /> {/* Здесь будут рендериться дочерние страницы (Journal, Reports и т.д.) */}
      </main>
    </div>
  );
};


export default AccountingLayout;