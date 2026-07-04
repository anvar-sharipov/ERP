import ExcelJS from "exceljs";

export const addExcelHeader = async (
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  company: any,
  user: any,
  t: any
) => {
  // --- 1. НАСТРОЙКИ СТРАНИЦЫ И ПЕЧАТИ ---
  worksheet.pageSetup.margins = {
    left: 0.3,
    right: 0.2,
    top: 0.2,
    bottom: 0.2,
    header: 0,
    footer: 0,
  };

  worksheet.pageSetup.orientation = "portrait";
  worksheet.pageSetup.fitToPage = true;
  worksheet.pageSetup.fitToWidth = 1;
  worksheet.pageSetup.fitToHeight = 0;

//   worksheet.printOptions = {
//     horizontalCentered: true,
//   };
  worksheet.pageSetup.horizontalCentered = true;
  worksheet.pageSetup.verticalCentered = false; // если нужно, можно поставить true

  // --- 2. Логотип ---
  const logoPath = company?.logo || company?.logo2;
  if (logoPath) {
    try {
      const response = await fetch(logoPath);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const ext = logoPath.split(".").pop()?.split("?")[0] || "png";

      const imageId = workbook.addImage({
        buffer: arrayBuffer,
        extension: ext as "png" | "jpeg" | "gif",
      });

      worksheet.addImage(imageId, {
        tl: { col: 0, row: 0 },
        ext: { width: 80, height: 80 },
      });
    } catch (e) {
      console.error("Ошибка загрузки логотипа для Excel:", e);
    }
  }

  // --- 3. Информация ---
  const infoData = [
    { label: `${t("Company")}:`, value: company?.name || "—" },
    { label: `${t("Operator")}:`, value: user?.full_name || "—" },
    { label: `${t("DownloadDate")}:`, value: new Date().toLocaleString() },
  ];

  infoData.forEach((item, index) => {
    const rowNum = index + 1;
    // Метка — колонки C:D, значение — колонки E:I. Обе merge'нутся, чтобы длинный
    // текст не "прятался" под соседними ячейками товарной таблицы ниже — её ширины
    // колонок задаются отдельно и могут не совпадать с шириной, нужной этому блоку.
    const cellLabel = worksheet.getCell(rowNum, 3);
    const cellValue = worksheet.getCell(rowNum, 5);

    cellLabel.value = item.label;
    cellLabel.font = { bold: true };
    cellValue.value = item.value;

    worksheet.mergeCells(rowNum, 3, rowNum, 4);
    worksheet.mergeCells(rowNum, 5, rowNum, 9);
  });

  // --- 4. Отступ перед таблицей ---
  worksheet.addRow([]);
};