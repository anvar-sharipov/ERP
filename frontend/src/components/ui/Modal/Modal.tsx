// frontend/src/components/ui/Modal/Modal.tsx
import React, { useRef, useEffect, useState, useCallback } from "react";
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

// ✅ Минимум столько px модалки должно оставаться в пределах viewport по каждой
// стороне при перетаскивании — гарантирует, что заголовок всегда можно ухватить
// повторно, даже если окно утащили почти целиком за край экрана.
const DRAG_EDGE_MARGIN = 60;

interface DragState {
  dragging: boolean;
  startMouseX: number;
  startMouseY: number;
  startPosX: number;
  startPosY: number;
  // "Домашняя" позиция окна (без учёта текущего смещения position) — точка
  // отсчёта, от которой считаются границы перетаскивания.
  naturalLeft: number;
  naturalTop: number;
  width: number;
  height: number;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = "md", closeOnOutsideClick = true }) => {
  const modalRef = useRef<HTMLDivElement>(null);

  // ✅ Перетаскивание окна за заголовок — реализовано через CSS transform
  // (смещение от изначальной, центрированной flex-контейнером позиции), а не
  // через left/top, поэтому не нужно вручную вычислять исходные координаты.
  // Ресайза нет по требованию — только перемещение.
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragState = useRef<DragState | null>(null);

  // Сбрасываем позицию при каждом открытии — иначе модалка "запомнит" сдвиг
  // с прошлого открытия, что неожиданно для пользователя.
  useEffect(() => {
    if (isOpen) setPosition({ x: 0, y: 0 });
  }, [isOpen]);

  const handleHeaderMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return; // только левая кнопка мыши
      if (!modalRef.current) return;
      e.preventDefault(); // не даём браузеру выделить текст заголовка при перетаскивании

      const rect = modalRef.current.getBoundingClientRect();
      dragState.current = {
        dragging: true,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startPosX: position.x,
        startPosY: position.y,
        naturalLeft: rect.left - position.x,
        naturalTop: rect.top - position.y,
        width: rect.width,
        height: rect.height,
      };
      setIsDragging(true);
    },
    [position],
  );

  // ✅ Слушатели на window (а не на заголовке) — мышь двигается быстрее, чем
  // курсор остаётся строго над заголовком, обычный onMouseMove на элементе
  // потерял бы перетаскивание при резком движении.
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const ds = dragState.current;
      if (!ds || !ds.dragging) return;

      const nextX = ds.startPosX + (e.clientX - ds.startMouseX);
      const nextY = ds.startPosY + (e.clientY - ds.startMouseY);

      // Границы экрана — не даём утащить окно так, чтобы заголовок стал
      // полностью недоступен для повторного захвата.
      const minLeft = DRAG_EDGE_MARGIN - ds.width;
      const maxLeft = window.innerWidth - DRAG_EDGE_MARGIN;
      const minTop = DRAG_EDGE_MARGIN - ds.height;
      const maxTop = window.innerHeight - DRAG_EDGE_MARGIN;

      const clampedLeft = Math.min(Math.max(ds.naturalLeft + nextX, minLeft), maxLeft);
      const clampedTop = Math.min(Math.max(ds.naturalTop + nextY, minTop), maxTop);

      setPosition({ x: clampedLeft - ds.naturalLeft, y: clampedTop - ds.naturalTop });
    };

    const handleMouseUp = () => {
      if (dragState.current) dragState.current.dragging = false;
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

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

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const focusable = Array.from(modalRef.current?.querySelectorAll<HTMLElement>("input, textarea, select, button:not(.modal-close)") ?? []);
        if (focusable.length === 0) return;

        const current = document.activeElement;
        const idx = focusable.indexOf(current as HTMLElement);

        if (e.key === "ArrowDown") {
          e.preventDefault();
          const next = focusable[(idx + 1) % focusable.length];
          next?.focus();
        } else {
          e.preventDefault();
          const prev = focusable[(idx - 1 + focusable.length) % focusable.length];
          prev?.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // ✅ "Отмена"/Submit — как в стандартных диалогах ОС (Windows message box):
  // фокус по умолчанию на "Отмена", ArrowLeft/ArrowRight переключают между ней
  // и основной кнопкой действия. Работает без правок в каждой странице —
  // ищем последний футер-ряд кнопок (`class*="justify-end"`, тот самый паттерн
  // `<div className="flex justify-end gap-2 ...">`, которым уже везде оформлены
  // Cancel/Submit — см. AccountPage.tsx/WarehousesListPage.tsx/ConfirmModal.tsx),
  // первая кнопка в нём — Cancel, последняя — Submit.
  const getActionButtons = useCallback((): HTMLButtonElement[] => {
    if (!modalRef.current) return [];
    const groups = Array.from(modalRef.current.querySelectorAll<HTMLElement>('[class*="justify-end"]'));
    const footer = groups[groups.length - 1];
    if (!footer) return [];
    return Array.from(footer.querySelectorAll<HTMLButtonElement>("button:not(.modal-close):not(:disabled)"));
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const raf = requestAnimationFrame(() => {
      const buttons = getActionButtons();
      buttons[0]?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [isOpen, getActionButtons]);

  useEffect(() => {
    if (!isOpen) return;
    const handleArrowKeys = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const buttons = getActionButtons();
      if (buttons.length < 2) return;
      const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (idx === -1) return; // фокус не на Cancel/Submit — не перехватываем стрелки (например, поле ввода)
      e.preventDefault();
      const next = e.key === "ArrowRight" ? Math.min(idx + 1, buttons.length - 1) : Math.max(idx - 1, 0);
      buttons[next].focus();
    };
    document.addEventListener("keydown", handleArrowKeys);
    return () => document.removeEventListener("keydown", handleArrowKeys);
  }, [isOpen, getActionButtons]);

  // ✅ Выразительная подсветка фокуса именно на Cancel/Submit — стандартного
  // тонкого focus-visible-кольца из Button.tsx (общего для всех кнопок в
  // приложении) недостаточно, чтобы сразу бросалось в глаза, какая из двух
  // кнопок сейчас выбрана. Ставим через inline style напрямую на DOM-узлы
  // (это чужой контент — children, а не наша разметка), поэтому это
  // единственный способ подсветить их без правок в каждой странице. Двойное
  // кольцо (белый зазор + толстое индиго) — читается на любом фоне кнопки:
  // серый (secondary/Cancel), индиго (primary/Submit) или красный (danger).
  useEffect(() => {
    if (!isOpen) return;
    const buttons = getActionButtons();
    if (buttons.length === 0) return;

    const applyHighlight = (btn: HTMLButtonElement) => {
      btn.style.boxShadow = "0 0 0 3px rgba(255,255,255,0.95), 0 0 0 6px #4f46e5";
      btn.style.transform = "scale(1.06)";
      btn.style.transition = "transform 120ms ease, box-shadow 120ms ease";
      btn.style.position = "relative";
      btn.style.zIndex = "1";
    };
    const clearHighlight = (btn: HTMLButtonElement) => {
      btn.style.boxShadow = "";
      btn.style.transform = "";
    };

    const onFocus = (e: FocusEvent) => applyHighlight(e.currentTarget as HTMLButtonElement);
    const onBlur = (e: FocusEvent) => clearHighlight(e.currentTarget as HTMLButtonElement);

    buttons.forEach((btn) => {
      btn.addEventListener("focus", onFocus);
      btn.addEventListener("blur", onBlur);
    });

    return () => {
      buttons.forEach((btn) => {
        btn.removeEventListener("focus", onFocus);
        btn.removeEventListener("blur", onBlur);
        clearHighlight(btn);
      });
    };
  }, [isOpen, getActionButtons]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={handleOutsideClick}>
      <div
        ref={modalRef}
        className={`${sizeClasses[size]} w-full relative bg-white text-slate-900 dark:bg-slate-800 dark:text-white rounded-xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] border border-slate-200/80 dark:border-slate-700 p-6 pt-0 transition-all duration-300 max-h-[90vh] overflow-y-auto overflow-x-hidden`}
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
          // Отключаем transition во время перетаскивания — иначе transform-based
          // transition-all даёт заметное отставание окна от курсора при движении.
          transition: isDragging ? "none" : undefined,
        }}
      >
        {/* "Титульная строка" в духе окна Windows — она же ручка перетаскивания
            (см. handleHeaderMouseDown). sticky, чтобы оставаться на виду при
            скролле длинного содержимого модалки. */}
        <div
          className={`sticky top-0 z-10 flex items-center justify-between gap-4 -mx-6 mb-4 px-4 py-2.5 rounded-t-xl select-none
            bg-gradient-to-r from-indigo-600 to-indigo-700 dark:from-slate-900 dark:to-slate-800
            border-b border-indigo-800/60 dark:border-slate-600 shadow-sm
            ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
          onMouseDown={handleHeaderMouseDown}
        >
          {title ? <h3 className="text-sm font-semibold text-white tracking-wide truncate">{title}</h3> : <span />}
          <button
            onClick={onClose}
            onMouseDown={(e) => e.stopPropagation()}
            className="modal-close shrink-0 p-1.5 -mr-1.5 rounded-md text-indigo-100/90 hover:bg-red-600 hover:text-white active:bg-red-700 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {children}
      </div>
    </div>,
    document.body,
  );
};
