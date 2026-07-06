// frontend/src/components/ui/HelpButton.tsx
import { useState } from "react";
import { Modal } from "./Modal/Modal";

interface HelpButtonProps {
  title: string;
  children: React.ReactNode;
}

// ✅ Кнопка "?" — краткая инструкция по странице (что она делает, что делает
// каждая кнопка/элемент на ней). Ставится в actions PageHeaderText каждой новой
// страницы (см. правило в CLAUDE.md), контент — свой на каждой странице.
export const HelpButton = ({ title, children }: HelpButtonProps) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Помощь"
        className="w-6 h-6 shrink-0 flex items-center justify-center rounded-full border border-gray-300 dark:border-slate-600 text-gray-500 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-500 dark:hover:border-indigo-500 dark:hover:text-indigo-400 text-xs font-bold transition-colors"
      >
        ?
      </button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title={title} size="md">
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 [&_b]:text-gray-900 dark:[&_b]:text-white [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
          {children}
        </div>
      </Modal>
    </>
  );
};
