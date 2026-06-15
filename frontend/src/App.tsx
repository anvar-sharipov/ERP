// // frontend/src/App.tsx
// import AppRouter from "./core/router/AppRouter";
// import { NotificationProvider, useNotify } from "./core/context/NotificationContext";
// import { SidebarProvider } from "./core/context/SidebarRightContext";
// import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// import { useEffect } from "react";
// import { UserProvider } from "./core/context/UserContext";
// import { useNavigate } from "react-router-dom";

// const queryClient = new QueryClient();

// // Отдельный компонент — внутри NotificationProvider
// const AppContent = () => {
//   const notify = useNotify();

//   useEffect(() => {
//     const handler = (e: CustomEvent) => {
//       notify("error", e.detail.message);
//     };
//     window.addEventListener("api:forbidden", handler as EventListener);
//     return () => window.removeEventListener("api:forbidden", handler as EventListener);
//   }, []);

//   return (
//     <div className="App min-h-screen bg-gray-50 dark:bg-gray-950">
//       <AppRouter />
//     </div>
//   );
// };

// function App() {
//   const navigate = useNavigate();

//   useEffect(() => {
//     const handleAuthExpired = () => {
//       // 1. Очищаем локальные данные, если нужно
//       // 2. Показываем уведомление
//       // 3. Редиректим (через useNavigate из react-router-dom)
//       navigate("/login");
//     };

//     window.addEventListener("auth:expired", handleAuthExpired);

//     return () => {
//       window.removeEventListener("auth:expired", handleAuthExpired);
//     };
//   }, [navigate]);
//   return (
//     <QueryClientProvider client={queryClient}>
//       <UserProvider>
//         <SidebarProvider>
//           <NotificationProvider>
//             <AppContent />
//           </NotificationProvider>
//         </SidebarProvider>
//       </UserProvider>
//     </QueryClientProvider>
//   );
// }

// export default App;

// frontend/src/App.tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import AppRouter from "./core/router/AppRouter";
import { UserProvider } from "./core/context/UserContext";
import { CompanyProvider } from "./core/context/CompanyContext";
import { SidebarProvider } from "./core/context/SidebarRightContext";
import { NotificationProvider, useNotify } from "./core/context/NotificationContext";

const queryClient = new QueryClient();

/**
 * AppContent находится внутри BrowserRouter (через App)
 * и внутри всех необходимых провайдеров.
 */
const AppContent = () => {
  const notify = useNotify();
  const navigate = useNavigate(); // ✅ работает, BrowserRouter выше

  useEffect(() => {
    const handleForbidden = (e: any) => {
      notify("error", e.detail.message || "У вас недостаточно прав");
    };
    window.addEventListener("api:forbidden", handleForbidden);
    return () => window.removeEventListener("api:forbidden", handleForbidden);
  }, [notify]);

  useEffect(() => {
    const handleAuthExpired = () => {
      navigate("/login");
    };
    window.addEventListener("auth:expired", handleAuthExpired);
    return () => window.removeEventListener("auth:expired", handleAuthExpired);
  }, [navigate]);

  return (
    <div className="App min-h-screen bg-gray-50 dark:bg-gray-950">
      <AppRouter />
    </div>
  );
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        <CompanyProvider>
          <SidebarProvider>
            <NotificationProvider>
              {/* Оборачиваем здесь, чтобы все дочерние компоненты (включая AppContent) 
                имели доступ к хукам React Router (useNavigate и т.д.) */}

              <AppContent />
            </NotificationProvider>
          </SidebarProvider>
        </CompanyProvider>
      </UserProvider>
    </QueryClientProvider>
  );
}

export default App;
