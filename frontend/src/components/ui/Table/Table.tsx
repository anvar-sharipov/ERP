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

export const Table = <T extends { id: string | number }>({ columns, data, onRowClick, onRowDoubleClick, tableId = "", searchQuery, onSearchChange, selectedRowId }: TableProps<T>) => {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedRow, setSelectedRow] = useState<string | number | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ rowId: string | number; colIndex: number } | null>(null);
  const { company: currentCompany } = useCompany();
  const { user: currentUser } = useUser();
  const [sortConfig, setSortConfig] = useState<{ key: keyof T | null; direction: "asc" | "desc" }>({
    key: null,
    direction: "asc",
  });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  const isFirstRender = useRef(true);
  const containerRef = useRef<HTMLDivElement>(null);
  // const [_activeRegion, setActiveRegion] = useState(focusManager.getRegion());

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

  // useEffect(() => {
  //   // Если это самый первый рендер, НЕ трогаем фокус (даем сработать фокусу на поиске)
  //   if (isFirstRender.current) {
  //     isFirstRender.current = false;
  //     // Но всё равно восстанавливаем selectedRow для подсветки, если нужно
  //     if (selectedRowId != null) setSelectedRow(selectedRowId);
  //     return;
  //   }

  //   // Если это не первый рендер и пришел ID — фокусируем ячейку
  //   if (selectedRowId != null) {
  //     setSelectedRow(selectedRowId);
  //     const visibleCols = columns.map((_, i) => i).filter((i) => !hiddenInView.has(i));
  //     if (visibleCols.length > 0) {
  //       setSelectedCell({
  //         rowId: selectedRowId,
  //         colIndex: visibleCols[0],
  //       });
  //       // Если ячейка сфокусирована, убираем фокус с поиска (если он там был)
  //       searchInputRef.current?.blur();
  //     }
  //   }
  // }, [selectedRowId, columns, hiddenInView]);

  // useEffect(() => {
  //   if (selectedRowId != null) {
  //     setSelectedRow(selectedRowId);
  //     // selectedCell НЕ трогаем — пусть мышь сама управляет ячейкой
  //   }
  // }, [selectedRowId]);

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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
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

  const handleSort = (key: keyof T) => {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  // const handleCellClick = (item: T, colIndex: number, column: Column<T>) => {
  //   playClickSound();
  //   setSelectedRow(item.id);
  //   setSelectedCell({ rowId: item.id, colIndex });
  //   if (onRowClick) onRowClick(item);
  //   if (column.onCellClick) column.onCellClick(item);
  // };

  const userSelectedCell = useRef(false);

  // в handleCellClick добавить:
  const handleCellClick = (item: T, colIndex: number, column: Column<T>) => {
    focusManager.setRegion("table");
    playClickSound();
    userSelectedCell.current = true; // <-- добавить
    setSelectedRow(item.id);
    setSelectedCell({ rowId: item.id, colIndex });
    if (onRowClick) onRowClick(item);
    if (column.onCellClick) column.onCellClick(item);
  };

  // в useEffect исправить:
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      if (selectedRowId != null) setSelectedRow(selectedRowId);
      return;
    }

    if (selectedRowId != null) {
      if (userSelectedCell.current) {
        // Пользователь сам кликнул — не перезаписываем ячейку
        userSelectedCell.current = false;
        setSelectedRow(selectedRowId);
        return;
      }
      // Только для back-навигации — ставим первую ячейку
      setSelectedRow(selectedRowId);
      const visibleCols = columns.map((_, i) => i).filter((i) => !hiddenInView.has(i));
      if (visibleCols.length > 0) {
        setSelectedCell({ rowId: selectedRowId, colIndex: visibleCols[0] });
        searchInputRef.current?.blur();
      }
    }
  }, [selectedRowId, columns, hiddenInView]);

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
          setSelectedRow(null);
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
          setSelectedRow(nextItem.id);
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
      e.preventDefault();
      e.stopPropagation(); // Важно: предотвращает конфликт с глобальным слушателем

      playClickSound();
      const visibleCols = columns.map((_, i) => i).filter((i) => !hiddenInView.has(i));
      const firstColIndex = visibleCols[0];

      if (firstColIndex !== undefined) {
        const firstItem = sortedData[0];
        setSelectedRow(firstItem.id);
        setSelectedCell({ rowId: firstItem.id, colIndex: firstColIndex });

        // Убираем фокус с инпута только при переходе в таблицу
        searchInputRef.current?.blur();
      }
    }
  };

  // excel
  // Внутри компонента Table
  const handleExcelExport = useCallback(async () => {
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
    for (let index = 0; index < sortedData.length; index++) {
      const item = sortedData[index];
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
  }, [columns, sortedData, hiddenInPrint, currentCompany, currentUser, t, tableId]);

  // hot key for input search and excel download button
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 1. Проверяем Ctrl+E (Экспорт) - ОН ДОЛЖЕН РАБОТАТЬ ВСЕГДА
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
        e.preventDefault();
        e.stopPropagation();
        handleExcelExport();
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
        setSelectedRow(null);

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
      <div className="flex justify-between items-center print:hidden" ref={dropdownRef}>
        {/* Поиск теперь внутри таблицы */}
        {onSearchChange !== undefined && (
          <div className="relative w-96">
            <Input
              type="text"
              ref={searchInputRef}
              title={`${t("Search")} (Ctrl + /)`}
              value={searchQuery}
              onKeyDown={handleSearchKeyDown}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t("Search_press_esc_to_reset")}
              leftIcon={<Search size={18} />}
              onClear={() => onSearchChange("")} // Всё! Теперь поле очищается по клику и по Esc
            />
          </div>
        )}

        <div className="ml-auto relative flex gap-2">
  
          {/* excel */}
          <button
            onClick={handleExcelExport}
            title={`${t("ExportToExcel")} (Ctrl + E)`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-green-300 dark:border-green-700 bg-white dark:bg-gray-800 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition shadow-sm"
          >
            <span>📊</span>
            <span>Excel</span>
          </button>

          {/* Кнопка настройки колонок */}
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition shadow-sm"
          >
            <Settings2 size={14} /> {t("Columns")} <ChevronDown size={14} className={`transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
          </button>
          {dropdownOpen && (
            <div className="absolute right-0 mt-10 z-50 min-w-[220px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg py-1">
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
                    <button onClick={() => toggleView(i)} title={hiddenInView.has(i) ? "Показать" : "Скрыть"}>
                      {hiddenInView.has(i) ? <EyeOff size={14} className="text-red-400" /> : <Eye size={14} className="text-gray-400 hover:text-indigo-500" />}
                    </button>
                    <button onClick={() => togglePrint(i)} title={hiddenInPrint.has(i) ? "Включить в печать" : "Исключить из печати"}>
                      <Printer size={14} className={hiddenInPrint.has(i) ? "text-red-400" : "text-gray-400 hover:text-indigo-500"} />
                    </button>
                  </div>
                </div>
              ))}
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
              {sortedData.map((item, index) => {
                const isRowSelected = selectedRow === item.id;
                return (
                  <tr key={item.id} data-row-id={item.id} className={`${isRowSelected ? "bg-yellow-100 dark:bg-yellow-900/30" : "hover:bg-gray-50 dark:hover:bg-gray-800/60"} transition-colors`}>
                    <td className="px-2 py-1 border border-gray-200 dark:border-gray-700 text-center text-gray-400 bg-gray-50/50 dark:bg-gray-800/30">{index + 1}</td>
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
        </div>
      ) : (
        <EmptyState />
      )}
    </div>
  );
};
