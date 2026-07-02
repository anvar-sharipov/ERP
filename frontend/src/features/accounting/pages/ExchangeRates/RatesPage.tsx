import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { accountApi } from "../../services/accountingApi";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { useSidebar } from "../../../../core/context/SidebarRightContext";
import { Table, type Column } from "../../../../components/ui/Table/Table";
import { Button } from "../../../../components/ui/Button";
import { Modal } from "../../../../components/ui/Modal/Modal";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import { Plus } from "lucide-react";
import { useTableFilter } from "../../../../core/hooks/useTableFilter";
import { usePageHotkeys } from "../../../../core/hooks/usePageHotkeys";
import { useNotify } from "../../../../core/context/NotificationContext";
import { useClosedPeriod } from "../../../../core/hooks/useClosedPeriod";
import { useDateStore } from "../../../../core/store/dateStore";

type ExchangeRateRow = {
  id: number;
  date: string;
  currency_code: string;
  currency_symbol: string;
  rate: string;
  created_by_username: string;
  created_at: string;
};

interface RateForm {
  currency: string;
  rate: string;
  date: string;
}

export default function RatesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { setSidebarContent } = useSidebar();
  const { canView, canPost } = usePageAccess("exchangerate");
  const notify = useNotify();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    try {
      return Number(localStorage.getItem("table:exchange_rates:pageSize")) || 25;
    } catch {
      return 25;
    }
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const { workDate, workBranch, workWarehouse, periodFrom, periodTo } = useDateStore();
  const { isClosed } = useClosedPeriod({
    branch: workBranch?.id,
    warehouse: workWarehouse?.id,
  });

  // canCreate — оба условия должны быть выполнены
  const canCreate = canPost && !isClosed;

  const EMPTY: RateForm = { currency: "", rate: "", date: workDate };
  const [form, setForm] = useState<RateForm>(EMPTY);

  const { data: currencies = [] } = useQuery({
    queryKey: ["currencies"],
    queryFn: accountApi.getCurrencies,
    staleTime: 1000 * 60 * 10,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["exchange-rates", page, pageSize, periodFrom, periodTo],
    queryFn: () =>
      accountApi.getExchangeRates({
        page,
        page_size: pageSize,
        ...(periodFrom && { date_from: periodFrom }),
        ...(periodTo && { date_to: periodTo }),
      }),
    enabled: canView,
    placeholderData: (prev) => prev,
    staleTime: 0,
  });

  // сбрасывай страницу при смене периода
  useEffect(() => {
    setPage(1);
  }, [periodFrom, periodTo]);

  const mutation = useMutation({
    mutationFn: () =>
      accountApi.addExchangeRate({
        currency: Number(form.currency),
        rate: form.rate,
        date: form.date,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exchange-rates"] });
      qc.invalidateQueries({ queryKey: ["exchange-rates-latest"] });
      notify("success", t("SuccessCreated"));
      setForm(EMPTY);
      setFormOpen(false);
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", err.response?.data?.detail || t("ErrorSaving"));
    },
  });

  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <h4 className="font-bold text-indigo-300">{t("Actions")}</h4>
        {isClosed && <div className="text-xs text-red-400 bg-red-900/20 px-2 py-1.5 rounded">{t("DayClosed")} — добавление запрещено</div>}
        <Button
          disabled={!canCreate}
          text={t("AddRate", "Добавить курс")}
          className="w-full"
          dark
          icon={<Plus className="w-4 h-4" />}
          onClick={() => {
            setForm({ currency: "", rate: "", date: workDate });
            setFormOpen(true);
          }}
        />
      </div>,
    );
  }, [setSidebarContent, canPost, canCreate, isClosed, t]);

  usePageHotkeys({
    canPost: canCreate,
    onInsert: () => {
      setForm({ currency: "", rate: "", date: workDate });
      setFormOpen(true);
    },
  });

  const rates = (data?.results ?? []) as ExchangeRateRow[];

  const columns: Column<ExchangeRateRow>[] = [
    { header: t("Date"), accessor: "date", sortable: true, excelWidth: 15 },
    {
      header: t("Currency"),
      accessor: "currency_code",
      sortable: true,
      excelWidth: 12,
      render: (item) => (
        <span className="font-medium">
          {item.currency_symbol} {item.currency_code}
        </span>
      ),
    },
    {
      header: t("Rate"),
      accessor: "rate",
      sortable: true,
      excelWidth: 15,
      render: (item) => <span className="font-semibold text-yellow-500">{Number(item.rate).toFixed(4)} TMT</span>,
    },
    {
      header: t("AddedBy"),
      accessor: "created_by_username",
      sortable: true,
      excelWidth: 20,
      render: (item) => item.created_by_username || "—",
    },
    {
      header: t("CreatedAt"),
      accessor: "created_at",
      sortable: true,
      excelWidth: 20,
      render: (item) => new Date(item.created_at).toLocaleString("ru-RU"),
    },
  ];

  const filtered = useTableFilter(rates, {
    search: searchQuery,
    searchFields: ["currency_code", "date", "created_by_username"],
  });

  const inputCls = "px-3 py-2 rounded-lg border text-sm bg-slate-900 text-slate-100 border-slate-700 focus:border-indigo-500 focus:outline-none w-full";

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText={t("ForbiddenText")}>
      <Table
        columns={columns}
        data={filtered}
        tableId="exchange_rates"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        pagination={{
          mode: "server",
          page,
          pageSize,
          total: data?.count ?? 0,
          onPageChange: setPage,
          onPageSizeChange: (size) => {
            setPageSize(size);
            setPage(1);
            try {
              localStorage.setItem("table:exchange_rates:pageSize", String(size));
            } catch {}
          },
        }}
        onFetchAllData={async () => {
          const res = await accountApi.getExchangeRates({
            page: 1,
            page_size: 10000,
            ...(periodFrom && { date_from: periodFrom }),
            ...(periodTo && { date_to: periodTo }),
          });
          return res.results ?? [];
        }}
      />

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={t("AddRate", "Добавить курс")} closeOnOutsideClick={false}>
        <div className="space-y-4">
          {/* Дата — только показываем */}
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700">
            <span className="text-xs text-slate-400">{t("Date", "Дата")}:</span>
            <span className="text-sm font-semibold text-slate-200">{workDate}</span>
            {isClosed && <span className="ml-auto text-xs text-red-400 bg-red-900/20 px-2 py-0.5 rounded">{t("DayClosed")}</span>}
          </div>

          {/* Валюта */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">{t("Currency", "Валюта")}</label>
            <select className={inputCls} value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>
              <option value="">— выбрать —</option>
              {(currencies as any[])
                .filter((c) => c.is_active)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Курс */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">{t("Rate", "Курс (TMT)")}</label>
            <input type="number" step="0.0001" className={inputCls} placeholder="3.5000" value={form.rate} onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button text={t("Cancel")} onClick={() => setFormOpen(false)} />
            <Button
              text={mutation.isPending ? t("Saving") : t("Save")}
              variant="danger"
              disabled={mutation.isPending || !form.currency || !form.rate || !canCreate}
              onClick={() => mutation.mutate()}
            />
          </div>
        </div>
      </Modal>
    </RBACGuard>
  );
}
