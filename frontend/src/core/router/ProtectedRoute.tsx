// frontend/src/core/router/ProtectedRoute.tsx
import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { getTenantInfo } from "../utils/tenant";
import { ROUTES } from "./routes";

export const ProtectedRoute: React.FC = () => {
  const token = localStorage.getItem("access_token");
  const { isSubdomain } = getTenantInfo();

  // 1. Если токена нет вообще — отправляем на логин
  if (!token) {
    return <Navigate to={ROUTES.AUTH.LOGIN} replace />;
  }

  // 2. СТРАХОВКА: Если мы НЕ на поддомене, но пытаемся залезть на рабочий дашборд
  if (!isSubdomain) {
    console.warn("Попытка доступа к клиентскому дашборду без поддомена. Перенаправление в админку.");
    // Выкидываем суперадмина туда, где ему положено быть — в панель SaaS
    return <Navigate to="/admin-panel" replace />;
  }

  // Если всё ок (токен есть + мы внутри тенанта) — показываем рабочую область
  return <Outlet />;
};

export default ProtectedRoute;
