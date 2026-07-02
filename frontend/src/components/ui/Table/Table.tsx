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
}

// backend pagination
interface ServerPagination {
  mode: "server";
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
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

export const Table = <T extends { id: string | number }>({
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
}: TableProps<T>) => {
  const isServer = pagination?.mode === "server";
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedRow, setSelectedRow] = useState<string | number | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ rowId: string | number; colIndex: number } | null>(null);
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
    // if (isServer) return data;
    // if (isServer) return data ?? [];
    const source = data ?? [];
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
  }, [data, sortConfig, columns]);

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

  const paginatedData = useMemo(() => {
    // if (isServer) return data;
    // if (isServer) return data ?? [];
    if (isServer) return sortedData;
    if (!pageSize) return sortedData;
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [isServer, data, sortedData, currentPage, pageSize]);

  const handleSort = (key: keyof T) => {
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
      setSelectedCell({ rowId: selectedRowId, colIndex: visibleCols[0] });
      onHighlightConsumed?.();
      focusManager.setRegion("table");
      requestAnimationFrame(() => {
        const row = containerRef.current?.querySelector(`tr[data-row-id="${selectedRowId}"]`);
        if (row) row.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  }, [selectedRowId, columns, hiddenInView]);

  useEffect(() => {
    if (selectedRowId == null || !pageSize) return;

    const index = sortedData.findIndex((item) => item.id === selectedRowId);
    if (index === -1) return;

    const targetPage = Math.floor(index / pageSize) + 1;
    if (targetPage !== currentPage) {
      setCurrentPage(targetPage);
    }
  }, [selectedRowId, sortedData, pageSize]);

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

    const lastItem = paginatedData[paginatedData.length - 1];
    setSelectedRowSync(lastItem.id);
    setSelectedCell({ rowId: lastItem.id, colIndex: visibleCols[0] });
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

      // F2 — редактировать (аналог двойного клика)
      if (e.key === "F2") {
        e.preventDefault();
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
      const firstColIndex = visibleCols[0]; // ← вот здесь берётся первая колонка
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
  const frozenOffsets = useMemo(() => {
    const offsets: Record<number, number> = {};
    let accumulated = NUMBER_COL_WIDTH;
    columns.forEach((col, i) => {
      if (!col.frozen) return;
      offsets[i] = accumulated;
      // width может быть строкой ("120px") или числом
      const w = typeof col.width === "number" ? col.width : typeof col.width === "string" ? parseInt(col.width, 10) || 120 : 120; // дефолт если width не задан
      accumulated += w;
    });
    return offsets;
  }, [columns]);

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
        focusManager.setRegion("none"); // или любой нейтральный регион
        setSelectedCell(null); // опционально — снять выделение ячейки
      }
    };

    document.addEventListener("focusin", handler);
    return () => document.removeEventListener("focusin", handler);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400 border border-gray-300 dark:border-gray-700 rounded">
        <span className="text-sm">Загрузка...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Тулбар */}
      <div className="flex items-center gap-2 print:hidden">
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
                  <span>📊</span> {t("ExcelAllData")} ({sortedData.length})
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
                    <span>📊</span> {t("ExcelAllData")} ({sortedData.length})
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

      {data.length > 0 ? (
        <div className="overflow-auto border border-gray-300 dark:border-gray-700 shadow-xl" ref={containerRef}>
          <table
            className="w-full text-left border-collapse min-w-max"
            onFocus={() => {
              // Не перебиваем регион если мы в action-колонке
              if (focusManager.getRegion() !== "action") {
                focusManager.setRegion("table");
              }
            }}
          >
            <thead className="border-b border-gray-300 dark:border-gray-700">
              <tr>
                <th
                  className={`px-2 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-medium text-gray-500 w-10
                    ${hasFrozen ? "sticky left-0 z-20" : ""}
                  `}
                >
                  №
                </th>
                {columns.map((col, i) => (
                  <th
                    key={i}
                    className={`
                      px-1 py-0.5 md:px-2 md:py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700
                      font-medium text-gray-700 dark:text-gray-300 print:!text-black
                      ${hiddenInView.has(i) ? "hidden print:table-cell" : ""}
                      ${hiddenInPrint.has(i) ? "print:hidden" : ""}
                      ${col.frozen ? "sticky z-20" : ""}
                    `}
                    style={{
                      width: col.width,
                      ...(col.frozen && frozenOffsets[i] !== undefined ? { left: frozenOffsets[i] } : {}),
                    }}
                  >
                    <div
                      className={`flex items-center gap-1 ${col.sortable ? "cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400" : ""}`}
                      onClick={() => col.sortable && col.accessor && handleSort(col.accessor)}
                    >
                      {col.header}
                      {col.sortable && sortConfig.key === col.accessor && <span>{sortConfig.direction === "asc" ? "▲" : "▼"}</span>}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
              {paginatedData.map((item, index) => {
                const isRowSelected = selectedRow === item.id;
                const displayIndex = pageSize ? (currentPage - 1) * pageSize + index + 1 : index + 1;
                return (
                  <tr key={item.id} data-row-id={item.id} className={`${isRowSelected ? "bg-yellow-100 dark:bg-yellow-900/30" : "hover:bg-gray-50 dark:hover:bg-gray-800/60"} transition-colors`}>
                    <td
                      className={`px-2 py-1 border border-gray-200 dark:border-gray-700 text-center text-gray-400 bg-gray-50/50 dark:bg-gray-800/30
                      ${hasFrozen ? "sticky left-0 z-10" : ""}
                    `}
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
                            px-1 py-0.5 md:px-2 md:py-1 border border-gray-200 dark:border-gray-700 cursor-pointer whitespace-nowrap
                            text-gray-700 dark:text-gray-300 print:!text-black
                            ${isCellSelected && !isActionCell ? "bg-yellow-400/30 dark:bg-yellow-500/20 shadow-[inset_0_0_0_2px_#eab308] print:!bg-transparent print:shadow-none" : ""}
                            ${isCellSelected && isActionCell ? "shadow-[inset_0_0_0_2px_#6366f1] print:shadow-none" : ""}
                            ${hiddenInView.has(i) ? "hidden print:table-cell" : ""}
                            ${hiddenInPrint.has(i) ? "print:hidden" : ""}
                            ${col.frozen ? `sticky z-10 ${isRowSelected ? "bg-yellow-100 dark:bg-yellow-900/30" : "bg-white dark:bg-gray-900"}` : ""}
                          `}
                          style={{
                            width: col.width,
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
          </table>

          {/* ── Пагинация ────────────────────────────────────────────────── */}
          {pageSize && totalPages > 1 && (
            <div className="flex items-center justify-between px-2 py-2 print:hidden">
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
        </div>
      ) : (
        <EmptyState />
      )}
    </div>
  );
};
