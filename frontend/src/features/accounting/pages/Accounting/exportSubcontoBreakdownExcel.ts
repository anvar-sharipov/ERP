// frontend/src/features/accounting/pages/Accounting/exportSubcontoBreakdownExcel.ts
import ExcelJS from "exceljs";
import { addExcelHeader } from "../../../../core/utils/excelHelpers";

interface BreakdownRow {
  subconto_label: string;
  opening_debit: number;
  opening_credit: number;
  debit_turnover: number;
  credit_turnover: number;
  closing_debit: number;
  closing_credit: number;
}

interface Totals {
  opening_debit: number; opening_credit: number;
  debit_turnover: number; credit_turnover: number;
  closing_debit: number; closing_credit: number;
}

interface CompanyLike {
  name?: string;
  logo?: string | null;
  logo2?: string | null;
}

interface UserLike {
  full_name?: string;
}

export interface ExportSubcontoBreakdownExcelOptions {
  company: CompanyLike | null | undefined;
  user: UserLike | null | undefined;
  t: (key: string) => string;
  dateFrom: string;
  dateTo: string;
  accountCode: string;
  accountName: string;
  subcontoName: string;
  rows: BreakdownRow[];
  totals: Totals;
  // ✅ Точное отражение текущего вида страницы (см. CLAUDE.md: экран/печать/Excel
  // не должны расходиться) — если на SubcontoBreakdownPage.tsx включено
  // "Группировать по агенту", сюда передаются те же сегменты (label+rows+totals),
  // что рисуются там отдельными таблицами; Excel-экспорт воспроизводит ту же
  // структуру, а не плоский список независимо от того, что видно на экране.
  groupSegments?: { label: string; rows: BreakdownRow[]; totals: Totals }[] | null;
}

// ✅ Строгая чёрно-серая палитра — как в exportDocumentExcel.ts (документ должен
// выглядеть как обычный деловой отчёт, а не яркая презентация): светло-серая
// заливка + чёрный жирный текст на заголовках/итогах, без цветных заливок.
const FLOAT_NUMFMT = "#,##0.00";
const HEADER_FILL = "FFE0E0E0";
const SUBTOTAL_FILL = "FFF2F2F2";
const GRANDTOTAL_FILL = "FFD9D9D9";
const GROUP_LABEL_FILL = "FFF2F2F2";
const thin = { top: { style: "thin" as const }, left: { style: "thin" as const }, bottom: { style: "thin" as const }, right: { style: "thin" as const } };

export async function exportSubcontoBreakdownExcel(opts: ExportSubcontoBreakdownExcelOptions): Promise<void> {
  const { company, user, t, dateFrom, dateTo, accountCode, accountName, subcontoName, rows, totals, groupSegments } = opts;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(t("AccountCard"));

  await addExcelHeader(workbook, worksheet, company, user, t);

  const titleRow = worksheet.addRow([
    `${t("AccountCard")}: ${accountCode} ${accountName} (${subcontoName}), ${new Date(dateFrom).toLocaleDateString("ru-RU")} — ${new Date(dateTo).toLocaleDateString("ru-RU")}`,
  ]);
  titleRow.font = { bold: true, size: 14 };
  worksheet.mergeCells(titleRow.number, 1, titleRow.number, 8);
  titleRow.getCell(1).alignment = { horizontal: "center" };
  worksheet.addRow([]);

  const addColumnHeaders = () => {
    // ✅ №, субконто, затем Дт/Кт × (открыт./оборот/закрыт.) — 8 колонок.
    const groupHeaderRow = worksheet.addRow(["", "", t("OpeningBalance"), "", t("PeriodTurnover"), "", t("ClosingBalance"), ""]);
    worksheet.mergeCells(groupHeaderRow.number, 3, groupHeaderRow.number, 4);
    worksheet.mergeCells(groupHeaderRow.number, 5, groupHeaderRow.number, 6);
    worksheet.mergeCells(groupHeaderRow.number, 7, groupHeaderRow.number, 8);
    groupHeaderRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
      cell.alignment = { horizontal: "center" };
      cell.border = thin;
    });

    const colHeaderRow = worksheet.addRow(["№", subcontoName, t("Debit"), t("Credit"), t("Debit"), t("Credit"), t("Debit"), t("Credit")]);
    colHeaderRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
      cell.alignment = { horizontal: "center" };
      cell.border = thin;
    });
  };

  // ✅ Нумерация — единый счётчик, продолжающийся сквозь все группы (как и на
  // экране: rowIdx там тоже общий на весь список, не сбрасывается по группам).
  let rowNumber = 0;

  const addDataRow = (row: BreakdownRow) => {
    rowNumber += 1;
    const excelRow = worksheet.addRow([
      rowNumber,
      row.subconto_label,
      row.opening_debit,
      row.opening_credit,
      row.debit_turnover,
      row.credit_turnover,
      row.closing_debit,
      row.closing_credit,
    ]);
    excelRow.eachCell((cell, colNumber) => {
      cell.border = thin;
      if (colNumber >= 3) cell.numFmt = FLOAT_NUMFMT;
    });
    excelRow.getCell(1).alignment = { horizontal: "center" };
  };

  const addTotalsRow = (label: string, t2: Totals, fill = SUBTOTAL_FILL) => {
    // ✅ Метка объединяется с колонкой "№" (см. CLAUDE.md: текст в Excel-ячейке
    // никогда не должен обрезаться соседней колонкой — merge, а не расчёт на
    // пустоту соседа) — значение пишем в якорную (левую) ячейку диапазона.
    const totalRow = worksheet.addRow([label, "", t2.opening_debit, t2.opening_credit, t2.debit_turnover, t2.credit_turnover, t2.closing_debit, t2.closing_credit]);
    worksheet.mergeCells(totalRow.number, 1, totalRow.number, 2);
    totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      cell.border = thin;
      if (colNumber >= 3) cell.numFmt = FLOAT_NUMFMT;
    });
  };

  if (groupSegments && groupSegments.length > 0) {
    // ✅ Та же структура, что и на экране в режиме "Группировать по агенту" —
    // отдельный блок колонок-заголовков + строк + подытог на каждого агента.
    for (const seg of groupSegments) {
      const labelRow = worksheet.addRow([seg.label]);
      worksheet.mergeCells(labelRow.number, 1, labelRow.number, 8);
      labelRow.getCell(1).font = { bold: true };
      labelRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GROUP_LABEL_FILL } };
        cell.border = thin;
      });

      addColumnHeaders();
      seg.rows.forEach(addDataRow);
      addTotalsRow(`${t("Total")}: ${seg.label}`, seg.totals);
      worksheet.addRow([]);
    }
    addTotalsRow(t("GrandTotal"), totals, GRANDTOTAL_FILL);
  } else {
    addColumnHeaders();
    rows.forEach(addDataRow);
    addTotalsRow(t("GrandTotal"), totals, GRANDTOTAL_FILL);
  }

  worksheet.columns.forEach((col, i) => {
    col.width = i === 0 ? 6 : i === 1 ? 34 : 16;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${t("AccountCard")}_${accountCode}_${new Date().toLocaleDateString("ru-RU").replace(/\./g, "-")}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}
