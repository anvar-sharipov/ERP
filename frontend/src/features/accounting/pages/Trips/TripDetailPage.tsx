// frontend/src/features/accounting/pages/Trips/TripDetailPage.tsx
import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { tripApi } from "../../services/tripApi";
import { documentApi } from "../../services/documentApi";
import { accountApi } from "../../services/accountingApi";
import { useNotify } from "../../../../core/context/NotificationContext";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { useRestoreScroll } from "../../../../core/hooks/useRestoreScroll";
import { ROUTES } from "../../../../core/router/routes";
import { Table, type Column } from "../../../../components/ui/Table/Table";
import { Button } from "../../../../components/ui/Button";
import { BackButton } from "../../../../components/ui/BackButton";
import { HelpButton } from "../../../../components/ui/HelpButton";
import { Loader } from "../../../../components/ui/Loader";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import { ConfirmModal } from "../../../../components/ui/Modal/ConfirmModal";
import SearchableSelect, { type SelectOption } from "../../../../components/ui/SearchableSelect";
import { Truck, RotateCcw, Trash2 } from "lucide-react";

const fmt = (v: any) => Number(v ?? 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TripDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const tripId = Number(id);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { canView, canPut, canDelete } = usePageAccess("trip");
  const { getBackProps } = useRestoreScroll("selectedTripId", () => {});

  const [addDocId, setAddDocId] = useState<number | null>(null);
  const [confirmDeliver, setConfirmDeliver] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const {
    data: trip,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["trip", tripId],
    queryFn: () => tripApi.getOne(tripId),
    enabled: canView && !!tripId,
  });

  const isNew = trip?.status === "new";
  const isDelivered = trip?.status === "delivered";
  const isUsdWarehouse = trip?.warehouse_currency === "USD";

  // ✅ Курс USD→TMT на ДАТУ РЕЙСА (не сегодняшний) — та же логика, что и в
  // backend Trip.deliver(). Пока рейс не доставлен, это только предпросмотр
  // (может быть не задан на дату рейса); после доставки берём trip.exchange_rate_used
  // — реально зафиксированный курс, а не то, что могло измениться в справочнике
  // валют задним числом.
  const { data: currencies = [] } = useQuery({
    queryKey: ["currencies"],
    queryFn: accountApi.getCurrencies,
    enabled: isUsdWarehouse && isNew,
  });
  const usdCurrencyId = (currencies as any[]).find((c) => c.code === "USD")?.id ?? null;

  const { data: rateRowsRaw } = useQuery({
    queryKey: ["exchange-rate-for-trip", usdCurrencyId, trip?.date],
    queryFn: () => accountApi.getExchangeRates({ currency: usdCurrencyId, date_from: trip.date, date_to: trip.date }),
    enabled: isUsdWarehouse && isNew && !!usdCurrencyId && !!trip?.date,
  });
  const rateRows: any[] = Array.isArray(rateRowsRaw) ? rateRowsRaw : (rateRowsRaw?.results ?? []);

  const tripDateRate: number | null = !isUsdWarehouse
    ? 1
    : isDelivered
      ? (trip.exchange_rate_used ? Number(trip.exchange_rate_used) : null)
      : rateRows.length > 0
        ? Number(rateRows[0].rate)
        : null;

  const { data: availableDocsRaw } = useQuery({
    // ✅ driver в queryKey — не только в query params: тот же трип теоретически
    // мог сменить водителя (PUT), список кандидатов должен пересчитаться.
    queryKey: ["documents-available-for-trip", trip?.warehouse, trip?.driver],
    queryFn: () => documentApi.getAll({ document_type: "out", status: "posted", trip: "none", warehouse: String(trip.warehouse), driver: String(trip.driver), page_size: "200" }),
    enabled: !!trip?.warehouse && !!trip?.driver && isNew,
  });

  const availableDocs: any[] = Array.isArray(availableDocsRaw) ? availableDocsRaw : (availableDocsRaw?.results ?? []);
  const availableOptions: SelectOption[] = availableDocs.map((d) => ({
    id: d.id,
    label: `№${d.number} — ${d.counterparty_detail?.name ?? "—"}`,
    sublabel: `${new Date(d.date).toLocaleDateString("ru-RU")} · ${fmt(d.total)}`,
  }));

  const invalidateTrip = () => {
    queryClient.invalidateQueries({ queryKey: ["trip", tripId] });
    queryClient.invalidateQueries({ queryKey: ["documents-available-for-trip"] });
    queryClient.invalidateQueries({ queryKey: ["trips"] });
  };

  const addDocMutation = useMutation({
    mutationFn: (documentId: number) => tripApi.addDocument(tripId, documentId),
    onSuccess: () => {
      invalidateTrip();
      setAddDocId(null);
    },
    onError: (err: any) => notify("error", err.response?.data?.detail || t("ErrorSaving")),
  });

  const removeDocMutation = useMutation({
    mutationFn: (documentId: number) => tripApi.removeDocument(tripId, documentId),
    onSuccess: invalidateTrip,
    onError: (err: any) => notify("error", err.response?.data?.detail || t("ErrorSaving")),
  });

  const deliverMutation = useMutation({
    mutationFn: () => tripApi.deliver(tripId),
    onSuccess: () => {
      invalidateTrip();
      notify("success", t("TripDelivered"));
    },
    onError: (err: any) => notify("error", err.response?.data?.detail || t("ErrorSaving")),
  });

  const cancelDeliveryMutation = useMutation({
    mutationFn: () => tripApi.cancelDelivery(tripId),
    onSuccess: () => {
      invalidateTrip();
      notify("success", t("TripDeliveryCancelled"));
    },
    onError: (err: any) => notify("error", err.response?.data?.detail || t("ErrorSaving")),
  });

  const deleteMutation = useMutation({
    mutationFn: () => tripApi.delete(tripId),
    onSuccess: () => {
      notify("success", t("SuccessDeleted"));
      navigate(ROUTES.APP.TRIPS);
    },
    onError: (err: any) => notify("error", err.response?.data?.detail || t("ErrorDeleting")),
  });

  const documents: any[] = trip?.documents ?? [];
  const rawSalary = (d: any) => (Number(d.total) * Number(d.delivery_percent)) / 100;
  const previewSalary = useMemo(() => documents.reduce((sum, d) => sum + rawSalary(d), 0), [documents]);
  const documentsTotal = useMemo(() => documents.reduce((sum, d) => sum + Number(d.total), 0), [documents]);
  const warehouseCurrency = trip?.warehouse_currency ?? "";

  const columns: Column<any>[] = [
    { header: t("Number"), accessor: "number", excelWidth: 15 },
    { header: t("Date"), accessor: "date", excelWidth: 12, render: (d) => new Date(d.date).toLocaleDateString("ru-RU") },
    { header: t("Counterparty"), excelWidth: 25, render: (d) => d.counterparty_detail?.name ?? "—", excelValue: (d) => d.counterparty_detail?.name ?? "" },
    {
      header: `${t("Sum")} (${warehouseCurrency})`,
      accessor: "total",
      excelWidth: 15,
      render: (d) => fmt(d.total),
      footerValue: (rows) => fmt(rows.reduce((sum, d) => sum + Number(d.total), 0)),
    },
    { header: t("DeliveryPercent"), accessor: "delivery_percent", excelWidth: 10, render: (d) => `${d.delivery_percent}%` },
    {
      // ✅ ЗП водителя В ВАЛЮТЕ СКЛАДА (то, из чего реально считают) — раньше
      // называлась "манаты", хотя для USD-склада показывала доллары под чужим
      // ярлыком. Заголовок теперь честно называет реальную валюту.
      header: `${t("DriverSalaryColumn")} (${warehouseCurrency})`,
      excelWidth: 15,
      render: (d) => fmt(rawSalary(d)),
      footerValue: (rows) => fmt(rows.reduce((sum, d) => sum + rawSalary(d), 0)),
    },
    {
      header: t("ExchangeRateColumn"),
      excelWidth: 10,
      render: () => (tripDateRate != null ? Number(tripDateRate).toFixed(4) : "—"),
    },
    {
      header: t("DriverSalaryTmt"),
      excelWidth: 15,
      render: (d) => (tripDateRate != null ? fmt(rawSalary(d) * tripDateRate) : "—"),
      footerValue: (rows) => (tripDateRate != null ? fmt(rows.reduce((sum, d) => sum + rawSalary(d) * tripDateRate, 0)) : "—"),
    },
    ...(isNew
      ? [
          {
            header: t("Actions"),
            hideInPrint: true,
            isActionColumn: true,
            render: (d: any) => (
              <Button
                variant="1c"
                icon={<span>🗑️</span>}
                className="md:h-6 md:w-8 md:!p-0"
                disabled={!canPut}
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  removeDocMutation.mutate(d.id);
                }}
              />
            ),
          } as Column<any>,
        ]
      : []),
  ];

  if (isLoading) return <Loader containerClass="mx-auto mt-20" text={t("LoadingTrip")} progress="indeterminate" />;

  return (
    <RBACGuard error={error} canView={canView} forbiddenText={t("ForbiddenText")}>
      {trip && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <BackButton id={tripId} getBackProps={getBackProps} />
            <h2 className="text-sm md:text-lg font-bold text-gray-800 dark:text-gray-100">
              {t("Trip")} №{trip.id} — {trip.driver_detail?.full_name}
            </h2>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                isDelivered ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
              }`}
            >
              {trip.status_display}
            </span>
            <HelpButton title={t("Trip")}>
              <p>{t("TripDetailHelpIntro")}</p>
              <ul>
                <li>{t("TripDetailHelpAdd")}</li>
                <li>{t("TripDetailHelpDeliver")}</li>
                <li>{t("TripDetailHelpCancel")}</li>
                <li>{t("TripDetailHelpCurrency")}</li>
              </ul>
            </HelpButton>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs md:text-sm bg-gray-50 dark:bg-slate-800 rounded-lg p-3">
            <div>
              <div className="text-gray-400">{t("Warehouse")}</div>
              <div className="font-medium text-gray-800 dark:text-gray-100">
                {trip.warehouse_detail?.name} <span className="text-gray-400">({trip.warehouse_currency})</span>
              </div>
            </div>
            <div>
              <div className="text-gray-400">{t("Date")}</div>
              <div className="font-medium text-gray-800 dark:text-gray-100">{new Date(trip.date).toLocaleDateString("ru-RU")}</div>
            </div>
            <div>
              <div className="text-gray-400">{t("Comment")}</div>
              <div className="font-medium text-gray-800 dark:text-gray-100">{trip.comment || "—"}</div>
            </div>
            <div>
              <div className="text-gray-400">{t("DocumentsCount")}</div>
              <div className="font-medium text-gray-800 dark:text-gray-100">{documents.length}</div>
            </div>
            <div>
              <div className="text-gray-400">{t("DocumentsTotalSum")}</div>
              <div className="font-medium text-gray-800 dark:text-gray-100">{fmt(documentsTotal)}</div>
            </div>
            <div>
              <div className="text-gray-400">{isDelivered ? t("DriverSalary") : t("DriverSalaryPreview")}</div>
              <div className="font-semibold text-indigo-600 dark:text-indigo-400">{fmt(isDelivered ? trip.salary_total : previewSalary)} {trip.warehouse_currency}</div>
            </div>
            {isDelivered && trip.exchange_rate_used && (
              <div>
                <div className="text-gray-400">{t("ExchangeRateUsed")}</div>
                <div className="font-medium text-gray-800 dark:text-gray-100">{trip.exchange_rate_used}</div>
              </div>
            )}
            {isDelivered && (
              <div>
                <div className="text-gray-400">{t("DriverSalaryTmt")}</div>
                <div className="font-semibold text-green-600 dark:text-green-400">{fmt(trip.salary_total_tmt)}</div>
              </div>
            )}
          </div>

          {isNew && (
            <div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("AddDocumentToTrip")}</label>
                  <SearchableSelect options={availableOptions} value={addDocId} onChange={setAddDocId} placeholder={t("SearchDocumentPlaceholder")} />
                </div>
                <Button
                  text={t("Add")}
                  disabled={!addDocId || !canPut || addDocMutation.isPending}
                  onClick={() => addDocId && addDocMutation.mutate(addDocId)}
                />
              </div>
              {availableOptions.length === 0 && <p className="text-xs text-gray-400 mt-1">{t("NoAvailableDocumentsForDriverHint")}</p>}
            </div>
          )}

          {isNew && isUsdWarehouse && tripDateRate == null && documents.length > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">{t("NoRateForTripDateHint", { date: new Date(trip.date).toLocaleDateString("ru-RU") })}</p>
          )}

          <Table columns={columns} data={documents} tableId="trip_documents" onRowDoubleClick={(d) => navigate(ROUTES.APP.DOCUMENTS_VIEW.replace(":id", String(d.id)))} />

          <div className="flex justify-end gap-2 pt-2 flex-wrap">
            {isNew && (
              <Button
                text={t("DeleteTripAction")}
                variant="danger"
                icon={<Trash2 size={16} />}
                disabled={!canDelete || documents.length > 0}
                title={documents.length > 0 ? t("RemoveDocumentsFirst") : undefined}
                onClick={() => setConfirmDelete(true)}
              />
            )}
            {isDelivered && (
              <Button text={t("CancelDelivery")} variant="secondary" icon={<RotateCcw size={16} />} disabled={!canPut} onClick={() => setConfirmCancel(true)} />
            )}
            {isNew && (
              <Button text={t("MarkDelivered")} icon={<Truck size={16} />} disabled={!canPut || documents.length === 0 || deliverMutation.isPending} onClick={() => setConfirmDeliver(true)} />
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmDeliver}
        type="info"
        title={t("MarkDelivered")}
        message={t("MarkDeliveredConfirmMessage", { sum: fmt(previewSalary), currency: trip?.warehouse_currency })}
        onClose={() => setConfirmDeliver(false)}
        onConfirm={() => {
          deliverMutation.mutate();
          setConfirmDeliver(false);
        }}
      />
      <ConfirmModal
        isOpen={confirmCancel}
        type="warning"
        title={t("CancelDelivery")}
        message={t("CancelDeliveryConfirmMessage")}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => {
          cancelDeliveryMutation.mutate();
          setConfirmCancel(false);
        }}
      />
      <ConfirmModal
        isOpen={confirmDelete}
        type="delete"
        title={t("DeleteTripAction")}
        message={t("DeleteTripMessage", { id: trip?.id })}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          deleteMutation.mutate();
          setConfirmDelete(false);
        }}
      />
    </RBACGuard>
  );
};

export default TripDetailPage;
