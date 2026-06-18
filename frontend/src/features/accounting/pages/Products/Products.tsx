// frontend/src/features/accounting/pages/Products/Products.tsx
import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { GoogleTabs } from "../../../../components/ui/Tabs/GoogleTabs";

const Products = () => {
  const { t } = useTranslation();
  const tabs = [
    { to: "list",       label: t("Products") },
    { to: "categories", label: t("Categories") },
    { to: "brands",     label: t("Brands") },
    { to: "tags",       label: t("Tags") },
    { to: "units",      label: t("Units") },
    { to: "price-types",      label: t("PriceTypes") },
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