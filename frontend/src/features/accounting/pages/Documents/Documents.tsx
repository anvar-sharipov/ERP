import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { GoogleTabs } from "../../../../components/ui/Tabs/GoogleTabs";

const Documents = () => {
  const { t } = useTranslation();

  const tabs = [
    {
      to: "invoices",
      label: t("Invoices"),
    },
    {
      to: "orders",
      label: t("Orders"),
    },
    {
      to: "returns",
      label: t("Returns"),
    },
  ];

  return (
    <div className="h-full flex flex-col">
      <GoogleTabs items={tabs} />

      <div className="flex-1 p-4 md:p-6 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
};

export default Documents;
