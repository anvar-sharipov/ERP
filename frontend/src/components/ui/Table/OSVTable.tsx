// // frontend/src/components/ui/Table/OSVTable.tsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { playClickSound } from "../../../core/utils/sound";
import { focusManager } from "../../../core/utils/focusManager";

interface OSVRow {
  id: number;
  code: string;
  name: string;
  account_type: string;
  opening_debit: string;
  opening_credit: string;
  debit_turnover: string;
  credit_turnover: string;
  closing_debit: string;
  closing_credit: string;
}

interface OSVTableProps {
  rows: OSVRow[];
  onRowDoubleClick?: (row: OSVRow) => void;
}

const fmt = (v: string | number) => (Number(v) === 0 ? "" : Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 2 }));

export const OSVTable: React.FC<OSVTableProps> = ({ rows, onRowDoubleClick }) => {
  const { t } = useTranslation();

  const [selectedCell, setSelectedCell] = useState<{ rowIdx: number; colIdx: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // При появлении данных — выделяем первую ячейку
  useEffect(() => {
    if (rows.length > 0) {
      setSelectedCell({ rowIdx: 0, colIdx: 0 });
      focusManager.setRegion("table");
    }
  }, [rows.length]);

  // Итоги
  const totals = rows.reduce(
    (acc, row) => ({
      opening_debit: acc.opening_debit + Number(row.opening_debit),
      opening_credit: acc.opening_credit + Number(row.opening_credit),
      debit_turnover: acc.debit_turnover + Number(row.debit_turnover),
      credit_turnover: acc.credit_turnover + Number(row.credit_turnover),
      closing_debit: acc.closing_debit + Number(row.closing_debit),
      closing_credit: acc.closing_credit + Number(row.closing_credit),
    }),
    { opening_debit: 0, opening_credit: 0, debit_turnover: 0, credit_turnover: 0, closing_debit: 0, closing_credit: 0 },
  );

  // Скролл к выделенной строке
  const scrollToRow = useCallback((rowIdx: number) => {
    requestAnimationFrame(() => {
      const row = containerRef.current?.querySelector(`tr[data-row-idx="${rowIdx}"]`);
      row?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, []);

  useEffect(() => {
    const handler = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      const isInsideContainer = containerRef.current?.contains(target);
      if (isInsideContainer) return;

      const isEditable = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;

      if (isEditable) {
        focusManager.setRegion("none");
      }
    };

    document.addEventListener("focusin", handler);
    return () => document.removeEventListener("focusin", handler);
  }, []);

  // Навигация стрелками
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (focusManager.getRegion() !== "table") return;
      if (!selectedCell) return;
      const isModalOpen = document.querySelector(".fixed.inset-0.z-50");
      if (isModalOpen) return;

      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable) return;

      const { rowIdx, colIdx } = selectedCell;
      const COLS = [
        { key: "code", label: t("Account"), group: null, numeric: false },
        { key: "name", label: t("Name"), group: null, numeric: false },
        { key: "opening_debit", label: t("Debit"), group: t("OpeningBalance"), numeric: true },
        { key: "opening_credit", label: t("Credit"), group: t("OpeningBalance"), numeric: true },
        { key: "debit_turnover", label: t("Debit"), group: t("PeriodTurnover"), numeric: true },
        { key: "credit_turnover", label: t("Credit"), group: t("PeriodTurnover"), numeric: true },
        { key: "closing_debit", label: t("Debit"), group: t("ClosingBalance"), numeric: true },
        { key: "closing_credit", label: t("Credit"), group: t("ClosingBalance"), numeric: true },
      ] as const;

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
        const next = Math.min(colIdx + 1, COLS.length - 1);
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
        if (onRowDoubleClick) onRowDoubleClick(rows[rowIdx]);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedCell, rows, onRowDoubleClick, scrollToRow, t]);

  const thBase = "px-2 py-1.5 font-semibold text-white uppercase tracking-wider border border-green-700 dark:border-green-800";
  const tdBase = "px-2 py-1 border border-gray-200 dark:border-slate-600 cursor-pointer";

  const COLS = [
    { key: "code", label: t("Account"), group: null, numeric: false },
    { key: "name", label: t("Name"), group: null, numeric: false },
    { key: "opening_debit", label: t("Debit"), group: t("OpeningBalance"), numeric: true },
    { key: "opening_credit", label: t("Credit"), group: t("OpeningBalance"), numeric: true },
    { key: "debit_turnover", label: t("Debit"), group: t("PeriodTurnover"), numeric: true },
    { key: "credit_turnover", label: t("Credit"), group: t("PeriodTurnover"), numeric: true },
    { key: "closing_debit", label: t("Debit"), group: t("ClosingBalance"), numeric: true },
    { key: "closing_credit", label: t("Credit"), group: t("ClosingBalance"), numeric: true },
  ] as const;

  type ColKey = (typeof COLS)[number]["key"];

  // Группируем заголовки
  const groups: { label: string | null; span: number }[] = [];
  COLS.forEach((col) => {
    const last = groups[groups.length - 1];
    if (last && last.label === col.group) {
      last.span++;
    } else {
      groups.push({ label: col.group, span: 1 });
    }
  });

  return (
    <div ref={containerRef} className="overflow-x-auto rounded-lg border border-green-700 dark:border-green-800 w-fit" onFocus={() => focusManager.setRegion("table")} tabIndex={-1}>
      <table className="text-xs md:text-sm border-collapse w-auto">
        <thead>
          {/* Строка 1 — группы */}
          <tr>
            {groups.map((g, i) => (
              <th key={i} colSpan={g.span} className={`${thBase} bg-green-700 dark:bg-green-800 text-center`}>
                {g.label ?? ""}
              </th>
            ))}
          </tr>
          {/* Строка 2 — Дт/Кт и названия */}
          <tr>
            {COLS.map((col, i) => (
              <th
                key={i}
                className={`${thBase} bg-green-600 dark:bg-green-700 ${col.numeric ? "text-right" : "text-left"}`}
                style={{ width: col.key === "code" ? 60 : col.key === "name" ? 180 : 100 }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, rowIdx) => (
            <tr
              key={row.id}
              data-row-idx={rowIdx}
              onDoubleClick={() => onRowDoubleClick?.(row)}
              className={`
                transition-colors
                ${rowIdx % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-gray-50/50 dark:bg-slate-800/30"}
                hover:bg-green-50 dark:hover:bg-green-900/10
              `}
            >
              {COLS.map((col, colIdx) => {
                const isSelected = selectedCell?.rowIdx === rowIdx && selectedCell?.colIdx === colIdx;
                const isRowSelected = selectedCell?.rowIdx === rowIdx;
                const val = row[col.key as ColKey];
                return (
                  <td
                    key={colIdx}
                    onClick={() => {
                      playClickSound();
                      setSelectedCell({ rowIdx, colIdx });
                      focusManager.setRegion("table");
                    }}
                    className={`
                      ${tdBase}
                      ${col.numeric ? "font-mono text-right tabular-nums" : ""}
                      ${col.key === "code" ? "font-semibold text-indigo-600 dark:text-indigo-400" : "text-gray-700 dark:text-gray-300"}
                      ${isSelected ? "bg-yellow-400/30 dark:bg-yellow-500/20 shadow-[inset_0_0_0_2px_#eab308]" : ""}
                      ${isRowSelected && !isSelected ? "bg-yellow-50 dark:bg-yellow-900/10" : ""}
                      ${col.key === "opening_debit" || col.key === "debit_turnover" || col.key === "closing_debit" ? "text-blue-600 dark:text-blue-400" : ""}
                      ${col.key === "opening_credit" || col.key === "credit_turnover" || col.key === "closing_credit" ? "text-red-500 dark:text-red-400" : ""}
                    `}
                  >
                    {col.numeric ? fmt(val) : val}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>

        <tfoot>
          <tr className="bg-green-700 dark:bg-green-800 font-semibold">
            <td colSpan={2} className={`${tdBase} border-green-600 dark:border-green-700 text-white font-bold`}>
              {t("Total")}
            </td>
            {(["opening_debit", "opening_credit", "debit_turnover", "credit_turnover", "closing_debit", "closing_credit"] as const).map((key) => (
              <td key={key} className={`${tdBase} border-green-600 dark:border-green-700 text-white font-mono text-right tabular-nums`}>
                {fmt(totals[key])}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

