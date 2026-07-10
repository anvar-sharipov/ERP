// frontend/src/features/accounting/pages/Dashboard/RevenueByWarehouseTable.tsx
import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { playClickSound } from "../../../../core/utils/sound";
import { focusManager } from "../../../../core/utils/focusManager";
import type { RevenueByWarehouseRow } from "./RevenueByWarehouseChart";

interface Row extends RevenueByWarehouseRow {
  documents_count: number;
}

interface Props {
  rows: Row[];
}

const fmt = (v: number | string) => Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const COL_COUNT = 4; // №, Склад, Выручка, Кол-во документов

export const RevenueByWarehouseTable = ({ rows }: Props) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedCell, setSelectedCell] = useState<{ rowIdx: number; colIdx: number } | null>(null);

  useEffect(() => {
    if (rows.length > 0) setSelectedCell({ rowIdx: 0, colIdx: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  const scrollToCell = useCallback((rowIdx: number, colIdx: number) => {
    requestAnimationFrame(() => {
      const cell = containerRef.current?.querySelector(`[data-row-idx="${rowIdx}"][data-col-idx="${colIdx}"]`);
      cell?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (focusManager.getRegion() !== "table") return;
      if (!selectedCell) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      const { rowIdx, colIdx } = selectedCell;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(rowIdx + 1, rows.length - 1);
        if (next !== rowIdx) { playClickSound(); setSelectedCell({ rowIdx: next, colIdx }); scrollToCell(next, colIdx); }
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = Math.max(rowIdx - 1, 0);
        if (prev !== rowIdx) { playClickSound(); setSelectedCell({ rowIdx: prev, colIdx }); scrollToCell(prev, colIdx); }
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const next = Math.min(colIdx + 1, COL_COUNT - 1);
        if (next !== colIdx) { playClickSound(); setSelectedCell({ rowIdx, colIdx: next }); scrollToCell(rowIdx, next); }
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const prev = Math.max(colIdx - 1, 0);
        if (prev !== colIdx) { playClickSound(); setSelectedCell({ rowIdx, colIdx: prev }); scrollToCell(rowIdx, prev); }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedCell, rows.length, scrollToCell]);

  const selectCell = (rowIdx: number, colIdx: number) => {
    playClickSound();
    setSelectedCell({ rowIdx, colIdx });
    focusManager.setRegion("table");
  };

  const ring = (rowIdx: number, colIdx: number) =>
    selectedCell?.rowIdx === rowIdx && selectedCell?.colIdx === colIdx
      ? "shadow-[inset_0_0_0_2px_#eab308] bg-yellow-100/70 dark:bg-yellow-500/10"
      : "";
  const rowRing = (rowIdx: number) =>
    selectedCell?.rowIdx === rowIdx ? "!bg-yellow-50 dark:!bg-yellow-500/5" : "";

  const td = "border border-black dark:border-gray-700 px-2 py-1";

  if (rows.length === 0) {
    return <div className="text-center py-8 text-gray-400 text-xs md:text-sm">{t("NoDataForPeriod")}</div>;
  }

  const totalRevenue = rows.reduce((s, r) => s + Number(r.revenue), 0);
  const totalDocs = rows.reduce((s, r) => s + r.documents_count, 0);

  return (
    <div
      ref={containerRef}
      className="overflow-auto max-h-[50vh] rounded-lg border border-black dark:border-gray-700"
      onFocus={() => focusManager.setRegion("table")}
      tabIndex={-1}
    >
      <table className="w-full text-xs md:text-sm tabular-nums bg-white dark:bg-gray-900 border-collapse">
        <thead>
          <tr>
            <th className={`${td} bg-gray-100 dark:bg-gray-800 font-semibold text-center`}>№</th>
            <th className={`${td} bg-gray-100 dark:bg-gray-800 font-semibold text-left`}>{t("Warehouse")}</th>
            <th className={`${td} bg-gray-100 dark:bg-gray-800 font-semibold text-right`}>{t("Revenue")}</th>
            <th className={`${td} bg-gray-100 dark:bg-gray-800 font-semibold text-right`}>{t("DocumentsCount")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, rowIdx) => (
            <tr key={r.warehouse_id} className={`odd:bg-white even:bg-gray-50 dark:odd:bg-gray-900 dark:even:bg-gray-800 ${rowRing(rowIdx)}`}>
              <td data-row-idx={rowIdx} data-col-idx={0} onClick={() => selectCell(rowIdx, 0)} className={`${td} text-center cursor-pointer ${ring(rowIdx, 0)}`}>
                {rowIdx + 1}
              </td>
              <td data-row-idx={rowIdx} data-col-idx={1} onClick={() => selectCell(rowIdx, 1)} className={`${td} cursor-pointer ${ring(rowIdx, 1)}`}>
                {r.warehouse_name}
              </td>
              <td data-row-idx={rowIdx} data-col-idx={2} onClick={() => selectCell(rowIdx, 2)} className={`${td} text-right font-mono cursor-pointer ${ring(rowIdx, 2)}`}>
                {fmt(r.revenue)}
              </td>
              <td data-row-idx={rowIdx} data-col-idx={3} onClick={() => selectCell(rowIdx, 3)} className={`${td} text-right font-mono cursor-pointer ${ring(rowIdx, 3)}`}>
                {r.documents_count}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold bg-emerald-100 dark:bg-emerald-900/50">
            <td className={td} />
            <td className={`${td} text-right`}>{t("GrandTotal")}:</td>
            <td className={`${td} text-right font-mono`}>{fmt(totalRevenue)}</td>
            <td className={`${td} text-right font-mono`}>{totalDocs}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};
