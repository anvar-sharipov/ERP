// frontend/src/components/ui/Tabs/Tabs.tsx
import { NavLink } from "react-router-dom";
import { playClickSound } from "../../../core/utils/sound";
import { useTabHotkeys } from "../../../core/hooks/useTabHotkeys";

interface TabItem {
  to: string;
  label: string;
}

interface TabsProps {
  items: TabItem[];
  className?: string;
  // ✅ Ctrl+1..9 переключают вкладки глобальным window-событием — если на странице
  // одновременно смонтированы ДВА GoogleTabs (внешний + вложенный сабтаббар,
  // см. Reports/PriceChanges.tsx), оба слушателя сработают на один и тот же
  // keydown и будут конкурировать за навигацию. hotkeys=false отключает хоткеи
  // именно у ЭТОГО инстанса (обычно у вложенного), оставляя их только у внешнего.
  hotkeys?: boolean;
}

export const GoogleTabs = ({ items, className = "", hotkeys = true }: TabsProps) => {
  useTabHotkeys(hotkeys ? items : []);
  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-3 border-b-2 whitespace-nowrap transition-all duration-200 ${
      isActive ? "border-blue-500 text-blue-600 dark:text-blue-500 font-medium" : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
    }`;

  return (
    <div className={`flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto scrollbar-hide print:hidden ${className}`}>
      <div className="flex min-w-max px-2">
        {items.map((tab) => (
          <NavLink key={tab.to} to={tab.to} className={tabClass} onClick={playClickSound} title="Ctrl+1...Ctrl+9">
            {tab.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
};
