import { useAccess } from "./useAccess";

// frontend/src/core/hooks
export const usePageAccess = (resource: string) => {
  const { hasPermission } = useAccess();
  return {
    canView: hasPermission(resource, "GET"),
    canPost: hasPermission(resource, "POST"),
    canPut: hasPermission(resource, "PUT"),
    canDelete: hasPermission(resource, "DELETE"),
    canPatch: hasPermission(resource, "PATCH"),
  };
};

// Пример В AccountPage.tsx
// const { canView, canPost, canPut, canDelete } = usePageAccess("account");