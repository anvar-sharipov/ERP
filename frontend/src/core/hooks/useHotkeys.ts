import { useEffect } from "react";

export function useHotkeys() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
    //   const target = e.target as HTMLElement;

      // ❌ блокируем только ввод текста
    //   const isTyping =
    //     target instanceof HTMLInputElement ||
    //     target instanceof HTMLTextAreaElement ||
    //     target instanceof HTMLSelectElement ||
    //     target.isContentEditable;

    //   if (isTyping) return;

      // ✅ INSERT — глобально
      if (e.key === "Insert") {
        e.preventDefault();

        window.dispatchEvent(
          new CustomEvent("hotkey:insert")
        );
      }

      // Ctrl+1...Ctrl+9
      if (e.ctrlKey && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("hotkey:tab:index", { detail: { index: parseInt(e.key) - 1 } })
        );
      }
    };

    window.addEventListener("keydown", handler);

    return () => window.removeEventListener("keydown", handler);
  }, []);
}