// frontend/src/core/router/GlobalAdminRoute.tsx
import React, { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { getTenantInfo } from "../utils/tenant";
import { api } from "../api/axiosInstance";
import { ROUTES } from "./routes";

export const GlobalAdminRoute: React.FC = () => {
  const { isSubdomain } = getTenantInfo();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    // Если мы на поддомене (например, vector.localhost) — глобальной админки тут БЫТЬ НЕ МОЖЕТ
    if (isSubdomain) {
      setIsAdmin(false);
      return;
    }

    // Если мы на главном домене, стучимся на бэкенд и проверяем глобальную роль
    api
    //   .get("/api/users/check-global-admin/")
      .get("users/check-global-admin/")
      .then(() => setIsAdmin(true))
      .catch(() => setIsAdmin(false));
  }, [isSubdomain]);

  // Пока идет запрос к бэкенду — показываем загрузку
  if (isAdmin === null) {
    return <div className="p-8 text-center text-gray-500">Проверка прав владельца SaaS...</div>;
  }

  // Если проверка не прошла — выкидываем на логин
  if (!isAdmin) {
    return <Navigate to={ROUTES.AUTH.LOGIN} replace />;
  }

  return <Outlet />;
};
