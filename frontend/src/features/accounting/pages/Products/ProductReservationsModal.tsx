// frontend/src/features/accounting/pages/Products/ProductReservationsModal.tsx
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Modal } from "../../../../components/ui/Modal/Modal";
import { Loader } from "../../../../components/ui/Loader";
import { accountApi } from "../../services/accountingApi";
import { useDateStore } from "../../../../core/store/dateStore";
import { ROUTES } from "../../../../core/router/routes";
import { formatDateDisplay } from "../../../../core/utils/formatDate";

interface ProductReservationsModalProps {
  product: { id: number; name: string; unit: string } | null;
  onClose: () => void;
}

// ✅ Попап по клику на бейдж "В резерве" в ProductsListPage.tsx — показывает,
// на каких именно черновиках "Расхода" зарезервирован товар (см. обсуждение с
// пользователем: бейдж раньше показывал только итоговое число, без возможности
// узнать, для какой накладной/клиента). Клик по строке — переход в саму
// накладную (DocumentViewPage, только просмотр — см. CLAUDE.md про drill-down
// из отчётов). warehouse/branch — те же, что у бейджа (ReportViewSet.
// stock_balance), иначе сумма количеств в попапе разъедется с цифрой на бейдже.
export function ProductReservationsModal({ product, onClose }: ProductReservationsModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { workBranch, workWarehouse } = useDateStore();

  const { data = [], isLoading } = useQuery({
    queryKey: ["product-reservations", product?.id, workWarehouse?.id, workBranch?.id],
    queryFn: () =>
      accountApi.getReservations({
        product: String(product!.id),
        ...(workWarehouse?.id ? { warehouse: String(workWarehouse.id) } : workBranch?.id ? { branch: String(workBranch.id) } : {}),
      }),
    enabled: !!product,
  });

  const goToDocument = (documentId: number) => {
    onClose();
    navigate(ROUTES.APP.DOCUMENTS_VIEW.replace(":id", String(documentId)));
  };

  return (
    <Modal isOpen={!!product} onClose={onClose} title={product ? `${t("ReservedIn")}: ${product.name}` : ""} size="md">
      {isLoading ? (
        <Loader containerClass="py-6" text={t("Loading")} progress="indeterminate" />
      ) : data.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">{t("NoRows")}</p>
      ) : (
        <div className="divide-y divide-gray-200 dark:divide-slate-700">
          {data.map((row) => (
            <button
              key={row.document_id}
              type="button"
              onClick={() => goToDocument(row.document_id)}
              className="w-full flex items-center justify-between gap-3 py-2.5 px-1 text-left hover:bg-gray-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors cursor-pointer"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                  № {row.number} — {formatDateDisplay(row.date)}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {row.counterparty_name ?? t("NoCounterparty")} · {row.warehouse_name}
                </div>
              </div>
              <div className="shrink-0 text-sm font-medium text-orange-700 dark:text-orange-300 whitespace-nowrap">
                {Number(row.quantity).toLocaleString("ru-RU")} {product?.unit}
              </div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
