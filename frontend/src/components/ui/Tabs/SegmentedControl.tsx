// frontend/src/components/ui/SegmentedControl.tsx
import { playClickSound } from "../../../core/utils/sound";


interface Option<T> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export const SegmentedControl = <T extends string | number>({ options, value, onChange, className }: SegmentedControlProps<T>) => {
  return (
    <div className={`flex p-1 bg-gray-200 dark:bg-slate-900 rounded-lg w-fit border border-gray-300 dark:border-slate-700 ${className}`}>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => {
            playClickSound();
            onChange(option.value);
          }}
          className={`px-1.5 py-1 md:px-4 md:py-1 font-medium rounded-md transition-all duration-200 ${
            value === option.value ? "bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};
