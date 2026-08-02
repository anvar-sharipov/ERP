// frontend/src/features/accounting/pages/Reports/Reports.tsx
import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { GoogleTabs } from "../../../../components/ui/Tabs/GoogleTabs";

// ✅ Хаб раздела "Отчёты" (отдельная вкладка в левом сайдбаре, ROUTES.APP.REPORTS) —
// тот же паттерн, что и Accounting.tsx: GoogleTabs + вложенные <Route>. Каждый
// новый отчёт добавляется сюда одной строкой в tabs + своим <Route path="..."> в
// AppRouter.tsx (см. регистрацию ROUTES.APP.ACCOUNTING там же для образца) — без
// внешнего route-level RBAC-гейта на весь хаб, у каждой вкладки-отчёта должен быть
// свой usePageAccess/RBACGuard с ПРАВИЛЬНЫМ для неё ресурсом.
const Reports = () => {
  const { t } = useTranslation();
  const tabs = [
    { to: "osv", label: t("OSV") },
    { to: "account-card", label: t("AccountCard") },
    { to: "product-card", label: t("ProductCard") },
    { to: "product-turnover", label: t("ProductTurnover") },
    { to: "price-changes", label: t("PriceChanges") },
    { to: "universal-filter", label: t("UniversalFilter") },
    // { to: "some-report", label: t("SomeReportTitle") },
  ];

  return (
    <div className="h-full flex flex-col">
      <GoogleTabs items={tabs} />
      <div className="flex-1 md:p-6 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
};

export default Reports;
