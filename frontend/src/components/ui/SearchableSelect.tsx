// frontend/src/components/ui/SearchableSelect.tsx
import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown, X, Search } from "lucide-react";
import { focusManager } from "../../core/utils/focusManager";

export interface SelectOption {
  id: number;
  label: string;
  sublabel?: string;
  thumbnail?: string | null;
  // ✅ Полноразмерное фото (уже приходит в том же ответе API, что и thumbnail) —
  // показывается по клику на миниатюру вместо неё, без доп. запроса на бэкенд.
  fullImage?: string | null;
  stock?: {
    quantity: number;
    reserved: number;
    available: number;
    // ✅ Короткое обозначение ед. изм. (Unit.short_name, напр. "sany"/"шт") —
    // показывается один раз в конце строки остатка (см. StockBadge), а не
    // отдельной строкой под названием — сама единица измерения одна и та же
    // для остатка/резерва/доступно, дублировать её три раза незачем.
    unit?: string | null;
  } | null;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: number | null;
  onChange: (id: number | null) => void;
  onSelect?: (id: number) => void;
  onArrowUpFirst?: () => void;
  // ✅ Переход к СЛЕДУЮЩЕМУ полю формы: Enter/→ на закрытом триггере с уже выбранным
  // значением, либо →  в открытом списке пока поиск пуст (ничего не набрано)
  onEnterWhenClosed?: () => void;
  // ✅ Переход к ПРЕДЫДУЩЕМУ полю формы: ← на закрытом триггере, либо ← в открытом
  // списке пока поиск пуст
  onArrowLeft?: () => void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  className?: string;
  // ✅ "lg" — для полей, на которые пользователь смотрит постоянно (сотрудник,
  // контрагент, товар) — крупнее шрифт и иконки.
  size?: "sm" | "lg";
  // ✅ "auto" (по умолчанию) — обычные light/dark:-классы, следующие за глобальным
  // переключателем темы (используется в контенте страницы). "sidebar" — правый
  // сайдбар (SidebarRight.tsx) НЕ является настоящей dark:-областью (не ставит
  // класс "dark" на обёртку, а просто хардкодит тёмную slate/indigo палитру — см.
  // SidebarRight.tsx/InvoicesPage.tsx), поэтому обычные dark:-классы там не всегда
  // срабатывают при светлой глобальной теме. "sidebar" принудительно рисует той же
  // тёмной палитрой независимо от глобальной темы.
  theme?: "auto" | "sidebar";
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

// ✅ Без этого ограничения открытый список без поискового запроса рендерил в DOM
// ВСЕ переданные опции разом (каждую со своей <img>-миниатюрой) — на каталоге в
// тысячи товаров (см. DocumentFormPage.tsx/ProductRow.tsx на большом каталоге)
// это и было причиной "долго открывается список товаров в фактуре": браузер разом
// вставлял тысячи строк и запускал тысячи запросов картинок. Реального смысла
// показывать больше здесь нет — пользователь всё равно ищет конкретный товар
// через поиск, а не листает тысячи строк вручную.
const MAX_VISIBLE_OPTIONS = 100;

// ── Компонент остатка ─────────────────────────────────────────────────────────

// ✅ Одна строка вместо трёх фрагментов вразнобой — ед. изм. показывается один
// раз, в самом конце (она одна и та же для остатка/резерва/доступно, повторять
// её три раза незачем). Числа сделаны крупнее и жирнее подписей — на первый
// взгляд должно быть видно именно значение, а не текст вокруг него.
const StockBadge = ({ stock }: { stock: NonNullable<SelectOption["stock"]> }) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center flex-wrap gap-x-1 gap-y-0.5 text-sm md:text-base mt-0.5">
      <span className="text-gray-400">{t("InStock")}:</span>
      <span className="font-bold text-gray-700 dark:text-gray-200">{fmt3(stock.quantity)}</span>
      {stock.reserved > 0 && (
        <>
          <span className="text-orange-400">−</span>
          <span className="font-bold text-orange-500 dark:text-orange-400">{fmt3(stock.reserved)}</span>
          <span className="text-orange-400">{t("Reserved")}</span>
        </>
      )}
      <span className="text-gray-400">=</span>
      <span className={`font-extrabold text-base md:text-lg ${stockColor(stock.available)}`}>{fmt3(stock.available)}</span>
      {stock.unit && <span className="text-gray-400 font-normal">{stock.unit}</span>}
    </div>
  );
};

// ── Основной компонент ────────────────────────────────────────────────────────

const SearchableSelect = forwardRef<SearchableSelectHandle, SearchableSelectProps>(
  ({ options, value, onChange, onSelect, onArrowUpFirst, onEnterWhenClosed, onArrowLeft, placeholder, disabled = false, clearable = true, className = "", size = "sm", theme = "auto" }, ref) => {
    const isSidebar = theme === "sidebar";
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
    const portalRef = useRef<HTMLDivElement>(null);

    const selected = options.find((o) => o.id === value) ?? null;
    const filtered = search.trim() ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()) || o.sublabel?.toLowerCase().includes(search.toLowerCase())) : options;
    // ✅ Реально рендерим в DOM/клавиатурную навигацию только первые MAX_VISIBLE_OPTIONS
    // из filtered — см. комментарий у константы выше. "Found"-счётчик внизу списка
    // и подсказка "показаны первые N" считаются от filtered.length (реального числа
    // совпадений), а не от урезанного visibleOptions.length.
    const visibleOptions = filtered.slice(0, MAX_VISIBLE_OPTIONS);
    const truncatedCount = filtered.length - visibleOptions.length;

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
      const dropdownH = 420;
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
          const idx = visibleOptions.findIndex((o) => o.id === value);
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
        if (containerRef.current && !containerRef.current.contains(target) && !(portalRef.current && portalRef.current.contains(target))) {
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
            setHighlightedIndex((p) => (p < visibleOptions.length - 1 ? p + 1 : 0));
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
            if (highlightedIndex >= 0 && visibleOptions[highlightedIndex]) {
              doSelect(visibleOptions[highlightedIndex].id);
            } else if (filtered.length === 1) {
              doSelect(filtered[0].id);
            }
            break;
          // ✅ Пока поиск пуст — стрелки вправо/влево листают поля формы, а не курсор в тексте.
          // Текущий список при этом схлопываем — иначе остаётся висеть открытым.
          case "ArrowRight":
            if (search === "" && onEnterWhenClosed) {
              e.preventDefault();
              setOpen(false);
              setSearch("");
              setHighlightedIndex(-1);
              onEnterWhenClosed();
            }
            break;
          case "ArrowLeft":
            if (search === "" && onArrowLeft) {
              e.preventDefault();
              setOpen(false);
              setSearch("");
              setHighlightedIndex(-1);
              onArrowLeft();
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
      [open, filtered, visibleOptions, highlightedIndex, onArrowUpFirst, search, onEnterWhenClosed, onArrowLeft],
    );

    // ── Рендер ───────────────────────────────────────────────────────────────

    const baseClass =
      `w-full flex items-center justify-between gap-2 rounded-lg shadow-sm ${size === "lg" ? "px-3 py-2 text-base font-medium" : "px-2 py-1.5 text-sm"} ` +
      (isSidebar ? "border border-indigo-900 bg-slate-900 text-indigo-200 " : "border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 ") +
      "focus:outline-none focus:ring-2 focus:ring-indigo-500 " +
      "transition-colors cursor-pointer select-none " +
      (disabled ? "opacity-50 cursor-not-allowed" : isSidebar ? "hover:border-indigo-600" : "hover:border-indigo-400 dark:hover:border-indigo-500");

    const thumbSizeClass = size === "lg" ? "w-7 h-7" : "w-5 h-5";

    const dropdown = open ? (
      <div
        style={dropdownStyle}
        className={
          "rounded-lg shadow-xl overflow-hidden border-2 " +
          (isSidebar ? "bg-slate-900 border-indigo-700" : "bg-indigo-50 dark:bg-indigo-950/90 border-indigo-300 dark:border-indigo-600")
        }
      >
        {/* Поиск */}
        <div className={`p-2 border-b ${isSidebar ? "border-indigo-900" : "border-gray-100 dark:border-slate-700"}`}>
          <div className={`flex items-center gap-2 px-2 py-1 rounded-md border ${isSidebar ? "bg-slate-800 border-indigo-900" : "bg-gray-50 dark:bg-slate-700 border-gray-200 dark:border-slate-600"}`}>
            <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              // ✅ Тот же явный клейм региона, что и на триггере выше — этот инпут
              // рендерится через createPortal(document.body), поэтому обычный
              // DOM-обход/onFocus на родительском <aside> его не поймает.
              onFocus={() => { if (isSidebar) focusManager.setRegion("sidebar-right"); }}
              placeholder={t("Search")}
              className={`flex-1 text-sm bg-transparent outline-none placeholder-gray-400 ${isSidebar ? "text-indigo-100" : "text-gray-900 dark:text-gray-100"}`}
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600 transition-colors" tabIndex={-1}>
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <p className={`mt-1 text-[10px] px-1 ${isSidebar ? "text-indigo-400/70" : "text-gray-400 dark:text-gray-500"}`}>{t("SearchNavigationHelp")}</p>
        </div>

        {/* Список */}
        <ul ref={listRef} role="listbox" className={`max-h-96 overflow-y-auto py-1 m-2 border rounded-md divide-y ${isSidebar ? "border-indigo-900 divide-indigo-900" : "border-black divide-black"}`}>
          {filtered.length === 0 ? (
            <li className="px-3 py-4 text-center text-sm text-gray-400">{t("NotFound")}</li>
          ) : (
            visibleOptions.map((opt, idx) => {
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
                    "flex items-center gap-3 px-3 py-2.5 cursor-pointer text-base md:text-lg transition-colors " +
                    // ✅ isHighlighted — пункт под клавиатурной/мышиной навигацией (Enter
                    // выберет именно его). Раньше был еле заметным лёгким оттенком, почти не
                    // отличимым от isSelected — сделан явно "громче": сплошной фон + ring +
                    // жирный текст, чтобы на глаз сразу было видно, какая строка сейчас активна
                    // (особенно важно при быстрой навигации стрелками по длинному списку товаров).
                    (isSidebar
                      ? isHighlighted
                        ? "bg-indigo-600 text-white shadow-sm ring-2 ring-inset ring-indigo-300 font-semibold"
                        : isSelected
                          ? "bg-indigo-900/30 text-indigo-300 font-medium"
                          : "text-indigo-200 hover:bg-slate-800"
                      : isHighlighted
                        ? "bg-indigo-600 dark:bg-indigo-500 text-white shadow-sm ring-2 ring-inset ring-indigo-400 dark:ring-indigo-300 font-semibold"
                        : isSelected
                          ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium"
                          : "text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-slate-700")
                  }
                >
                  {/* Фото */}
                  {opt.thumbnail ? (
                    <img src={opt.thumbnail} alt={opt.label} loading="lazy" className={`w-11 h-11 md:w-12 md:h-12 object-cover rounded shrink-0 ${isHighlighted ? "ring-2 ring-white/70" : ""}`} />
                  ) : (
                    <div className={`w-11 h-11 md:w-12 md:h-12 rounded shrink-0 ${isSidebar ? "bg-slate-800" : "bg-gray-100 dark:bg-slate-700"}`} />
                  )}

                  {/* Название + остаток */}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{opt.label}</div>
                    {/* ✅ Ед. изм. отдельной строкой показываем только когда нет остатка — если
                        остаток есть, она уже показана один раз в конце строки StockBadge, дублировать
                        её тут (opt.sublabel — та же ед. изм.) незачем. */}
                    {opt.sublabel && opt.stock == null && (
                      <div className={`text-sm md:text-base truncate ${isHighlighted ? "text-indigo-100" : isSidebar ? "text-indigo-400/70" : "text-gray-400 dark:text-gray-500"}`}>{opt.sublabel}</div>
                    )}
                    {opt.stock != null && <StockBadge stock={opt.stock} />}
                  </div>
                </li>
              );
            })
          )}
        </ul>

        {(truncatedCount > 0 || (search && filtered.length > 0)) && (
          <div className={`px-3 py-1.5 border-t text-xs text-gray-400 ${isSidebar ? "border-indigo-900" : "border-gray-100 dark:border-slate-700"}`}>
            {truncatedCount > 0 ? t("SearchableSelectTruncated", { shown: visibleOptions.length, total: filtered.length }) : t("Found", { count: filtered.length })}
          </div>
        )}
      </div>
    ) : null;

    return (
      // ✅ data-region — доступен и для триггера, и (см. ниже) для портала с
      // выпадающим списком: closest('[data-region]') должен находить его даже
      // когда открытый список физически смонтирован в document.body через
      // createPortal, а не внутри настоящего <aside data-region="sidebar-right">
      // (см. CLAUDE.md про focusManager и SidebarRight.tsx — обычный DOM-обход
      // от портала до реального сайдбара невозможен, поэтому регион вешаем прямо
      // на сам портал).
      <div ref={containerRef} data-region={isSidebar ? "sidebar-right" : undefined} className={`relative ${className}`}>
        {/* Триггер */}
        <div
          ref={triggerRef}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          tabIndex={disabled ? -1 : 0}
          className={baseClass}
          onClick={doOpen}
          // ✅ Явный клейм региона (не полагаясь только на data-region/closest()) —
          // см. CLAUDE.md про focusManager: фокус должен всегда вытеснять
          // предыдущий регион, а не рассчитывать на то, что что-то другое уже
          // сделало это правильно.
          onFocus={() => { if (isSidebar) focusManager.setRegion("sidebar-right"); }}
          onKeyDown={(e) => {
            if (!open && value !== null && (e.key === "Enter" || e.key === "ArrowRight") && onEnterWhenClosed) {
              e.preventDefault();
              onEnterWhenClosed();
              return;
            }
            if (!open && e.key === "ArrowLeft" && onArrowLeft) {
              e.preventDefault();
              onArrowLeft();
              return;
            }
            if (e.key === "Enter" || e.key === " ") doOpen();
            if (e.key === "ArrowDown" && !open) doOpen();
          }}
        >
          {/* Фото в триггере если выбран */}
          {selected?.thumbnail && <img src={selected.thumbnail} alt={selected.label} className={`${thumbSizeClass} object-cover rounded shrink-0`} />}
          <span className={`flex-1 truncate ${selected ? "" : isSidebar ? "text-indigo-400/70" : "text-gray-400 dark:text-gray-500"}`}>{selected ? selected.label : placeholder || t("Select")}</span>
          <div className="flex items-center gap-1 shrink-0">
            {clearable && selected && !disabled && (
              <button
                type="button"
                onClick={handleClear}
                className={`p-0.5 transition-colors rounded ${isSidebar ? "text-indigo-400 hover:text-indigo-200" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"}`}
                tabIndex={-1}
                title={t("Clear")}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
          </div>
        </div>

        {createPortal(<div ref={portalRef} data-region={isSidebar ? "sidebar-right" : undefined}>{dropdown}</div>, document.body)}
      </div>
    );
  },
);

SearchableSelect.displayName = "SearchableSelect";
export default SearchableSelect;
