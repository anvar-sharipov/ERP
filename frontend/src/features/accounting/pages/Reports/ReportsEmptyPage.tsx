// frontend/src/features/accounting/pages/Reports/ReportsEmptyPage.tsx
import { useTranslation } from "react-i18next";
import { ChartBarIcon } from "@heroicons/react/24/outline";
import { HelpButton } from "../../../../components/ui/HelpButton";

// ✅ index-роут раздела "Отчёты", пока в tabs (Reports.tsx) нет ни одного отчёта.
// Как только добавляется первый реальный отчёт — этот index стоит заменить на
// <Navigate to="<первый-отчёт>" replace/> (тем же способом, что Accounting.tsx
// делает index -> "accounts"), а этот файл оставить только как fallback уже не нужен.
const ReportsEmptyPage = () => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-gray-500 dark:text-gray-400">
      <div className="flex items-center gap-2">
        <ChartBarIcon className="w-10 h-10 text-lime-400" />
        <HelpButton title={t("Reports")}>
          <p>{t("ReportsEmptyText")}</p>
        </HelpButton>
      </div>
      <h2 className="text-base md:text-lg font-bold text-gray-700 dark:text-gray-200">{t("ReportsEmptyTitle")}</h2>
      <p className="max-w-md text-sm">{t("ReportsEmptyText")}</p>
    </div>
  );
};

export default ReportsEmptyPage;
