import { type ReactNode } from "react";
import { Loader } from "./Loader";
import ErrMsg from "./ErrMsg";

interface RBACGuardProps {
  children: ReactNode;
  isLoading?: boolean;
  canView?: boolean;
  forbiddenText?: string;
  error?: any; // Добавляем пропс для ошибки
}

export const RBACGuard = ({ children, isLoading = false, canView = true, forbiddenText = "Доступ запрещён", error }: RBACGuardProps) => {
  if (isLoading) {
    return <Loader containerClass="mx-auto mt-20" />;
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
