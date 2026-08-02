// frontend/src/features/accounting/pages/Analytics/ComingSoonAnalysis.tsx
import { useTranslation } from "react-i18next";
import { PresentationChartLineIcon } from "@heroicons/react/24/outline";

// ✅ Заглушка для вкладок раздела "Аналитика", которые ещё не реализованы —
// вкладки создаются все сразу (см. Analytics.tsx), содержимое наполняется по
// одному отчёту за раз (см. CLAUDE.md-задачу от пользователя: "не завершив
// один анализ, не начинай второй").
export default function ComingSoonAnalysis({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center text-gray-400 gap-3">
      <PresentationChartLineIcon className="w-10 h-10 opacity-40" />
      <div className="text-sm md:text-base font-medium text-gray-500 dark:text-gray-400">{t(titleKey)}</div>
      <div className="text-xs md:text-sm">{t("AnalysisComingSoon")}</div>
    </div>
  );
}
