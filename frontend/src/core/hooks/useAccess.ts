
// // frontenr/src/core/useAccess.ts
import { useUser } from "../context/UserContext";

export const useAccess = () => {
  const { user, isLoading } = useUser();

  const hasPermission = (
    resource: string,
    action: string
  ) => {
    if (user?.is_superuser) return true;

    return (
      user?.permissions?.includes(
        `${resource}.${action}`
      ) ?? false
    );
  };

  return {
    user,
    isLoading,
    hasPermission,
  };
};
