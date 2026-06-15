import React from "react";

interface IconOption {
  name: string;
  icon: React.ElementType;
}

interface IconPickerProps {
  options: IconOption[];
  selectedIcon: string;
  onSelect: (name: string) => void;
  label?: string;
}

export const IconPicker: React.FC<IconPickerProps> = ({ options, selectedIcon, onSelect, label = "Выберите иконку" }) => {
  return (
    <div className="space-y-3 w-full">
      <label className="block font-medium text-slate-700 dark:text-slate-200 ml-1">{label}</label>

      {/* Адаптивная сетка: 
         3 колонки на телефонах (мобильная подстройка)
         5 на планшетах, 8 на десктопах 
      */}
      <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-8 gap-2">
        {options.map(({ name, icon: Icon }) => {
          const isActive = selectedIcon === name;

          return (
            <button
              key={name}
              type="button"
              onClick={() => onSelect(name)}
              className={`
                flex flex-col items-center justify-center 
                h-20 sm:h-20 rounded-xl border-2 transition-all duration-200
                ${
                  isActive
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 shadow-sm"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-indigo-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                }
              `}
            >
              <Icon size={24} />
              <span className="mt-2 text-[9px] font-medium px-1 truncate w-full text-center">{name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
