// frontend/src/features/accounting/pages/Accounting/ProductTurnoverDetailPage.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FileSpreadsheet, Package, ImageOff } from "lucide-react";
import { accountApi } from "../../services/accountingApi";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { useRestoreScroll } from "../../../../core/hooks/useRestoreScroll";
import { focusManager } from "../../../../core/utils/focusManager";
import { playClickSound } from "../../../../core/utils/sound";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import { HelpButton } from "../../../../components/ui/HelpButton";
import { BackButton } from "../../../../components/ui/BackButton";
import { Loader } from "../../../../components/ui/Loader";
import { ImagePreview } from "../../../../components/ui/ImagePreview";
import { useCompany } from "../../../../core/context/CompanyContext";
import { useUser } from "../../../../core/context/UserContext";
import { ROUTES } from "../../../../core/router/routes";
import { exportProductTurnoverDetailExcel } from "./exportProductTurnoverDetailExcel";

// ✅ 13 колонок строки документа (см. заголовок таблицы): №, Дата, Контрагент,
// Примечание, Цена, Приход(кол-во/сумма), Возврат(кол-во/сумма), Расход(кол-во/сумма),
// Остаток(кол-во/сумма) — используется для навигации стрелками (как в Table.tsx).
const DETAIL_COLS = 13;

interface DetailRow {
  date: string;
  document_id: number;
  document_number: string;
  document_type: string;
  partner: string;
  note: string;
  price: string;
  discount_percent: string;
  discount_amount: string;
  in_qty: string; in_sum: string;
  return_qty: string; return_sum: string;
  out_qty: string; out_sum: string;
  balance_qty: string; balance_sum: string;
}

interface DetailResponse {
  product_id: number;
  product_name: string;
  product_sku: string | null;
  product_unit: string;
  product_cost_price: string;
  product_thumbnail_url: string | null;
  product_image_url: string | null;
  start_quantity: string;
  start_value: string;
  turnover: { in_qty: string; in_value: string; return_qty: string; return_value: string; out_qty: string; out_value: string };
  end: { quantity: string; value: string };
  rows: DetailRow[];
}

const fmt = (v: number | string) => Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 2 });
const fmtQty = (v: number | string) => Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const td = "border border-black dark:border-gray-700 px-1.5 py-1 text-xs md:text-sm whitespace-nowrap";
const th = "border border-black dark:border-gray-600 px-1.5 py-1 text-xs md:text-sm font-semibold text-center whitespace-nowrap";
// ✅ Подсветка выбранной ячейки/строки — тот же приём, что и в ProductTurnoverTable.tsx/Table.tsx.
const ring = (rowIdx: number, colIdx: number, selectedCell: { rowIdx: number; colIdx: number } | null) =>
  selectedCell?.rowIdx === rowIdx && selectedCell?.colIdx === colIdx ? "shadow-[inset_0_0_0_2px_#eab308] bg-yellow-100/70 dark:bg-yellow-500/10" : "";
const rowRing = (rowIdx: number, selectedCell: { rowIdx: number; colIdx: number } | null) =>
  selectedCell?.rowIdx === rowIdx ? "!bg-yellow-50 dark:!bg-yellow-500/5" : "";

const ProductTurnoverDetailPage = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { canView } = usePageAccess("document");
  const { company } = useCompany();
  const { user } = useUser();
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  // ✅ "Наш" back button — Alt+← + звук, тот же компонент, что и на других
  // detail-страницах (см. CLAUDE.md: любая detail-страница, открытая с основной,
  // должна иметь back button). Ключ зависит от того, откуда пришли: если из
  // ProductsListPage (?from=products), при возврате назад нужно подсветить тот же
  // товар там — используем тот же ключ "selectedProductId", что и её собственный
  // useRestoreScroll. Иначе (пришли из ProductTurnoverPage) — свой отдельный ключ,
  // scroll/выделение на самой странице оборота тут не нужны.
  const cameFromProducts = searchParams.get("from") === "products";
  const { getBackProps } = useRestoreScroll(cameFromProducts ? "selectedProductId" : "selectedTurnoverDetailProductId", () => {});
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedCell, setSelectedCell] = useState<{ rowIdx: number; colIdx: number } | null>(null);
  // ✅ react-query делает фоновый refetch при каждом монтировании (staleTime по
  // умолчанию 0) — это меняет ссылку на `data` ещё раз уже ПОСЛЕ восстановления
  // выделения из sessionStorage, и без этого флага восстанавливающий useEffect
  // срабатывал бы повторно и сбрасывал выделение обратно на первую строку.
  const restoredRef = useRef(false);

  const dateFrom = searchParams.get("date_from") ?? "";
  const dateTo = searchParams.get("date_to") ?? "";
  const warehouse = searchParams.get("warehouse") ?? undefined;
  // ✅ Пришедший из ProductTurnoverPage.tsx филиал (когда выбран только он, без
  // конкретного склада) — тот же принцип пересечения со scope, что и в самом отчёте.
  const branch = searchParams.get("branch") ?? undefined;

  const { data, isLoading } = useQuery<DetailResponse>({
    queryKey: ["product-turnover-detail", id, dateFrom, dateTo, warehouse, branch],
    queryFn: () => accountApi.getProductTurnoverDetail({ product: id!, date_from: dateFrom, date_to: dateTo, warehouse, branch }),
    enabled: !!id && !!dateFrom && !!dateTo && canView,
  });

  const openDocument = useCallback(
    (rowIdx: number) => {
      const row = data?.rows[rowIdx];
      if (row) {
        navigate(ROUTES.APP.DOCUMENTS_VIEW.replace(":id", String(row.document_id)), {
          state: { returnKey: "selectedTurnoverDocumentId", returnId: row.document_id },
        });
      }
    },
    [data, navigate],
  );

  const scrollToCell = useCallback((rowIdx: number, colIdx: number) => {
    requestAnimationFrame(() => {
      const cell = containerRef.current?.querySelector(`[data-row-idx="${rowIdx}"][data-col-idx="${colIdx}"]`);
      cell?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    });
  }, []);

  // ✅ При возврате из DocumentViewPage (см. её back-кнопку, пишет returnId в
  // sessionStorage под этим ключом) — выделяем и скроллим к той же строке-документу,
  // с которой ушли, вместо того чтобы всегда сбрасывать выделение на первую строку.
  useEffect(() => {
    if (!data?.rows.length || restoredRef.current) return;
    restoredRef.current = true;
    const savedDocId = sessionStorage.getItem("selectedTurnoverDocumentId");
    if (savedDocId) {
      sessionStorage.removeItem("selectedTurnoverDocumentId");
      const idx = data.rows.findIndex((r) => String(r.document_id) === savedDocId);
      if (idx !== -1) {
        setSelectedCell({ rowIdx: idx, colIdx: 0 });
        focusManager.setRegion("table");
        scrollToCell(idx, 0);
        return;
      }
    }
    setSelectedCell({ rowIdx: 0, colIdx: 0 });
    focusManager.setRegion("table");
  }, [data, scrollToCell]);

  const selectCell = useCallback((rowIdx: number, colIdx: number) => {
    playClickSound();
    focusManager.setRegion("table");
    setSelectedCell({ rowIdx, colIdx });
  }, []);

  // ✅ Клавиатурная навигация по ячейкам — тот же паттерн, что в ProductTurnoverTable.tsx
  // (см. CLAUDE.md: любая таблица/список строк должна иметь такой же focus, как Table.tsx).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (focusManager.getRegion() !== "table") return;
      if (!selectedCell || !data?.rows.length) return;
      const { rowIdx, colIdx } = selectedCell;

      if (e.key === "ArrowDown") {
        const next = Math.min(rowIdx + 1, data.rows.length - 1);
        if (next !== rowIdx) {
          e.preventDefault();
          playClickSound();
          setSelectedCell({ rowIdx: next, colIdx });
          scrollToCell(next, colIdx);
        }
      } else if (e.key === "ArrowUp") {
        const prev = Math.max(rowIdx - 1, 0);
        if (prev !== rowIdx) {
          e.preventDefault();
          playClickSound();
          setSelectedCell({ rowIdx: prev, colIdx });
          scrollToCell(prev, colIdx);
        }
      } else if (e.key === "ArrowRight") {
        const next = Math.min(colIdx + 1, DETAIL_COLS - 1);
        if (next !== colIdx) {
          e.preventDefault();
          playClickSound();
          setSelectedCell({ rowIdx, colIdx: next });
          scrollToCell(rowIdx, next);
        }
      } else if (e.key === "ArrowLeft") {
        const prev = Math.max(colIdx - 1, 0);
        if (prev !== colIdx) {
          e.preventDefault();
          playClickSound();
          setSelectedCell({ rowIdx, colIdx: prev });
          scrollToCell(rowIdx, prev);
        }
      } else if (e.key === "Enter" || e.key === "F2") {
        e.preventDefault();
        openDocument(rowIdx);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedCell, data, scrollToCell, openDocument]);

  const canExport = !!data;
  const handleExportExcel = useMemo(
    () => () => {
      if (!data) return;
      exportProductTurnoverDetailExcel({ company, user, t, dateFrom, dateTo, data });
    },
    [data, company, user, t, dateFrom, dateTo],
  );

  return (
    <RBACGuard isLoading={false} error={null} canView={canView} forbiddenText={t("ForbiddenText")}>
      {isLoading ? (
        <Loader containerClass="py-12" text={t("LoadingProductTurnoverDetail")} progress="indeterminate" />
      ) : !data ? (
        <div className="text-center py-12 text-gray-400">{t("NoDataForPeriod")}</div>
      ) : (
        <div className="space-y-3 p-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <BackButton id={Number(id) || 0} getBackProps={getBackProps} />
              {data.product_thumbnail_url ? (
                <img
                  src={data.product_thumbnail_url}
                  alt={data.product_name}
                  className="w-9 h-9 rounded object-cover shrink-0 cursor-zoom-in"
                  onClick={() => setPreviewImage(data.product_image_url || data.product_thumbnail_url)}
                />
              ) : (
                <div className="w-9 h-9 rounded bg-gray-200 dark:bg-slate-700 shrink-0 flex items-center justify-center">
                  <ImageOff className="w-4 h-4 text-gray-400" />
                </div>
              )}
              <Package className="w-5 h-5 text-indigo-500" />
              <h2 className="text-sm md:text-lg font-bold text-gray-800 dark:text-gray-100">{data.product_name}</h2>
              <HelpButton title={t("ProductTurnoverDetail")}>
                <p>
                  Детализация оборота по товару <b>{data.product_name}</b> за выбранный период — построчно все документы,
                  которые повлияли на его остаток (приход/возврат/расход), с бегущим остатком после каждой строки.
                </p>
                <ul>
                  <li>
                    <b>Двойной клик по строке</b> открывает соответствующий документ.
                  </li>
                  <li>
                    <b>Остаток на начало/конец</b> — по фактическим ценам из документов (не пересчитывается задним числом
                    при изменении текущей себестоимости товара).
                  </li>
                </ul>
              </HelpButton>
            </div>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={!canExport}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs transition-colors disabled:opacity-40"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              {t("ExportToExcel")}
            </button>
          </div>

          <div className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-x-4">
            <span>{t("SKU")}: {data.product_sku ?? "—"}</span>
            <span>{t("Unit")}: {data.product_unit}</span>
            <span>{t("CostPrice")}: {fmt(data.product_cost_price)}</span>
            <span>{t("Period")}: {new Date(dateFrom).toLocaleDateString("ru-RU")} – {new Date(dateTo).toLocaleDateString("ru-RU")}</span>
          </div>

          <div
            ref={containerRef}
            className="overflow-x-auto rounded-lg border border-black dark:border-gray-700"
            onFocus={() => focusManager.setRegion("table")}
            tabIndex={-1}
          >
            <table className="border-collapse w-full text-xs md:text-sm tabular-nums bg-white dark:bg-gray-900">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-800">
                  <th className={th}>№</th>
                  <th className={th}>{t("Date")}</th>
                  <th className={th}>{t("Counterparty")}</th>
                  <th className={th}>{t("Note")}</th>
                  <th className={th}>{t("Price")}</th>
                  <th colSpan={2} className={th}>{t("Incoming")}</th>
                  <th colSpan={2} className={th}>{t("ReturnIn")}</th>
                  <th colSpan={2} className={th}>{t("Outgoing")}</th>
                  <th colSpan={2} className={th}>{t("ClosingBalance")}</th>
                </tr>
                <tr className="bg-gray-50 dark:bg-gray-800/60">
                  <th className={th} colSpan={5} />
                  <th className={th}>{t("Quantity")}</th><th className={th}>{t("Total")}</th>
                  <th className={th}>{t("Quantity")}</th><th className={th}>{t("Total")}</th>
                  <th className={th}>{t("Quantity")}</th><th className={th}>{t("Total")}</th>
                  <th className={th}>{t("Quantity")}</th><th className={th}>{t("Total")}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-gray-50 dark:bg-gray-800 font-semibold">
                  <td className={td} />
                  <td className={td} colSpan={4}>{t("OpeningBalance")}</td>
                  <td className={td} colSpan={6} />
                  <td className={`${td} text-right`}>{fmtQty(data.start_quantity)}</td>
                  <td className={`${td} text-right`}>{fmt(data.start_value)}</td>
                </tr>

                {data.rows.map((r, i) => {
                  const cell = (colIdx: number, className: string, content: React.ReactNode) => (
                    <td
                      data-row-idx={i}
                      data-col-idx={colIdx}
                      onClick={() => selectCell(i, colIdx)}
                      className={`${className} cursor-pointer ${ring(i, colIdx, selectedCell)}`}
                    >
                      {content}
                    </td>
                  );
                  return (
                    <tr
                      key={i}
                      className={`hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors ${rowRing(i, selectedCell)}`}
                      onDoubleClick={() => openDocument(i)}
                    >
                      {cell(0, `${td} text-center`, i + 1)}
                      {cell(1, td, `${new Date(r.date).toLocaleDateString("ru-RU")} ${r.document_number}`)}
                      {cell(2, td, r.partner || "-")}
                      {cell(3, td, r.note || "-")}
                      {cell(4, `${td} text-right`, fmt(r.price))}
                      {cell(5, `${td} text-right text-green-700 dark:text-green-400`, Number(r.in_qty) ? fmtQty(r.in_qty) : "")}
                      {cell(6, `${td} text-right text-green-700 dark:text-green-400`, Number(r.in_qty) ? fmt(r.in_sum) : "")}
                      {cell(7, `${td} text-right text-blue-700 dark:text-blue-400`, Number(r.return_qty) ? fmtQty(r.return_qty) : "")}
                      {cell(8, `${td} text-right text-blue-700 dark:text-blue-400`, Number(r.return_qty) ? fmt(r.return_sum) : "")}
                      {cell(9, `${td} text-right text-red-700 dark:text-red-400`, Number(r.out_qty) ? fmtQty(r.out_qty) : "")}
                      {cell(10, `${td} text-right text-red-700 dark:text-red-400`, Number(r.out_qty) ? fmt(r.out_sum) : "")}
                      {cell(11, `${td} text-right font-medium`, fmtQty(r.balance_qty))}
                      {cell(12, `${td} text-right font-medium`, fmt(r.balance_sum))}
                    </tr>
                  );
                })}

                <tr className="bg-gray-100 dark:bg-gray-800 font-semibold">
                  <td className={td} colSpan={5}>{t("TotalTurnover")}</td>
                  <td className={`${td} text-right`}>{fmtQty(data.turnover.in_qty)}</td>
                  <td className={`${td} text-right`}>{fmt(data.turnover.in_value)}</td>
                  <td className={`${td} text-right`}>{fmtQty(data.turnover.return_qty)}</td>
                  <td className={`${td} text-right`}>{fmt(data.turnover.return_value)}</td>
                  <td className={`${td} text-right`}>{fmtQty(data.turnover.out_qty)}</td>
                  <td className={`${td} text-right`}>{fmt(data.turnover.out_value)}</td>
                  <td className={td} colSpan={2} />
                </tr>

                <tr className="bg-emerald-100 dark:bg-emerald-900/40 font-semibold">
                  <td className={td} />
                  <td className={td} colSpan={4}>{t("ClosingBalance")}</td>
                  <td className={td} colSpan={6} />
                  <td className={`${td} text-right`}>{fmtQty(data.end.quantity)}</td>
                  <td className={`${td} text-right`}>{fmt(data.end.value)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ImagePreview src={previewImage} onClose={() => setPreviewImage(null)} />
    </RBACGuard>
  );
};

export default ProductTurnoverDetailPage;
