// src/components/ui/PermissionCheckbox.tsx

interface PermissionCheckboxProps {
  checked: boolean;
  label: string;
  onChange: () => void;
}

export const PermissionCheckbox = ({ checked, label, onChange }: PermissionCheckboxProps) => {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`
        flex items-center gap-2
        px-3 py-2 rounded-xl
        border transition-all duration-200
        ${checked ? "bg-indigo-50 border-indigo-500 text-indigo-600 dark:bg-indigo-950/30" : "bg-white border-slate-200 hover:border-indigo-300 dark:bg-slate-800 dark:border-slate-700"}
      `}
    >
      <div
        className={`
          w-5 h-5 rounded-md border flex items-center justify-center
          ${checked ? "bg-indigo-500 border-indigo-500 text-white" : "border-slate-300"}
        `}
      >
        {checked && (
          <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.25 7.25a1 1 0 01-1.415 0l-3.25-3.25a1 1 0 011.414-1.415l2.543 2.543 6.543-6.543a1 1 0 011.415 0z" clipRule="evenodd" />
          </svg>
        )}
      </div>

      <span className="text-sm font-medium">{label}</span>
    </button>
  );
};
