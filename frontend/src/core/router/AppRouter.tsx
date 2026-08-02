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
import DocumentSettingsPage from "../../features/users/components/pages/admin/Roles/DocumentSettings/DocumentSettingsPage";
import AlertsPage from "../../features/users/components/pages/admin/Alerts/AlertsPage";
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
import TripsListPage from "../../features/accounting/pages/Trips/TripsListPage";
import TripDetailPage from "../../features/accounting/pages/Trips/TripDetailPage";
import ProductFormPage from "../../features/accounting/pages/Products/Form/ProductFormPage";
import PriceTypesPage from "../../features/accounting/pages/Products/PriceTypesPage";
import JournalPage from "../../features/accounting/pages/Journal/JournalPage";
import Journal from "../../features/accounting/pages/Journal/Journal";
import StockMovementsPage from "../../features/accounting/pages/Journal/StockMovementsPage";
import RoleFormPage from "../../features/users/components/pages/admin/Roles/RoleFormPage";
import SubcontoTypesPage from "../../features/accounting/pages/Accounting/SubcontoTypesPage";
import OSVPage from "../../features/accounting/pages/Accounting/OSVPage";
import AccountCardPage from "../../features/accounting/pages/Accounting/AccountCardPage";
import ProductCardPage from "../../features/accounting/pages/Accounting/ProductCardPage";
import ProductTurnoverPage from "../../features/accounting/pages/Accounting/ProductTurnoverPage";
import ProductTurnoverDetailPage from "../../features/accounting/pages/Accounting/ProductTurnoverDetailPage";
import SubcontoBreakdownPage from "../../features/accounting/pages/Accounting/SubcontoBreakdownPage";
import SubcontoCardPage from "../../features/accounting/pages/Accounting/SubcontoCardPage";
import Employees from "../../features/accounting/pages/Employees/Employees";
import EmployeesPage from "../../features/accounting/pages/Employees/EmployeesPage";
import PositionsPage from "../../features/accounting/pages/Employees/PositionsPage";
import AgentsPage from "../../features/accounting/pages/Employees/AgentsPage";
import AuditLogPage from "../../features/accounting/pages/Accounting/AuditLogPage";
import Documents from "../../features/accounting/pages/Documents/Documents";
import InvoicesPage from "../../features/accounting/pages/Documents/InvoicesPage";
import OrdersPage from "../../features/accounting/pages/Documents/OrdersPage";
import ReturnsPage from "../../features/accounting/pages/Documents/ReturnsPage";
import DocumentFormPage from "../../features/accounting/pages/Documents/Invoice/DocumentFormPage";
import DocumentViewPage from "../../features/accounting/pages/Documents/Invoice/DocumentViewPage";
import ChatPage from "../../features/chat/pages/ChatPage";
import { PlatformContactPage } from "../../features/admin/components/PlatformContactPage";
import ExchangeRates from "../../features/accounting/pages/ExchangeRates/ExchangeRates";
import RatesPage from "../../features/accounting/pages/ExchangeRates/RatesPage";
import CurrenciesPage from "../../features/accounting/pages/ExchangeRates/CurrenciesPage";
import Reports from "../../features/accounting/pages/Reports/Reports";
import Analytics from "../../features/accounting/pages/Analytics/Analytics";
import ComingSoonAnalysis from "../../features/accounting/pages/Analytics/ComingSoonAnalysis";
import SalesDynamicsPage from "../../features/accounting/pages/Analytics/SalesDynamicsPage";
import ABCAnalysisPage from "../../features/accounting/pages/Analytics/ABCAnalysisPage";
import XYZAnalysisPage from "../../features/accounting/pages/Analytics/XYZAnalysisPage";
import MarginAnalysisPage from "../../features/accounting/pages/Analytics/MarginAnalysisPage";
import CategoryAnalysisPage from "../../features/accounting/pages/Analytics/CategoryAnalysisPage";
import ProductRevaluationPage from "../../features/accounting/pages/Reports/ProductRevaluationPage";
import PriceChangeHistoryPage from "../../features/accounting/pages/Reports/PriceChangeHistoryPage";
import PriceChanges from "../../features/accounting/pages/Reports/PriceChanges";
import UniversalFilterPage from "../../features/accounting/pages/Reports/UniversalFilterPage";

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
          <Route path="/admin-panel/platform-contact" element={<PlatformContactPage />} />
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
            <Route path={ROUTES.COMPANY_ADMIN.DOCUMENT_SETTINGS} element={<DocumentSettingsPage />} />
            <Route path={ROUTES.COMPANY_ADMIN.ALERTS} element={<AlertsPage />} />
          </Route>
          {/* ОБЫЧНЫЕ РОУТЫ (доступны всем) */}
          <Route path={ROUTES.APP.DASHBOARD} element={<Dashboard />} />
          <Route path={ROUTES.APP.EXCHANGE_RATES} element={<ExchangeRates />}>
            <Route index element={<Navigate to="rates" replace />} />
            <Route path="rates" element={<RatesPage />} />
            <Route path="currencies" element={<CurrenciesPage />} />
          </Route>
          {/* <Route path={ROUTES.APP.ACCOUNTING} element={<Accounting />} /> */}

          {/* Бухгалтерия — без внешнего route-level гейта: у каждой вкладки свой
              usePageAccess/RBACGuard с ПРАВИЛЬНЫМ для неё ресурсом (account,
              journalentry, auditlog, document) — единый внешний PermissionRoute
              resource="account" раньше блокировал доступ к osv/audit-log/
              product-turnover для пользователей без прав именно на "account",
              даже если у них были права на нужный именно этой вкладке ресурс. */}
          <Route path={ROUTES.APP.ACCOUNTING} element={<Accounting />}>
            <Route index element={<Navigate to="accounts" replace />} />
            <Route path="accounts" element={<AccountPage />} />
            <Route path="subconto-types" element={<SubcontoTypesPage />} />
            <Route path="audit-log" element={<AuditLogPage />} />
          </Route>
          <Route path={ROUTES.APP.ACCOUNTING_SUBCONTO_BREAKDOWN} element={<SubcontoBreakdownPage />} />
          <Route path={ROUTES.APP.ACCOUNTING_SUBCONTO_CARD} element={<SubcontoCardPage />} />

          {/* Отчёты — отдельная вкладка в сайдбаре, сюда по одному будут добавляться
              новые отчёты (см. Reports.tsx). Каждый новый отчёт: своя строка в tabs
              там + свой <Route path="..."> здесь, тем же паттерном, что и ACCOUNTING.
              ОСВ перенесена сюда из "Бухгалтерия" (была первым тестовым переносом),
              следом — Товарооборот; index редиректит на ОСВ. */}
          <Route path={ROUTES.APP.REPORTS} element={<Reports />}>
            <Route index element={<Navigate to="osv" replace />} />
            <Route path="osv" element={<OSVPage />} />
            <Route path="account-card" element={<AccountCardPage />} />
            <Route path="product-card" element={<ProductCardPage />} />
            <Route path="product-turnover" element={<ProductTurnoverPage />} />
            <Route path="price-changes" element={<PriceChanges />}>
              <Route index element={<Navigate to="revaluation" replace />} />
              <Route path="revaluation" element={<ProductRevaluationPage />} />
              <Route path="history" element={<PriceChangeHistoryPage />} />
            </Route>
            <Route path="universal-filter" element={<UniversalFilterPage />} />
          </Route>
          <Route path={ROUTES.APP.REPORTS_PRODUCT_TURNOVER_DETAIL} element={<ProductTurnoverDetailPage />} />

          {/* Аналитика — отдельная вкладка в сайдбаре (см. Analytics.tsx), 15
              под-вкладок реализуются по одной; пока не реализована — ComingSoonAnalysis. */}
          <Route path={ROUTES.APP.ANALYTICS} element={<Analytics />}>
            <Route index element={<Navigate to="sales-dynamics" replace />} />
            <Route path="sales-dynamics" element={<SalesDynamicsPage />} />
            <Route path="abc" element={<ABCAnalysisPage />} />
            <Route path="xyz" element={<XYZAnalysisPage />} />
            <Route path="margin" element={<MarginAnalysisPage />} />
            <Route path="category" element={<CategoryAnalysisPage />} />
            <Route path="channels" element={<ComingSoonAnalysis titleKey="SalesChannelAnalysis" />} />
            <Route path="geography" element={<ComingSoonAnalysis titleKey="GeographyAnalysis" />} />
            <Route path="rfm" element={<ComingSoonAnalysis titleKey="RFMAnalysis" />} />
            <Route path="ltv" element={<ComingSoonAnalysis titleKey="LTVAnalysis" />} />
            <Route path="churn" element={<ComingSoonAnalysis titleKey="ChurnAnalysis" />} />
            <Route path="cohort" element={<ComingSoonAnalysis titleKey="CohortAnalysis" />} />
            <Route path="plan-fact" element={<ComingSoonAnalysis titleKey="PlanFactAnalysis" />} />
            <Route path="variance" element={<ComingSoonAnalysis titleKey="VarianceAnalysis" />} />
            <Route path="factor" element={<ComingSoonAnalysis titleKey="FactorAnalysis" />} />
            <Route path="funnel" element={<ComingSoonAnalysis titleKey="FunnelAnalysis" />} />
          </Route>

          {/* Справочники — тот же принцип: свой resource на каждой вложенной странице */}
          <Route path={ROUTES.APP.DIRECTORY} element={<Directory />}>
            <Route index element={<Navigate to="create-fields-for-directory" replace />} />
            <Route path="create-fields-for-directory" element={<CreateField />} />
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

          <Route path={ROUTES.APP.TRIPS} element={<TripsListPage />} />
          <Route path={ROUTES.APP.TRIPS_VIEW} element={<TripDetailPage />} />

          <Route path={ROUTES.APP.WAREHOUSES} element={<Warehouses />}>
            <Route index element={<Navigate to="list" replace />} />
            <Route path="list" element={<WarehousesListPage />} />
            <Route path="stocks" element={<WarehouseStocksPage />} />
          </Route>

          {/* Журнал — entries проверяет journalentry, movements проверяет
              stockmovement (см. StockMovementsPage.tsx) — свой resource на странице */}
          <Route path={ROUTES.APP.JOURNAL} element={<Journal />}>
            <Route index element={<Navigate to="entries" replace />} />
            <Route path="entries" element={<JournalPage />} />
            <Route path="movements" element={<StockMovementsPage />} />
          </Route>

          <Route path={ROUTES.APP.CHAT} element={<ChatPage />} />
        </Route>

        <Route path={ROUTES.APP.EMPLOYEES} element={<Employees />}>
          <Route index element={<Navigate to="list" replace />} />
          <Route path="list" element={<EmployeesPage />} />
          <Route path="positions" element={<PositionsPage />} />
          <Route path="agents" element={<AgentsPage />} />
        </Route>

        <Route path={ROUTES.APP.DOCUMENTS} element={<Documents />}>
          <Route index element={<Navigate to="invoices" replace />} />
          <Route path="invoices" element={<InvoicesPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="returns" element={<ReturnsPage />} />
        </Route>
        {/* ✅ Один <Route> и на создание (id="new"), и на редактирование — см.
            комментарий у ROUTES.APP.DOCUMENTS_CREATE в routes.ts: если оставить
            отдельный <Route> под "/documents/create", react-router размонтирует
            DocumentFormPage при переходе на ":id/edit" после первого автосохранения
            (роняя фокус ввода), вместо того чтобы просто сменить :id-параметр у уже
            смонтированного компонента. */}
        <Route path={ROUTES.APP.DOCUMENTS_EDIT} element={<DocumentFormPage />} />
        <Route path={ROUTES.APP.DOCUMENTS_VIEW} element={<DocumentViewPage />} />
      </Route>

      {/* ================= FALLBACK ZONE ================= */}
      {/* Универсальный редирект для неизвестных роутов */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
};

export default AppRouter;
