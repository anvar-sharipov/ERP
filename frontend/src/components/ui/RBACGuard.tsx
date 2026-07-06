import { type ReactNode } from "react";
import { Loader } from "./Loader";
import ErrMsg from "./ErrMsg";

interface RBACGuardProps {
  children: ReactNode;
  isLoading?: boolean;
  canView?: boolean;
  forbiddenText?: string;
  error?: any; // Добавляем пропс для ошибки
  // ✅ Что именно сейчас загружается / доля выполненного — см. Loader.tsx.
  // Необязательные — если не передать, поведение не меняется (просто спиннер).
  loadingText?: string;
  loadingProgress?: number | "indeterminate";
}

export const RBACGuard = ({ children, isLoading = false, canView = true, forbiddenText = "Доступ запрещён", error, loadingText, loadingProgress }: RBACGuardProps) => {
  if (isLoading) {
    return <Loader containerClass="mx-auto mt-20" text={loadingText} progress={loadingProgress} />;
  }

  // Если сервер вернул ошибку, приоритет за ошибкой
  if (error) {
    return <ErrMsg error={error} defaultText={error.response?.status === 403 ? forbiddenText : undefined} />;
  }

  // Если прав нет по мнению фронтенда
  if (!canView) {
    return <ErrMsg error={{ response: { status: 403 } }} defaultText={forbiddenText} />;
  }

  return <>{children}</>;
};
