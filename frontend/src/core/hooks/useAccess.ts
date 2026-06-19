// src/core/hooks/useAccess.ts
import { useUser } from "../context/UserContext";

export const useAccess = () => {
  const { user, isLoading } = useUser();

  const hasPermission = (resource: string, action: string): boolean => {
    if (!user) return false
    if (user.is_superuser) return true
    if (!user.permissions) return false

    return user.permissions.includes(`${resource}.${action}`)
  };

  return {
    user,
    isLoading,
    hasPermission,
  };
};

// // // frontenr/src/core/useAccess.ts
// import { useUser } from "../context/UserContext";

// export const useAccess = () => {
//   const { user, isLoading } = useUser();

//   const hasPermission = (
//     resource: string,
//     action: string
//   ) => {
//     if (user?.is_superuser) return true;

//     return (
//       user?.permissions?.includes(
//         `${resource}.${action}`
//       ) ?? false
//     );
//   };

//   return {
//     user,
//     isLoading,
//     hasPermission,
//   };
// };
