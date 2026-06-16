

import React from "react";
import { playClickSound } from "../../core/utils/sound";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  text?: string;
  icon?: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "1c" | "danger";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  dark?: boolean; // Новый проп
  isActive?: boolean;
}

const sizes = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-1 py-0.5 md:px-3 md:py-1.5 text-sm",
  lg: "px-6 py-2 text-base",
};

export const Button: React.FC<ButtonProps> = ({
  text,
  icon,
  variant = "primary",

  className = "",
  isLoading = false,
  disabled,
  dark = false, // По умолчанию false
  isActive = false,
  onClick,
  size = "md",
  ...props
}) => {
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    playClickSound(); // Воспроизводим звук
    if (onClick) {
      onClick(event); // Вызываем оригинальный onClick, если он был передан
    }
  };

  const baseClass = "flex items-center justify-center gap-2 font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed px-1 py-0.5 md:px-3 md:py-1";
  // const baseClass = "flex items-center justify-center gap-2 font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed px-1 py-0.5 md:px-3 md:py-1";

  // Добавляем логику активного состояния
  const activeClasses = isActive ? "bg-indigo-600 !text-white hover:bg-indigo-700" : "bg-indigo-900/20 text-indigo-200 hover:bg-indigo-900/40";

  // Если dark === true, используем только "dark:" стили принудительно
  const variants = {
    primary: dark
      ? "bg-indigo-900/60 text-indigo-100 border border-indigo-500/30 hover:bg-indigo-800/60"
      : "bg-indigo-600 text-white border border-transparent hover:bg-indigo-500 dark:bg-indigo-900/60 dark:text-indigo-100 dark:border-indigo-500/30 dark:hover:bg-indigo-800/60",

    secondary: dark
      ? "bg-slate-900 text-indigo-300 border border-indigo-900 hover:border-indigo-700"
      : "bg-gray-200 text-gray-800 border border-gray-300 hover:bg-gray-300 dark:bg-slate-900 dark:text-indigo-300 dark:border-indigo-900 dark:hover:border-indigo-700",

    ghost: dark
      ? "text-indigo-400 hover:bg-indigo-900/20 hover:text-indigo-200 bg-indigo-900/70"
      : "text-gray-600 hover:bg-gray-100 bg-indigo-900 hover:text-indigo-600 dark:text-indigo-400 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-200",

    "1c": dark
      ? "bg-gray-700 text-gray-200 border border-gray-600 hover:bg-gray-600 hover:border-gray-500 active:bg-gray-500 rounded-[3px] shadow-sm"
      : "bg-[#f5f5f5] text-[#404040] border border-[#c0c0c0] hover:bg-[#e5e5e5] hover:border-[#a0a0a0] active:bg-[#dcdcdc] rounded-[3px] shadow-sm dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600",

    danger: "bg-red-600 text-white border border-red-700 hover:bg-red-700 hover:border-red-800 active:bg-red-800 rounded-[3px] shadow-sm",
  };

  return (
    <button
      // className={`${baseClass} ${variants[variant]} ${className}`}

      className={`${baseClass} ${sizes[size]} ${variant === "ghost" && isActive ? "" : variants[variant]} ${isActive ? activeClasses : ""} ${className}`}

      disabled={disabled || isLoading}
      onClick={handleClick}
      {...props}
    >
      {isLoading ? (
        <svg className="w-4 h-4 animate-spin text-current" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : (
        icon && <span className="flex items-center">{icon}</span>
      )}
      {text && <span>{text}</span>}
    </button>
  );
};
