// frontend/src/core/hooks/usePageHotkeys.ts

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNotify } from "../context/NotificationContext";

interface PageHotkeyOptions {
  onInsert?: () => void;       // Insert — создать
  onDelete?: () => void;       // Delete — удалить выбранное  
  canPost?: boolean;           // если false — покажет ошибку вместо onInsert
  canDelete?: boolean;         // если false — покажет ошибку вместо onDelete
}

export function usePageHotkeys({
  onInsert,
  onDelete,
  canPost = true,
  canDelete = true,
}: PageHotkeyOptions) {
  const { t } = useTranslation();
  const notify = useNotify();

  // Ref чтобы не пересоздавать listener при каждом рендере
  const optsRef = useRef({ onInsert, onDelete, canPost, canDelete, t, notify });
  useEffect(() => {
    optsRef.current = { onInsert, onDelete, canPost, canDelete, t, notify };
  });

  useEffect(() => {
    const handleInsert = () => {
      const { onInsert, canPost, t, notify } = optsRef.current;
      if (!onInsert) return;
      if (!canPost) {
        notify("error", t("InsufficientRights"));
        return;
      }
      onInsert();
    };

    const handleDelete = () => {
      const { onDelete, canDelete, t, notify } = optsRef.current;
      if (!onDelete) return;
      if (!canDelete) {
        notify("error", t("InsufficientRights"));
        return;
      }
      onDelete();
    };

    window.addEventListener("hotkey:insert", handleInsert);
    window.addEventListener("hotkey:delete", handleDelete);

    return () => {
      window.removeEventListener("hotkey:insert", handleInsert);
      window.removeEventListener("hotkey:delete", handleDelete);
    };
  }, []); // стабильно — opts читаем через ref
}