// frontend/src/features/accounting/pages/Trips/TripsListPage.tsx
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { tripApi } from "../../services/tripApi";
import { employeeApi } from "../../services/employeeApi";
import { warehouseApi } from "../../services/productApi";
import { useDateStore } from "../../../../core/store/dateStore";
import { useNotify } from "../../../../core/context/NotificationContext";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { useSidebar } from "../../../../core/context/SidebarRightContext";
import { ROUTES } from "../../../../core/router/routes";
import { Table, type Column } from "../../../../components/ui/Table/Table";
import { Button } from "../../../../components/ui/Button";
import { Modal } from "../../../../components/ui/Modal/Modal";
import { ConfirmModal } from "../../../../components/ui/Modal/ConfirmModal";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import { HelpButton } from "../../../../components/ui/HelpButton";
import SearchableSelect, { type SelectOption } from "../../../../components/ui/SearchableSelect";
import { Plus } from "lucide-react";
import { usePageHotkeys } from "../../../../core/hooks/usePageHotkeys";

interface TripForm {
  driver: number | null;
  warehouse: number | null;
  date: string;
  comment: string;
}

const emptyForm = (workDate: string | null): TripForm => ({
  driver: null,
  warehouse: null,
  date: workDate || new Date().toISOString().slice(0, 10),
  comment: "",
});

const TripStatusBadge = ({ status, label }: { status: string; label: string }) => (
  <span
    className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
      status === "delivered"
        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
        : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
    }`}
  >
    {label}
  </span>
);

const TripsListPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { setSidebarContent } = useSidebar();
  const { canView, canPost, canDelete } = usePageAccess("trip");
  const { workDate, workBranch, workWarehouse, periodFrom, periodTo } = useDateStore();

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<TripForm>(emptyForm(workDate));
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [driverFilter, setDriverFilter] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "new" | "delivered">("all");

  const queryParams = useMemo(() => {
    const params: Record<string, string> = {};
    if (workWarehouse?.id) params.warehouse = String(workWarehouse.id);
    else if (workBranch?.id) params.branch = String(workBranch.id);
    if (periodFrom) params.date_from = periodFrom;
    if (periodTo) params.date_to = periodTo;
    if (driverFilter) params.driver = String(driverFilter);
    if (statusFilter !== "all") params.status = statusFilter;
    return params;
  }, [workWarehouse?.id, workBranch?.id, periodFrom, periodTo, driverFilter, statusFilter]);

  const {
    data: trips = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["trips", queryParams],
    queryFn: () => tripApi.getAll(queryParams),
    enabled: canView,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees-list"],
    queryFn: () => employeeApi.getAll(),
    enabled: canView,
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses"],
    queryFn: warehouseApi.getAll,
    enabled: canView,
  });

  // ✅ useMemo — без него это новый массив на каждый рендер, а он в deps
  // useEffect ниже (setSidebarContent) => setSidebarContent триггерит ре-рендер
  // => новый driverOptions => эффект снова срабатывает => бесконечный цикл
  // ("Maximum update depth exceeded").
  const driverOptions: SelectOption[] = useMemo(() => (employees as any[]).map((e) => ({ id: e.id, label: e.full_name })), [employees]);
  const warehouseOptions: SelectOption[] = useMemo(() => (warehouses as any[]).map((w) => ({ id: w.id, label: w.name })), [warehouses]);

  const saveMutation = useMutation({
    mutationFn: () => tripApi.save(null, form),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      notify("success", t("SuccessCreated"));
      setFormOpen(false);
      navigate(ROUTES.APP.TRIPS_VIEW.replace(":id", String(res.data.id)));
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", err.response?.data?.detail || t("ErrorSaving"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => tripApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      notify("success", t("SuccessDeleted"));
      setDeleteId(null);
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", err.response?.data?.detail || t("ErrorDeleting"));
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => tripApi.bulkDelete(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      notify("success", t("SuccessDeleted"));
    },
    onError: () => notify("error", t("ErrorDeleting")),
  });

  const openCreate = () => {
    setForm(emptyForm(workDate));
    setFormOpen(true);
  };

  usePageHotkeys({ canPost, onInsert: openCreate });

  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <div>
          <h4 className="font-bold text-indigo-300 mb-2">{t("Actions")}</h4>
          <Button text={t("AddTrip")} onClick={openCreate} className="w-full" dark={true} icon={<Plus size={16} />} disabled={!canPost} />
        </div>
        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2">{t("StatusFilter")}</h4>
          <div className="flex flex-col gap-1">
            {(
              [
                ["all", t("All")],
                ["new", t("TripStatusNew")],
                ["delivered", t("TripStatusDelivered")],
              ] as const
            ).map(([val, label]) => (
              <Button key={val} onClick={() => setStatusFilter(val)} text={label} variant="ghost" dark={true} isActive={statusFilter === val} className="w-full justify-start" />
            ))}
          </div>
        </div>
        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2">{t("Driver")}</h4>
          <SearchableSelect options={driverOptions} value={driverFilter} onChange={setDriverFilter} placeholder={t("AllEmployees")} theme="sidebar" />
        </div>
      </div>,
    );
  }, [setSidebarContent, canPost, statusFilter, driverFilter, driverOptions, t]);

  const columns: Column<any>[] = [
    { header: t("ID"), accessor: "id", sortable: true, excelWidth: 6 },
    {
      header: t("Driver"), sortable: true, excelWidth: 22,
      render: (i) => i.driver_detail?.full_name ?? "—",
      sortValue: (i) => i.driver_detail?.full_name ?? "",
      excelValue: (i) => i.driver_detail?.full_name ?? "",
    },
    {
      header: t("Warehouse"), sortable: true, excelWidth: 20,
      render: (i) => i.warehouse_detail?.name ?? "—",
      sortValue: (i) => i.warehouse_detail?.name ?? "",
      excelValue: (i) => i.warehouse_detail?.name ?? "",
    },
    {
      header: t("Date"), accessor: "date", sortable: true, excelWidth: 12,
      render: (i) => new Date(i.date).toLocaleDateString("ru-RU"),
    },
    {
      header: t("Status"), accessor: "status", sortable: true, excelWidth: 14,
      render: (i) => <TripStatusBadge status={i.status} label={i.status_display} />,
      excelValue: (i) => i.status_display,
    },
    { header: t("DocumentsCount"), accessor: "documents_count", excelWidth: 12 },
    {
      header: t("DriverSalaryTmt"), accessor: "salary_total_tmt", excelWidth: 16,
      render: (i) => (i.status === "delivered" ? Number(i.salary_total_tmt).toLocaleString("ru-RU", { minimumFractionDigits: 2 }) : "—"),
    },
    {
      header: t("Actions"),
      hideInPrint: true,
      isActionColumn: true,
      render: (i) => (
        <div className="flex gap-2">
          <Button
            variant="1c"
            icon={<span>🗑️</span>}
            className="md:h-6 md:w-8 md:!p-0"
            disabled={!canDelete || i.status === "delivered"}
            title={i.status === "delivered" ? t("CancelDeliveryFirst") : undefined}
            onClick={(e) => {
              e.stopPropagation();
              setDeleteId(i.id);
              setDeleteModal(true);
            }}
          />
        </div>
      ),
    },
  ];

  const toDelete = (trips as any[]).find((tr) => tr.id === deleteId);

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText={t("ForbiddenText")} loadingText={t("LoadingTrips")} loadingProgress="indeterminate">
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-sm md:text-lg font-bold text-gray-800 dark:text-gray-100">{t("Trips")}</h2>
        <HelpButton title={t("Trips")}>
          <p>{t("TripsHelpIntro")}</p>
          <ul>
            <li>{t("TripsHelpAdd")}</li>
            <li>{t("TripsHelpOpen")}</li>
            <li>{t("TripsHelpDelete")}</li>
            <li>{t("TripsHelpFilters")}</li>
          </ul>
        </HelpButton>
      </div>

      <Table
        columns={columns}
        data={trips}
        tableId="trips_list"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRowDoubleClick={(item) => navigate(ROUTES.APP.TRIPS_VIEW.replace(":id", String(item.id)))}
        selectable
        onBulkDelete={async (ids) => {
          await bulkDeleteMutation.mutateAsync(ids as number[]);
        }}
      />

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={t("AddTrip")} closeOnOutsideClick={false}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("Driver")}</label>
            <SearchableSelect options={driverOptions} value={form.driver} onChange={(id) => setForm((p) => ({ ...p, driver: id }))} placeholder={t("SelectDriver")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("Warehouse")}</label>
            <SearchableSelect options={warehouseOptions} value={form.warehouse} onChange={(id) => setForm((p) => ({ ...p, warehouse: id }))} placeholder={t("SelectWarehouse")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("Date")}</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("Comment")}</label>
            <textarea
              rows={2}
              value={form.comment}
              onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button text={t("Cancel")} variant="secondary" onClick={() => setFormOpen(false)} />
            <Button
              text={saveMutation.isPending ? t("Saving") : t("Create")}
              onClick={() => {
                if (!form.driver || !form.warehouse) {
                  notify("error", t("DriverAndWarehouseRequired"));
                  return;
                }
                saveMutation.mutate();
              }}
            />
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={deleteModal}
        type="delete"
        title={`DELETE - ${t("Delete")}`}
        message={t("DeleteTripMessage", { id: toDelete?.id })}
        onClose={() => setDeleteModal(false)}
        onConfirm={() => {
          if (deleteId) {
            deleteMutation.mutate(deleteId);
            setDeleteModal(false);
          }
        }}
      />
    </RBACGuard>
  );
};

export default TripsListPage;
