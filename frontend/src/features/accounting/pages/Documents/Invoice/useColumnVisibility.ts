// frontend/src/features/accounting/pages/Documents/Invoice/useColumnVisibility.ts
import { useState, useCallback } from "react";
import { DEFAULT_COLUMNS, type ColumnDef } from "./Interface";

const STORAGE_KEY = (docType: string) => `invoice_cols_${docType}`;

const loadColumns = (docType: string): ColumnDef[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(docType));
    if (!raw) return DEFAULT_COLUMNS;

    const saved: Partial<Record<string, { visibleScreen: boolean; visiblePrint: boolean }>> =
      JSON.parse(raw);

    // Мержим с DEFAULT_COLUMNS — новые колонки из дефолта подхватываются автоматически
    return DEFAULT_COLUMNS.map((col) => {
      const s = saved[col.key];
      if (!s || col.locked) return col;
      return { ...col, visibleScreen: s.visibleScreen, visiblePrint: s.visiblePrint };
    });
  } catch {
    return DEFAULT_COLUMNS;
  }
};

const saveColumns = (docType: string, cols: ColumnDef[]) => {
  const toSave: Record<string, { visibleScreen: boolean; visiblePrint: boolean }> = {};
  for (const col of cols) {
    if (!col.locked) {
      toSave[col.key] = { visibleScreen: col.visibleScreen, visiblePrint: col.visiblePrint };
    }
  }
  localStorage.setItem(STORAGE_KEY(docType), JSON.stringify(toSave));
};

export const useColumnVisibility = (docType: string) => {
  const [columns, setColumns] = useState<ColumnDef[]>(() => loadColumns(docType));

  const toggleScreen = useCallback(
    (key: string) => {
      setColumns((prev) => {
        const next = prev.map((col) =>
          col.key === key && !col.locked
            ? { ...col, visibleScreen: !col.visibleScreen }
            : col
        );
        saveColumns(docType, next);
        return next;
      });
    },
    [docType]
  );

  const togglePrint = useCallback(
    (key: string) => {
      setColumns((prev) => {
        const next = prev.map((col) =>
          col.key === key && !col.locked
            ? { ...col, visiblePrint: !col.visiblePrint }
            : col
        );
        saveColumns(docType, next);
        return next;
      });
    },
    [docType]
  );

  const setAllColumns = useCallback(
    (cols: ColumnDef[]) => {
      setColumns(cols);
      saveColumns(docType, cols);
    },
    [docType]
  );

  const resetColumns = useCallback(() => {
    setColumns(DEFAULT_COLUMNS);
    localStorage.removeItem(STORAGE_KEY(docType));
  }, [docType]);

  return { columns, toggleScreen, togglePrint, setAllColumns, resetColumns };
};