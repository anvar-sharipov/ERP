import React from "react";

interface StatusBadgeProps {
  isActive: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ isActive, activeLabel = "Активен", inactiveLabel = "Неактивен" }) => {
  return (
    <div className="flex items-center justify-center gap-2 print:block">
      <span className={`w-2 h-2 rounded-full ${isActive ? "bg-green-500" : "bg-red-500"}`} />
      <span className="text-gray-700 dark:text-gray-400 text-xs">{isActive ? activeLabel : inactiveLabel}</span>
    </div>
  );
};
