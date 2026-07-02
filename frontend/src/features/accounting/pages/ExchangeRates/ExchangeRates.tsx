import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { GoogleTabs } from "../../../../components/ui/Tabs/GoogleTabs";

const ExchangeRates = () => {
  const { t } = useTranslation();
  const tabs = [
    { to: "rates", label: t("ExchangeRates", "Курсы валют") },
    { to: "currencies", label: t("Currencies", "Валюты") },
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

export default ExchangeRates;