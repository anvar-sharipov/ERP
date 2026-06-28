// frontend/src/features/accounting/pages/Warehouses/Warehouses.tsx
import { NavLink, Outlet } from "react-router-dom";
import { playClickSound } from "../../../../core/utils/sound";
import { useTranslation } from "react-i18next";

const Warehouses = () => {
  const { t } = useTranslation();

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-3 border-b-2 whitespace-nowrap transition-all duration-200 ${
      isActive ? "border-blue-500 text-blue-600 dark:text-blue-500 font-medium" : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
    }`;

  return (
    <div className="h-full flex flex-col">
      <div className="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto scrollbar-hide print:hidden">
        <div className="flex min-w-max px-2">
          <NavLink to="list" className={tabClass} onClick={playClickSound}>
            {t("Warehouses")}
          </NavLink>
          <NavLink to="stocks" className={tabClass} onClick={playClickSound}>
            {t("WarehouseStocks")}
          </NavLink>
        </div>
      </div>
      <div className="flex-1 md:p-6 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
};

export default Warehouses;
