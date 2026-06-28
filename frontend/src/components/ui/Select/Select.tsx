// components/ui/Select.tsx

interface Option {
  value: string | number;
  label: string;
}

interface SelectProps {
  label?: string;
  value: string | number | "";
  options: Option[];
  placeholder?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export const Select = ({ label, value, options, placeholder = "Выберите", onChange, disabled = false, className = "" }: SelectProps) => {
  return (
    <div className={className}>
      {label && <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</label>}

      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="
          w-full px-3 py-2 text-sm
          border border-gray-300 dark:border-slate-600
          rounded-lg
          bg-white dark:bg-slate-700
          text-gray-900 dark:text-gray-100
          focus:outline-none focus:ring-2 focus:ring-indigo-500
          transition-colors
        "
      >
        <option value="">{placeholder}</option>

        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};
