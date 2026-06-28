interface CheckboxCardProps {
  checked: boolean;
  label: string;
  onChange: () => void;
  disabled?: boolean;
}

export const CheckboxCard = ({ checked, label, onChange, disabled = false }: CheckboxCardProps) => {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onChange}
      className={`
        w-full flex items-center gap-3 p-3 rounded-lg border transition-all
        ${checked ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 dark:border-indigo-400" : "border-gray-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/50"}
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
      `}
    >
      <div
        className={`
          w-5 h-5 rounded border flex items-center justify-center transition-all
          ${checked ? "bg-indigo-500 border-indigo-500" : "border-gray-400 dark:border-slate-500"}
        `}
      >
        {checked && (
          <svg className="w-3 h-3 text-white" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.414 0l-3-3a1 1 0 111.414-1.42L8.5 12.09l6.796-6.8a1 1 0 011.408 0z" clipRule="evenodd" />
          </svg>
        )}
      </div>

      <span className="text-sm text-gray-900 dark:text-gray-100">{label}</span>
    </button>
  );
};
