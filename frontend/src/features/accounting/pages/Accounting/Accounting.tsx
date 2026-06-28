// frontend/src/features/accounting/pages/Accounting/Accounting.tsx
import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { GoogleTabs } from "../../../../components/ui/Tabs/GoogleTabs";

const Accounting = () => {
  const { t } = useTranslation();
  const tabs = [
    { to: "accounts", label: t("AccountsPlan") },
    { to: "subconto-types", label: t("SubcontoTypes") },
    { to: "osv", label: t("OSV") },
    { to: "audit-log", label: t("AuditLog") },
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

export default Accounting;
