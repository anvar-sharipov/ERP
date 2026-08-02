// frontend/src/features/accounting/pages/Reports/PriceChanges.tsx
import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { GoogleTabs } from "../../../../components/ui/Tabs/GoogleTabs";

// ✅ Объединяет "Переоценка товаров" и "История изменения цен" под одной вкладкой
// Отчётов — тот же паттерн вложенных табов, что у Reports.tsx/Accounting.tsx
// (GoogleTabs + вложенные <Route> в AppRouter.tsx), только на один уровень глубже.
// hotkeys={false} — иначе Ctrl+1..9 этого сабтаббара конфликтовали бы с
// Ctrl+1..9 внешнего таббара Reports.tsx (см. GoogleTabs.tsx).
const PriceChanges = () => {
  const { t } = useTranslation();
  const tabs = [
    { to: "revaluation", label: t("ProductRevaluation") },
    { to: "history", label: t("PriceChangeHistory") },
  ];

  return (
    <div className="h-full flex flex-col">
      <GoogleTabs items={tabs} hotkeys={false} />
      <div className="flex-1 overflow-auto pt-3">
        <Outlet />
      </div>
    </div>
  );
};

export default PriceChanges;
