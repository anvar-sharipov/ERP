import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { playClickSound } from "../../../core/utils/sound";
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
}

interface TableProps<T> {
  selectedRowId?: string | number | null;
  columns: Column<T>[];
  data: T[];
  onRowClick?: (item: T) => void;
  onRowDoubleClick?: (item: T) => void;
  tableId?: string;
  // Добавляем пропсы поиска
  searchQuery?: string;
  onSearchChange?: (val: string) => void;
  onHighlightConsumed?: () => void; // snyatiya trigera selected row kotoryy wydelilsya posle create/edit
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

  // всегда первая
  range.push(1);

  if (current > 3) range.push("...");

  // окно вокруг текущей
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) range.push(i);

  if (current < total - 2) range.push("...");

  // всегда последняя
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
}: TableProps<T>) => {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedRow, setSelectedRow] = useState<string | number | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ rowId: string | number; colIndex: number } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const { company: currentCompany } = useCompany();
  const { user: currentUser } = useUser();
  const [sortConfig, setSortConfig] = useState<{ key: keyof T | null; direction: "asc" | "desc" }>({
    key: null,
    direction: "asc",
  });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  // const isFirstRender = useRef(true);
  const containerRef = useRef<HTMLDivElement>(null);
  // const [_activeRegion, setActiveRegion] = useState(focusManager.getRegion());
  // Table.tsx — добавить ref чтобы эффект срабатывал только на изменение значения
  const prevSelectedRowId = useRef<string | number | null>(null);
  const selectedRowRef = useRef<string | number | null>(null);

  const [excelDropdownOpen, setExcelDropdownOpen] = useState(false);
  const excelDropdownRef = useRef<HTMLDivElement>(null);

  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const setSelectedRowSync = useCallback((id: string | number | null) => {
    selectedRowRef.current = id;
    setSelectedRow(id);
  }, []);

  const [pageSize, setPageSize] = useState<number>(() => {
    if (!tableId) return DEFAULT_PAGE_SIZE;
    try {
      const saved = localStorage.getItem(`table:${tableId}:pageSize`);
      return saved ? Number(saved) : DEFAULT_PAGE_SIZE;
    } catch {
      return DEFAULT_PAGE_SIZE;
    }
  });

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
    if (tableId) {
      try {
        localStorage.setItem(`table:${tableId}:pageSize`, String(size));
      } catch {}
    }
  };

  // useEffect(() => {
  //   return focusManager.subscribe(setActiveRegion);
  // }, []);
  useEffect(() => {
    // Подписываемся на изменения
    const unsubscribe = focusManager.subscribe((_newRegion) => {
      // Если переменная не нужна, добавляем подчеркивание
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const [hiddenInView, toggleView] = usePersistedSet(
    tableId ? `table:${tableId}:hiddenView` : "",
    columns.map((c, i) => (c.hideInView ? i : -1)).filter((i) => i !== -1),
  );

  // 3. А вот этот useEffect (который ставит фокус на поиск) верните обратно:
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  const [hiddenInPrint, togglePrint] = usePersistedSet(
    tableId ? `table:${tableId}:hiddenPrint` : "",
    columns.map((c, i) => (c.hideInPrint ? i : -1)).filter((i) => i !== -1),
  );

  // useEffect(() => {
  //   const handler = (e: MouseEvent) => {
  //     if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
  //       setDropdownOpen(false);
  //     }
  //   };
  //   document.addEventListener("mousedown", handler);
  //   return () => document.removeEventListener("mousedown", handler);
  // }, []);
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
    if (!sortConfig.key) return data;
    return [...data].sort((a, b) => {
      const col = columns.find((c) => c.accessor === sortConfig.key);
      const getVal = (item: T) => (col?.sortValue ? col.sortValue(item) : item[sortConfig.key!]);
      const aVal = getVal(a);
      const bVal = getVal(b);
      if (aVal === bVal) return 0;
      const comparison = aVal! < bVal! ? -1 : 1;
      return sortConfig.direction === "asc" ? comparison : -comparison;
    });
  }, [data, sortConfig, columns]);

  // сбрасывать на первую страницу при смене поиска/данных:
  useEffect(() => {
    setCurrentPage(1);
  }, [sortedData.length, searchQuery]);

  const totalPages = pageSize ? Math.ceil(sortedData.length / pageSize) : 1;

  const paginatedData = useMemo(() => {
    if (!pageSize) return sortedData; // без пагинации
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const handleSort = (key: keyof T) => {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
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

    // Пользователь кликнул на ту же строку что редактировал — не трогаем его ячейку
    if (userSelectedCell.current && selectedRowId === selectedRowRef.current) {
      userSelectedCell.current = false;
      setSelectedRowSync(selectedRowId);
      return;
    }

    // Всё остальное: back-навигация / save / edit другой строки — первая ячейка
    userSelectedCell.current = false;
    setSelectedRowSync(selectedRowId);
    const visibleCols = columns.map((_, i) => i).filter((i) => !hiddenInView.has(i));
    if (visibleCols.length > 0) {
      setSelectedCell({ rowId: selectedRowId, colIndex: visibleCols[0] });
      onHighlightConsumed?.();
      focusManager.setRegion("table"); // стрелки работают сразу после back
      requestAnimationFrame(() => {
        const row = containerRef.current?.querySelector(`tr[data-row-id="${selectedRowId}"]`);
        if (row) row.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  }, [selectedRowId, columns, hiddenInView]); // selectedRow намеренно не в deps

  useEffect(() => {
    if (selectedRowId == null || !pageSize) return;

    // ищем индекс в sortedData (уже отфильтрованные + отсортированные)
    const index = sortedData.findIndex((item) => item.id === selectedRowId);
    if (index === -1) return; // запись ещё не появилась в данных

    const targetPage = Math.floor(index / pageSize) + 1;
    if (targetPage !== currentPage) {
      setCurrentPage(targetPage);
    }
  }, [selectedRowId, sortedData, pageSize]);

  // beg po yacheyla klawiaturoy
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (focusManager.getRegion() !== "table") return;
      // 1. ПРОВЕРКА: Если есть хотя бы одна открытая модалка — игнорируем нажатия
      const isModalOpen = document.querySelector(".fixed.inset-0.z-50");
      if (isModalOpen) return;
      if (!selectedCell) return;

      const { rowId, colIndex } = selectedCell;
      const visibleCols = columns.map((_, i) => i).filter((i) => !hiddenInView.has(i));
      // const rowIndex = sortedData.findIndex((item) => item.id === rowId);
      const rowIndex = sortedData.findIndex((item) => item.id === rowId);
      if (rowIndex === -1) {
        // Если мы потеряли строку (например, отфильтровали её поиском),
        // сбросьте выделение, чтобы не было ошибки
        setSelectedCell(null);
        return;
      }
      const visibleColIndex = visibleCols.indexOf(colIndex);

      let nextRowIndex = rowIndex;
      let nextColIndex = visibleColIndex;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        nextRowIndex = Math.min(rowIndex + 1, sortedData.length - 1);
        // focusManager.setRegion("table");
        searchInputRef.current?.blur();
      }

      // ИЗМЕНЕНИЕ ЗДЕСЬ:
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (rowIndex === 0) {
          // Если мы в первой строке, возвращаем фокус в поиск
          playClickSound();
          setSelectedCell(null);
          setSelectedRowSync(null);
          searchInputRef.current?.focus();
          return; // Выходим, так как перемещение по таблице не требуется
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
        const item = sortedData[rowIndex];
        if (item && onRowDoubleClick) onRowDoubleClick(item);
        return;
      }

      if (nextRowIndex !== rowIndex || nextColIndex !== visibleColIndex) {
        const nextItem = sortedData[nextRowIndex];
        const nextCol = visibleCols[nextColIndex];
        if (nextItem) {
          playClickSound();
          setSelectedRowSync(nextItem.id);
          setSelectedCell({ rowId: nextItem.id, colIndex: nextCol });

          requestAnimationFrame(() => {
            const cellElement = containerRef.current?.querySelector(`tr[data-row-id="${nextItem.id}"] td:nth-child(${nextCol + 2})`);
            if (cellElement) {
              cellElement.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
                inline: "nearest",
              });
            }
          });
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedCell, sortedData, columns, hiddenInView, onRowDoubleClick]);

  useEffect(() => {
    if (selectedRowId != null) {
      // back-навигация — поиск не фокусируем, и если браузер сам его сфокусировал — блюрим
      searchInputRef.current?.blur();
      return;
    }
    searchInputRef.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    // Обработка Esc: сбрасываем поиск и ОСТАВЛЯЕМ фокус
    if (e.key === "Escape") {
      e.preventDefault(); // Предотвращаем стандартное поведение, если оно есть
      if (onSearchChange) {
        onSearchChange("");
      }

      // Вместо blur() используем focus(), чтобы курсор остался в поле
      // setTimeout нужен, чтобы фокус сработал корректно после обновления состояния
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 0);
      return;
    }

    // Обработка стрелки вниз: переход в таблицу
    if (e.key === "ArrowDown" && sortedData.length > 0) {
      // если уже есть выделенная ячейка — не перехватываем,
      // глобальный handler сам обработает
      if (selectedCell !== null) return;

      e.preventDefault();
      e.stopPropagation();

      playClickSound();
      const visibleCols = columns.map((_, i) => i).filter((i) => !hiddenInView.has(i));
      const firstColIndex = visibleCols[0];

      if (firstColIndex !== undefined) {
        const firstItem = sortedData[0];
        setSelectedRowSync(firstItem.id);
        setSelectedCell({ rowId: firstItem.id, colIndex: firstColIndex });
        focusManager.setRegion("table"); // ← добавить
        searchInputRef.current?.blur();
      }
    }
  };

  // excel
  // Внутри компонента Table
  const handleExcelExport = useCallback(
    async (exportData: T[]) => {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Данные");

      // await addHeaderToExcel(workbook, worksheet, currentCompany, currentUser);
      await addExcelHeader(workbook, worksheet, currentCompany, currentUser, t);

      const visibleColumns = columns.filter((_, i) => !hiddenInPrint.has(i));

      // ── Ширины колонок ──
      worksheet.columns = [
        { width: 5 }, // №
        ...visibleColumns.map((col) => ({ width: col.excelWidth ?? 20 })),
      ];

      // ── Заголовок таблицы ──
      const headerRow = worksheet.addRow(["№", ...visibleColumns.map((c) => c.header)]);
      headerRow.font = { bold: true };
      // headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE0E0E0" },
        };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      });

      // ── Строки данных ──
      for (let index = 0; index < exportData.length; index++) {
        const item = exportData[index];
        const rowData: (string | number)[] = [index + 1];

        visibleColumns.forEach((col) => {
          if (col.excelImageUrl) {
            rowData.push(""); // placeholder
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

          // colNumber в excelJS начинается с 1.
          // У вас первая колонка — это "№" (индекс 1), а данные начинаются со 2-й колонки.
          // Поэтому доступ к настройке колонки будет через colNumber - 2
          const colIndex = (cell.col as unknown as number) - 2;
          const columnConfig = visibleColumns[colIndex];
          cell.alignment = {
            vertical: "middle",
            horizontal: columnConfig?.excelAlign ?? "left",
            // Если настройка не задана, по умолчанию ставим true (перенос),
            // либо false, если вам нужно, чтобы всё было в одну строку
            wrapText: columnConfig ? (columnConfig.excelWrapText ?? true) : true,
          };
          // cell.alignment = { vertical: "middle", wrapText: true };
        });

        // ── Картинки в строке ──
        for (let colIdx = 0; colIdx < visibleColumns.length; colIdx++) {
          const col = visibleColumns[colIdx];

          // ВАЖНО: ExcelJS использует 0-based индексы.
          // 0-я колонка у нас "№", поэтому данные начинаются с 1-й колонки (colIdx + 1)
          const currentTlCol = colIdx + 1;
          const currentTlRow = row.number - 1;

          // 1. Иконки
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
                // const response = await fetch(`/icons/${iconData.iconName.toLowerCase()}.svg`);

                const svgText = await response.text();

                const coloredSvg = svgText.replace(/stroke="[^"]*"/g, `stroke="${iconData.color}"`);

                // SVG -> PNG
                const pngBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
                  const img = new Image();

                  const svgBlob = new Blob([coloredSvg], {
                    type: "image/svg+xml;charset=utf-8",
                  });

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

                const imageId = workbook.addImage({
                  buffer: pngBuffer,
                  extension: "png",
                });

                worksheet.addImage(imageId, {
                  tl: {
                    col: currentTlCol + 0.15,
                    row: currentTlRow + 0.15,
                  },
                  ext: {
                    width: 24,
                    height: 24,
                  },
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

            const imageId = workbook.addImage({
              buffer: arrayBuffer,
              extension: ext as "png" | "jpeg" | "gif",
            });

            // row.number — 1-based, ExcelJS tl — 0-based
            const tlRow = row.number - 1;
            const tlCol = colIdx + 1; // +1 для колонки №

            // ext вместо br — не создаёт лишних строк
            worksheet.addImage(imageId, {
              tl: { col: tlCol, row: tlRow },
              ext: { width: 45, height: 45 },
            });
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

  // hot key for input search and excel download button
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 1. Проверяем Ctrl+E (Экспорт) - ОН ДОЛЖЕН РАБОТАТЬ ВСЕГДА
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
        e.preventDefault();
        e.stopPropagation();
        handleExcelExport(sortedData);
        return;
      }

      // 2. Для остальных клавиш (например, Ctrl+F) проверяем, не в инпуте ли мы
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
        // 1. Очищаем все текущие выделения в таблице
        setSelectedCell(null);
        setSelectedRowSync(null);

        // 2. Убираем фокус с элементов таблицы
        (document.activeElement as HTMLElement)?.blur();

        // 3. Устанавливаем регион
        focusManager.setRegion("sidebar");

        // 4. Диспатчим событие, чтобы Sidebar подхватил фокус (см. ниже)
        window.dispatchEvent(new CustomEvent("focus-sidebar"));
      }
    };

    window.addEventListener("keydown", handleGlobalKeys);
    return () => window.removeEventListener("keydown", handleGlobalKeys);
  }, []);

  return (
    <div className="flex flex-col gap-2">
      {/* Тулбар с поиском и настройками */}
      <div className="flex items-center gap-2 print:hidden">
        {/* Поиск */}
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

        {/* ── ДЕСКТОП: обычные кнопки ─────────────────────────── */}
        <div className="hidden md:flex items-center gap-2">
          {/* pageSize кнопки */}
          <div className="flex items-center gap-1">
            {PAGE_SIZE_OPTIONS.map((size) => (
              <button
                key={size}
                onClick={() => handlePageSizeChange(size)}
                className={`
            px-2 py-1.5 rounded border text-sm transition
            ${
              pageSize === size
                ? "bg-indigo-600 border-indigo-600 text-white"
                : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            }
          `}
              >
                {size}
              </button>
            ))}
          </div>

          {/* Excel dropdown */}
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
                  <span>📄</span>
                  {t("ExcelCurrentPage")} ({paginatedData.length})
                </button>
                <button
                  onClick={() => {
                    handleExcelExport(sortedData);
                    setExcelDropdownOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                  <span>📊</span>
                  {t("ExcelAllData")} ({sortedData.length})
                </button>
              </div>
            )}
          </div>

          {/* Columns dropdown */}
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

        {/* ── МОБАЙЛ: одна кнопка ⚙️ → единый dropdown ───────── */}
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
              {/* Строк на странице */}
              <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-400 mb-1.5">{t("RowsPerPage")}</p>
                <div className="flex gap-1 flex-wrap">
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <button
                      key={size}
                      onClick={() => {
                        handlePageSizeChange(size);
                      }}
                      className={`
                  px-2 py-1 rounded border text-xs transition
                  ${pageSize === size ? "bg-indigo-600 border-indigo-600 text-white" : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"}
                `}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {/* Excel */}
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
                    <span>📄</span>
                    {t("ExcelCurrentPage")} ({paginatedData.length})
                  </button>
                  <button
                    onClick={() => {
                      handleExcelExport(sortedData);
                      setMobileMenuOpen(false);
                    }}
                    className="w-full text-left px-2 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded flex items-center gap-2"
                  >
                    <span>📊</span>
                    {t("ExcelAllData")} ({sortedData.length})
                  </button>
                </div>
              </div>

              {/* Колонки */}
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
          {/* Таблица */}
          <table className="w-full text-left border-collapse min-w-max" onFocus={() => focusManager.setRegion("table")}>
            <thead className="border-b border-gray-300 dark:border-gray-700">
              <tr>
                <th className="px-2 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-medium text-gray-500 w-10">№</th>
                {columns.map((col, i) => {
                  // if (hiddenInView.has(i)) return null;
                  return (
                    <th
                      // ${hiddenInPrint.has(i) ? "print:hidden" : ""}
                      key={i}
                      className={`
                      px-1 py-0.5 md:px-2 md:py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700
                      font-medium text-gray-700 dark:text-gray-300 print:!text-black
                      
                      ${hiddenInView.has(i) ? "hidden print:table-cell" : ""}
                      ${hiddenInPrint.has(i) ? "print:hidden" : ""}
                    `}
                      style={{ width: col.width }}
                    >
                      <div
                        className={`flex items-center gap-1 ${col.sortable ? "cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400" : ""}`}
                        onClick={() => col.sortable && col.accessor && handleSort(col.accessor)}
                      >
                        {col.header}
                        {col.sortable && sortConfig.key === col.accessor && <span>{sortConfig.direction === "asc" ? "▲" : "▼"}</span>}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
              {paginatedData.map((item, index) => {
                const isRowSelected = selectedRow === item.id;
                const displayIndex = pageSize ? (currentPage - 1) * pageSize + index + 1 : index + 1;
                return (
                  <tr key={item.id} data-row-id={item.id} className={`${isRowSelected ? "bg-yellow-100 dark:bg-yellow-900/30" : "hover:bg-gray-50 dark:hover:bg-gray-800/60"} transition-colors`}>
                    <td className="px-2 py-1 border border-gray-200 dark:border-gray-700 text-center text-gray-400 bg-gray-50/50 dark:bg-gray-800/30">{displayIndex}</td>
                    {columns.map((col, i) => {
                      // if (hiddenInView.has(i)) return null;
                      const isCellSelected = selectedCell?.rowId === item.id && selectedCell?.colIndex === i;
                      return (
                        <td
                          // ${hiddenInPrint.has(i) ? "print:hidden" : ""}
                          key={i}
                          onClick={() => handleCellClick(item, i, col)}
                          onDoubleClick={() => onRowDoubleClick && onRowDoubleClick(item)}
                          className={`
                          px-1 py-0.5 md:px-2 md:py-1 border border-gray-200 dark:border-gray-700 cursor-pointer whitespace-nowrap
                          text-gray-700 dark:text-gray-300 print:!text-black

                          ${isCellSelected ? "bg-yellow-400/30 dark:bg-yellow-500/20 shadow-[inset_0_0_0_2px_#eab308] print:!bg-transparent print:shadow-none" : ""}
                          
                          ${hiddenInView.has(i) ? "hidden print:table-cell" : ""}
                          ${hiddenInPrint.has(i) ? "print:hidden" : ""}
                        `}
                          style={{ width: col.width }}
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
          {pageSize && totalPages > 1 && (
            <div className="flex items-center justify-between px-2 py-2 print:hidden">
              {/* Инфо */}
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {t("Showing")} {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, sortedData.length)} {t("Of")} {sortedData.length}
              </span>

              {/* Кнопки страниц */}
              <div className="flex items-center gap-1">
                {/* Назад */}
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm
          disabled:opacity-40 disabled:cursor-not-allowed
          hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  ←
                </button>

                {/* Номера страниц */}
                {getPaginationRange(currentPage, totalPages).map((page, i) =>
                  page === "..." ? (
                    <span key={`dots-${i}`} className="px-2 text-gray-400">
                      …
                    </span>
                  ) : (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page as number)}
                      className={`
              px-3 py-1 rounded border text-sm transition
              ${currentPage === page ? "bg-indigo-600 border-indigo-600 text-white" : "border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"}
            `}
                    >
                      {page}
                    </button>
                  ),
                )}

                {/* Вперёд */}
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm
          disabled:opacity-40 disabled:cursor-not-allowed
          hover:bg-gray-50 dark:hover:bg-gray-700 transition"
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
