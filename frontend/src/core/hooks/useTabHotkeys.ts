// frontend/src/core/hooks/useTabHotkeys.ts
import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";

interface TabItem {
  to: string;
  label: string;
}

export function useTabHotkeys(items: TabItem[]) {
  const navigate = useNavigate();
  const location = useLocation();
  const ref = useRef({ items, navigate, location });

  useEffect(() => {
    ref.current = { items, navigate, location };
  });

  useEffect(() => {
    const onIndex = (e: Event) => {
      const { items, navigate } = ref.current;
      const idx = (e as CustomEvent).detail.index;
      if (idx < items.length) {
        navigate(items[idx].to);
      }
    };

    window.addEventListener("hotkey:tab:index", onIndex);
    return () => window.removeEventListener("hotkey:tab:index", onIndex);
  }, []);
}