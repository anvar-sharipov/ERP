import React, { forwardRef } from "react";

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(({ label, error, className = "", ...props }, ref) => {
  return (
    <div className={`flex flex-col gap-1.5 w-full ${className}`}>
      {label && <label className="text-xs font-semibold text-gray-500 dark:text-indigo-400/80 uppercase tracking-wider ml-1">{label}</label>}
      <textarea
        ref={ref}
        className={`
            w-full px-3 py-2 rounded-lg border transition-all duration-200 outline-none
            shadow-sm bg-white dark:bg-slate-950 text-gray-900 dark:text-indigo-100
            placeholder:text-gray-400 dark:placeholder:text-slate-500
            ${
              error
                ? "border-red-300 dark:border-red-900/60 focus:border-red-500 dark:focus:border-red-700"
                : "border-slate-400 dark:border-indigo-900/50 focus:border-indigo-500 dark:focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20"
            }
          `}
        {...props}
      />
      {error && <span className="text-[10px] text-red-500 ml-1 font-medium">{error}</span>}
    </div>
  );
});

TextArea.displayName = "TextArea";
