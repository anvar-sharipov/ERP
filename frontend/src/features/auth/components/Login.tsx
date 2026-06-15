// frontend/src/features/auth/components/Login.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../core/api/axiosInstance";
import { API_ENDPOINTS } from "../../../core/api/endpoints";
import { ROUTES } from "../../../core/router/routes";
import { getTenantInfo } from "../../../core/utils/tenant";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { LogIn, User, Key } from "lucide-react";

export const Login: React.FC = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const { isSubdomain } = getTenantInfo();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const loginEndpoint = isSubdomain ? API_ENDPOINTS.AUTH.LOGIN : API_ENDPOINTS.AUTH.SUPERUSER_LOGIN;

    try {
      const response = await api.post(loginEndpoint, { username, password });
      const { access, refresh } = response.data;

      localStorage.setItem("access_token", access);
      localStorage.setItem("refresh_token", refresh);
      localStorage.setItem("session_expires_at", String(Date.now() + 2 * 60 * 1000));

      if (!isSubdomain) {
        navigate("/admin-panel", { replace: true });
      } else {
        navigate(ROUTES.APP.DASHBOARD, { replace: true });
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || "Ошибка авторизации");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      {/* Убрали text-gray-900 dark:text-white — цвет подхватится из body автоматически */}
      <h2 className="text-3xl font-extrabold text-center mb-8 tracking-tight">{isSubdomain ? "Вход в систему" : "Глобальный вход SaaS"}</h2>

      {/* Ошибки оставляем явными, у них кастомный системный цвет */}
      {error && <div className="p-3 mb-6 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm rounded-lg text-center">{error}</div>}

      <form onSubmit={handleLogin} className="space-y-6">
        <Input label="Логин" leftIcon={<User className="w-4 h-4" />} value={username} onChange={(e) => setUsername(e.target.value)} />

        <Input label="Пароль" leftIcon={<Key className="w-4 h-4" />} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />

        <Button text="Войти" icon={<LogIn className="w-4 h-4" />} isLoading={loading} className="w-full" />
      </form>
    </div>
  );
};
