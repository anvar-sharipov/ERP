// frontend/src/features/accounting/pages/Employees/Employees.tsx
import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { GoogleTabs } from "../../../../components/ui/Tabs/GoogleTabs";

const Employees = () => {
  const { t } = useTranslation();

  const tabs = [
    {
      to: "list",
      label: t("Employees"),
    },
    {
      to: "positions",
      label: t("Positions"),
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

export default Employees;
