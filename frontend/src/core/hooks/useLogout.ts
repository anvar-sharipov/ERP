// frontend/src/core/hooks/useLogout.ts
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { logoutRequest } from "../../features/auth/services/authApi";
import { useAuthStore } from "../store/authStore";
import { ROUTES } from "../router/routes";

// ✅ Раньше logout был продублирован в UserProfileBlock.tsx и AdminHeader.tsx —
// первый чистил React Query кэш (queryClient.clear()), второй нет вообще, из-за
// чего выход из системы через админ-хедер оставлял данные предыдущего
// пользователя в кэше для следующего логина в той же вкладке. Единый hook —
// один источник правды для обоих мест.
export const useLogout = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);

  return async () => {
    await logoutRequest();
    queryClient.clear();
    setAuthenticated(false);
    navigate(ROUTES.AUTH.LOGIN, { replace: true });
  };
};
