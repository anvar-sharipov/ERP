// frontend/src/components/ui/Modal/Modal.tsx
import React, { useRef, useEffect } from "react";
import ReactDOM from "react-dom";
import { X } from "lucide-react"; // Убедитесь, что установлен lucide-react

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  closeOnOutsideClick?: boolean;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = "md", closeOnOutsideClick = true }) => {
  const modalRef = useRef<HTMLDivElement>(null);

  // Добавляем обработчик нажатия клавиши Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleOutsideClick = (e: React.MouseEvent) => {
    if (closeOnOutsideClick && modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={handleOutsideClick}>
      <div
        ref={modalRef}
        className={`${sizeClasses[size]} w-full relative bg-white text-slate-900 dark:bg-slate-800 dark:text-white rounded-xl shadow-2xl p-6 transition-all duration-300 max-h-[90vh] overflow-y-auto`}
      >
        {/* Кнопка X */}
        <button onClick={onClose} className="absolute top-4 right-4 p-1 rounded-full text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-slate-700 transition-all cursor-pointer">
          <X size={20} />
        </button>

        {title && <h3 className="text-xl font-bold mb-4 pr-8">{title}</h3>}
        {children}
      </div>
    </div>,
    document.body,
  );
};
