// frontend/src/features/accounting/pages/Products/Products.tsx
import { NavLink, Outlet } from "react-router-dom";
import { playClickSound } from "../../../../core/utils/sound";
import { useTranslation } from "react-i18next";
import { GoogleTabs } from "../../../../components/ui/Tabs/GoogleTabs";

const Products = () => {
  const { t } = useTranslation();

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-3 border-b-2 whitespace-nowrap transition-all duration-200 ${
      isActive
        ? "border-blue-500 text-blue-600 dark:text-blue-500 font-medium"
        : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
    }`;

  const tabs = [
    { to: "list",       label: t("Products") },
    { to: "categories", label: t("Categories") },
    { to: "brands",     label: t("Brands") },
    { to: "tags",       label: t("Tags") },
    { to: "units",      label: t("Units") },
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

export default Products;