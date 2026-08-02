// frontend/src/components/ui/MultiSearchableSelect.tsx
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import SearchableSelect, { type SelectOption } from "./SearchableSelect";

interface MultiSearchableSelectProps {
  options: SelectOption[];
  value: number[];
  onChange: (ids: number[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "lg";
  // ✅ "sidebar" — тот же смысл, что у SearchableSelect.theme (см. там же) —
  // правый сайдбар не настоящая dark:-область, нужна принудительная тёмная палитра.
  theme?: "auto" | "sidebar";
}

/**
 * Тонкая обёртка над SearchableSelect для мультивыбора — самого
 * SearchableSelect с массовым value/onChange в кодовой базе ещё нет.
 * Один SearchableSelect работает как "добавить ещё одно значение"
 * (value всегда null, options — за вычетом уже выбранных, чтобы нельзя
 * было выбрать один и тот же элемент дважды), под ним — список чипов
 * уже выбранного с крестиком-удалением.
 */
const MultiSearchableSelect = ({ options, value, onChange, placeholder, disabled, className = "", size = "sm", theme = "auto" }: MultiSearchableSelectProps) => {
  const { t } = useTranslation();
  const isSidebar = theme === "sidebar";

  const selectedOptions = value.map((id) => options.find((o) => o.id === id)).filter((o): o is SelectOption => !!o);
  const availableOptions = options.filter((o) => !value.includes(o.id));

  const addValue = (id: number | null) => {
    if (id === null) return;
    onChange([...value, id]);
  };

  const removeValue = (id: number) => {
    onChange(value.filter((v) => v !== id));
  };

  return (
    <div className={className}>
      <SearchableSelect options={availableOptions} value={null} onChange={addValue} placeholder={placeholder ?? t("Select")} disabled={disabled} clearable={false} size={size} theme={theme} />
      {selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {selectedOptions.map((opt) => (
            <span
              key={opt.id}
              className={
                "inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-xs font-medium " +
                (isSidebar ? "bg-slate-800 border border-indigo-900 text-indigo-200" : "bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300")
              }
            >
              <span className="truncate max-w-[10rem]">{opt.label}</span>
              <button
                type="button"
                onClick={() => removeValue(opt.id)}
                className={"rounded-full p-0.5 transition-colors " + (isSidebar ? "hover:bg-slate-700 text-indigo-400 hover:text-indigo-200" : "hover:bg-indigo-100 dark:hover:bg-indigo-800 text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-200")}
                title={t("Delete")}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default MultiSearchableSelect;
