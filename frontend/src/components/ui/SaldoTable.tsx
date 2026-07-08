// frontend/src/components/ui/SaldoTable.tsx
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ROUTES } from "../../core/router/routes";

export interface SaldoItem {
  date: string;
  journal_entry_id: number;
  document_id: number | null;
  comment: string;
  corr_account: string;
  debit: number;
  credit: number;
  balance: number;
}

// ✅ Ровно то, что отдаёт backend::_compute_subconto_card (transaction_views.py) —
// используется и карточкой сальдо на форме накладной (CounterpartyBalanceCard.tsx),
// и модалкой сальдо контрагента из списка (CounterpartySaldoModal.tsx), без
// дублирования расчёта/вёрстки (см. CLAUDE.md про паритет экран/печать/Excel —
// тот же принцип: один источник данных/вёрстки для всех мест использования).
export interface SaldoAccountData {
  items: SaldoItem[];
  opening_balance: number;
  closing_balance: number;
  total_debit: number;
  total_credit: number;
  account_code: string;
  account_name: string;
  subconto_label: string;
}

interface SaldoTableProps {
  data: SaldoAccountData;
}

const fmt = (n: number) => n.toLocaleString("ru-RU", { minimumFractionDigits: 2 });
const cell = (n: number) => (n ? fmt(n) : "−");

// Однозначное сальдо (дебет-кредит) раскладывается по двум колонкам —
// стандартная бухгалтерская подача: положительное сальдо показывается в
// колонке "Дебет", отрицательное — по модулю в "Кредит".
const splitBalance = (v: number): [string, string] => (v >= 0 ? [fmt(v), "−"] : ["−", fmt(Math.abs(v))]);

const th = "px-1.5 py-1 border border-gray-300 dark:border-slate-600 print:border-black font-semibold text-gray-600 dark:text-gray-300 print:text-black";
const td = "px-1.5 py-1 border border-gray-300 dark:border-slate-600 print:border-black";

// ✅ Таблица сальдо по одному счёту — показатель/дебет/кредит, начало → проводки
// за день → оборот → конец + бегущий "Остаток". Строки с document_id кликабельны —
// открывают исходный документ (DocumentViewPage.tsx, read-only, см. CLAUDE.md про
// drill-down из отчётов).
export function SaldoTable({ data }: SaldoTableProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const opening = data.opening_balance ?? 0;
  const closing = data.closing_balance ?? 0;
  const totalDebit = data.total_debit ?? 0;
  const totalCredit = data.total_credit ?? 0;
  const items = data.items ?? [];
  const [openingDebit, openingCredit] = splitBalance(opening);
  const [closingDebit, closingCredit] = splitBalance(closing);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs md:text-sm print:text-[10px]">
        <thead>
          <tr className="bg-gray-100 dark:bg-slate-700/60 print:bg-transparent">
            <th colSpan={2} className={th}>
              {t("Indicator")}
            </th>
            <th className={`${th} text-right`}>{t("Debit")}</th>
            <th className={`${th} text-right`}>{t("Credit")}</th>
            <th className={`${th} text-right`}>{t("Balance")}</th>
          </tr>
        </thead>
        <tbody className="text-gray-700 dark:text-gray-200 print:text-black">
          <tr>
            <td colSpan={2} className={`${td} font-medium`}>
              {t("OpeningBalance")}
            </td>
            <td className={`${td} text-right font-mono`}>{openingDebit}</td>
            <td className={`${td} text-right font-mono`}>{openingCredit}</td>
            <td className={`${td} text-right font-mono`}>{fmt(opening)}</td>
          </tr>

          {items.length > 0 ? (
            items.map((item) => {
              const clickable = !!item.document_id;
              return (
                <tr
                  key={item.journal_entry_id}
                  onClick={() => clickable && navigate(ROUTES.APP.DOCUMENTS_VIEW.replace(":id", String(item.document_id)))}
                  title={item.comment}
                  className={clickable ? "cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700/40 print:cursor-default transition-colors" : undefined}
                >
                  <td className={td}>{new Date(item.date).toLocaleDateString("ru-RU")}</td>
                  <td className={`${td} truncate max-w-[110px]`}>
                    {t("CorrAccount")} {item.corr_account}
                  </td>
                  <td className={`${td} text-right font-mono`}>{cell(item.debit)}</td>
                  <td className={`${td} text-right font-mono`}>{cell(item.credit)}</td>
                  <td className={`${td} text-right font-mono`}>{fmt(item.balance)}</td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td className={`${td} text-center`}>−</td>
              <td className={`${td} text-center`}>−</td>
              <td className={`${td} text-center`}>−</td>
              <td className={`${td} text-center`}>−</td>
              <td className={`${td} text-center`}>−</td>
            </tr>
          )}

          <tr className="bg-gray-50 dark:bg-slate-800 print:bg-transparent font-semibold">
            <td colSpan={2} className={td}>
              {t("TotalTurnover")}
            </td>
            <td className={`${td} text-right font-mono`}>{cell(totalDebit)}</td>
            <td className={`${td} text-right font-mono`}>{cell(totalCredit)}</td>
            <td className={td}>−</td>
          </tr>

          <tr className="bg-gray-100 dark:bg-slate-700/60 print:bg-transparent font-semibold">
            <td colSpan={2} className={td}>
              {t("ClosingBalance")}
            </td>
            <td className={`${td} text-right font-mono`}>{closingDebit}</td>
            <td className={`${td} text-right font-mono`}>{closingCredit}</td>
            <td className={`${td} text-right font-mono`}>{fmt(closing)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
