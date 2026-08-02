// frontend/src/features/accounting/pages/Analytics/Analytics.tsx
import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { GoogleTabs } from "../../../../components/ui/Tabs/GoogleTabs";

// ✅ Хаб раздела "Аналитика" (отдельная вкладка в левом сайдбаре, ROUTES.APP.ANALYTICS) —
// тот же паттерн, что и Reports.tsx/Accounting.tsx: GoogleTabs + вложенные <Route> в
// AppRouter.tsx. Порядок вкладок — от наиболее важного/востребованного анализа к
// менее важному (по явной просьбе пользователя), реализуются по одному — до тех пор,
// пока конкретная вкладка не реализована, она ведёт на ComingSoonAnalysis.tsx.
const Analytics = () => {
  const { t } = useTranslation();
  const tabs = [
    { to: "sales-dynamics", label: t("SalesDynamics") },
    { to: "abc", label: t("ABCAnalysis") },
    { to: "xyz", label: t("XYZAnalysis") },
    { to: "margin", label: t("MarginAnalysis") },
    { to: "category", label: t("CategoryAnalysis") },
    { to: "channels", label: t("SalesChannelAnalysis") },
    { to: "geography", label: t("GeographyAnalysis") },
    { to: "rfm", label: t("RFMAnalysis") },
    { to: "ltv", label: t("LTVAnalysis") },
    { to: "churn", label: t("ChurnAnalysis") },
    { to: "cohort", label: t("CohortAnalysis") },
    { to: "plan-fact", label: t("PlanFactAnalysis") },
    { to: "variance", label: t("VarianceAnalysis") },
    { to: "factor", label: t("FactorAnalysis") },
    { to: "funnel", label: t("FunnelAnalysis") },
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

export default Analytics;
