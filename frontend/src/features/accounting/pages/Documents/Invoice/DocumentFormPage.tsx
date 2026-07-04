// frontend/src/features/accounting/pages/Documents/Invoice/DocumentFormPage.tsx
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CheckCircle, XCircle, FileSpreadsheet } from "lucide-react";
import { documentApi } from "../../../services/documentApi";
import { priceTypeApi } from "../../../services/productApi";
import { counterpartyApi } from "../../../services/counterpartyApi";
import { employeeApi } from "../../../services/employeeApi";
import { productApi } from "../../../services/productApi";
import { useNotify } from "../../../../../core/context/NotificationContext";
import { usePageAccess } from "../../../../../core/hooks/usePageAccess";
import { useSidebar } from "../../../../../core/context/SidebarRightContext";
import { useDateStore } from "../../../../../core/store/dateStore";
import { useCompany } from "../../../../../core/context/CompanyContext";
import { useUser } from "../../../../../core/context/UserContext";
import { RBACGuard } from "../../../../../components/ui/RBACGuard";
import { ConfirmModal } from "../../../../../components/ui/Modal/ConfirmModal";
import { ROUTES } from "../../../../../core/router/routes";
import { newParticipantRow, lineTotal, lineGross, resolveVolumeDiscount, DOC_TYPES } from "./Vars";
import { formatDateDisplay } from "../../../../../core/utils/formatDate";
import { type DocHeader, type ItemRow, type ParticipantRow, type DocumentHeader } from "./Interface";
import { useColumnVisibility } from "./useColumnVisibility";
import { exportDocumentExcel } from "./exportDocumentExcel";
import Header from "./HeaderPage";
import HeadDocument, { type HeadDocumentHandle } from "./HeadDocument";
import ProductRow, { type ProductRowHandle } from "./ProductRow/ProductRow";
import Participants from "./Participants";
import { userScopeApi } from "../../../services/transactionApi";
import { useShallow } from "zustand/react/shallow";

// ── Компонент ─────────────────────────────────────────────────────────────────

const DocumentFormPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { setSidebarContent } = useSidebar();
  const { canPost, canPut } = usePageAccess("document");
  const { company: currentCompany } = useCompany();
  const { user: currentUser } = useUser();
  // const { workDate, workBranch, workWarehouse } = useDateStore();
  const { workDate, workBranch, workWarehouse } = useDateStore(
    useShallow((s) => ({
      workDate: s.workDate,
      workBranch: s.workBranch,
      workWarehouse: s.workWarehouse,
    })),
  );

  const isEdit = !!id;
  const docId = id ? Number(id) : null;

  // ── Состояние шапки ──────────────────────────────────────────────────────────

  const [header, setHeader] = useState<DocHeader>({
    document_type: "in",
    date: workDate ?? new Date().toISOString().slice(0, 10),
    warehouse: workWarehouse?.id ?? null,
    warehouse_to: null,
    counterparty: null,
    default_price_type: null,
    discount_percent: "0",
    note: "",
    branch: null,
  });

  const [items, setItems] = useState<ItemRow[]>([]);
  const [participants, setParticipants] = useState<ParticipantRow[]>(!isEdit ? [newParticipantRow()] : []);
  const [postConfirm, setPostConfirm] = useState(false);
  const [unpostConfirm, setUnpostConfirm] = useState(false);
  const [warehouseChangeConfirmOpen, setWarehouseChangeConfirmOpen] = useState(false);
  const [pendingWarehouseId, setPendingWarehouseId] = useState<number | null>(null);
  const [typeChangeConfirmOpen, setTypeChangeConfirmOpen] = useState(false);
  const [pendingDocumentType, setPendingDocumentType] = useState<string | null>(null);
  const [docStatus, setDocStatus] = useState<"draft" | "posted">("draft");
  const [docNumber, setDocNumber] = useState<string>("");
  const [counterpartyBalance, setCounterpartyBalance] = useState<number | null>(null);

  const canAddProducts = !!header.branch && !!header.warehouse;
  const isPosted = docStatus === "posted";
  const disableSave = !isEdit && (!workBranch || !workWarehouse);

  // ── Рефы для клавиатурного флоу: сотрудник → контрагент → комментарий → товар ─
  const headDocumentRef = useRef<HeadDocumentHandle>(null);
  const productRowRef = useRef<ProductRowHandle>(null);

  // Без выбранного филиала и склада в правой панели создавать накладные нельзя
  useEffect(() => {
    if (!isEdit && (!workBranch || !workWarehouse)) {
      notify("error", t("SelectBranchAndWarehouse"));
      navigate(ROUTES.APP.DOCUMENTS_INVOICES, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, workBranch, workWarehouse]);

  // Фокус на сотруднике при входе на форму
  useEffect(() => {
    if (!isPosted) {
      setTimeout(() => headDocumentRef.current?.focusEmployee(), 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Колонки таблицы ───────────────────────────────────────────────────────
  // Ключ зависит от типа документа — у каждого типа свои настройки в localStorage

  const { columns, setAllColumns } = useColumnVisibility(header.document_type);

  // ── Справочники ──────────────────────────────────────────────────────────────

  const counterpartyType = ["in", "return_out"].includes(header.document_type) ? "supplier" : "client";

  const { data: priceTypes = [] } = useQuery({
    queryKey: ["price-types"],
    queryFn: priceTypeApi.getAll,
  });

  const { data: counterparties = [] } = useQuery({
    queryKey: ["counterparties", counterpartyType],
    queryFn: () => counterpartyApi.getAll({ type: counterpartyType }),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees", workBranch?.id],
    queryFn: () => employeeApi.getAll(workBranch?.id ? { branch: String(workBranch.id) } : undefined),
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-short"],
    queryFn: () => productApi.getAll(),
  });

  // ── Загрузка документа при редактировании ────────────────────────────────────

  const {
    data: doc,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["document", docId],
    queryFn: () => documentApi.getById(docId!),
    enabled: isEdit,
  });

  const { data: scope } = useQuery({
    queryKey: ["my-scope"],
    queryFn: () => userScopeApi.getMyScope().then((r) => r.data),
    staleTime: 60_000,
  });

  // ── Эффекты синхронизации ────────────────────────────────────────────────────

  useEffect(() => {
    if (!isEdit) setHeader((p) => ({ ...p, branch: workBranch?.id ?? null }));
  }, [workBranch?.id, isEdit]);

  useEffect(() => {
    if (!priceTypes.length || isEdit) return;
    const saved = localStorage.getItem("default_price_type");
    const savedId = saved ? Number(saved) : null;
    const exists = savedId && priceTypes.some((pt: any) => pt.id === savedId);
    const priceTypeId = exists ? savedId : (priceTypes[0] as any).id;
    setHeader((p) => ({ ...p, default_price_type: priceTypeId }));
  }, [priceTypes, isEdit]);

  useEffect(() => {
    if (!doc) return;
    setDocStatus(doc.status);
    setDocNumber(doc.number);
    setHeader({
      document_type: doc.document_type,
      date: doc.date,
      warehouse: doc.warehouse,
      warehouse_to: doc.warehouse_to,
      counterparty: doc.counterparty,
      default_price_type: doc.default_price_type,
      discount_percent: doc.discount_percent,
      note: doc.note,
      branch: doc.branch,
    });
    setItems(
      doc.items.length > 0
        ? doc.items.map((it: any) => ({
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
            // доп. поля из product_detail если бэк их отдаёт
            sku: it.product_detail?.sku,
            barcode: it.product_detail?.barcode,
            weight: it.product_detail?.weight != null ? String(it.product_detail.weight) : undefined,
            volume_m3: it.product_detail?.volume_m3 != null ? String(it.product_detail.volume_m3) : undefined,
            length: it.product_detail?.length != null ? String(it.product_detail.length) : undefined,
            width: it.product_detail?.width != null ? String(it.product_detail.width) : undefined,
            height: it.product_detail?.height != null ? String(it.product_detail.height) : undefined,
            thumbnail: it.product_detail?.main_image?.thumbnail_url ?? undefined,
            // ✅ тип строки (обычная/комплектующая/бонус акции) — храним в extra_data,
            // чтобы при повторном открытии документа авто-строки не считались обычной покупкой
            is_bundle: it.extra_data?.row_type === "bundle",
            is_promo: it.extra_data?.row_type === "promo",
          }))
        : [],
    );
    setParticipants(
      doc.participants.length > 0
        ? doc.participants.map((p: any) => ({
            id: p.id,
            _key: String(p.id),
            employee: p.employee,
            role: p.role,
          }))
        : [newParticipantRow()],
    );
    if (doc.counterparty_balance != null) {
      setCounterpartyBalance(Number(doc.counterparty_balance));
    }
  }, [doc]);

  useEffect(() => {
    if (!isEdit || !header.counterparty) setCounterpartyBalance(null);
  }, [header.counterparty, isEdit]);

  useEffect(() => {
    if (!isEdit) setHeader((p) => ({ ...p, warehouse: workWarehouse?.id ?? null }));
  }, [workWarehouse?.id, isEdit]);

  useEffect(() => {
    if (!isEdit) {
      setHeader((p) => ({ ...p, date: workDate ?? new Date().toISOString().slice(0, 10) }));
    }
  }, [workDate, isEdit]);

  // Когда загрузились products и doc — подставить цены в строки
  useEffect(() => {
    if (!doc || !products.length || !doc.default_price_type) return;
    setItems((prev) =>
      prev.map((row) => {
        // ✅ Комплектующие и бонусные строки не подставляются под обычную цену товара
        // по типу цены документа — у них своя цена (default_price/manual_price бандла,
        // 0 для бонуса), и её нельзя перетирать ценой продажи этого же товара.
        if (!row.product || row.is_bundle || row.is_promo) return row;
        const prod = (products as any[]).find((p: any) => p.id === row.product);
        if (!prod?.prices) return row;
        const pp = prod.prices.find((p: any) => p.price_type === doc.default_price_type);
        if (!pp) return row;
        return { ...row, price: String(pp.price) };
      }),
    );
  }, [doc?.id, products.length]);

  // ── Сайдбар ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    // netSubtotal — уже с учётом построчных скидок (акции/ручные), до скидки документа
    const netSubtotal = items.reduce((sum, row) => sum + lineTotal(row), 0);
    const disc = parseFloat(header.discount_percent) || 0;
    const headerDiscAmount = (netSubtotal * disc) / 100;
    const total = netSubtotal - headerDiscAmount;

    // subtotal — сумма БЕЗ каких-либо скидок (построчных и документа); discAmount — их суммарная величина
    const subtotal = items.reduce((sum, row) => sum + lineGross(row), 0);
    const discAmount = subtotal - total;

    setSidebarContent(
      <div className="space-y-4">
        {/* Excel-экспорт */}
        <button
          type="button"
          onClick={handleExportExcel}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-medium text-sm hover:bg-emerald-500/20 hover:border-emerald-400/60 active:scale-95 transition-all shadow-sm"
        >
          <FileSpreadsheet className="w-4 h-4" />
          {t("ExportToExcel")}
        </button>

        {/* Статус */}
        <div>
          <h4 className="font-bold text-indigo-300 mb-2">{t("Status")}</h4>
          <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${isPosted ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>
            {isPosted ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
            {isPosted ? t("Posted") : t("Draft")}
          </span>
        </div>

        {/* Итоги */}
        <div className="pt-3 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2">{t("Total")}</h4>
          <div className="text-xs text-indigo-200 space-y-1">
            <div className="flex justify-between">
              <span>{t("Subtotal")}:</span>
              <span className="font-mono">{subtotal.toLocaleString("ru-RU", { minimumFractionDigits: 2 })}</span>
            </div>
            {discAmount > 0.004 && (
              <div className="flex justify-between text-red-400">
                <span>{t("Discount")}:</span>
                <span className="font-mono">−{discAmount.toLocaleString("ru-RU", { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-white border-t border-indigo-900/30 pt-1">
              <span>{t("TotalPayable")}:</span>
              <span className="font-mono">{total.toLocaleString("ru-RU", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        {/* Сальдо контрагента */}
        {counterpartyBalance !== null && (
          <div className="pt-3 border-t border-indigo-900/30">
            <h4 className="font-bold text-indigo-300 mb-1">{t("CounterpartyBalance")}</h4>
            <span className={`font-mono text-sm font-bold ${counterpartyBalance >= 0 ? "text-green-400" : "text-red-400"}`}>
              {counterpartyBalance.toLocaleString("ru-RU", { minimumFractionDigits: 2 })}
            </span>
          </div>
        )}

        {/* Инфо */}
        {isEdit && doc && (
          <div className="pt-3 border-t border-indigo-900/30">
            <h4 className="font-bold text-indigo-300 mb-2">{t("Info")}</h4>
            <div className="text-xs text-indigo-200 space-y-1">
              <div>
                {t("Number")} {doc.number}
              </div>
              <div>
                {t("Created")}: {new Date(doc.created_at).toLocaleDateString("ru-RU")}
              </div>
              {doc.posted_at && (
                <div>
                  {t("PostedAt")}: {new Date(doc.posted_at).toLocaleDateString("ru-RU")}
                </div>
              )}
            </div>
          </div>
        )}
      </div>,
    );
  }, [setSidebarContent, items, header.discount_percent, isPosted, doc, isEdit, counterpartyBalance, t]);

  // ── Мутации ──────────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async () => {
      const headerData = {
        ...header,
        discount_percent: parseFloat(header.discount_percent) || 0,
      };
      const res = await documentApi.save(docId, headerData);
      const savedId = res.data.id;

      // ✅ Удаляем на сервере строки, которых больше нет в текущем items —
      // иначе, например, после очистки таблицы (смена типа/склада) старые
      // строки останутся в БД и вернутся при следующей загрузке документа.
      const currentIds = new Set(items.filter((r) => r.id != null).map((r) => r.id));
      const removedIds = ((doc?.items as any[]) ?? []).map((it) => it.id).filter((id: number) => !currentIds.has(id));
      for (const id of removedIds) {
        try {
          await documentApi.deleteItem(savedId, id);
        } catch {
          // строка уже могла быть удалена (например кнопкой удаления строки) — не блокируем сохранение
        }
      }

      for (const row of items) {
        if (!row.product) continue;
        await documentApi.saveItem(savedId, row.id, {
          product: row.product,
          unit: row.unit,
          quantity: parseFloat(row.quantity) || 1,
          price: parseFloat(row.price) || 0,
          discount_percent: parseFloat(row.discount_percent) || 0,
          cost_price: parseFloat(row.cost_price) || 0,
          // ✅ помечаем тип строки, чтобы при следующем открытии документа
          // авто-строки (комплектующее/бонус акции) не приняли за обычную покупку
          extra_data: { row_type: row.is_bundle ? "bundle" : row.is_promo ? "promo" : "manual" },
        });
      }

      for (const p of participants) {
        if (!p.employee || p.id) continue;
        await documentApi.saveParticipant(savedId, null, {
          employee: p.employee,
          role: p.role,
        });
      }

      return { savedId, data: res.data };
    },
    onSuccess: ({ savedId }) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["document", docId] });
      notify("success", isEdit ? t("SuccessUpdated") : t("SuccessCreated"));
      if (!isEdit) {
        navigate(ROUTES.APP.DOCUMENTS_EDIT.replace(":id", String(savedId)), { replace: true });
      }
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", err.response?.data?.detail || t("ErrorSaving"));
    },
  });

  const postMutation = useMutation({
    mutationFn: () => documentApi.post(docId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document", docId] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setDocStatus("posted");
      notify("success", t("DocumentPosted"));
      setPostConfirm(false);
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", err.response?.data?.detail || t("ErrorPosting"));
      setPostConfirm(false);
    },
  });

  const unpostMutation = useMutation({
    mutationFn: () => documentApi.unpost(docId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document", docId] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setDocStatus("draft");
      notify("success", t("DocumentUnposted"));
      setUnpostConfirm(false);
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", err.response?.data?.detail || t("ErrorUnposting"));
      setUnpostConfirm(false);
    },
  });

  // ── Работа со строками ───────────────────────────────────────────────────────

  const updateItem = (key: string, field: keyof ItemRow, value: any) => {
    setItems((prev) =>
      prev.map((row) => {
        if (row._key !== key) return row;
        const updated = { ...row, [field]: value };
        if (field === "product") {
          const prod = (products as any[]).find((p: any) => p.id === value);
          if (prod) {
            updated.product_name = prod.name;
            updated.unit = prod.unit;
            updated.unit_name = prod.unit_detail?.name ?? "";
            updated.cost_price = String(prod.cost_price ?? 0);
            if (header.default_price_type && prod.prices) {
              const pp = prod.prices.find((p: any) => p.price_type === header.default_price_type);
              if (pp) updated.price = String(pp.price);
            }
          }
        }
        return updated;
      }),
    );
  };

  const removeItem = async (row: ItemRow) => {
    if (row.id && docId) {
      try {
        await documentApi.deleteItem(docId, row.id);
        queryClient.invalidateQueries({ queryKey: ["document", docId] });
      } catch {
        notify("error", t("ErrorDeletingRow"));
        return;
      }
    }
    setItems((prev) => prev.filter((r) => r._key !== row._key));
  };

  const removeParticipant = async (p: ParticipantRow) => {
    if (p.id && docId) {
      try {
        await documentApi.deleteParticipant(docId, p.id);
      } catch {
        notify("error", t("ErrorDeletingParticipant"));
        return;
      }
    }
    setParticipants((prev) => prev.filter((r) => r._key !== p._key));
  };

  const handleWarehouseChange = (warehouseId: number | null) => {
    const hasFilledItems = items.some((row) => !!row.product);
    if (hasFilledItems) {
      setPendingWarehouseId(warehouseId);
      setWarehouseChangeConfirmOpen(true);
      return;
    }
    setHeader((p) => ({ ...p, warehouse: warehouseId }));
  };

  const applyDocumentTypeChange = (newType: string) => {
    setHeader((p) => ({
      ...p,
      document_type: newType,
      warehouse_to: newType === "move" ? p.warehouse_to : null,
    }));
  };

  const handleDocumentTypeChange = (newType: string) => {
    const hasFilledItems = items.some((row) => !!row.product);
    if (hasFilledItems) {
      setPendingDocumentType(newType);
      setTypeChangeConfirmOpen(true);
      return;
    }
    applyDocumentTypeChange(newType);
  };

  const handlePriceTypeChange = (priceTypeId: number | null) => {
    setHeader((p) => ({ ...p, default_price_type: priceTypeId }));
    if (priceTypeId) localStorage.setItem("default_price_type", String(priceTypeId));
    if (!priceTypeId) return;

    setItems((prev) =>
      prev.map((row) => {
        if (!row.product) return row;
        const prod = (products as any[]).find((p: any) => p.id === row.product);
        if (!prod?.prices) return row;
        const pp = prod.prices.find((p: any) => p.price_type === priceTypeId);
        const price = pp ? String(pp.price) : row.price;
        const qty = parseFloat(row.quantity) || 0;
        const autoDiscount = !row.discount_manual ? resolveVolumeDiscount(prod, qty, priceTypeId) : null;
        return { ...row, price, discount_percent: autoDiscount ?? row.discount_percent };
      }),
    );
  };

  // ── Итоги ────────────────────────────────────────────────────────────────────
  // subtotal — сумма БЕЗ каких-либо скидок (построчных и документа);
  // discAmount — их суммарная величина; total — итог после всех скидок.

  const netSubtotal = items.reduce((sum, row) => sum + lineTotal(row), 0);
  const discPercent = parseFloat(header.discount_percent) || 0;
  const headerDiscAmount = (netSubtotal * discPercent) / 100;
  const total = netSubtotal - headerDiscAmount;

  const subtotal = items.reduce((sum, row) => sum + lineGross(row), 0);
  const discAmount = subtotal - total;

  const isMove = header.document_type === "move";
  const needsCounterparty = ["in", "out", "return_in", "return_out"].includes(header.document_type);
  const filteredWarehouses = header.branch ? (scope?.warehouses ?? []).filter((w: any) => w.branch === header.branch) : (scope?.warehouses ?? []);

  // ── Excel-экспорт ──────────────────────────────────────────────────────────
  // Использует те же items/columns/итоги, что уже показаны на экране и при печати —
  // см. правило в CLAUDE.md: экран/печать/Excel не должны расходиться.
  const handleExportExcel = async () => {
    const mainItems = items.filter((r) => !r.is_bundle && !r.is_promo);
    const bundleItems = items.filter((r) => r.is_bundle);
    const promoItems = items.filter((r) => r.is_promo);

    const typeLabel = t(DOC_TYPES.find((d) => d.value === header.document_type)?.label ?? header.document_type);
    const warehouseName = filteredWarehouses.find((w: any) => w.id === header.warehouse)?.name ?? "—";
    const warehouseToName = filteredWarehouses.find((w: any) => w.id === header.warehouse_to)?.name ?? "—";
    const primaryParticipant = participants[0];
    const employeeName = employees.find((e: any) => e.id === primaryParticipant?.employee)?.full_name ?? "—";
    const counterparty = counterparties.find((c: any) => c.id === header.counterparty);
    const discPercentNum = parseFloat(String(header.discount_percent)) || 0;
    const extraParticipantsText = participants
      .slice(1)
      .map((p) => {
        const emp = employees.find((e: any) => e.id === p.employee);
        return `${emp?.position_name ?? p.role}: ${emp?.full_name ?? "—"}`;
      })
      .join("; ");

    try {
      await exportDocumentExcel({
        company: currentCompany,
        user: currentUser,
        t,
        fileNamePrefix: isEdit ? `Document_${docNumber}` : "Document",
        docTitle: isEdit ? `${typeLabel} №${docNumber}` : t("NewDocument"),
        headerLines: [
          // ✅ Дата и Склад — в одну строку, как в компактной печатной шапке (Ctrl+P)
          {
            parts: [
              { label: t("Date") + ":", value: header.date ? formatDateDisplay(header.date) : "—" },
              { label: `${isMove ? t("SourceWarehouse") : t("Warehouse")}:`, value: warehouseName },
              ...(isMove ? [{ label: t("DestinationWarehouse") + ":", value: warehouseToName }] : []),
            ],
          },
          ...(discPercentNum !== 0 ? [{ label: t("DiscountPercent") + ":", value: `${header.discount_percent}%` }] : []),
          ...(extraParticipantsText ? [{ label: t("Participants") + ":", value: extraParticipantsText }] : []),
        ],
        counterpartyLine: needsCounterparty ? { name: counterparty?.name ?? "—", phone: counterparty?.phone } : undefined,
        driverLine: primaryParticipant ? { label: t("DriverLabel"), name: employeeName } : undefined,
        // ✅ Excel следует галочкам "ПЕЧАТЬ" в кнопке "Колонки" (та же логика, что и Ctrl+P),
        // а не "ЭКРАН" — это позволяет включить в Excel/печать колонку, скрытую на экране.
        columns: columns.filter((c) => c.visiblePrint),
        mainItems,
        bundleItems,
        promoItems,
        lineTotal,
        totals: { subtotal, discAmount, total },
      });
    } catch (e) {
      console.error("Ошибка экспорта в Excel:", e);
      notify("error", t("ErrorExportExcel"));
    }
  };

  // ── Рендер ───────────────────────────────────────────────────────────────────

  return (
    <RBACGuard isLoading={isEdit ? isLoading : false} error={isEdit ? error : null} canView={isEdit ? canPut : canPost} forbiddenText={t("ForbiddenText")}>
      <div className="h-full flex flex-col min-h-0">
        {/* ── Шапка страницы и шапка документа — всегда видимы, не скроллятся ── */}
        <div className="shrink-0">
          <Header
            docId={docId}
            isEdit={isEdit}
            header={header}
            docNumber={docNumber}
            isPosted={isPosted}
            setPostConfirm={setPostConfirm}
            postMutation={postMutation}
            setUnpostConfirm={setUnpostConfirm}
            unpostMutation={unpostMutation}
            saveMutation={saveMutation}
            disableSave={disableSave}
          />

          <div className="space-y-3 print:space-y-1 mt-3 print:mt-1">
            <Participants setParticipants={setParticipants} participants={participants} isPosted={isPosted} employees={employees} removeParticipant={removeParticipant} />

            <HeadDocument
              ref={headDocumentRef}
              header={header}
              isPosted={isPosted}
              isEdit={isEdit}
              setHeader={setHeader as React.Dispatch<React.SetStateAction<DocumentHeader>>}
              isMove={isMove}
              warehouses={filteredWarehouses}
              needsCounterparty={needsCounterparty}
              counterpartyBalance={counterpartyBalance}
              priceTypes={priceTypes}
              counterparties={counterparties}
              onPriceTypeChange={handlePriceTypeChange}
              branches={scope?.branches ?? []}
              onWarehouseChange={handleWarehouseChange}
              onDocumentTypeChange={handleDocumentTypeChange}
              participants={participants}
              setParticipants={setParticipants}
              employees={employees}
              onAdvance={() => productRowRef.current?.focusProductSearch()}
            />
          </div>
        </div>

        {/* ── Таблица товаров — единственная скроллируемая область; её шапка (thead) прилипает сверху ──
            В печати flex-1 убираем (print:flex-none print:h-auto) — иначе блок растягивается на всё
            оставшееся место в flex-колонке и оставляет пустоту перед строкой "Авто" ниже. */}
        <div className="flex-1 min-h-0 mt-3 print:mt-1 print:flex-none print:h-auto">
          <ProductRow
            ref={productRowRef}
            isPosted={isPosted}
            setItems={setItems}
            items={items}
            updateItem={updateItem}
            products={products}
            lineTotal={lineTotal}
            removeItem={removeItem}
            subtotal={subtotal}
            discAmount={discAmount}
            total={total}
            disabled={!canAddProducts}
            defaultPriceType={header.default_price_type}
            onBack={() => headDocumentRef.current?.focusNote()}
            columns={columns}
            onColumnsChange={setAllColumns}
            warehouseId={header.warehouse}
          />
        </div>

        {/* ── Печатная версия: "Авто" (сотрудник/водитель) — под таблицей товаров ── */}
        {participants[0] && (
          <div className="hidden print:block text-xs pt-1 mt-1 border-t border-gray-300">
            <span className="font-semibold">{t("DriverLabel")}:</span> {employees.find((e: any) => e.id === participants[0].employee)?.full_name ?? "—"}
          </div>
        )}
      </div>

      <ConfirmModal isOpen={postConfirm} type="info" title={t("PostDocument")} message={t("PostDocumentConfirm")} onClose={() => setPostConfirm(false)} onConfirm={() => postMutation.mutate()} />
      <ConfirmModal
        isOpen={unpostConfirm}
        type="info"
        title={t("UnpostDocument")}
        message={t("UnpostDocumentConfirm")}
        onClose={() => setUnpostConfirm(false)}
        onConfirm={() => unpostMutation.mutate()}
      />
      <ConfirmModal
        isOpen={warehouseChangeConfirmOpen}
        type="warning"
        title={t("ChangeWarehouseTitle")}
        message={t("ChangeWarehouseMessage")}
        onClose={() => setWarehouseChangeConfirmOpen(false)}
        onConfirm={() => {
          setHeader((p) => ({ ...p, warehouse: pendingWarehouseId }));
          setItems([]);
          setWarehouseChangeConfirmOpen(false);
        }}
      />
      <ConfirmModal
        isOpen={typeChangeConfirmOpen}
        type="warning"
        title={t("ChangeDocumentTypeTitle")}
        message={t("ChangeDocumentTypeMessage")}
        onClose={() => setTypeChangeConfirmOpen(false)}
        onConfirm={() => {
          if (pendingDocumentType) applyDocumentTypeChange(pendingDocumentType);
          setItems([]);
          setTypeChangeConfirmOpen(false);
        }}
      />
    </RBACGuard>
  );
};

export default DocumentFormPage;
