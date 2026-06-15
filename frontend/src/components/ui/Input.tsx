// import React, { useState } from "react";
// import { X, Eye, EyeOff } from "lucide-react";
// import { forwardRef, type InputHTMLAttributes } from "react";

// interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
//   label?: string;
//   error?: string;
//   leftIcon?: React.ReactNode;
//   rightIcon?: React.ReactNode;
//   onClear?: () => void;
// }

// export const Input: React.FC<InputProps> = ({ label, error, leftIcon, rightIcon, onClear, className = "", value, onChange, type = "text", ...props }) => {
//   const [showPassword, setShowPassword] = useState(false);

//   const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
//     if (e.key === "Escape" && onClear) onClear();
//     props.onKeyDown?.(e);
//   };

//   // Определяем тип инпута: если пароль и showPassword === true, то text
//   const isPassword = type === "password";
//   const inputType = isPassword ? (showPassword ? "text" : "password") : type;

//   return (
//     <div className={`flex flex-col gap-1.5 w-full ${className} print:hidden`}>
//       {label && <label className="text-xs font-semibold text-gray-500 dark:text-indigo-400/80 uppercase tracking-wider ml-1">{label}</label>}
//       <div className="relative flex items-center">
//         {leftIcon && <div className="absolute left-3 text-gray-400 dark:text-indigo-500">{leftIcon}</div>}

//         <input
//           type={inputType}
//           value={value}
//           onChange={onChange}
//           onKeyDown={handleKeyDown}
//           className={`
//             w-full px-3 py-2 rounded-lg border transition-all duration-200 outline-none
//             bg-white dark:bg-slate-950 text-gray-900 dark:text-indigo-100
//             placeholder:text-gray-400 dark:placeholder:text-slate-500
//             ${leftIcon ? "pl-10" : ""}
//             ${rightIcon || (onClear && value) || isPassword ? "pr-10" : "pr-3"}
//             ${
//               error
//                 ? "border-red-300 dark:border-red-900/60 focus:border-red-500 dark:focus:border-red-700"
//                 : "border-gray-300 dark:border-indigo-900/50 focus:border-indigo-500 dark:focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
//             }
//           `}
//           {...props}
//         />

//         <div className="absolute right-2 flex items-center gap-1">
//           {/* Кнопка очистки */}
//           {onClear && value && (
//             <button type="button" onClick={onClear} className="p-1 rounded-full text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-indigo-900/40 transition-all cursor-pointer">
//               <X size={14} />
//             </button>
//           )}

//           {/* Кнопка показа пароля */}
//           {isPassword && (
//             <button
//               type="button"
//               onClick={() => setShowPassword(!showPassword)}
//               className="p-1 rounded-full text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-all cursor-pointer"
//             >
//               {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
//             </button>
//           )}

//           {/* Внешняя иконка (если не пароль и не очистка) */}
//           {rightIcon && !(onClear && value) && !isPassword && <div className="mr-1 text-gray-400 dark:text-indigo-500">{rightIcon}</div>}
//         </div>
//       </div>
//       {error && <span className="text-[10px] text-red-500 ml-1 font-medium">{error}</span>}
//     </div>
//   );
// };

// // import React, { useRef, useEffect } from "react";
// // import { X } from "lucide-react"; // Импортируйте иконку X из lucide-react

// // interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
// //   label?: string;
// //   error?: string;
// //   leftIcon?: React.ReactNode;
// //   rightIcon?: React.ReactNode;
// //   onClear?: () => void; // Новый проп для очистки
// // }

// // export const Input: React.FC<InputProps> = ({ label, error, leftIcon, rightIcon, onClear, className = "", value, onChange, ...props }) => {
// //   // Обработка клавиши Esc
// //   const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
// //     if (e.key === "Escape" && onClear) {
// //       onClear();
// //     }
// //     props.onKeyDown?.(e);
// //   };

// //   return (
// //     <div className={`flex flex-col gap-1.5 w-full ${className}`}>
// //       {label && <label className="text-xs font-semibold text-gray-500 dark:text-indigo-400/80 uppercase tracking-wider ml-1">{label}</label>}
// //       <div className="relative flex items-center">
// //         {leftIcon && <div className="absolute left-3 text-gray-400 dark:text-indigo-500">{leftIcon}</div>}

// //         <input
// //           value={value}
// //           onChange={onChange}
// //           onKeyDown={handleKeyDown}
// //           className={`
// //             w-full px-3 py-2 rounded-lg border transition-all duration-200 outline-none
// //             bg-white dark:bg-slate-950 text-gray-900 dark:text-indigo-100
// //             placeholder:text-gray-400 dark:placeholder:text-slate-500
// //             ${leftIcon ? "pl-10" : ""}
// //             ${rightIcon || (onClear && value) ? "pr-10" : "pr-3"}
// //             ${
// //               error
// //                 ? "border-red-300 dark:border-red-900/60 focus:border-red-500 dark:focus:border-red-700"
// //                 : "border-gray-300 dark:border-indigo-900/50 focus:border-indigo-500 dark:focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
// //             }
// //           `}
// //           {...props}
// //         />

// //         {/* Логика отображения иконок справа */}
// //         <div className="absolute right-2 flex items-center">
// //           {onClear && value && (
// //             <button
// //               type="button"
// //               onClick={onClear}
// //               className="p-1 rounded-full text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-indigo-900/40 dark:hover:text-indigo-200 transition-all duration-200 cursor-pointer"
// //             >
// //               <X size={14} />
// //             </button>
// //           )}
// //           {rightIcon && !(onClear && value) && <div className="mr-1 text-gray-400 dark:text-indigo-500">{rightIcon}</div>}
// //         </div>
// //       </div>
// //       {error && <span className="text-[10px] text-red-500 ml-1 font-medium">{error}</span>}
// //     </div>
// //   );
// // };

import React, { useState, forwardRef } from "react";
import { X, Eye, EyeOff } from "lucide-react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onClear?: () => void;
}

// 1. Используем forwardRef для проброса рефа
export const Input = forwardRef<HTMLInputElement, InputProps>(({ label, error, leftIcon, rightIcon, onClear, className = "", value, onChange, type = "text", ...props }, ref) => {
  const [showPassword, setShowPassword] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && onClear) onClear();
    props.onKeyDown?.(e);
  };

  const isPassword = type === "password";
  const inputType = isPassword ? (showPassword ? "text" : "password") : type;

  return (
    <div className={`flex flex-col gap-1.5 w-full ${className} print:hidden`}>
      {label && <label className="text-xs font-semibold text-gray-500 dark:text-indigo-400/80 uppercase tracking-wider ml-1">{label}</label>}
      <div className="relative flex items-center">
        {leftIcon && <div className="absolute left-3 text-gray-400 dark:text-indigo-500">{leftIcon}</div>}

        <input
          // 2. Передаем ref в стандартный input
          ref={ref}
          type={inputType}
          value={value}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          className={`
              w-full px-3 py-2 rounded-lg border transition-all duration-200 outline-none
              bg-white dark:bg-slate-950 text-gray-900 dark:text-indigo-100 
              placeholder:text-gray-400 dark:placeholder:text-slate-500
              ${leftIcon ? "pl-10" : ""}
              ${rightIcon || (onClear && value) || isPassword ? "pr-10" : "pr-3"}
              ${
                error
                  ? "border-red-300 dark:border-red-900/60 focus:border-red-500 dark:focus:border-red-700"
                  : "border-gray-300 dark:border-indigo-900/50 focus:border-indigo-500 dark:focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
              }
            `}
          {...props}
        />

        <div className="absolute right-2 flex items-center gap-1">
          {onClear && value && (
            <button type="button" onClick={onClear} className="p-1 rounded-full text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-indigo-900/40 transition-all cursor-pointer">
              <X size={14} />
            </button>
          )}

          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="p-1 rounded-full text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-all cursor-pointer"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          )}

          {rightIcon && !(onClear && value) && !isPassword && <div className="mr-1 text-gray-400 dark:text-indigo-500">{rightIcon}</div>}
        </div>
      </div>
      {error && <span className="text-[10px] text-red-500 ml-1 font-medium">{error}</span>}
    </div>
  );
});

Input.displayName = "Input";
