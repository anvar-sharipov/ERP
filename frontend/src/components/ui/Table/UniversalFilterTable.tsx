// frontend/src/components/ui/Table/UniversalFilterTable.tsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { playClickSound } from "../../../core/utils/sound";
import { focusManager } from "../../../core/utils/focusManager";
import { getColumnsFor, getCellValue, type UniversalFilterGroupBy, type UniversalFilterRow } from "../../../features/accounting/pages/Reports/universalFilterColumns";

interface UniversalFilterTableProps {
  rows: UniversalFilterRow[];
  groupBy: UniversalFilterGroupBy;
  hasProfit: boolean;
  totals: UniversalFilterRow;
  // ✅ group_by !== 'none' — Enter/F2 на строке "спускается" внутрь этой
  // группы (см. UniversalFilterPage.tsx), не уходит на отдельную под-страницу
  // на каждое измерение (иначе снова копипаст фиксированных вариантов).
  onDrillDown?: (row: UniversalFilterRow) => void;
  // group_by === 'none' — Enter/F2 открывает исходный документ (read-only).
  onOpenDocument?: (documentId: number) => void;
}

export const UniversalFilterTable: React.FC<UniversalFilterTableProps> = ({ rows, groupBy, hasProfit, totals, onDrillDown, onOpenDocument }) => {
  const { t } = useTranslation();
  const columns = getColumnsFor(groupBy, hasProfit, t);

  const [selectedCell, setSelectedCell] = useState<{ rowIdx: number; colIdx: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (rows.length > 0) {
      setSelectedCell({ rowIdx: 0, colIdx: 0 });
    } else {
      setSelectedCell(null);
    }
  }, [rows.length, groupBy]);

  const scrollToRow = useCallback((rowIdx: number) => {
    requestAnimationFrame(() => {
      const row = containerRef.current?.querySelector(`tr[data-row-idx="${rowIdx}"]`);
      row?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, []);

  const activateRow = useCallback(
    (rowIdx: number) => {
      const row = rows[rowIdx];
      if (!row) return;
      if (groupBy === "none") {
        if (row.document_id != null) onOpenDocument?.(Number(row.document_id));
      } else {
        onDrillDown?.(row);
      }
    },
    [rows, groupBy, onOpenDocument, onDrillDown],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (focusManager.getRegion() !== "table") return;
      if (!selectedCell) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable) return;

      const { rowIdx, colIdx } = selectedCell;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(rowIdx + 1, rows.length - 1);
        if (next !== rowIdx) {
          playClickSound();
          setSelectedCell({ rowIdx: next, colIdx });
          scrollToRow(next);
        }
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = Math.max(rowIdx - 1, 0);
        if (prev !== rowIdx) {
          playClickSound();
          setSelectedCell({ rowIdx: prev, colIdx });
          scrollToRow(prev);
        }
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const next = Math.min(colIdx + 1, columns.length - 1);
        if (next !== colIdx) {
          playClickSound();
          setSelectedCell({ rowIdx, colIdx: next });
        }
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const prev = Math.max(colIdx - 1, 0);
        if (prev !== colIdx) {
          playClickSound();
          setSelectedCell({ rowIdx, colIdx: prev });
        }
      }
      if (e.key === "Enter" || e.key === "F2") {
        e.preventDefault();
        activateRow(rowIdx);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedCell, rows, columns.length, scrollToRow, activateRow]);

  const thBase = "px-2 py-1.5 font-semibold text-white uppercase tracking-wider border border-gray-600 dark:border-gray-700";
  const tdBase = "px-2 py-1 border border-gray-200 dark:border-slate-600 cursor-pointer";

  return (
    <div
      ref={containerRef}
      className="overflow-x-auto print:overflow-visible rounded-lg border border-gray-600 dark:border-gray-700 print:border-black w-fit print:w-full [print-color-adjust:exact] [-webkit-print-color-adjust:exact]"
      onFocus={() => focusManager.setRegion("table")}
      tabIndex={-1}
    >
      <table className="text-xs md:text-sm border-collapse w-auto print:w-full">
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={i} className={`${thBase} bg-gray-700 dark:bg-gray-800 print:bg-gray-300 print:text-black ${col.numeric ? "text-right" : "text-left"}`} style={{ width: col.width }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
                {t("NotFound")}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                data-row-idx={rowIdx}
                onDoubleClick={() => activateRow(rowIdx)}
                className={`transition-colors ${rowIdx % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-gray-50/50 dark:bg-slate-800/30"} print:!bg-transparent hover:bg-indigo-50 dark:hover:bg-indigo-900/10`}
              >
                {columns.map((col, colIdx) => {
                  const isSelected = selectedCell?.rowIdx === rowIdx && selectedCell?.colIdx === colIdx;
                  const isRowSelected = selectedCell?.rowIdx === rowIdx;
                  return (
                    <td
                      key={colIdx}
                      onClick={() => {
                        playClickSound();
                        setSelectedCell({ rowIdx, colIdx });
                        focusManager.setRegion("table");
                      }}
                      className={`
                        ${tdBase} print:border-black
                        ${col.numeric ? "font-mono text-right tabular-nums" : ""}
                        text-gray-700 dark:text-gray-300 print:text-black
                        ${isSelected ? "shadow-[inset_0_0_0_2px_#eab308] bg-yellow-100/70 dark:bg-yellow-500/10 print:!bg-transparent print:!shadow-none" : ""}
                        ${isRowSelected && !isSelected ? "!bg-yellow-50 dark:!bg-yellow-500/5 print:!bg-transparent" : ""}
                      `}
                    >
                      {getCellValue(row, col, t)}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>

        {rows.length > 0 && (
          <tfoot>
            <tr className="bg-gray-700 dark:bg-gray-800 print:bg-gray-300 font-semibold">
              {columns.map((col, i) => (
                <td key={i} className={`${tdBase} border-gray-600 dark:border-gray-700 print:border-black text-white print:text-black ${col.numeric ? "font-mono text-right tabular-nums" : "font-bold"}`}>
                  {i === 0 ? t("Total") : col.numeric ? getCellValue(totals, col, t) : ""}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
};
