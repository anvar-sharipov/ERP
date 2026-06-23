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
import DirectoryRecordsPage from "../../features/accounting/pages/Directory/Directory/DirectoryRecordsPage";
import Products from "../../features/accounting/pages/Products/Products";
import ProductsListPage from "../../features/accounting/pages/Products/ProductsListPage";
import CategoriesPage from "../../features/accounting/pages/Products/CategoriesPage";
import BrandsPage from "../../features/accounting/pages/Products/BrandsPage";
import TagsPage from "../../features/accounting/pages/Products/TagsPage";
import UnitsPage from "../../features/accounting/pages/Products/UnitsPage";
import Warehouses from "../../features/accounting/pages/Warehouses/Warehouses";
import WarehousesListPage from "../../features/accounting/pages/Warehouses/WarehousesListPage";
import WarehouseStocksPage from "../../features/accounting/pages/Warehouses/WarehouseStocksPage";
import CounterpartiesPage from "../../features/accounting/pages/Counterparties/CounterpartiesPage";
import ProductFormPage from "../../features/accounting/pages/Products/Form/ProductFormPage";
import PriceTypesPage from "../../features/accounting/pages/Products/PriceTypesPage";
import JournalPage from "../../features/accounting/pages/Journal/JournalPage";
import Journal from "../../features/accounting/pages/Journal/Journal";
import StockMovementsPage from "../../features/accounting/pages/Journal/StockMovementsPage";
import RoleFormPage from "../../features/users/components/pages/admin/Roles/RoleFormPage";
import SubcontoTypesPage from "../../features/accounting/pages/Accounting/SubcontoTypesPage";
import OSVPage from "../../features/accounting/pages/Accounting/OSVPage";
import Employees from "../../features/accounting/pages/Employees/Employees";
import EmployeesPage from "../../features/accounting/pages/Employees/EmployeesPage";
import PositionsPage from "../../features/accounting/pages/Employees/PositionsPage";
import AuditLogPage from "../../features/accounting/pages/Accounting/AuditLogPage";

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

          <Route element={<PermissionRoute resource="user" action="GET" />}>
            <Route path={ROUTES.ADMIN.DASHBOARD} element={<AdminPanel />} />
            <Route path={ROUTES.COMPANY_ADMIN.USERS} element={<CompanyAdminUser />} />
            <Route path={ROUTES.COMPANY_ADMIN.ROLES} element={<Roles />} />
            <Route path={ROUTES.COMPANY_ADMIN.ROLES_CREATE} element={<RoleFormPage />} />
            <Route path={ROUTES.COMPANY_ADMIN.ROLES_EDIT} element={<RoleFormPage />} />
            <Route path={ROUTES.COMPANY_ADMIN.COMPANIES} element={<CompanyAdmin />} />
            <Route path={ROUTES.COMPANY_ADMIN.BRANCHS} element={<Branchs />} />
          </Route>
          {/* ОБЫЧНЫЕ РОУТЫ (доступны всем) */}
          <Route path={ROUTES.APP.DASHBOARD} element={<Dashboard />} />
          {/* <Route path={ROUTES.APP.ACCOUNTING} element={<Accounting />} /> */}

          {/* Бухгалтерия */}
          <Route element={<PermissionRoute resource="account" action="GET" />}>
            <Route path={ROUTES.APP.ACCOUNTING} element={<Accounting />}>
              <Route index element={<Navigate to="accounts" replace />} />
              <Route path="accounts" element={<AccountPage />} />
              <Route path="subconto-types" element={<SubcontoTypesPage />} />
              <Route path="osv" element={<OSVPage />} />
              <Route path="audit-log" element={<AuditLogPage />} />
            </Route>
          </Route>

          {/* Справочники */}
          <Route element={<PermissionRoute resource="directory" action="GET" />}>
            <Route path={ROUTES.APP.DIRECTORY} element={<Directory />}>
              <Route index element={<Navigate to="create-fields-for-directory" replace />} />
              <Route path="create-fields-for-directory" element={<CreateField />} />
            </Route>
          </Route>
          <Route path={ROUTES.APP.DIRECTORY_FIELDS} element={<DirectoryFieldsPage />} />
          <Route path={ROUTES.APP.DIRECTORY_RECORDS} element={<DirectoryRecordsPage />} />

          <Route path={ROUTES.APP.PRODUCTS} element={<Products />}>
            <Route index element={<Navigate to="list" replace />} />
            <Route path="list" element={<ProductsListPage />} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="brands" element={<BrandsPage />} />
            <Route path="tags" element={<TagsPage />} />
            <Route path="units" element={<UnitsPage />} />
            <Route path={ROUTES.APP.PRODUCTS_PRICE_TYPES} element={<PriceTypesPage />} />
          </Route>
          <Route path={ROUTES.APP.PRODUCTS_CREATE} element={<ProductFormPage />} />
          <Route path={ROUTES.APP.PRODUCTS_EDIT} element={<ProductFormPage />} />

          <Route path={ROUTES.APP.COUNTERPARTIES} element={<CounterpartiesPage />} />

          <Route path={ROUTES.APP.WAREHOUSES} element={<Warehouses />}>
            <Route index element={<Navigate to="list" replace />} />
            <Route path="list" element={<WarehousesListPage />} />
            <Route path="stocks" element={<WarehouseStocksPage />} />
          </Route>

          {/* Журнал */}
          <Route element={<PermissionRoute resource="journalentry" action="GET" />}>
            <Route path={ROUTES.APP.JOURNAL} element={<Journal />}>
              <Route index element={<Navigate to="entries" replace />} />
              <Route path="entries" element={<JournalPage />} />
              <Route path="movements" element={<StockMovementsPage />} />
            </Route>
          </Route>
        </Route>

        <Route element={<PermissionRoute resource="employee" action="GET" />}>
          <Route path={ROUTES.APP.EMPLOYEES} element={<Employees />}>
            <Route index element={<Navigate to="list" replace />} />
            <Route path="list" element={<EmployeesPage />} />
            <Route path="positions" element={<PositionsPage />} />
          </Route>
        </Route>
      </Route>

      {/* ================= FALLBACK ZONE ================= */}
      {/* Универсальный редирект для неизвестных роутов */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
};

export default AppRouter;
