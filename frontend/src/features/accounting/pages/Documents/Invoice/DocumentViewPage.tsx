// frontend/src/features/accounting/pages/Documents/Invoice/DocumentViewPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FileSpreadsheet } from "lucide-react";
import { documentApi } from "../../../services/documentApi";
import { userScopeApi } from "../../../services/transactionApi";
import { usePageAccess } from "../../../../../core/hooks/usePageAccess";
import { useSidebar } from "../../../../../core/context/SidebarRightContext";
import { useCompany } from "../../../../../core/context/CompanyContext";
import { useUser } from "../../../../../core/context/UserContext";
import { useNotify } from "../../../../../core/context/NotificationContext";
import { useRestoreScroll } from "../../../../../core/hooks/useRestoreScroll";
import { RBACGuard } from "../../../../../components/ui/RBACGuard";
import { BackButton } from "../../../../../components/ui/BackButton";
import { HelpButton } from "../../../../../components/ui/HelpButton";
import { formatDateDisplay } from "../../../../../core/utils/formatDate";
import { DOC_TYPES, lineTotal } from "./Vars";
import { DEFAULT_COLUMNS, type ItemRow, type ColumnDef } from "./Interface";
import ProductRow from "./ProductRow/ProductRow";
import { InvoiceHeaderView } from "./InvoiceHeaderView";
import { exportDocumentExcel } from "./exportDocumentExcel";

// ✅ Read-only "красивая" фактура — в отличие от DocumentFormPage не позволяет
// ничего редактировать, только смотреть, как настоящий бумажный документ (тот же
// вид, что и Ctrl+P на форме редактирования). Переиспользует InvoiceHeaderView
// (общий с HeadDocument.tsx кусок шапки) и сам ProductRow в режиме isPosted —
// у него уже есть полностью read-only рендер каждой ячейки (см. Mainrows.tsx),
// поэтому таблица товаров не дублируется отдельным компонентом.
const DocumentViewPage = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { t } = useTranslation();
  const { canView } = usePageAccess("document");
  const { setSidebarContent } = useSidebar();
  const { company: currentCompany } = useCompany();
  const { user: currentUser } = useUser();
  const notify = useNotify();
  const docId = Number(id);
  // ✅ Общий BackButton (Alt+← + звук) вместо самодельной кнопки — иначе Alt+←
  // не перехватывался нашим кодом (см. BackButton.tsx::handleKeyDown), и браузер
  // мог обработать его сам как нативный "назад", из-за чего returnId ни разу не
  // попадал в sessionStorage. Ключ/id берём из location.state, если страницу
  // открыли с явным "куда вернуться и что подсветить" (см. ProductTurnoverDetailPage
  // ::openDocument) — иначе ключ ни для кого не значим, просто no-op.
  const returnState = location.state as { returnKey?: string; returnId?: number } | null;
  const { getBackProps } = useRestoreScroll(returnState?.returnKey ?? "documentViewBackNoop", () => {});

  const {
    data: doc,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["document", docId],
    queryFn: () => documentApi.getById(docId),
    enabled: !!docId,
  });

  const { data: scope } = useQuery({
    queryKey: ["my-scope"],
    queryFn: () => userScopeApi.getMyScope().then((r) => r.data),
    staleTime: 60_000,
  });

  // ✅ Своё, независимое от формы редактирования состояние колонок — эта страница
  // всегда показывает набор колонок, настроенный для печати (visiblePrint), но на
  // обычном экране, а не только при реальном Ctrl+P. Не трогаем localStorage формы
  // редактирования, чтобы переключение колонок здесь не влияло на неё и наоборот.
  const [viewColumns, setViewColumns] = useState<ColumnDef[]>(() => DEFAULT_COLUMNS.map((c) => ({ ...c, visibleScreen: c.visiblePrint })));

  const items: ItemRow[] = useMemo(() => {
    if (!doc?.items?.length) return [];
    return doc.items.map((it: any) => ({
      id: it.id,
      _key: String(it.id),
      product: it.product,
      product_name: it.product_detail?.name ?? "",
      unit: it.unit,
      unit_name: it.unit_detail?.name ?? "",
      quantity: String(it.quantity),
      price: String(it.price),
      discount_percent: String(it.discount_percent),
      cost_price: String(it.cost_price),
      sku: it.product_detail?.sku,
      barcode: it.product_detail?.barcode,
      weight: it.product_detail?.weight != null ? String(it.product_detail.weight) : undefined,
      volume_m3: it.product_detail?.volume_m3 != null ? String(it.product_detail.volume_m3) : undefined,
      length: it.product_detail?.length != null ? String(it.product_detail.length) : undefined,
      width: it.product_detail?.width != null ? String(it.product_detail.width) : undefined,
      height: it.product_detail?.height != null ? String(it.product_detail.height) : undefined,
      thumbnail: it.product_detail?.main_image?.thumbnail_url ?? undefined,
      is_bundle: it.extra_data?.row_type === "bundle",
      is_promo: it.extra_data?.row_type === "promo",
    }));
  }, [doc]);

  const isMove = doc?.document_type === "move";
  const needsCounterparty = !!doc && ["in", "out", "return_in", "return_out"].includes(doc.document_type);
  const typeLabel = doc ? t(DOC_TYPES.find((d) => d.value === doc.document_type)?.label ?? doc.document_type) : "";
  const branchSlogan = scope?.branches?.find((b: any) => b.id === doc?.branch)?.slogan || "";
  const primaryParticipant = doc?.participants?.[0];
  const extraParticipants = doc?.participants?.slice(1) ?? [];
  // ✅ Показываем строку "Авто" только если водитель реально назначен — участник
  // без сотрудника (employee) не должен рендериться как "Авто: —".
  const driverName = primaryParticipant?.employee ? (primaryParticipant.employee_detail?.full_name ?? undefined) : undefined;

  // ── Excel-экспорт — та же функция и те же данные (items/columns/итоги), что и
  // на DocumentFormPage, см. правило в CLAUDE.md: экран/печать/Excel не расходятся.
  const handleExportExcel = async () => {
    if (!doc) return;
    const mainItems = items.filter((r) => !r.is_bundle && !r.is_promo);
    const bundleItems = items.filter((r) => r.is_bundle);
    const promoItems = items.filter((r) => r.is_promo);

    const discPercentNum = parseFloat(String(doc.discount_percent)) || 0;
    const extraParticipantsText = extraParticipants.map((p: any) => `${p.role || "—"}: ${p.employee_detail?.full_name ?? "—"}`).join("; ");

    try {
      await exportDocumentExcel({
        company: currentCompany,
        user: currentUser,
        t,
        fileNamePrefix: `Document_${doc.number}`,
        docTitle: `${typeLabel} №${doc.number}`,
        headerLines: [
          {
            parts: [
              { label: t("Date") + ":", value: doc.date ? formatDateDisplay(doc.date) : "—" },
              { label: `${isMove ? t("SourceWarehouse") : t("Warehouse")}:`, value: doc.warehouse_detail?.name ?? "—" },
              ...(isMove ? [{ label: t("DestinationWarehouse") + ":", value: doc.warehouse_to_detail?.name ?? "—" }] : []),
            ],
          },
          ...(doc.document_type !== "in" && discPercentNum !== 0 ? [{ label: t("DiscountPercent") + ":", value: `${doc.discount_percent}%` }] : []),
          ...(extraParticipantsText ? [{ label: t("Participants") + ":", value: extraParticipantsText }] : []),
        ],
        counterpartyLine: needsCounterparty ? { name: doc.counterparty_detail?.name ?? "—", phone: doc.counterparty_detail?.phone } : undefined,
        driverLine: driverName ? { label: t("DriverLabel"), name: driverName } : undefined,
        postedByLine: doc.posted_by_name ? { label: t("PostedByLabel"), name: doc.posted_by_name } : undefined,
        branchSlogan: branchSlogan || undefined,
        columns: viewColumns.filter((c) => c.visiblePrint && !(doc.document_type === "in" && (c.key === "discount_percent" || c.key === "discount_amount"))),
        mainItems,
        bundleItems,
        promoItems,
        lineTotal,
        totals: { subtotal: Number(doc.subtotal) || 0, discAmount: Number(doc.discount_amount) || 0, total: Number(doc.total) || 0 },
      });
    } catch (e) {
      console.error("Ошибка экспорта в Excel:", e);
      notify("error", t("ErrorExportExcel"));
    }
  };

  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <button
          type="button"
          onClick={handleExportExcel}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-medium text-sm hover:bg-emerald-500/20 hover:border-emerald-400/60 active:scale-95 transition-all shadow-sm"
        >
          <FileSpreadsheet className="w-4 h-4" />
          {t("ExportToExcel")}
        </button>
      </div>,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSidebarContent, doc, items, viewColumns, t]);

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText={t("ForbiddenText")}>
      {doc && (
        <div className="h-full flex flex-col min-h-0">
          {/* ── Панель управления — скрыта при печати ── */}
          <div className="shrink-0 flex items-center gap-2 pb-3 print:hidden">
            <BackButton id={returnState?.returnId ?? docId} getBackProps={getBackProps} />
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              {typeLabel} № {doc.number}
            </h1>
            <HelpButton title={t("DocumentViewHelpTitle")}>
              <p>{t("DocumentViewHelpBody")}</p>
            </HelpButton>
          </div>

          {/* ── "Бумажный" вид документа — выглядит и масштабируется так же, как
              Ctrl+P (viewMode прокидывается в ProductRow, см. printSize в Interface.ts) ── */}
          <div className="flex-1 min-h-0 overflow-auto print:overflow-visible">
            <div className="w-full bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg shadow-sm p-6 print:border-none print:shadow-none print:p-0 print:max-w-none">
              <InvoiceHeaderView
                formattedDate={doc.date ? formatDateDisplay(doc.date) : "—"}
                isMove={isMove}
                warehouseName={doc.warehouse_detail?.name ?? "—"}
                warehouseToName={doc.warehouse_to_detail?.name ?? "—"}
                documentType={doc.document_type}
                discountPercent={doc.discount_percent}
                needsCounterparty={needsCounterparty}
                counterpartyName={doc.counterparty_detail?.name}
                counterpartyPhone={doc.counterparty_detail?.phone}
              />

              {extraParticipants.length > 0 && (
                <div className="text-xs leading-snug mb-2">
                  <span className="font-semibold">{t("Participants")}:</span>{" "}
                  {extraParticipants.map((p: any) => `${p.role || "—"}: ${p.employee_detail?.full_name ?? "—"}`).join("; ")}
                </div>
              )}

              <div>
                <ProductRow
                  isPosted={true}
                  setItems={() => {}}
                  items={items}
                  updateItem={() => {}}
                  products={[]}
                  lineTotal={lineTotal}
                  removeItem={() => {}}
                  subtotal={Number(doc.subtotal) || 0}
                  discAmount={Number(doc.discount_amount) || 0}
                  total={Number(doc.total) || 0}
                  disabled={false}
                  isPurchase={doc.document_type === "in"}
                  columns={viewColumns}
                  onColumnsChange={setViewColumns}
                  warehouseId={doc.warehouse}
                  viewMode
                />
              </div>

              {(driverName || doc.posted_by_name) && (
                <div className="text-xs pt-1 mt-1 border-t border-gray-300 dark:border-slate-600 space-y-0.5">
                  {driverName && (
                    <div>
                      <span className="font-semibold">{t("DriverLabel")}:</span> {driverName}
                    </div>
                  )}
                  {doc.posted_by_name && (
                    <div>
                      <span className="font-semibold">{t("PostedByLabel")}:</span> {doc.posted_by_name}
                    </div>
                  )}
                </div>
              )}

              {branchSlogan && <div className="text-2xl font-bold italic text-center mt-3 font-serif">{branchSlogan}</div>}
            </div>
          </div>
        </div>
      )}
    </RBACGuard>
  );
};

export default DocumentViewPage;
