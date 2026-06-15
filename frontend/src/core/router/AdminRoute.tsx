// // frontend/src/core/router/AdminRoute.tsx
import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAccess } from "../hooks/useAccess";
import { ROUTES } from "./routes";

export const AdminRoute: React.FC = () => {
  const { hasPermission, isLoading } = useAccess();

  if (isLoading) return null;

  if (!hasPermission("user", "GET")) {
    return <Navigate to={ROUTES.APP.DASHBOARD} replace />;
  }

  return <Outlet />;
};

// import React from "react";
// import { Navigate, Outlet } from "react-router-dom";
// import { useAccess } from "../hooks/useAccess";
// import { ROUTES } from "./routes";

// export const AdminRoute: React.FC = () => {
//   const { isAdmin, isSuperUser, isLoading } = useAccess();

//   if (isLoading) return null; // или <Spinner />

//   if (!isAdmin && !isSuperUser) {
//     return <Navigate to={ROUTES.APP.DASHBOARD} replace />;
//   }

//   return <Outlet />;
// };
