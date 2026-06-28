import { ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";

export interface DropdownOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface DropdownProps {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

export default function Dropdown({ value, options, onChange, disabled }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="
          w-full flex items-center justify-between
          px-2 py-1.5 text-sm
          border border-gray-300 dark:border-slate-600
          rounded-lg
          bg-white dark:bg-slate-700
        "
      >
        <div className="flex items-center gap-2">
          {selected?.icon}
          <span>{selected?.label}</span>
        </div>

        <ChevronDown className={`w-4 h-4 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          className="
            absolute z-50 mt-1 w-full
            bg-white dark:bg-slate-800
            border border-gray-200 dark:border-slate-600
            rounded-lg shadow-lg
          "
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className="
                w-full px-3 py-2
                flex items-center gap-2
                text-left
                hover:bg-gray-100
                dark:hover:bg-slate-700
              "
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
