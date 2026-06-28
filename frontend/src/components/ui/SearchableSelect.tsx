// frontend/src/components/ui/SearchableSelect.tsx
import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown, X, Search } from "lucide-react";

export interface SelectOption {
  id: number;
  label: string;
  sublabel?: string;
  thumbnail?: string | null;
  stock?: {
    quantity: number;
    reserved: number;
    available: number;
  } | null;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: number | null;
  onChange: (id: number | null) => void;
  onSelect?: (id: number) => void;
  onArrowUpFirst?: () => void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  className?: string;
}

export interface SearchableSelectHandle {
  open: () => void;
  clear: () => void;
  focus: () => void;
}

// ── Хелпер: цвет остатка ─────────────────────────────────────────────────────

const stockColor = (available: number) => {
  if (available <= 0) return "text-red-500 dark:text-red-400";
  if (available <= 5) return "text-orange-500 dark:text-orange-400";
  return "text-emerald-600 dark:text-emerald-400";
};

const fmt3 = (n: number) => (n % 1 === 0 ? String(n) : n.toLocaleString("ru-RU", { maximumFractionDigits: 3 }));

// ── Компонент остатка ─────────────────────────────────────────────────────────

const StockBadge = ({ stock }: { stock: NonNullable<SelectOption["stock"]> }) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1.5 text-[10px] mt-0.5">
      <span className="text-gray-400">
        {t("InStock")}: {fmt3(stock.quantity)}
      </span>
      {stock.reserved > 0 && (
        <span className="text-orange-400">
          −{fmt3(stock.reserved)} {t("Reserved")}
        </span>
      )}
      <span className={`font-semibold ${stockColor(stock.available)}`}>= {fmt3(stock.available)}</span>
    </div>
  );
};

// ── Основной компонент ────────────────────────────────────────────────────────

const SearchableSelect = forwardRef<SearchableSelectHandle, SearchableSelectProps>(
  ({ options, value, onChange, onSelect, onArrowUpFirst, placeholder, disabled = false, clearable = true, className = "" }, ref) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const itemRefs = useRef<(HTMLLIElement | null)[]>([]);

    const selected = options.find((o) => o.id === value) ?? null;
    const filtered = search.trim() ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()) || o.sublabel?.toLowerCase().includes(search.toLowerCase())) : options;

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
      focus: () => triggerRef.current?.focus(),
    }));

    // ── Позиция дропдауна ────────────────────────────────────────────────────

    const recalcPosition = useCallback(() => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const dropdownH = 320;
      const openUpward = spaceBelow < dropdownH && spaceAbove > spaceBelow;

      setDropdownStyle({
        position: "fixed",
        left: rect.left,
        width: Math.max(rect.width, 260),
        zIndex: 9999,
        ...(openUpward ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      });
    }, []);

    useEffect(() => {
      if (open) {
        recalcPosition();
        setTimeout(() => inputRef.current?.focus(), 50);
        if (value !== null) {
          const idx = filtered.findIndex((o) => o.id === value);
          setHighlightedIndex(idx);
        }
      }
    }, [open]);

    useEffect(() => {
      if (!open) return;
      const h = () => recalcPosition();
      window.addEventListener("scroll", h, true);
      window.addEventListener("resize", h);
      return () => {
        window.removeEventListener("scroll", h, true);
        window.removeEventListener("resize", h);
      };
    }, [open, recalcPosition]);

    useEffect(() => {
      setHighlightedIndex(-1);
      itemRefs.current = [];
    }, [search]);

    useEffect(() => {
      if (highlightedIndex >= 0 && itemRefs.current[highlightedIndex]) {
        itemRefs.current[highlightedIndex]?.scrollIntoView({ block: "nearest" });
      }
    }, [highlightedIndex]);

    // Закрытие при клике вне
    useEffect(() => {
      const handler = (e: MouseEvent) => {
        const target = e.target as Node;
        const portalEl = document.getElementById("searchable-select-portal");
        if (containerRef.current && !containerRef.current.contains(target) && !(portalEl && portalEl.contains(target))) {
          setOpen(false);
          setSearch("");
          setHighlightedIndex(-1);
        }
      };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, []);

    // ── Действия ─────────────────────────────────────────────────────────────

    const doOpen = () => {
      if (disabled) return;
      setOpen((p) => !p);
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
            setHighlightedIndex((p) => (p < filtered.length - 1 ? p + 1 : 0));
            break;
          case "ArrowUp":
            e.preventDefault();
            setHighlightedIndex((p) => {
              if (p <= 0) {
                onArrowUpFirst?.();
                return p;
              }
              return p - 1;
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
          case "Tab":
            setOpen(false);
            setSearch("");
            setHighlightedIndex(-1);
            break;
        }
      },
      [open, filtered, highlightedIndex, onArrowUpFirst],
    );

    // ── Рендер ───────────────────────────────────────────────────────────────

    const baseClass =
      "w-full flex items-center justify-between gap-2 px-2 py-1.5 text-sm " +
      "border border-gray-300 dark:border-slate-600 rounded-lg " +
      "bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 " +
      "focus:outline-none focus:ring-2 focus:ring-indigo-500 " +
      "transition-colors cursor-pointer select-none " +
      (disabled ? "opacity-50 cursor-not-allowed" : "hover:border-indigo-400 dark:hover:border-indigo-500");

    const dropdown = open ? (
      <div style={dropdownStyle} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-lg overflow-hidden">
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
              placeholder={t("Search")}
              className="flex-1 text-sm bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600 transition-colors" tabIndex={-1}>
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500 px-1">{t("SearchNavigationHelp")}</p>
        </div>

        {/* Список */}
        <ul ref={listRef} role="listbox" className="max-h-64 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <li className="px-3 py-4 text-center text-sm text-gray-400">{t("NotFound")}</li>
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
                    "flex items-center gap-2.5 px-2 py-1.5 cursor-pointer text-sm transition-colors " +
                    (isHighlighted
                      ? "bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300"
                      : isSelected
                        ? "bg-indigo-50/50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400"
                        : "text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-slate-700")
                  }
                >
                  {/* Фото */}
                  {opt.thumbnail ? (
                    <img src={opt.thumbnail} alt={opt.label} className="w-8 h-8 object-cover rounded shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded bg-gray-100 dark:bg-slate-700 shrink-0" />
                  )}

                  {/* Название + остаток */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{opt.label}</div>
                    {opt.sublabel && <div className="text-xs text-gray-400 dark:text-gray-500 truncate">{opt.sublabel}</div>}
                    {opt.stock != null && <StockBadge stock={opt.stock} />}
                  </div>
                </li>
              );
            })
          )}
        </ul>

        {search && filtered.length > 0 && <div className="px-3 py-1.5 border-t border-gray-100 dark:border-slate-700 text-xs text-gray-400">{t("Found", { count: filtered.length })}</div>}
      </div>
    ) : null;

    return (
      <div ref={containerRef} className={`relative ${className}`}>
        {/* Триггер */}
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
          {/* Фото в триггере если выбран */}
          {selected?.thumbnail && <img src={selected.thumbnail} alt={selected.label} className="w-5 h-5 object-cover rounded shrink-0" />}
          <span className={`flex-1 truncate ${selected ? "" : "text-gray-400 dark:text-gray-500"}`}>{selected ? selected.label : placeholder || t("Select")}</span>
          <div className="flex items-center gap-1 shrink-0">
            {clearable && selected && !disabled && (
              <button type="button" onClick={handleClear} className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors rounded" tabIndex={-1} title={t("Clear")}>
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
          </div>
        </div>

        {createPortal(<div id="searchable-select-portal">{dropdown}</div>, document.body)}
      </div>
    );
  },
);

SearchableSelect.displayName = "SearchableSelect";
export default SearchableSelect;

// // // components/ui/SearchableSelect.tsx
// // components/ui/SearchableSelect.tsx
// import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
// import { createPortal } from "react-dom";
// import { useTranslation } from "react-i18next";
// import { ChevronDown, X, Search } from "lucide-react";

// export interface SelectOption {
//   id: number;
//   label: string;
//   sublabel?: string;
// }

// interface SearchableSelectProps {
//   options: SelectOption[];
//   value: number | null;
//   onChange: (id: number | null) => void;
//   onSelect?: (id: number) => void;
//   onArrowUpFirst?: () => void;
//   placeholder?: string;
//   disabled?: boolean;
//   clearable?: boolean;
//   className?: string;
// }

// export interface SearchableSelectHandle {
//   open: () => void;
//   clear: () => void;
//   focus: () => void;
// }

// const SearchableSelect = forwardRef<SearchableSelectHandle, SearchableSelectProps>(
//   ({ options, value, onChange, onSelect, onArrowUpFirst, placeholder, disabled = false, clearable = true, className = "" }, ref) => {
//     const { t } = useTranslation();
//     const [open, setOpen] = useState(false);
//     const [search, setSearch] = useState("");
//     const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
//     const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

//     const containerRef = useRef<HTMLDivElement>(null);
//     const triggerRef = useRef<HTMLDivElement>(null);
//     const inputRef = useRef<HTMLInputElement>(null);
//     const listRef = useRef<HTMLUListElement>(null);
//     const itemRefs = useRef<(HTMLLIElement | null)[]>([]);

//     const selected = options.find((o) => o.id === value) ?? null;
//     const filtered = search.trim() ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()) || o.sublabel?.toLowerCase().includes(search.toLowerCase())) : options;

//     useImperativeHandle(ref, () => ({
//       open: () => {
//         setOpen(true);
//         setSearch("");
//         setTimeout(() => inputRef.current?.focus(), 50);
//       },
//       clear: () => {
//         onChange(null);
//         setSearch("");
//         setOpen(false);
//       },
//       focus: () => {
//         triggerRef.current?.focus();
//       },
//     }));

//     // Вычислить позицию дропдауна по триггеру
//     const recalcPosition = useCallback(() => {
//       if (!triggerRef.current) return;
//       const rect = triggerRef.current.getBoundingClientRect();
//       const spaceBelow = window.innerHeight - rect.bottom;
//       const spaceAbove = rect.top;
//       const dropdownHeight = 280;

//       const openUpward = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;

//       setDropdownStyle({
//         position: "fixed",
//         left: rect.left,
//         width: Math.max(rect.width, 220),
//         zIndex: 9999,
//         ...(openUpward ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
//       });
//     }, []);

//     useEffect(() => {
//       if (open) {
//         recalcPosition();
//         setTimeout(() => inputRef.current?.focus(), 50);
//         if (value !== null) {
//           const idx = filtered.findIndex((o) => o.id === value);
//           setHighlightedIndex(idx);
//         }
//       }
//     }, [open]);

//     // Пересчитывать при скролле/ресайзе
//     useEffect(() => {
//       if (!open) return;
//       const handler = () => recalcPosition();
//       window.addEventListener("scroll", handler, true);
//       window.addEventListener("resize", handler);
//       return () => {
//         window.removeEventListener("scroll", handler, true);
//         window.removeEventListener("resize", handler);
//       };
//     }, [open, recalcPosition]);

//     useEffect(() => {
//       setHighlightedIndex(-1);
//       itemRefs.current = [];
//     }, [search]);

//     useEffect(() => {
//       if (highlightedIndex >= 0 && itemRefs.current[highlightedIndex]) {
//         itemRefs.current[highlightedIndex]?.scrollIntoView({ block: "nearest" });
//       }
//     }, [highlightedIndex]);

//     // Закрытие при клике вне (триггер + портал)
//     useEffect(() => {
//       const handler = (e: MouseEvent) => {
//         const target = e.target as Node;
//         const portalEl = document.getElementById("searchable-select-portal");
//         if (containerRef.current && !containerRef.current.contains(target) && !(portalEl && portalEl.contains(target))) {
//           setOpen(false);
//           setSearch("");
//           setHighlightedIndex(-1);
//         }
//       };
//       document.addEventListener("mousedown", handler);
//       return () => document.removeEventListener("mousedown", handler);
//     }, []);

//     const doOpen = () => {
//       if (disabled) return;
//       setOpen((prev) => !prev);
//       setSearch("");
//     };

//     const doSelect = (id: number) => {
//       onChange(id);
//       setOpen(false);
//       setSearch("");
//       setHighlightedIndex(-1);
//       onSelect?.(id);
//     };

//     const handleClear = (e: React.MouseEvent) => {
//       e.stopPropagation();
//       onChange(null);
//       setSearch("");
//     };

//     const handleKeyDown = useCallback(
//       (e: React.KeyboardEvent) => {
//         if (!open) return;
//         switch (e.key) {
//           case "ArrowDown":
//             e.preventDefault();
//             setHighlightedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
//             break;
//           case "ArrowUp":
//             e.preventDefault();
//             setHighlightedIndex((prev) => {
//               if (prev <= 0) {
//                 onArrowUpFirst?.();
//                 return prev;
//               }
//               return prev - 1;
//             });
//             break;
//           case "Enter":
//             e.preventDefault();
//             if (highlightedIndex >= 0 && filtered[highlightedIndex]) {
//               doSelect(filtered[highlightedIndex].id);
//             } else if (filtered.length === 1) {
//               doSelect(filtered[0].id);
//             }
//             break;
//           case "Escape":
//           case "Tab":
//             setOpen(false);
//             setSearch("");
//             setHighlightedIndex(-1);
//             break;
//         }
//       },
//       [open, filtered, highlightedIndex, onArrowUpFirst],
//     );

//     const baseClass =
//       "w-full flex items-center justify-between gap-2 px-2 py-1.5 text-sm " +
//       "border border-gray-300 dark:border-slate-600 rounded-lg " +
//       "bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 " +
//       "focus:outline-none focus:ring-2 focus:ring-indigo-500 " +
//       "transition-colors cursor-pointer select-none " +
//       (disabled ? "opacity-50 cursor-not-allowed" : "hover:border-indigo-400 dark:hover:border-indigo-500");

//     const dropdown = open ? (
//       <div style={dropdownStyle} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-lg overflow-hidden">
//         {/* Поиск */}
//         <div className="p-2 border-b border-gray-100 dark:border-slate-700">
//           <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600">
//             <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
//             <input
//               ref={inputRef}
//               type="text"
//               value={search}
//               onChange={(e) => setSearch(e.target.value)}
//               onKeyDown={handleKeyDown}
//               placeholder={t("Search")}
//               className="flex-1 text-sm bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400"
//             />
//             {search && (
//               <button type="button" onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600 transition-colors" tabIndex={-1}>
//                 <X className="w-3 h-3" />
//               </button>
//             )}
//           </div>
//           <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500 px-1">{t("SearchNavigationHelp")}</p>
//         </div>

//         {/* Список */}
//         <ul ref={listRef} role="listbox" className="max-h-56 overflow-y-auto py-1">
//           {filtered.length === 0 ? (
//             <li className="px-3 py-4 text-center text-sm text-gray-400">{t("NotFound")}</li>
//           ) : (
//             filtered.map((opt, idx) => {
//               const isHighlighted = idx === highlightedIndex;
//               const isSelected = opt.id === value;
//               return (
//                 <li
//                   key={opt.id}
//                   ref={(el) => {
//                     itemRefs.current[idx] = el;
//                   }}
//                   role="option"
//                   aria-selected={isSelected}
//                   onClick={() => doSelect(opt.id)}
//                   onMouseEnter={() => setHighlightedIndex(idx)}
//                   className={
//                     "flex flex-col px-3 py-2 cursor-pointer text-sm transition-colors " +
//                     (isHighlighted
//                       ? "bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300"
//                       : isSelected
//                         ? "bg-indigo-50/50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400"
//                         : "text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-slate-700")
//                   }
//                 >
//                   <span className="font-medium truncate">{opt.label}</span>
//                   {opt.sublabel && <span className="text-xs text-gray-400 dark:text-gray-500 truncate">{opt.sublabel}</span>}
//                 </li>
//               );
//             })
//           )}
//         </ul>

//         {search && filtered.length > 0 && <div className="px-3 py-1.5 border-t border-gray-100 dark:border-slate-700 text-xs text-gray-400">{t("Found", { count: filtered.length })}</div>}
//       </div>
//     ) : null;

//     return (
//       <div ref={containerRef} className={`relative ${className}`}>
//         {/* Триггер */}
//         <div
//           ref={triggerRef}
//           role="combobox"
//           aria-expanded={open}
//           aria-haspopup="listbox"
//           tabIndex={disabled ? -1 : 0}
//           className={baseClass}
//           onClick={doOpen}
//           onKeyDown={(e) => {
//             if (e.key === "Enter" || e.key === " ") doOpen();
//             if (e.key === "ArrowDown" && !open) doOpen();
//           }}
//         >
//           <span className={`flex-1 truncate ${selected ? "" : "text-gray-400 dark:text-gray-500"}`}>{selected ? selected.label : placeholder || t("Select")}</span>
//           <div className="flex items-center gap-1 shrink-0">
//             {clearable && selected && !disabled && (
//               <button type="button" onClick={handleClear} className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors rounded" tabIndex={-1} title={t("Clear")}>
//                 <X className="w-3.5 h-3.5" />
//               </button>
//             )}
//             <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
//           </div>
//         </div>

//         {/* Портал — рендерим вне любого overflow-hidden */}
//         {createPortal(<div id="searchable-select-portal">{dropdown}</div>, document.body)}
//       </div>
//     );
//   },
// );

// SearchableSelect.displayName = "SearchableSelect";
// export default SearchableSelect;
