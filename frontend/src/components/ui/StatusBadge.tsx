import React from "react";

interface StatusBadgeProps {
  isActive: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
  onlyIcon?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ isActive, activeLabel = "Активен", inactiveLabel = "Неактивен", onlyIcon=false }) => {
  return (
    <div className="flex items-center justify-center gap-2 print:block">
      <span className={`w-3 h-3 rounded-full ${isActive ? "bg-green-500" : "bg-red-500"}`} />
      {/* <span className={`w-3 h-3 rounded-full ${item.status === "posted" ? "bg-green-500" : "bg-red-500"}`} /> */}
      {!onlyIcon && <span className="text-gray-700 dark:text-gray-400 text-xs">{isActive ? activeLabel : inactiveLabel}</span>}
      
    </div>
  );
};
