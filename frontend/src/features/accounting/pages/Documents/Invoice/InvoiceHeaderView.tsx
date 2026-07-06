// frontend/src/features/accounting/pages/Documents/Invoice/InvoiceHeaderView.tsx
import { useTranslation } from "react-i18next";

// ✅ Компактный "как настоящий документ" рендер шапки — раньше жил только внутри
// HeadDocument.tsx как inline-блок `hidden print:block` (виден только при Ctrl+P).
// Вынесен сюда, чтобы тот же самый JSX использовали и HeadDocument (для печати),
// и DocumentViewPage.tsx (красивый read-only просмотр фактуры) — не две
// независимо поддерживаемые копии (см. правило в CLAUDE.md про screen/print/excel).
export interface InvoiceHeaderViewProps {
  formattedDate: string;
  isMove: boolean;
  warehouseName: string;
  warehouseToName: string;
  documentType: string;
  discountPercent: string | number;
  needsCounterparty: boolean;
  counterpartyName?: string;
  counterpartyPhone?: string;
}

export const InvoiceHeaderView = ({
  formattedDate,
  isMove,
  warehouseName,
  warehouseToName,
  documentType,
  discountPercent,
  needsCounterparty,
  counterpartyName,
  counterpartyPhone,
}: InvoiceHeaderViewProps) => {
  const { t } = useTranslation();

  return (
    <div className="leading-snug mb-2">
      <div className="text-xs flex flex-wrap gap-x-4 gap-y-0.5">
        <div>
          <span className="font-semibold">{t("Date")}:</span> {formattedDate}
        </div>
        <div>
          <span className="font-semibold">{isMove ? t("SourceWarehouse") : t("Warehouse")}:</span> {warehouseName}
        </div>
        {isMove && (
          <div>
            <span className="font-semibold">{t("DestinationWarehouse")}:</span> {warehouseToName}
          </div>
        )}
        {documentType !== "in" && parseFloat(String(discountPercent)) !== 0 && (
          <div>
            <span className="font-semibold">{t("DiscountPercent")}:</span> {discountPercent}%
          </div>
        )}
      </div>

      {needsCounterparty && (
        <div className="mt-1 pt-1 border-t border-gray-300 dark:border-slate-600">
          <span className="text-2xl font-bold">
            {t("Counterparty")}: {counterpartyName ?? "—"}
          </span>
          {counterpartyPhone && <span className="ml-3 text-lg font-normal">{counterpartyPhone}</span>}
        </div>
      )}
    </div>
  );
};
