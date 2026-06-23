// src/features/accounting/pages/Journal/Journal.tsx
import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { GoogleTabs } from "../../../../components/ui/Tabs/GoogleTabs";

const Journal = () => {
  const { t } = useTranslation();

  const tabs = [
    { to: "entries", label: t("JournalEntries") },
    { to: "movements", label: t("StockMovements") },
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

export default Journal;

// // src/features/accounting/pages/Journal/Journal.tsx
// import { Outlet } from "react-router-dom";
// import { useTranslation } from "react-i18next";
// import { GoogleTabs } from "../../../../components/ui/Tabs/GoogleTabs";

// const Journal = () => {
//   const { t } = useTranslation();

//   const tabs = [
//     { to: t("Entries"), label: "Журнал операций" },
//     { to: t("Movements"), label: "Движения склада" },
//   ];

//   return (
//     <div className="h-full flex flex-col">
//       <GoogleTabs items={tabs} />
//       <div className="flex-1 p-4 md:p-6 overflow-auto">
//         <Outlet />
//       </div>
//     </div>
//   );
// };

// export default Journal;
