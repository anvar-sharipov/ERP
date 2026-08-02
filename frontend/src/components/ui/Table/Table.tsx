import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { playClickSound, playClick2Sound } from "../../../core/utils/sound";
import { Eye, EyeOff, Printer, Settings2, ChevronDown, Search } from "lucide-react";
import { Input } from "../Input";
import { EmptyState } from "../EmptyState";
import { useCompany } from "../../../core/context/CompanyContext";
import { useUser } from "../../../core/context/UserContext";
import ExcelJS from "exceljs";
import { addExcelHeader } from "../../../core/utils/excelHelpers";
import { iconFileName } from "../Icon/iconFileName";
import { useTranslation } from "react-i18next";
import { focusManager } from "../../../core/utils/focusManager";
import { ConfirmModal } from "../Modal/ConfirmModal";
import { Loader } from "../Loader";
import { Trash2, FileSpreadsheet, X as XIcon } from "lucide-react";

export interface Column<T> {
  header: string;
  accessor?: keyof T;
  width?: string | number;
  render?: (item: T) => React.ReactNode;
  sortable?: boolean;
  sortValue?: (item: T) => string | number;
  excelIcon?: (item: T) => { iconName: string; color: string } | null;
  onCellClick?: (item: T) => void;
  hideInPrint?: boolean;
  hideInView?: boolean;
  excelValue?: (item: T) => string;
  excelWidth?: number;
  excelImageUrl?: (item: T) => string | null | undefined;
  excelAlign?: "left" | "center" | "right";
  excelWrapText?: boolean;
  isActionColumn?: boolean; // колонка с кнопками действий (Edit, Delete и т.д.)
  frozen?: boolean; // фиксировать колонку при горизонтальном скролле
  isLoading?: boolean;
  // ✅ Строка "Итого" под таблицей (см. TripDetailPage.tsx) — полностью опционально:
  // если ни у одной колонки footerValue не задан, <tfoot> вообще не рендерится, на
  // остальные использования Table.tsx это никак не влияет. Считается по ВСЕМ
  // отфильтрованным/отсортированным строкам (sortedData), а не только по текущей
  // странице — при server-пагинации это, соответственно, только текущая страница,
  // т.к. остальные страницы физически не загружены на клиенте.
  footerValue?: (data: T[]) => React.ReactNode;
}

// backend pagination
interface ServerPagination {
  mode: "server";
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  // ✅ Сортировка при серверной пагинации — data содержит только ТЕКУЩУЮ страницу,
  // поэтому локальный .sort() (как при client-пагинации) сортировал бы только её,
  // а не весь список (см. CLAUDE.md/обсуждение). При server-режиме handleSort не
  // трогает данные сам — вызывает onSortChange, а состояние сортировки (для стрелки
  // в заголовке и для запроса на бэкенд) держит и передаёт сама страница.
  sortBy?: string | null;
  sortDir?: "asc" | "desc";
  onSortChange?: (key: string, direction: "asc" | "desc") => void;
}

type PaginationConfig = ServerPagination | { mode?: "client" };

interface TableProps<T> {
  selectedRowId?: string | number | null;
  columns: Column<T>[];
  data: T[];
  onRowClick?: (item: T) => void;
  onRowDoubleClick?: (item: T) => void;
  tableId?: string;
  searchQuery?: string;
  onSearchChange?: (val: string) => void;
  onHighlightConsumed?: () => void;
  isLoading?: boolean;
  pagination?: PaginationConfig;
  onFetchAllData?: () => Promise<T[]>;
  // ✅ Массовое удаление/скачивание через чекбоксы (см. CLAUDE.md). Опционально —
  // существующие страницы, не передающие selectable, работают как раньше.
  // Выбор хранится как Map(id -> item), а не просто Set(id) — так выбранные
  // строки остаются доступны для Excel-экспорта, даже если пользователь после
  // выбора перешёл на другую страницу (server-пагинация) и строка пропала из data.
  selectable?: boolean;
  onBulkDelete?: (ids: (string | number)[]) => Promise<void> | void;
  // ✅ Опциональная подсветка строки по данным (например, разные цвета для
  // разных типов документов — приход/расход/возврат). Должна включать и
  // hover-вариант (см. использование ниже) — без неё при наведении цвет
  // строки просто пропадёт.
  rowClassName?: (item: T) => string;
}

function usePersistedSet(key: string, defaultIndices: number[]): [Set<number>, (i: number) => void] {
  const [set, setSet] = useState<Set<number>>(() => {
    if (key) {
      try {
        const saved = localStorage.getItem(key);
        if (saved) return new Set(JSON.parse(saved) as number[]);
      } catch {}
    }
    return new Set(defaultIndices);
  });

  const toggle = (i: number) => {
    setSet((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      if (key) localStorage.setItem(key, JSON.stringify([...next]));
      return next;
    });
  };

  return [set, toggle];
}

function getPaginationRange(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const range: (number | "...")[] = [];

  range.push(1);

  if (current > 3) range.push("...");

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) range.push(i);

  if (current < total - 2) range.push("...");

  range.push(total);

  return range;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 500] as const;
const DEFAULT_PAGE_SIZE = 25;

// ✅ Обёрнуто в React.memo (см. низ файла) — страницы со своим состоянием формы
// в том же компоненте, что и таблица (например CounterpartiesPage.tsx: `form`
// живёт рядом с `columns`/`data`), раньше вызывали полный ре-рендер и
// ре-реконсиляцию ВСЕХ строк таблицы на каждое нажатие клавиши в поле формы —
// даже когда props самой таблицы (columns/data) не менялись. На таблице в
// несколько сотен строк с тяжёлыми ячейками (вложенные таблицы сальдо и т.п.)
// это давало реальные фризы UI (keydown handler >400мс). memo пропускает
// ре-рендер, когда props действительно не изменились (shallow-equal) — но это
// работает, только если сам вызывающий код передаёт СТАБИЛЬНЫЕ ссылки
// (columns/data обёрнуты в useMemo с правильными deps на стороне страницы),
// иначе memo ничего не даст.
const TableInner = <T extends { id: string | number }>({
  columns,
  data,
  onRowClick,
  onRowDoubleClick,
  tableId = "",
  searchQuery,
  onSearchChange,
  selectedRowId,
  onHighlightConsumed,
  isLoading = false,
  pagination,
  onFetchAllData,
  selectable = false,
  onBulkDelete,
  rowClassName,
}: TableProps<T>) => {
  const isServer = pagination?.mode === "server";
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedRow, setSelectedRow] = useState<string | number | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ rowId: string | number; colIndex: number } | null>(null);

  // ✅ Массовый выбор — Map(id -> item), не Set(id) (см. комментарий у TableProps).
  const [checkedItems, setCheckedItems] = useState<Map<string | number, T>>(new Map());
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const toggleChecked = useCallback((item: T) => {
    playClickSound();
    setCheckedItems((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, item);
      return next;
    });
  }, []);

  const clearChecked = useCallback(() => setCheckedItems(new Map()), []);
  // const [currentPage, setCurrentPage] = useState(1);
  const [clientPage, setClientPage] = useState(1);

  const currentPage = isServer ? (pagination as ServerPagination).page : clientPage;

  const setCurrentPage = (page: number) => {
    if (isServer) {
      (pagination as ServerPagination).onPageChange(page);
    } else {
      setClientPage(page);
    }
  };
  const { company: currentCompany } = useCompany();
  const { user: currentUser } = useUser();
  const [sortConfig, setSortConfig] = useState<{ key: keyof T | null; direction: "asc" | "desc" }>(() => {
    if (!tableId) return { key: null, direction: "asc" };
    try {
      const saved = localStorage.getItem(`table:${tableId}:sort`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return { key: null, direction: "asc" };
  });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const prevSelectedRowId = useRef<string | number | null>(null);
  const selectedRowRef = useRef<string | number | null>(null);

  // ✅ Шапка закреплена (sticky top-0 на th, см. ниже), но scrollIntoView ничего не
  // знает про то, что верх контейнера визуально перекрыт ею — если строка формально
  // уже попадает в scrollTop..scrollTop+height контейнера, браузер считает её "уже
  // видимой" и не скроллит вообще, даже если реально она под шапкой (именно так
  // терялась самая первая строка при восстановлении выделения/навигации). Меряем
  // реальную высоту шапки и резервируем её через scroll-padding-top на контейнере —
  // тогда все scrollIntoView-вызовы ниже (стрелки, восстановление выделения,
  // пагинация) сами учитывают перекрытую зону, без правок в каждом месте отдельно.
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const [headerHeight, setHeaderHeight] = useState(40);
  useEffect(() => {
    const el = theadRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const h = entries[0].contentRect.height;
      if (h > 0) setHeaderHeight(h);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const [excelDropdownOpen, setExcelDropdownOpen] = useState(false);
  const excelDropdownRef = useRef<HTMLDivElement>(null);

  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // ── Pagination refs ──────────────────────────────────────────────────────
  // Храним refs на все кнопки пагинации: [prevBtn, page1, page2, ..., nextBtn]
  // Пересоздаём массив при каждом рендере через callback-ref на контейнер
  const paginationRef = useRef<HTMLDivElement>(null);
  // Индекс сфокусированной кнопки внутри пагинации (-1 = не в пагинации)
  const [paginationFocusIndex, setPaginationFocusIndex] = useState<number>(-1);

  // ── Action column ────────────────────────────────────────────────────────
  // rowId строки в которой сейчас активен регион "action"
  const actionRowId = useRef<string | number | null>(null);

  const setSelectedRowSync = useCallback((id: string | number | null) => {
    selectedRowRef.current = id;
    setSelectedRow(id);
  }, []);

  // const [pageSize, setPageSize] = useState<number>(() => {
  //   if (!tableId) return DEFAULT_PAGE_SIZE;
  //   try {
  //     const saved = localStorage.getItem(`table:${tableId}:pageSize`);
  //     return saved ? Number(saved) : DEFAULT_PAGE_SIZE;
  //   } catch {
  //     return DEFAULT_PAGE_SIZE;
  //   }
  // });

  // const handlePageSizeChange = (size: number) => {
  //   setPageSize(size);
  //   setCurrentPage(1);
  //   if (tableId) {
  //     try {
  //       localStorage.setItem(`table:${tableId}:pageSize`, String(size));
  //     } catch {}
  //   }
  // };

  const [clientPageSize, setClientPageSize] = useState<number>(() => {
    if (!tableId) return DEFAULT_PAGE_SIZE;
    try {
      const saved = localStorage.getItem(`table:${tableId}:pageSize`);
      return saved ? Number(saved) : DEFAULT_PAGE_SIZE;
    } catch {
      return DEFAULT_PAGE_SIZE;
    }
  });

  const pageSize = isServer ? (pagination as ServerPagination).pageSize : clientPageSize;

  const handlePageSizeChange = (size: number) => {
    // console.log("handlePageSizeChange", size, isServer);
    if (isServer) {
      (pagination as ServerPagination).onPageSizeChange(size);
    } else {
      setClientPageSize(size);
      setCurrentPage(1);
      if (tableId) {
        try {
          localStorage.setItem(`table:${tableId}:pageSize`, String(size));
        } catch {}
      }
    }
  };

  useEffect(() => {
    const unsubscribe = focusManager.subscribe((_newRegion) => {});
    return () => {
      unsubscribe();
    };
  }, []);

  const [hiddenInView, toggleView] = usePersistedSet(
    tableId ? `table:${tableId}:hiddenView` : "",
    columns.map((c, i) => (c.hideInView ? i : -1)).filter((i) => i !== -1),
  );

  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  const [hiddenInPrint, togglePrint] = usePersistedSet(
    tableId ? `table:${tableId}:hiddenPrint` : "",
    columns.map((c, i) => (c.hideInPrint ? i : -1)).filter((i) => i !== -1),
  );

  // ✅ Изменение ширины колонок мышкой (drag за правый край <th>), с сохранением
  // в localStorage per-tableId — тот же принцип, что и у hiddenInView/hiddenInPrint
  // выше, только значение не Set индексов, а Record<индекс, ширина в px>.
  const [columnWidths, setColumnWidths] = useState<Record<number, number>>(() => {
    if (!tableId) return {};
    try {
      const saved = localStorage.getItem(`table:${tableId}:colWidths`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });

  const resizingRef = useRef<{ colIndex: number; startX: number; startWidth: number } | null>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent, colIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.currentTarget as HTMLElement).closest("th");
    const startWidth = th ? th.getBoundingClientRect().width : 120;
    resizingRef.current = { colIndex, startX: e.clientX, startWidth };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const r = resizingRef.current;
      if (!r) return;
      const newWidth = Math.max(40, Math.round(r.startWidth + (e.clientX - r.startX)));
      setColumnWidths((prev) => (prev[r.colIndex] === newWidth ? prev : { ...prev, [r.colIndex]: newWidth }));
    };
    const handleMouseUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setColumnWidths((prev) => {
        if (tableId) {
          try {
            localStorage.setItem(`table:${tableId}:colWidths`, JSON.stringify(prev));
          } catch {}
        }
        return prev;
      });
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [tableId]);

  const getColWidth = useCallback((i: number, col: Column<T>) => columnWidths[i] ?? col.width, [columnWidths]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (excelDropdownRef.current && !excelDropdownRef.current.contains(e.target as Node)) {
        setExcelDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const sortedData = useMemo(() => {
    const source = data ?? [];
    // ✅ При server-пагинации бэкенд уже вернул страницу в нужном порядке
    // (см. onSortChange ниже) — сортировать на клиенте нельзя, data здесь это
    // только текущая страница, а не весь список.
    if (isServer) return source;
    if (!sortConfig.key) return source;
    return [...source].sort((a, b) => {
      const col = columns.find((c) => c.accessor === sortConfig.key);
      const getVal = (item: T) => (col?.sortValue ? col.sortValue(item) : item[sortConfig.key!]);
      const aVal = getVal(a);
      const bVal = getVal(b);
      if (aVal === bVal) return 0;
      const comparison = aVal! < bVal! ? -1 : 1;
      return sortConfig.direction === "asc" ? comparison : -comparison;
    });
  }, [data, sortConfig, columns, isServer]);

  // useEffect(() => {
  //   setCurrentPage(1);
  // }, [sortedData.length, searchQuery]);
  useEffect(() => {
    if (isServer) return;
    setCurrentPage(1);
  }, [sortedData.length, searchQuery]);

  // const totalPages = pageSize ? Math.ceil(sortedData.length / pageSize) : 1;

  // const paginatedData = useMemo(() => {
  //   if (!pageSize) return sortedData;
  //   const start = (currentPage - 1) * pageSize;
  //   return sortedData.slice(start, start + pageSize);
  // }, [sortedData, currentPage, pageSize]);

  const totalPages = isServer ? Math.ceil((pagination as ServerPagination).total / pageSize) : pageSize ? Math.ceil(sortedData.length / pageSize) : 1;

  // ✅ Число рядом с кнопкой "Excel — вся выгрузка" — при server-пагинации
  // sortedData/paginatedData это только ТЕКУЩАЯ страница (данные всех страниц
  // на клиенте просто нет), поэтому sortedData.length там всегда равен размеру
  // страницы. Реальное количество, которое реально скачается (через
  // onFetchAllData — см. handleExcelExport), это pagination.total.
  const allDataCount = isServer ? (pagination as ServerPagination).total : sortedData.length;

  const paginatedData = useMemo(() => {
    // if (isServer) return data;
    // if (isServer) return data ?? [];
    if (isServer) return sortedData;
    if (!pageSize) return sortedData;
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [isServer, data, sortedData, currentPage, pageSize]);

  // ✅ Чекбокс "выбрать всё" в шапке — относится к строкам ТЕКУЩЕЙ страницы
  // (выбор через несколько страниц server-пагинации накапливается отдельно,
  // просто листая страницы и отмечая чекбоксы — Map переживает смену страницы).
  const selectAllRef = useRef<HTMLInputElement>(null);
  const allOnPageSelected = paginatedData.length > 0 && paginatedData.every((item) => checkedItems.has(item.id));
  const someOnPageSelected = paginatedData.some((item) => checkedItems.has(item.id));

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someOnPageSelected && !allOnPageSelected;
  }, [someOnPageSelected, allOnPageSelected]);

  const toggleSelectAllOnPage = useCallback(() => {
    playClickSound();
    setCheckedItems((prev) => {
      const next = new Map(prev);
      if (allOnPageSelected) {
        paginatedData.forEach((item) => next.delete(item.id));
      } else {
        paginatedData.forEach((item) => next.set(item.id, item));
      }
      return next;
    });
  }, [allOnPageSelected, paginatedData]);

  const handleSort = (key: keyof T) => {
    // ✅ Server-режим — не сортируем на клиенте, а просим родительскую страницу
    // переспросить сервер с новым ordering (см. ServerPagination.onSortChange).
    // Сохраняем в тот же localStorage-ключ, что и client-режим (см. ниже) — так
    // сортировка переживает перезагрузку страницы независимо от режима пагинации.
    if (isServer) {
      const sp = pagination as ServerPagination;
      const direction: "asc" | "desc" = sp.sortBy === key && sp.sortDir === "asc" ? "desc" : "asc";
      if (tableId) {
        try {
          localStorage.setItem(`table:${tableId}:sort`, JSON.stringify({ key, direction }));
        } catch {}
      }
      sp.onSortChange?.(String(key), direction);
      return;
    }
    setSortConfig((current) => {
      const next = {
        key,
        direction: (current.key === key && current.direction === "asc" ? "desc" : "asc") as "asc" | "desc",
      };
      if (tableId) {
        try {
          localStorage.setItem(`table:${tableId}:sort`, JSON.stringify(next));
        } catch {}
      }
      return next;
    });
  };

  // ✅ Восстановление сохранённой сортировки для server-режима. В отличие от
  // client-режима (sortConfig читается из localStorage прямо в useState-инициализаторе
  // выше), при server-пагинации состояние сортировки держит родительская страница —
  // поэтому Table.tsx не может применить сохранённое значение сам, а должен один раз
  // на маунте попросить об этом родителя через onSortChange. Не перетираем sortBy,
  // если родитель уже явно задал начальную сортировку.
  useEffect(() => {
    if (!isServer || !tableId) return;
    const sp = pagination as ServerPagination;
    if (sp.sortBy) return;
    try {
      const saved = localStorage.getItem(`table:${tableId}:sort`);
      if (saved) {
        const parsed = JSON.parse(saved) as { key?: string; direction?: "asc" | "desc" };
        if (parsed?.key) sp.onSortChange?.(parsed.key, parsed.direction ?? "asc");
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  // ✅ Единый источник для стрелки-индикатора в заголовке — при server-режиме
  // "текущая сортировка" приходит снаружи (sortBy/sortDir), а не из локального
  // sortConfig (который для server-режима вообще не обновляется).
  const effectiveSortKey = isServer ? ((pagination as ServerPagination).sortBy ?? null) : sortConfig.key;
  const effectiveSortDir = isServer ? ((pagination as ServerPagination).sortDir ?? "asc") : sortConfig.direction;

  const userSelectedCell = useRef(false);

  const handleCellClick = (item: T, colIndex: number, column: Column<T>) => {
    focusManager.setRegion("table");
    playClickSound();
    userSelectedCell.current = true;
    setSelectedRowSync(item.id);
    setSelectedCell({ rowId: item.id, colIndex });
    if (onRowClick) onRowClick(item);
    if (column.onCellClick) column.onCellClick(item);
  };

  useEffect(() => {
    if (selectedRowId == null) {
      prevSelectedRowId.current = null;
      return;
    }
    if (selectedRowId === prevSelectedRowId.current) return;
    prevSelectedRowId.current = selectedRowId;

    if (userSelectedCell.current && selectedRowId === selectedRowRef.current) {
      userSelectedCell.current = false;
      setSelectedRowSync(selectedRowId);
      return;
    }

    userSelectedCell.current = false;
    setSelectedRowSync(selectedRowId);
    const visibleCols = columns.map((_, i) => i).filter((i) => !hiddenInView.has(i));
    if (visibleCols.length > 0) {
      // ✅ Как и при ArrowDown из search / ArrowUp из пагинации — фокусируем
      // колонку "name", если она есть, иначе первую видимую (см. handleSearchKeyDown
      // / focusLastTableRow). Тот же принцип нужен и при восстановлении выделения
      // после возврата через BackButton (см. CLAUDE.md).
      const nameColIndex = visibleCols.find((i) => columns[i].accessor === "name");
      const targetColIndex = nameColIndex ?? visibleCols[0];
      setSelectedCell({ rowId: selectedRowId, colIndex: targetColIndex });
      onHighlightConsumed?.();
      focusManager.setRegion("table");
      requestAnimationFrame(() => {
        const row = containerRef.current?.querySelector(`tr[data-row-id="${selectedRowId}"]`);
        if (row) row.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  }, [selectedRowId, columns, hiddenInView]);

  useEffect(() => {
    // ✅ В серверной пагинации `sortedData` — это только уже загруженная с бэкенда
    // страница (≤ pageSize строк), а не весь датасет: `index` тут всегда попадает
    // в диапазон [0, pageSize), поэтому targetPage ниже всегда считался бы как 1,
    // и это МОЛЧА перебивало страницу, восстановленную родителем (см. InvoicesPage.tsx
    // ::PAGE_STORAGE_KEY) обратно на первую. Для server-режима правильная страница
    // должна быть выставлена снаружи ДО загрузки данных — здесь её пересчитать
    // из локальных данных в принципе нельзя.
    if (isServer) return;
    if (selectedRowId == null || !pageSize) return;

    const index = sortedData.findIndex((item) => item.id === selectedRowId);
    if (index === -1) return;

    const targetPage = Math.floor(index / pageSize) + 1;
    if (targetPage !== currentPage) {
      setCurrentPage(targetPage);
    }
  }, [selectedRowId, sortedData, pageSize, isServer]);

  // ── Helpers для фокуса пагинации ─────────────────────────────────────────

  /**
   * Возвращает все кликабельные кнопки пагинации в DOM-порядке.
   * Порядок: [← , page1, page2, ..., →]
   * "..." — не кнопка, пропускается автоматически т.к. это <span>
   */
  const getPaginationButtons = useCallback((): HTMLButtonElement[] => {
    if (!paginationRef.current) return [];
    return Array.from(paginationRef.current.querySelectorAll<HTMLButtonElement>("button"));
  }, []);

  /**
   * Фокусирует кнопку пагинации по индексу в массиве кнопок.
   * Возвращает реальный индекс (с зажимом к границам).
   */
  const focusPaginationButton = useCallback(
    (index: number): number => {
      const buttons = getPaginationButtons();
      if (buttons.length === 0) return -1;
      const clamped = Math.max(0, Math.min(index, buttons.length - 1));
      buttons[clamped]?.focus();
      setPaginationFocusIndex(clamped);
      return clamped;
    },
    [getPaginationButtons],
  );

  /**
   * Входная точка: Ctrl+Q → фокус на кнопку "→" (последняя кнопка пагинации).
   */
  const focusPaginationNext = useCallback(() => {
    const buttons = getPaginationButtons();
    if (buttons.length === 0) return;
    playClickSound();
    focusPaginationButton(buttons.length - 1);
    focusManager.setRegion("pagination");
  }, [getPaginationButtons, focusPaginationButton]);

  /**
   * Из пагинации ArrowUp → последняя строка таблицы.
   */
  const focusLastTableRow = useCallback(() => {
    if (paginatedData.length === 0) return;
    const visibleCols = columns.map((_, i) => i).filter((i) => !hiddenInView.has(i));
    if (visibleCols.length === 0) return;
    // ✅ Как и при ArrowDown из search — фокусируем колонку "name", если она есть,
    // иначе первую видимую (см. handleSearchKeyDown).
    const nameColIndex = visibleCols.find((i) => columns[i].accessor === "name");
    const targetColIndex = nameColIndex ?? visibleCols[0];

    const lastItem = paginatedData[paginatedData.length - 1];
    setSelectedRowSync(lastItem.id);
    setSelectedCell({ rowId: lastItem.id, colIndex: targetColIndex });
    focusManager.setRegion("table");
    setPaginationFocusIndex(-1);

    // Убираем нативный фокус с кнопки пагинации
    (document.activeElement as HTMLElement)?.blur();

    requestAnimationFrame(() => {
      const row = containerRef.current?.querySelector(`tr[data-row-id="${lastItem.id}"]`);
      if (row) row.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, [paginatedData, columns, hiddenInView, setSelectedRowSync]);

  // ── Клавиатура: таблица ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (focusManager.getRegion() !== "table") return;
      const isModalOpen = document.querySelector(".fixed.inset-0.z-50");
      if (isModalOpen) return;
      if (!selectedCell) return;

      const { rowId, colIndex } = selectedCell;
      const visibleCols = columns.map((_, i) => i).filter((i) => !hiddenInView.has(i));

      // Навигация по строкам — только внутри текущей страницы (paginatedData)
      const rowIndex = paginatedData.findIndex((item) => item.id === rowId);
      if (rowIndex === -1) {
        setSelectedCell(null);
        return;
      }
      const visibleColIndex = visibleCols.indexOf(colIndex);

      let nextRowIndex = rowIndex;
      let nextColIndex = visibleColIndex;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const isLastRowOnPage = rowIndex === paginatedData.length - 1;
        // Последняя строка страницы + есть пагинация → уходим в пагинацию
        if (isLastRowOnPage && totalPages > 1) {
          focusPaginationNext();
          return;
        }
        nextRowIndex = Math.min(rowIndex + 1, paginatedData.length - 1);
        searchInputRef.current?.blur();
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (rowIndex === 0) {
          playClickSound();
          setSelectedCell(null);
          setSelectedRowSync(null);
          searchInputRef.current?.focus();
          return;
        }
        nextRowIndex = Math.max(rowIndex - 1, 0);
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        nextColIndex = Math.min(visibleColIndex + 1, visibleCols.length - 1);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        nextColIndex = Math.max(visibleColIndex - 1, 0);
      }
      if (e.key === "Enter") {
        // Если фокус реально на кнопке внутри таблицы — не перехватываем,
        // пусть кнопка сработает нативно
        if (document.activeElement instanceof HTMLButtonElement) return;

        // Если текущая ячейка — isActionColumn, входим в неё
        const currentCol = columns[colIndex];
        if (currentCol?.isActionColumn) {
          e.preventDefault();
          const row = containerRef.current?.querySelector(`tr[data-row-id="${rowId}"]`);
          if (row) {
            const buttons = Array.from(row.querySelectorAll<HTMLButtonElement>("td button:not(:disabled)"));
            if (buttons.length > 0) {
              actionRowId.current = rowId;
              buttons[0].focus();
              // Ставим регион ПОСЛЕ focus() чтобы onFocus таблицы не перебил
              requestAnimationFrame(() => focusManager.setRegion("action"));
              playClickSound();
            }
          }
          return;
        }
        // Обычная ячейка — открыть запись
        const item = paginatedData[rowIndex];
        if (item && onRowDoubleClick) onRowDoubleClick(item);
        return;
      }

      // Delete — фокус на последнюю кнопку action-колонки (обычно Delete)
      if (e.key === "Delete") {
        const actionColIndex = columns.findIndex((c) => c.isActionColumn);
        if (actionColIndex === -1) return;
        e.preventDefault();
        const row = containerRef.current?.querySelector(`tr[data-row-id="${rowId}"]`);
        if (row) {
          const buttons = Array.from(row.querySelectorAll<HTMLButtonElement>("td button:not(:disabled)"));
          if (buttons.length > 0) {
            actionRowId.current = rowId;
            buttons[buttons.length - 1].focus(); // последняя кнопка = Delete
            // Ставим регион ПОСЛЕ focus() чтобы onFocus таблицы не перебил
            requestAnimationFrame(() => focusManager.setRegion("action"));
            playClickSound();
          }
        }
        return;
      }

      if (nextRowIndex !== rowIndex || nextColIndex !== visibleColIndex) {
        const nextItem = paginatedData[nextRowIndex]; // ← paginatedData, не sortedData
        const nextCol = visibleCols[nextColIndex];
        if (nextItem) {
          playClickSound();
          setSelectedRowSync(nextItem.id);
          setSelectedCell({ rowId: nextItem.id, colIndex: nextCol });

          requestAnimationFrame(() => {
            const cellElement = containerRef.current?.querySelector(`tr[data-row-id="${nextItem.id}"] td:nth-child(${nextCol + 2})`);
            if (cellElement) {
              cellElement.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
            }
          });
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedCell, paginatedData, columns, hiddenInView, onRowDoubleClick, totalPages, focusPaginationNext]);

  // ── Клавиатура: action-колонка ───────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (focusManager.getRegion() !== "action") return;
      const isModalOpen = document.querySelector(".fixed.inset-0.z-50");
      if (isModalOpen) return;

      const rowId = actionRowId.current;
      if (rowId == null) return;

      const row = containerRef.current?.querySelector(`tr[data-row-id="${rowId}"]`);
      if (!row) return;

      const buttons = Array.from(row.querySelectorAll<HTMLButtonElement>("td button:not(:disabled)"));
      if (buttons.length === 0) return;

      const activeIndex = buttons.findIndex((b) => b === document.activeElement);

      if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        const next = Math.min(activeIndex + 1, buttons.length - 1);
        buttons[next].focus();
        requestAnimationFrame(() => focusManager.setRegion("action"));
        playClickSound();
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        const prev = Math.max(activeIndex - 1, 0);
        buttons[prev].focus();
        requestAnimationFrame(() => focusManager.setRegion("action"));
        playClickSound();
      }

      if (e.key === "Escape") {
        e.preventDefault();
        // Возвращаемся на ячейку action-колонки в этой строке
        actionRowId.current = null;
        focusManager.setRegion("table");
        (document.activeElement as HTMLElement)?.blur();
        // Ставим selectedCell на action-колонку
        const actionColIndex = columns.findIndex((c) => c.isActionColumn);
        if (actionColIndex !== -1) {
          setSelectedCell({ rowId, colIndex: actionColIndex });
        }
        playClickSound();
      }

      // ArrowUp/ArrowDown — выходим из action обратно в таблицу и двигаемся
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        actionRowId.current = null;
        focusManager.setRegion("table");
        (document.activeElement as HTMLElement)?.blur();

        const rowIndex = paginatedData.findIndex((item) => item.id === rowId);
        if (rowIndex === -1) return;

        const actionColIndex = columns.findIndex((c) => c.isActionColumn);
        const targetRowIndex = e.key === "ArrowUp" ? Math.max(rowIndex - 1, 0) : Math.min(rowIndex + 1, paginatedData.length - 1);

        const targetItem = paginatedData[targetRowIndex];
        if (targetItem) {
          playClickSound();
          setSelectedRowSync(targetItem.id);
          setSelectedCell({ rowId: targetItem.id, colIndex: actionColIndex !== -1 ? actionColIndex : 0 });
          requestAnimationFrame(() => {
            const targetRow = containerRef.current?.querySelector(`tr[data-row-id="${targetItem.id}"]`);
            if (targetRow) targetRow.scrollIntoView({ behavior: "smooth", block: "nearest" });
          });
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [columns, paginatedData, setSelectedRowSync]);

  // ── Клавиатура: пагинация ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (focusManager.getRegion() !== "pagination") return;
      const isModalOpen = document.querySelector(".fixed.inset-0.z-50");
      if (isModalOpen) return;

      const buttons = getPaginationButtons();
      if (buttons.length === 0) return;

      // Текущий индекс — смотрим кто реально сфокусирован в DOM
      const domFocusIndex = buttons.findIndex((b) => b === document.activeElement);
      const currentIndex = domFocusIndex !== -1 ? domFocusIndex : paginationFocusIndex;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        // Пропускаем задизейбленные кнопки
        let next = currentIndex + 1;
        while (next < buttons.length && buttons[next].disabled) next++;
        if (next < buttons.length) focusPaginationButton(next);
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        let prev = currentIndex - 1;
        while (prev >= 0 && buttons[prev].disabled) prev--;
        if (prev >= 0) focusPaginationButton(prev);
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        focusLastTableRow();
      }

      if (e.key === "Escape") {
        e.preventDefault();
        setPaginationFocusIndex(-1);
        focusManager.setRegion("search");
        searchInputRef.current?.focus();
      }

      // Enter обрабатывается нативно кнопкой — ничего делать не нужно,
      // но после клика (смены страницы) фокус должен остаться в пагинации.
      // Это обеспечивается через useEffect ниже.
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [paginationFocusIndex, getPaginationButtons, focusPaginationButton, focusLastTableRow]);

  // ── После смены страницы: восстанавливаем фокус в пагинации ─────────────
  // Сохраняем какой индекс был активен ДО смены страницы,
  // чтобы после ре-рендера кнопок восстановить фокус на том же месте.
  const pendingPaginationFocusIndex = useRef<number>(-1);

  const handlePageChange = useCallback((newPage: number, buttonIndex: number) => {
    playClick2Sound();
    pendingPaginationFocusIndex.current = buttonIndex;
    setCurrentPage(newPage);
    // focusManager остаётся "pagination"
  }, []);

  // После смены страницы (ре-рендер кнопок) восстанавливаем фокус
  useEffect(() => {
    if (pendingPaginationFocusIndex.current === -1) return;
    if (focusManager.getRegion() !== "pagination") return;

    const indexToFocus = pendingPaginationFocusIndex.current;
    pendingPaginationFocusIndex.current = -1;

    requestAnimationFrame(() => {
      focusPaginationButton(indexToFocus);
    });
  }, [currentPage, focusPaginationButton]);

  // ── Глобальные горячие клавиши ───────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+Q → фокус пагинации (Next Page)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "q") {
        if (totalPages <= 1) return; // пагинации нет — игнорируем
        e.preventDefault();
        e.stopPropagation();
        focusPaginationNext();
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [totalPages, focusPaginationNext]);

  useEffect(() => {
    if (selectedRowId != null) {
      searchInputRef.current?.blur();
      return;
    }
    searchInputRef.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (onSearchChange) onSearchChange("");
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 0);
      return;
    }

    if (e.key === "ArrowDown" && paginatedData.length > 0) {
      if (selectedCell !== null) return;
      e.preventDefault();
      e.stopPropagation();

      playClickSound();
      const visibleCols = columns.map((_, i) => i).filter((i) => !hiddenInView.has(i));
      // ✅ Если среди колонок есть "name" (accessor === "name") — фокусируем именно
      // её (там обычно самая важная инфа о строке), иначе — как раньше, первая
      // видимая колонка.
      const nameColIndex = visibleCols.find((i) => columns[i].accessor === "name");
      const firstColIndex = nameColIndex ?? visibleCols[0];
      // // Последняя видимая колонка:
      // const targetColIndex = visibleCols[visibleCols.length - 1];
      // Предпоследняя:
      // const targetColIndex = visibleCols[visibleCols.length - 2] ?? visibleCols[visibleCols.length - 1];

      if (firstColIndex !== undefined) {
        const firstItem = paginatedData[0];
        setSelectedRowSync(firstItem.id);
        setSelectedCell({ rowId: firstItem.id, colIndex: firstColIndex });
        focusManager.setRegion("table");
        searchInputRef.current?.blur();
      }
    }
  };

  // excel
  const handleExcelExport = useCallback(
    async (exportData: T[]) => {
      let finalData = exportData;
      if (isServer && onFetchAllData) {
        try {
          finalData = await onFetchAllData();
        } catch {
          finalData = exportData;
        }
      }
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Данные");

      await addExcelHeader(workbook, worksheet, currentCompany, currentUser, t);

      const visibleColumns = columns.filter((_, i) => !hiddenInPrint.has(i));

      worksheet.columns = [{ width: 5 }, ...visibleColumns.map((col) => ({ width: col.excelWidth ?? 20 }))];

      const headerRow = worksheet.addRow(["№", ...visibleColumns.map((c) => c.header)]);
      headerRow.font = { bold: true };
      headerRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      });

      for (let index = 0; index < finalData.length; index++) {
        const item = finalData[index];
        const rowData: (string | number)[] = [index + 1];

        visibleColumns.forEach((col) => {
          if (col.excelImageUrl) {
            rowData.push("");
          } else if (col.excelValue) {
            rowData.push(col.excelValue(item));
          } else if (col.accessor) {
            rowData.push(String(item[col.accessor as keyof T] ?? ""));
          } else {
            rowData.push("");
          }
        });

        const row = worksheet.addRow(rowData);
        row.height = 50;
        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
          const colIndex = (cell.col as unknown as number) - 2;
          const columnConfig = visibleColumns[colIndex];
          cell.alignment = {
            vertical: "middle",
            horizontal: columnConfig?.excelAlign ?? "left",
            wrapText: columnConfig ? (columnConfig.excelWrapText ?? true) : true,
          };
        });

        for (let colIdx = 0; colIdx < visibleColumns.length; colIdx++) {
          const col = visibleColumns[colIdx];
          const currentTlCol = colIdx + 1;
          const currentTlRow = row.number - 1;

          if (col.excelIcon) {
            const iconData = col.excelIcon(item);
            if (iconData?.iconName) {
              try {
                const fileName = iconFileName(iconData.iconName);
                const response = await fetch(`/icons/${fileName}.svg`);
                if (!response.ok) {
                  console.warn(`Иконка не найдена: ${fileName}.svg`);
                  continue;
                }
                const svgText = await response.text();
                const coloredSvg = svgText.replace(/stroke="[^"]*"/g, `stroke="${iconData.color}"`);
                const pngBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
                  const img = new Image();
                  const svgBlob = new Blob([coloredSvg], { type: "image/svg+xml;charset=utf-8" });
                  const url = URL.createObjectURL(svgBlob);
                  img.onload = () => {
                    const canvas = document.createElement("canvas");
                    canvas.width = 32;
                    canvas.height = 32;
                    const ctx = canvas.getContext("2d");
                    if (!ctx) {
                      reject(new Error("Canvas context not found"));
                      return;
                    }
                    ctx.drawImage(img, 0, 0, 32, 32);
                    canvas.toBlob(async (blob) => {
                      if (!blob) {
                        reject(new Error("PNG blob is null"));
                        return;
                      }
                      resolve(await blob.arrayBuffer());
                      URL.revokeObjectURL(url);
                    }, "image/png");
                  };
                  img.onerror = reject;
                  img.src = url;
                });
                const imageId = workbook.addImage({ buffer: pngBuffer, extension: "png" });
                worksheet.addImage(imageId, {
                  tl: { col: currentTlCol + 0.15, row: currentTlRow + 0.15 },
                  ext: { width: 24, height: 24 },
                });
              } catch (e) {
                console.warn(`Ошибка вставки иконки ${iconData.iconName}:`, e);
              }
            }
          }

          if (!col.excelImageUrl) continue;
          const imgUrl = col.excelImageUrl(item);
          if (!imgUrl) continue;
          try {
            const response = await fetch(imgUrl);
            const blob = await response.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const ext = imgUrl.split(".").pop()?.split("?")[0]?.toLowerCase() || "jpeg";
            const imageId = workbook.addImage({ buffer: arrayBuffer, extension: ext as "png" | "jpeg" | "gif" });
            const tlRow = row.number - 1;
            const tlCol = colIdx + 1;
            worksheet.addImage(imageId, { tl: { col: tlCol, row: tlRow }, ext: { width: 45, height: 45 } });
          } catch (e) {
            console.warn("⚠️ Не удалось загрузить фото:", imgUrl, e);
          }
        }
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${tableId || "export"}_${new Date().toLocaleDateString("ru-RU")}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    },
    [columns, hiddenInPrint, currentCompany, currentUser, t, tableId],
  );

  // ✅ Массовые действия по выбранным строкам (чекбоксы) — см. CLAUDE.md.
  // Печать — через Ctrl+P/кнопку "Печать" (window.print()); какие именно строки
  // попадут на бумагу, решает print:hidden на невыбранных <tr> в рендере ниже
  // (тот же экран/печать/Excel никогда не расходятся принцип, что и у колонок).
  const handleBulkExcelExport = useCallback(() => {
    handleExcelExport(Array.from(checkedItems.values()));
  }, [handleExcelExport, checkedItems]);

  const handlePrintSelected = useCallback(() => {
    window.print();
  }, []);

  const handleConfirmBulkDelete = useCallback(async () => {
    if (!onBulkDelete) return;
    setBulkDeleting(true);
    try {
      await onBulkDelete(Array.from(checkedItems.keys()));
      clearChecked();
      setBulkDeleteConfirmOpen(false);
    } finally {
      setBulkDeleting(false);
    }
  }, [onBulkDelete, checkedItems, clearChecked]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
        e.preventDefault();
        e.stopPropagation();
        handleExcelExport(sortedData);
        return;
      }

      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "/") {
        e.preventDefault();
        e.stopPropagation();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [handleExcelExport]);

  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      if (e.key === "F6") {
        e.preventDefault();
        setSelectedCell(null);
        setSelectedRowSync(null);
        (document.activeElement as HTMLElement)?.blur();
        focusManager.setRegion("sidebar");
        window.dispatchEvent(new CustomEvent("focus-sidebar"));
      }
    };

    window.addEventListener("keydown", handleGlobalKeys);
    return () => window.removeEventListener("keydown", handleGlobalKeys);
  }, []);

  // ── Вычисляем диапазон пагинации для рендера ─────────────────────────────
  // ── Фиксированные колонки ────────────────────────────────────────────────
  // Считаем left-offset для каждой frozen-колонки.
  // Колонка "№" всегда frozen и занимает 40px (w-10).
  const NUMBER_COL_WIDTH = 40;
  // Чекбокс-колонка (если selectable) — тоже sticky при hasFrozen, стоит перед "№".
  const CHECKBOX_COL_WIDTH = 36;
  const frozenOffsets = useMemo(() => {
    const offsets: Record<number, number> = {};
    let accumulated = NUMBER_COL_WIDTH + (selectable ? CHECKBOX_COL_WIDTH : 0);
    columns.forEach((col, i) => {
      if (!col.frozen) return;
      offsets[i] = accumulated;
      // width может быть строкой ("120px") или числом
      const w = typeof col.width === "number" ? col.width : typeof col.width === "string" ? parseInt(col.width, 10) || 120 : 120; // дефолт если width не задан
      accumulated += w;
    });
    return offsets;
  }, [columns, selectable]);

  const hasFrozen = columns.some((c) => c.frozen);

  const paginationRange = useMemo(() => getPaginationRange(currentPage, totalPages), [currentPage, totalPages]);

  // Строим массив { page, buttonIndex } чтобы знать позицию каждой кнопки
  // Порядок: [prevBtn=0, ...pageButtons, nextBtn=last]
  const paginationItems = useMemo(() => {
    // Считаем сколько кнопок-страниц (не "...")
    const pageButtons = paginationRange.filter((p) => p !== "...");
    return { pageButtons, total: pageButtons.length + 2 }; // +2 = prev + next
  }, [paginationRange]);

  useEffect(() => {
    const handler = (e: FocusEvent) => {
      const target = e.target as HTMLElement;

      // Если фокус ушёл в интерактивный элемент ВНЕ контейнера таблицы
      const isInsideTable = containerRef.current?.contains(target);
      const isSearchInput = searchInputRef.current === target;
      const isInsidePagination = paginationRef.current?.contains(target);

      if (isInsideTable || isSearchInput || isInsidePagination) return;

      // Фокус ушёл куда-то за пределы — если это редактируемый элемент, сбрасываем регион
      const isEditable = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;

      if (isEditable) {
        // ✅ Раньше здесь всегда стоял "none", даже если фокус ушёл в легитимный
        // регион (например правый сайдбар, см. CLAUDE.md про focusManager) — эта
        // таблица не единственная на странице, отслеживающая focusin на document,
        // и её собственный "none" молча затирал то, что только что корректно
        // выставил сам сайдбар/SearchableSelect. Теперь сначала смотрим, не
        // помечен ли ближайший предок явным data-region (сайдбар и
        // SearchableSelect в режиме theme="sidebar" ставят его и на себя, и на
        // свой createPortal-контейнер) — и если да, уважаем его вместо "none".
        const region = target.closest<HTMLElement>("[data-region]")?.dataset.region;
        focusManager.setRegion((region as any) ?? "none");
        setSelectedCell(null); // опционально — снять выделение ячейки
      }
    };

    document.addEventListener("focusin", handler);
    return () => document.removeEventListener("focusin", handler);
  }, []);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-200/80 dark:border-slate-700 shadow-sm bg-white dark:bg-slate-800 py-10">
        <Loader text={t("Loading")} progress="indeterminate" />
      </div>
    );
  }

  const showPagination = Boolean(pageSize && totalPages > 1);

  return (
    <div className="flex flex-col shadow-[0_12px_35px_-15px_rgba(0,0,0,0.3)] print:shadow-none rounded-xl">
      {/* ✅ Тулбар — верхняя "титульная" полоса окна (в духе Modal.tsx/ProductFormPage.tsx):
          светлый градиент + скруглённые верхние углы, визуально продолжается рамкой
          в область таблицы/пагинации ниже — единая карточка-"окно", а не голый контент.
          ✅ relative-обёртка + панель массовых действий абсолютным слоем ПОВЕРХ (не под)
          тулбара — иначе появление галочки добавляло бы новую строку и "прыгало" бы
          содержимое страницы вниз (см. жалобу пользователя). Сам тулбар при активном
          выборе становится invisible (не hidden!), чтобы сохранить высоту блока —
          именно высота invisible-тулбара и задаёт размер, который абсолютный слой
          заполняет через inset-0. Оверлей — с overflow-x-auto (не flex-wrap), чтобы
          при нехватке места он не перенёсся на вторую строку и не увеличил высоту. */}
      <div className="relative rounded-t-xl border border-slate-200/80 dark:border-slate-700">
        <div
          className={`flex items-center gap-2 px-3 py-2.5 print:hidden print:px-0 rounded-t-xl bg-gradient-to-r from-slate-50 to-slate-100/70 dark:from-slate-800 dark:to-slate-800/60 ${
            selectable && checkedItems.size > 0 ? "invisible" : ""
          }`}
        >
        {onSearchChange !== undefined && (
          <div className="flex-1 min-w-0">
            <Input
              type="text"
              ref={searchInputRef}
              title={`${t("Search")} (Ctrl + /)`}
              value={searchQuery}
              onKeyDown={handleSearchKeyDown}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t("Search_press_esc_to_reset")}
              leftIcon={<Search size={18} />}
              onClear={() => onSearchChange("")}
              // ✅ Выразительный фокус (см. запрос: "чтобы в глаза бросалась") —
              // шире кольцо + свечение тенью + более заметная граница, поверх
              // дефолтного focus-стиля Input.tsx (только для поиска в таблице).
              inputClassName="focus:ring-4 focus:ring-indigo-500/40 dark:focus:ring-indigo-400/30 focus:border-indigo-500 dark:focus:border-indigo-400 focus:shadow-lg focus:shadow-indigo-500/25"
            />
          </div>
        )}

        {/* Десктоп */}
        <div className="hidden md:flex items-center gap-2">
          <div className="flex items-center gap-1">
            {PAGE_SIZE_OPTIONS.map((size) => (
              <button
                key={size}
                onClick={() => {
                  handlePageSizeChange(size);
                  playClickSound();
                }}
                className={`px-2 py-1.5 rounded border text-sm transition ${
                  pageSize === size
                    ? "bg-indigo-600 border-indigo-600 text-white"
                    : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                {size}
              </button>
            ))}
          </div>

          <div className="relative" ref={excelDropdownRef}>
            <button
              onClick={() => setExcelDropdownOpen((v) => !v)}
              title={`${t("ExportToExcel")} (Ctrl + E)`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-green-300 dark:border-green-700 bg-white dark:bg-gray-800 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition shadow-sm"
            >
              <span>📊</span>
              <span>Excel</span>
              <ChevronDown size={14} className={`transition-transform ${excelDropdownOpen ? "rotate-180" : ""}`} />
            </button>
            {excelDropdownOpen && (
              <div className="absolute left-0 mt-1 z-50 min-w-[180px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg py-1">
                <button
                  onClick={() => {
                    handleExcelExport(paginatedData);
                    setExcelDropdownOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                  <span>📄</span> {t("ExcelCurrentPage")} ({paginatedData.length})
                </button>
                <button
                  onClick={() => {
                    handleExcelExport(sortedData);
                    setExcelDropdownOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                  <span>📊</span> {t("ExcelAllData")} ({allDataCount})
                </button>
              </div>
            )}
          </div>

          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setDropdownOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition shadow-sm"
            >
              <Settings2 size={14} /> {t("Columns")}
              <ChevronDown size={14} className={`transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 mt-1 z-50 min-w-[220px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg py-1">
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 dark:border-gray-700 text-gray-400 font-medium">
                  <span>{t("Column")}</span>
                  <div className="flex gap-3 pr-1">
                    <Eye size={12} />
                    <Printer size={12} />
                  </div>
                </div>
                {columns.map((col, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                    <span className="text-gray-700 dark:text-gray-300 truncate max-w-[130px]">{col.header}</span>
                    <div className="flex gap-3 items-center">
                      <button onClick={() => toggleView(i)}>
                        {hiddenInView.has(i) ? <EyeOff size={14} className="text-red-400" /> : <Eye size={14} className="text-gray-400 hover:text-indigo-500" />}
                      </button>
                      <button onClick={() => togglePrint(i)}>
                        <Printer size={14} className={hiddenInPrint.has(i) ? "text-red-400" : "text-gray-400 hover:text-indigo-500"} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Мобайл */}
        <div className="md:hidden relative" ref={mobileMenuRef}>
          <button
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300"
          >
            <Settings2 size={16} />
            <ChevronDown size={13} className={`transition-transform ${mobileMenuOpen ? "rotate-180" : ""}`} />
          </button>

          {mobileMenuOpen && (
            <div className="absolute right-0 mt-1 z-50 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg py-1">
              <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-400 mb-1.5">{t("RowsPerPage")}</p>
                <div className="flex gap-1 flex-wrap">
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <button
                      key={size}
                      onClick={() => {
                        handlePageSizeChange(size);
                      }}
                      className={`px-2 py-1 rounded border text-xs transition ${
                        pageSize === size ? "bg-indigo-600 border-indigo-600 text-white" : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
              <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-400 mb-1.5">Excel</p>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => {
                      handleExcelExport(paginatedData);
                      setMobileMenuOpen(false);
                    }}
                    className="w-full text-left px-2 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded flex items-center gap-2"
                  >
                    <span>📄</span> {t("ExcelCurrentPage")} ({paginatedData.length})
                  </button>
                  <button
                    onClick={() => {
                      handleExcelExport(sortedData);
                      setMobileMenuOpen(false);
                    }}
                    className="w-full text-left px-2 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded flex items-center gap-2"
                  >
                    <span>📊</span> {t("ExcelAllData")} ({allDataCount})
                  </button>
                </div>
              </div>
              <div className="px-3 py-2">
                <p className="text-xs text-gray-400 mb-1.5">{t("Columns")}</p>
                {columns.map((col, i) => (
                  <div key={i} className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[140px]">{col.header}</span>
                    <div className="flex gap-3 items-center">
                      <button onClick={() => toggleView(i)}>{hiddenInView.has(i) ? <EyeOff size={14} className="text-red-400" /> : <Eye size={14} className="text-gray-400" />}</button>
                      <button onClick={() => togglePrint(i)}>
                        <Printer size={14} className={hiddenInPrint.has(i) ? "text-red-400" : "text-gray-400"} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        </div>

        {/* ✅ Панель массовых действий — абсолютный слой ПОВЕРХ тулбара (см. комментарий
            в начале блока про invisible-тулбар), а не отдельная строка под ним. */}
        {selectable && checkedItems.size > 0 && (
          <div className="absolute inset-0 rounded-t-xl flex items-center gap-2 px-3 overflow-x-auto whitespace-nowrap bg-indigo-50 dark:bg-indigo-900/20 print:hidden">
            <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300 shrink-0">{t("SelectedCount", { count: checkedItems.size })}</span>
            <button onClick={clearChecked} className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-red-500 transition shrink-0">
              <XIcon size={14} /> {t("ClearSelection")}
            </button>
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <button
                onClick={handleBulkExcelExport}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-green-300 dark:border-green-700 bg-white dark:bg-gray-800 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition text-sm"
              >
                <FileSpreadsheet size={14} /> {t("ExcelSelected")}
              </button>
              <button
                onClick={handlePrintSelected}
                title={`${t("PrintSelected")} (Ctrl + P)`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition text-sm"
              >
                <Printer size={14} /> {t("PrintSelected")}
              </button>
              {onBulkDelete && (
                <button
                  onClick={() => setBulkDeleteConfirmOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-red-300 dark:border-red-700 bg-white dark:bg-gray-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition text-sm"
                >
                  <Trash2 size={14} /> {t("DeleteSelected")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {data.length > 0 ? (
        // ✅ max-h + overflow-auto здесь (а не sticky-позиционирование тулбара/пагинации
        // над скроллом всей страницы) — строки скроллятся ВНУТРИ этого блока, а тулбар
        // поиска сверху и пагинация снизу остаются обычными (не sticky) соседними
        // элементами вне зоны скролла — поэтому первая/последняя строка никогда не
        // уезжают у них "под низ" (см. жалобу пользователя на первую версию с sticky:
        // те же строки на скролле реально прятались под тулбаром/пагинацией, т.к. sticky
        // просто рисует их ПОВЕРХ содержимого, которое проезжает под ними). Печать
        // (print:max-h-none) — распечатать должны все строки целиком, а не только
        // видимую в скролле часть.
        <div
          className={`overflow-auto max-h-[70vh] print:max-h-none border-x border-slate-200/80 dark:border-slate-700 print:border-black ${showPagination ? "" : "rounded-b-xl border-b"}`}
          ref={containerRef}
          style={{ scrollPaddingTop: headerHeight }}
        >
          <table
            className="w-full text-left border-collapse min-w-max"
            onFocus={() => {
              // Не перебиваем регион если мы в action-колонке
              if (focusManager.getRegion() !== "action") {
                focusManager.setRegion("table");
              }
            }}
          >
            {/* ✅ sticky top-0 на каждом th (не на thead — position:sticky на самом
                <thead> ненадёжен в браузерах) — шапка остаётся видимой при скролле
                строк внутри max-h блока выше (см. запрос пользователя). z-30 для
                frozen-колонок (им и так нужен больший z ради горизонтальной sticky-
                логики — угловая ячейка "прилипает" и сверху, и слева одновременно),
                z-20 для остальных — выше z-10 у tbody-ячеек, чтобы шапка не
                просвечивала строками, проезжающими под ней при скролле. */}
            <thead ref={theadRef} className="border-b border-gray-300 dark:border-gray-700 print:static">
              <tr>
                {selectable && (
                  <th
                    className={`px-2 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 print:hidden print:static sticky top-0 ${hasFrozen ? "left-0 z-30" : "z-20"}`}
                    style={{ width: CHECKBOX_COL_WIDTH }}
                  >
                    <input ref={selectAllRef} type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAllOnPage} className="cursor-pointer" title={t("SelectAllOnPage")} />
                  </th>
                )}
                <th
                  className={`px-2 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-medium text-gray-500 w-10
                    print:static sticky top-0 ${hasFrozen ? "z-30" : "z-20"}
                  `}
                  style={hasFrozen ? { left: selectable ? CHECKBOX_COL_WIDTH : 0 } : undefined}
                >
                  №
                </th>
                {columns.map((col, i) => (
                  <th
                    key={i}
                    className={`
                      relative px-1 py-0.5 md:px-2 md:py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700
                      font-medium text-gray-700 dark:text-gray-300 print:!text-black
                      print:static sticky top-0 ${col.frozen ? "z-30" : "z-20"}
                      ${hiddenInView.has(i) ? "hidden print:table-cell" : ""}
                      ${hiddenInPrint.has(i) ? "print:hidden" : ""}
                    `}
                    style={{
                      width: getColWidth(i, col),
                      ...(col.frozen && frozenOffsets[i] !== undefined ? { left: frozenOffsets[i] } : {}),
                    }}
                  >
                    <div
                      className={`flex items-center gap-1 min-w-0 ${col.sortable ? "cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400" : ""}`}
                      onClick={() => col.sortable && col.accessor && handleSort(col.accessor)}
                    >
                      <span className="truncate min-w-0" title={col.header}>
                        {col.header}
                      </span>
                      {col.sortable && effectiveSortKey === col.accessor && <span className="shrink-0">{effectiveSortDir === "asc" ? "▲" : "▼"}</span>}
                    </div>
                    {/* ✅ Ручка изменения ширины колонки мышкой — drag за правый край.
                        z-30, чтобы быть выше sticky-контента (z-20) у frozen-колонок. */}
                    <div
                      onMouseDown={(e) => handleResizeStart(e, i)}
                      className="absolute top-0 right-0 h-full w-1.5 z-30 cursor-col-resize select-none print:hidden hover:bg-indigo-400/50 active:bg-indigo-500/70"
                      title={t("ResizeColumn")}
                    />
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
              {paginatedData.map((item, index) => {
                const isRowSelected = selectedRow === item.id;
                const isChecked = checkedItems.has(item.id);
                const displayIndex = pageSize ? (currentPage - 1) * pageSize + index + 1 : index + 1;
                return (
                  <tr
                    key={item.id}
                    data-row-id={item.id}
                    className={`${isRowSelected ? "bg-yellow-100 dark:bg-yellow-900/30" : rowClassName?.(item) || "hover:bg-gray-50 dark:hover:bg-gray-800/60"} transition-colors
                      ${selectable && checkedItems.size > 0 && !isChecked ? "print:hidden" : ""}
                    `}
                  >
                    {selectable && (
                      <td
                        className={`px-2 py-1 border border-gray-200 dark:border-gray-700 text-center bg-gray-50/50 dark:bg-gray-800/30 print:hidden ${hasFrozen ? "sticky left-0 z-10" : ""}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input type="checkbox" checked={isChecked} onChange={() => toggleChecked(item)} className="cursor-pointer" />
                      </td>
                    )}
                    <td
                      className={`px-2 py-1 border border-gray-200 dark:border-gray-700 text-center text-gray-400 bg-gray-50/50 dark:bg-gray-800/30
                      ${hasFrozen ? "sticky z-10" : ""}
                    `}
                      style={hasFrozen ? { left: selectable ? CHECKBOX_COL_WIDTH : 0 } : undefined}
                    >
                      {displayIndex}
                    </td>
                    {columns.map((col, i) => {
                      const isCellSelected = selectedCell?.rowId === item.id && selectedCell?.colIndex === i;
                      const isActionCell = col.isActionColumn === true;
                      return (
                        <td
                          key={i}
                          onClick={() => handleCellClick(item, i, col)}
                          onDoubleClick={() => !isActionCell && onRowDoubleClick && onRowDoubleClick(item)}
                          className={`
                            px-1 py-0.5 md:px-2 md:py-1 border border-gray-200 dark:border-gray-700 cursor-pointer break-words
                            text-gray-700 dark:text-gray-300 print:!text-black
                            ${isCellSelected && !isActionCell ? "bg-yellow-400/30 dark:bg-yellow-500/20 shadow-[inset_0_0_0_2px_#eab308] print:!bg-transparent print:shadow-none" : ""}
                            ${isCellSelected && isActionCell ? "shadow-[inset_0_0_0_2px_#6366f1] print:shadow-none" : ""}
                            ${hiddenInView.has(i) ? "hidden print:table-cell" : ""}
                            ${hiddenInPrint.has(i) ? "print:hidden" : ""}
                            ${col.frozen ? `sticky z-10 ${isRowSelected ? "bg-yellow-100 dark:bg-yellow-900/30" : "bg-white dark:bg-gray-900"}` : ""}
                          `}
                          style={{
                            width: getColWidth(i, col),
                            // Для frozen ячеек нужен явный background иначе будет прозрачный
                            ...(col.frozen && frozenOffsets[i] !== undefined ? { left: frozenOffsets[i] } : {}),
                          }}
                        >
                          {col.render ? col.render(item) : String(item[col.accessor as keyof T] ?? "")}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>

            {/* ✅ Строка "Итого" — рендерится, только если хотя бы одна колонка
                задаёт footerValue (см. Column.footerValue выше). Ячейки повторяют
                структуру/ширины из thead/tbody (checkbox-плейсхолдер, №-плейсхолдер
                с подписью "Итого", затем сами колонки), чтобы визуально совпадать
                с остальной таблицей 1:1, включая frozen-колонки. */}
            {columns.some((c) => c.footerValue) && (
              <tfoot>
                <tr className="bg-gray-100 dark:bg-gray-800 font-semibold">
                  {selectable && <td className="px-2 py-1 border border-gray-200 dark:border-gray-700 print:hidden" style={{ width: CHECKBOX_COL_WIDTH }} />}
                  <td
                    className={`px-2 py-1 border border-gray-200 dark:border-gray-700 text-center text-gray-500 dark:text-gray-400 text-xs ${hasFrozen ? "sticky z-10 bg-gray-100 dark:bg-gray-800" : ""}`}
                    style={hasFrozen ? { left: selectable ? CHECKBOX_COL_WIDTH : 0 } : undefined}
                  >
                    {t("Total")}
                  </td>
                  {columns.map((col, i) => (
                    <td
                      key={i}
                      className={`
                        px-1 py-0.5 md:px-2 md:py-1 border border-gray-200 dark:border-gray-700
                        text-gray-800 dark:text-gray-100
                        ${hiddenInView.has(i) ? "hidden print:table-cell" : ""}
                        ${hiddenInPrint.has(i) ? "print:hidden" : ""}
                        ${col.frozen ? "sticky z-10 bg-gray-100 dark:bg-gray-800" : ""}
                      `}
                      style={{
                        width: getColWidth(i, col),
                        ...(col.frozen && frozenOffsets[i] !== undefined ? { left: frozenOffsets[i] } : {}),
                      }}
                    >
                      {col.footerValue ? col.footerValue(sortedData) : null}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      ) : (
        <div className="rounded-b-xl border-x border-b border-slate-200/80 dark:border-slate-700 px-2">
          <EmptyState />
        </div>
      )}

      {/* ── Пагинация ────────────────────────────────────────────────── */}
      {/* ✅ Вынесена из overflow-auto контейнера таблицы (там, где строки скроллятся
          внутри max-h блока выше) — она обычный (не sticky) сосед этого блока, поэтому
          всегда полностью видна и никогда не перекрывает и не прячет строки под собой. */}
      {data.length > 0 && showPagination && (
        <div className="flex items-center justify-between px-2 py-2 rounded-b-xl border-x border-b border-t border-slate-200/80 dark:border-slate-700 bg-white dark:bg-gray-900 print:hidden">
          <span className="text-sm text-gray-500 dark:text-gray-400">
                {t("ShowingResults", {
                  from: (currentPage - 1) * pageSize + 1,
                  // to: Math.min(currentPage * pageSize, sortedData.length),
                  // total: sortedData.length,
                  to: Math.min(currentPage * pageSize, isServer ? (pagination as ServerPagination).total : sortedData.length),
                  total: isServer ? (pagination as ServerPagination).total : sortedData.length,
                })}
              </span>

              {/*
                ref={paginationRef} — контейнер, по которому ищем все кнопки.
                title на контейнере — подсказка о горячей клавише.
                Порядок кнопок в DOM: [← , ...pages, →]
                Индексы для focusPaginationButton: 0=prev, 1..N=pages, N+1=next
              */}
              <div ref={paginationRef} className="flex items-center gap-1" title="Ctrl+Q — перейти к пагинации" onFocus={() => focusManager.setRegion("pagination")}>
                {/* ← Prev */}
                <button
                  onClick={() => handlePageChange(Math.max(1, currentPage - 1), 0)}
                  disabled={currentPage === 1}
                  className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm
                    disabled:opacity-40 disabled:cursor-not-allowed
                    hover:bg-gray-50 dark:hover:bg-gray-700 transition
                    focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  ←
                </button>

                {/* Номера страниц */}
                {(() => {
                  // buttonIndex начинается с 1 (0 = prev)
                  let btnIdx = 1;
                  return paginationRange.map((page, i) => {
                    if (page === "...") {
                      return (
                        <span key={`dots-${i}`} className="px-2 text-gray-400">
                          …
                        </span>
                      );
                    }
                    const thisIdx = btnIdx++;
                    return (
                      <button
                        key={page}
                        onClick={() => handlePageChange(page as number, thisIdx)}
                        className={`
                          px-3 py-1 rounded border text-sm transition
                          focus:outline-none focus:ring-2 focus:ring-indigo-500
                          ${
                            currentPage === page
                              ? "bg-indigo-600 border-indigo-600 text-white"
                              : "border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                          }
                        `}
                      >
                        {page}
                      </button>
                    );
                  });
                })()}

                {/* → Next */}
                <button
                  onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1), paginationItems.total - 1)}
                  disabled={currentPage === totalPages}
                  className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm
                    disabled:opacity-40 disabled:cursor-not-allowed
                    hover:bg-gray-50 dark:hover:bg-gray-700 transition
                    focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  →
                </button>
              </div>
            </div>
      )}

      {selectable && onBulkDelete && (
        <ConfirmModal
          isOpen={bulkDeleteConfirmOpen}
          type="delete"
          title={t("DeleteSelected")}
          message={t("ConfirmBulkDeleteMessage", { count: checkedItems.size })}
          confirmText={t("Delete")}
          loading={bulkDeleting}
          onClose={() => setBulkDeleteConfirmOpen(false)}
          onConfirm={handleConfirmBulkDelete}
        />
      )}
    </div>
  );
};

// as typeof TableInner — сохраняет дженерик-сигнатуру TableInner<T> снаружи;
// React.memo сам по себе стирает generics, оборачивая тип в NamedExoticComponent.
export const Table = React.memo(TableInner) as typeof TableInner;
