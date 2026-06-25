// components/ui/SearchableSelect.tsx
import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import { ChevronDown, X, Search } from "lucide-react";

export interface SelectOption {
  id: number;
  label: string;
  sublabel?: string;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: number | null;
  onChange: (id: number | null) => void;
  /** Вызывается после выбора элемента (Enter/клик) — используется для перевода фокуса */
  onSelect?: (id: number) => void;
  /** Вызывается при нажатии ↑ на первом элементе или когда список пустой и нажат ↑ */
  onArrowUpFirst?: () => void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  className?: string;
}

export interface SearchableSelectHandle {
  /** Открыть дропдаун и сфокусировать инпут поиска */
  open: () => void;
  /** Очистить поиск и закрыть */
  clear: () => void;
  /** Сфокусировать триггер */
  focus: () => void;
}

const SearchableSelect = forwardRef<SearchableSelectHandle, SearchableSelectProps>(
  ({ options, value, onChange, onSelect, onArrowUpFirst, placeholder = "— выберите —", disabled = false, clearable = true, className = "" }, ref) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const itemRefs = useRef<(HTMLLIElement | null)[]>([]);

    const selected = options.find((o) => o.id === value) ?? null;

    const filtered = search.trim() ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()) || o.sublabel?.toLowerCase().includes(search.toLowerCase())) : options;

    // Expose методы наружу
    useImperativeHandle(ref, () => ({
      open: () => {
        setOpen(true);
        setSearch("");
        setTimeout(() => inputRef.current?.focus(), 50);
      },
      clear: () => {
        onChange(null);
        setSearch("");
        setOpen(false);
      },
      focus: () => {
        triggerRef.current?.focus();
      },
    }));

    // Сброс подсветки при изменении поиска
    useEffect(() => {
      setHighlightedIndex(-1);
      itemRefs.current = [];
    }, [search]);

    // Скролл к подсвеченному элементу
    useEffect(() => {
      if (highlightedIndex >= 0 && itemRefs.current[highlightedIndex]) {
        itemRefs.current[highlightedIndex]?.scrollIntoView({ block: "nearest" });
      }
    }, [highlightedIndex]);

    

    

    // Закрытие при клике вне
    useEffect(() => {
      const handler = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setOpen(false);
          setSearch("");
          setHighlightedIndex(-1);
        }
      };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, []);

    // Фокус на инпут при открытии
    useEffect(() => {
      if (open) {
        if (value !== null) {
          const idx = filtered.findIndex((o) => o.id === value);
          setHighlightedIndex(idx);
        }
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    }, [open]);

    const doOpen = () => {
      if (disabled) return;
      setOpen((prev) => !prev);
      setSearch("");
    };

    const doSelect = (id: number) => {
      onChange(id);
      setOpen(false);
      setSearch("");
      setHighlightedIndex(-1);
      onSelect?.(id);
    };

    const handleClear = (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange(null);
      setSearch("");
    };

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (!open) return;

        switch (e.key) {
          case "ArrowDown":
            e.preventDefault();
            setHighlightedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
            break;

          case "ArrowUp":
            e.preventDefault();
            setHighlightedIndex((prev) => {
              if (prev <= 0) {
                // На первом элементе — вызываем колбэк наружу
                onArrowUpFirst?.();
                return prev;
              }
              return prev - 1;
            });
            break;

          case "Enter":
            e.preventDefault();
            if (highlightedIndex >= 0 && filtered[highlightedIndex]) {
              doSelect(filtered[highlightedIndex].id);
            } else if (filtered.length === 1) {
              doSelect(filtered[0].id);
            }
            break;

          case "Escape":
            setOpen(false);
            setSearch("");
            setHighlightedIndex(-1);
            break;

          case "Tab":
            setOpen(false);
            setSearch("");
            setHighlightedIndex(-1);
            break;
        }
      },
      [open, filtered, highlightedIndex, onArrowUpFirst],
    );

    const baseClass =
      "w-full flex items-center justify-between gap-2 px-2 py-1.5 text-sm " +
      "border border-gray-300 dark:border-slate-600 rounded-lg " +
      "bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 " +
      "focus:outline-none focus:ring-2 focus:ring-indigo-500 " +
      "transition-colors cursor-pointer select-none " +
      (disabled ? "opacity-50 cursor-not-allowed" : "hover:border-indigo-400 dark:hover:border-indigo-500");

    return (
      <div ref={containerRef} className={`relative ${className}`}>
        {/* ── Trigger ── */}
        <div
          ref={triggerRef}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          tabIndex={disabled ? -1 : 0}
          className={baseClass}
          onClick={doOpen}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") doOpen();
            if (e.key === "ArrowDown" && !open) doOpen();
          }}
        >
          <span className={`flex-1 truncate ${selected ? "" : "text-gray-400 dark:text-gray-500"}`}>{selected ? selected.label : placeholder}</span>

          <div className="flex items-center gap-1 shrink-0">
            {clearable && selected && !disabled && (
              <button type="button" onClick={handleClear} className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors rounded" tabIndex={-1} title="Очистить">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
          </div>
        </div>

        {/* ── Dropdown ── */}
        {open && (
          <div className={"absolute z-[9999] mt-1 w-full min-w-[220px] " + "bg-white dark:bg-slate-800 " + "border border-gray-200 dark:border-slate-600 " + "rounded-lg shadow-lg overflow-hidden"}>
            {/* Поиск */}
            <div className="p-2 border-b border-gray-100 dark:border-slate-700">
              <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600">
                <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Поиск..."
                  className="flex-1 text-sm bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400"
                />
                {search && (
                  <button type="button" onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600 transition-colors" tabIndex={-1}>
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500 px-1">↑↓ навигация · Enter выбрать · Esc закрыть</p>
            </div>

            {/* Список */}
            <ul ref={listRef} role="listbox" className="max-h-56 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-4 text-center text-sm text-gray-400">Ничего не найдено</li>
              ) : (
                filtered.map((opt, idx) => {
                  const isHighlighted = idx === highlightedIndex;
                  const isSelected = opt.id === value;
                  return (
                    <li
                      key={opt.id}
                      ref={(el) => {
                        itemRefs.current[idx] = el;
                      }}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => doSelect(opt.id)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={
                        "flex flex-col px-3 py-2 cursor-pointer text-sm transition-colors " +
                        (isHighlighted
                          ? "bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300"
                          : isSelected
                            ? "bg-indigo-50/50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400"
                            : "text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-slate-700")
                      }
                    >
                      <span className="font-medium truncate">{opt.label}</span>
                      {opt.sublabel && <span className="text-xs text-gray-400 dark:text-gray-500 truncate">{opt.sublabel}</span>}
                    </li>
                  );
                })
              )}
            </ul>

            {search && filtered.length > 0 && <div className="px-3 py-1.5 border-t border-gray-100 dark:border-slate-700 text-xs text-gray-400">Найдено: {filtered.length}</div>}
          </div>
        )}
      </div>
    );
  },
);

SearchableSelect.displayName = "SearchableSelect";
export default SearchableSelect;
