// frontend/src/App.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AppRouter from "./core/router/AppRouter";
import { UserProvider } from "./core/context/UserContext";
import { CompanyProvider } from "./core/context/CompanyContext";
import { SidebarProvider } from "./core/context/SidebarRightContext";
import { NotificationProvider, useNotify } from "./core/context/NotificationContext";
import { useHotkeys } from "./core/hooks/useHotkeys";
import { ChatProvider } from "./features/chat/context/ChatContext";
import { MiniChat } from "./features/chat/components/MiniChat";
import { TenantBlockedScreen } from "./components/ui/TenantBlockedScreen";

const queryClient = new QueryClient();

/**
 * AppContent находится внутри BrowserRouter (через App)
 * и внутри всех необходимых провайдеров.
 */
const AppContent = () => {
  const notify = useNotify();
  const navigate = useNavigate(); // ✅ работает, BrowserRouter выше

  const [tenantBlockedMessage, setTenantBlockedMessage] = useState<string | null>(null);

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

  useEffect(() => {
    const handleTenantInactive = (e: any) => {
      setTenantBlockedMessage(e.detail?.message || null);
    };
    window.addEventListener("tenant:inactive", handleTenantInactive);
    return () => window.removeEventListener("tenant:inactive", handleTenantInactive);
  }, []);

  if (tenantBlockedMessage !== null) {
    return <TenantBlockedScreen message={tenantBlockedMessage} />;
  }

  return (
    <div className="App min-h-screen bg-gray-50 dark:bg-gray-950">
      <AppRouter />
      <MiniChat />
    </div>
  );
};

function App() {
  useHotkeys();
  return (
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        <CompanyProvider>
          <SidebarProvider>
            <NotificationProvider>
              <ChatProvider>
                {" "}
                {/* ← внутри NotificationProvider */}
                <AppContent />
              </ChatProvider>
            </NotificationProvider>
          </SidebarProvider>
        </CompanyProvider>
      </UserProvider>
    </QueryClientProvider>
  );
}

export default App;
