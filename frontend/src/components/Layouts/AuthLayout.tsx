// frontend/src/components/Layouts/AuthLayout.tsx
import React from "react";
import { Outlet } from "react-router-dom";
import { LanguageSwitcher } from "../ui/LanguageSwitcher";
import { ThemeToggle } from "../ui/ThemeToggle";

const AuthLayout: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 px-4 sm:px-6 lg:px-8 relative">
      {/* Кнопки переключения темы и языка в верхнем углу экрана */}
      <div className="absolute top-4 right-4 flex items-center gap-3">
        <ThemeToggle />
        <LanguageSwitcher />
      </div>

      {/* Карточка формы */}
      <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-xl">
        <Outlet />
      </div>
    </div>
  );
};

export default AuthLayout;
