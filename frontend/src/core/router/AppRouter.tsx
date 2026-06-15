import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { ROUTES } from "./routes";
import { AppLayout } from "../../components/Layouts/AppLayout"; // Проверь, именованный или default импорт у тебя
import AuthLayout from "../../components/Layouts/AuthLayout";
import { ProtectedRoute } from "./ProtectedRoute";
import { GlobalAdminRoute } from "./GlobalAdminRoute";
import { AdminPanel as GlobalAdminPanel } from "../../features/admin/components/AdminPanel";
import Dashboard from "../../features/accounting/pages/Dashboard";
import Accounting from "../../features/accounting/pages/Accounting/Accounting";

import { Login } from "../../features/auth/components/Login";
import CreateCompany from "../../features/admin/components/CreateCompany";
import AdminPanel from "../../features/users/components/pages/admin/AdminPanel";
import CompanyAdminUser from "../../features/users/components/pages/admin/Roles/CompanyAdminUser";
import Roles from "../../features/users/components/pages/admin/Roles/Roles";
import CompanyAdmin from "../../features/users/components/pages/admin/Roles/Company/Company";
import Branchs from "../../features/users/components/pages/admin/Roles/Branchs/Branchs";
import AccountPage from "../../features/accounting/pages/Accounting/AccountPage";
import Directory from "../../features/accounting/pages/Directory/Directory";

import CreateField from "../../features/accounting/pages/Directory/Directory/CreateField";
import { PermissionRoute } from "./PermissionRouteProps";
import DirectoryFieldsPage from "../../features/accounting/pages/Directory/Directory/DirectoryFieldsPage";


const AppRouter: React.FC = () => {
  return (
    <Routes>
      {/* ================= PUBLIC ZONE ================= */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
      </Route>

      {/* ================= PRIVATE & LAYOUT ZONE ================= */}
      {/* Оборачиваем всё в единый AppLayout, который сам переключит сайдбары */}
      <Route element={<AppLayout />}>
        {/* 1. Ветка Глобального Суперадмина (localhost) */}
        <Route element={<GlobalAdminRoute />}>
          <Route path="/admin-panel" element={<GlobalAdminPanel />} />
          <Route path="/create-company" element={<CreateCompany />} />
          {/* Сюда будут добавляться будущие страницы админа, например:
                <Route path="/admin/companies" element={<AdminCompanies />} /> */}
        </Route>

        {/* 2. Ветка Клиентских Тенантов (поддомены компаний) */}
        <Route element={<ProtectedRoute />}>
          {/* Редирект с корня на дашборд */}
          <Route path="/" element={<Navigate to={ROUTES.APP.DASHBOARD} replace />} />

          {/* ГРУППА АДМИНСКИХ РОУТОВ С ЗАЩИТОЙ */}
          <Route element={<PermissionRoute resource="transaction" action="GET" />}>
            <Route path={ROUTES.ADMIN.DASHBOARD} element={<AdminPanel />} />
            <Route path={ROUTES.COMPANY_ADMIN.USERS} element={<CompanyAdminUser />} />
            <Route path={ROUTES.COMPANY_ADMIN.ROLES} element={<Roles />} />
            <Route path={ROUTES.COMPANY_ADMIN.COMPANIES} element={<CompanyAdmin />} />
            <Route path={ROUTES.COMPANY_ADMIN.BRANCHS} element={<Branchs />} />
          </Route>

          {/* ОБЫЧНЫЕ РОУТЫ (доступны всем) */}
          <Route path={ROUTES.APP.DASHBOARD} element={<Dashboard />} />
          {/* <Route path={ROUTES.APP.ACCOUNTING} element={<Accounting />} /> */}

          {/* Вложенный роут для Бухгалтерии */}
          {/* ГРУППА БУХГАЛТЕРИИ */}
          <Route element={<PermissionRoute resource="transaction" action="GET" />}>
            <Route path={ROUTES.APP.ACCOUNTING} element={<Accounting />}>
              <Route index element={<Navigate to="accounts" replace />} />
              <Route path="accounts" element={<AccountPage />} />
            </Route>

            <Route path={ROUTES.APP.DIRECTORY} element={<Directory />}>
              <Route index element={<Navigate to="create-fields-for-directory" replace />} />
              {/* <Route path="create-directory-page" element={<CreateDirectoryPage />} /> */}
              <Route path="create-fields-for-directory" element={<CreateField />} />
            </Route>
          </Route>
          <Route path={ROUTES.APP.DIRECTORY_FIELDS} element={<DirectoryFieldsPage />} />

          {/* <Route path={ROUTES.APP.ACCOUNTING} element={<Accounting />}>
            <Route index element={<Navigate to="journal" replace />} />
            <Route path="journal" element={<EntryJournal />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="accounts" element={<AccountPage />} />
          </Route> */}

        </Route>
      </Route>

      {/* ================= FALLBACK ZONE ================= */}
      {/* Универсальный редирект для неизвестных роутов */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
};

export default AppRouter;
