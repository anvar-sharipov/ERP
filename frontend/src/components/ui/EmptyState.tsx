import React from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
}

export const EmptyState = ({
  title = "NothingFound",
  description = "TryChangingFilters",
  icon = <Search className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-4" />,
}: EmptyStateProps) => {
  const {t} = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      {icon}
      <h3 className="text-md md:text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">{t(title)}</h3>
      <p className="text-gray-400 dark:text-gray-500 max-w-sm">{t(description)}</p>
    </div>
  );
};
