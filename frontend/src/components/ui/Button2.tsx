// frontend/src/components/ui/Button2.tsx

import React from "react";
import { playClickSound } from "../../core/utils/sound";

interface Button2Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  text?: string;

  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;

  variant?: "primary" | "secondary" | "outline" | "ghost" | "soft" | "danger" | "success" | "warning";

  size?: "xs" | "sm" | "md" | "lg" | "icon";

  isLoading?: boolean;
  isActive?: boolean;

  fullWidth?: boolean;

  dark?: boolean;
}

const sizes = {
  xs: `
    h-7
    px-2
    text-xs
  `,

  sm: `
    h-7
    px-2
    text-xs
    md:px-3
    md:text-sm
  `,

  md: `
    h-7
    px-2
    md:h-10
    md:px-4
  `,

  lg: `
    h-7
    px-2
    text-sm
    md:h-12
    md:px-6
    md:text-base
  `,

  icon: `
    h-9
    w-9
    md:h-10
    md:w-10
  `,
};

export const Button2: React.FC<Button2Props> = ({
  text,

  leftIcon,
  rightIcon,

  variant = "primary",
  size = "md",

  isLoading = false,
  isActive = false,

  fullWidth = false,

  dark = false,

  disabled,
  className = "",
  onClick,

  ...props
}) => {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    playClickSound();
    onClick?.(e);
  };

  const base = `
  inline-flex
  items-center
  justify-center
  gap-1.5
  md:gap-2

  rounded-lg

  font-medium

  whitespace-nowrap
  select-none

  transition-all
  duration-200

  focus-visible:outline-none
  focus-visible:ring-2
  focus-visible:ring-indigo-500/50

  active:scale-[0.97]

  disabled:pointer-events-none
  disabled:opacity-50
`;

  const lightVariants = {
    primary: `
      bg-indigo-600
      text-white
      hover:bg-indigo-700
      shadow-sm
    `,

    secondary: `
      bg-slate-100
      text-slate-800
      hover:bg-slate-200

      dark:bg-slate-800
      dark:text-slate-100
      dark:hover:bg-slate-700
    `,

    outline: `
      border
      border-slate-300
      bg-white
      text-slate-700

      hover:bg-slate-50

      dark:border-slate-700
      dark:bg-slate-900
      dark:text-slate-200
      dark:hover:bg-slate-800
    `,

    ghost: `
      text-slate-600
      hover:bg-slate-100
      hover:text-slate-900

      dark:text-slate-300
      dark:hover:bg-slate-800
      dark:hover:text-white
    `,

    soft: `
      bg-indigo-100
      text-indigo-700
      hover:bg-indigo-200

      dark:bg-indigo-950
      dark:text-indigo-300
      dark:hover:bg-indigo-900
    `,

    success: `
      bg-emerald-600
      text-white
      hover:bg-emerald-700
    `,

    warning: `
      bg-amber-500
      text-white
      hover:bg-amber-600
    `,

    danger: `
      bg-red-600
      text-white
      hover:bg-red-700
    `,
  };

  const darkVariants = {
    primary: `
      bg-indigo-800
      text-indigo-100
      hover:bg-indigo-700
      border border-indigo-700
    `,

    secondary: `
      bg-slate-800
      text-slate-100
      hover:bg-slate-700
      border border-slate-700
    `,

    outline: `
      border border-slate-700
      text-slate-200
      hover:bg-slate-800
    `,

    ghost: `
      text-slate-300
      hover:bg-slate-800
      hover:text-white
    `,

    soft: `
      bg-indigo-950
      text-indigo-300
      hover:bg-indigo-900
    `,

    success: `
      bg-emerald-900
      text-emerald-100
      hover:bg-emerald-800
    `,

    warning: `
      bg-amber-900
      text-amber-100
      hover:bg-amber-800
    `,

    danger: `
      bg-red-900
      text-red-100
      hover:bg-red-800
    `,
  };

  const activeStyles = dark
    ? `
        bg-indigo-700
        text-white
        border border-indigo-600
      `
    : `
        bg-indigo-600
        text-white
        border border-indigo-600
      `;

  return (
    <button
      {...props}
      disabled={disabled || isLoading}
      onClick={handleClick}
      className={`
        ${base}
        ${sizes[size]}
        ${fullWidth ? "w-full" : ""}

        ${isActive ? activeStyles : dark ? darkVariants[variant] : lightVariants[variant]}

        ${className}
      `}
    >
      {isLoading ? (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />

          <path fill="currentColor" opacity="0.75" d="M4 12a8 8 0 018-8V0C5.3 0 0 5.3 0 12h4z" />
        </svg>
      ) : (
        <>
          {leftIcon}
          {text && <span>{text}</span>}
          {rightIcon}
        </>
      )}
    </button>
  );
};

export default Button2;
