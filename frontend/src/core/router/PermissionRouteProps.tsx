import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAccess } from "../hooks/useAccess";
import { ROUTES } from "./routes";

interface PermissionRouteProps {
  resource: string;
  action: string;
}

export const PermissionRoute: React.FC<PermissionRouteProps> = ({ resource, action }) => {
  const { hasPermission, isLoading } = useAccess();

  if (isLoading) return null;

  if (!hasPermission(resource, action)) {
    return <Navigate to={ROUTES.APP.DASHBOARD} replace />;
  }

  return <Outlet />;
};
