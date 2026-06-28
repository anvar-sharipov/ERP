// frontend/src/features/accounting/pages/Documents/Invoice/DocumentFormPage.tsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CheckCircle, XCircle } from "lucide-react";
import { documentApi } from "../../../services/documentApi";
import { priceTypeApi } from "../../../services/productApi";
import { counterpartyApi } from "../../../services/counterpartyApi";
import { employeeApi } from "../../../services/employeeApi";
import { productApi } from "../../../services/productApi";
import { useNotify } from "../../../../../core/context/NotificationContext";
import { usePageAccess } from "../../../../../core/hooks/usePageAccess";
import { useSidebar } from "../../../../../core/context/SidebarRightContext";
import { useDateStore } from "../../../../../core/store/dateStore";
import { RBACGuard } from "../../../../../components/ui/RBACGuard";
import { ConfirmModal } from "../../../../../components/ui/Modal/ConfirmModal";
import { ROUTES } from "../../../../../core/router/routes";
import { newItemRow, lineTotal, resolveVolumeDiscount } from "./Vars";
import { type DocHeader, type ItemRow, type ParticipantRow, type DocumentHeader } from "./Interface";
import { useColumnVisibility } from "./useColumnVisibility";
import Header from "./HeaderPage";
import HeadDocument from "./HeadDocument";
import ProductRow from "./ProductRow/ProductRow";
import Participants from "./Participants";
import { userScopeApi } from "../../../services/transactionApi";

// ── Компонент ─────────────────────────────────────────────────────────────────

const DocumentFormPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { setSidebarContent } = useSidebar();
  const { canPost, canPut } = usePageAccess("document");
  const { workDate, workBranch, workWarehouse } = useDateStore();

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

  const [items, setItems] = useState<ItemRow[]>([newItemRow()]);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [postConfirm, setPostConfirm] = useState(false);
  const [unpostConfirm, setUnpostConfirm] = useState(false);
  const [docStatus, setDocStatus] = useState<"draft" | "posted">("draft");
  const [docNumber, setDocNumber] = useState<string>("");
  const [counterpartyBalance, setCounterpartyBalance] = useState<number | null>(null);

  const canAddProducts = !!header.branch && !!header.warehouse;
  const isPosted = docStatus === "posted";

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
          }))
        : [newItemRow()],
    );
    setParticipants(
      doc.participants.map((p: any) => ({
        id: p.id,
        _key: String(p.id),
        employee: p.employee,
        role: p.role,
      })),
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
        if (!row.product) return row;
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
    const subtotal = items.reduce((sum, row) => sum + lineTotal(row), 0);
    const disc = parseFloat(header.discount_percent) || 0;
    const discAmount = (subtotal * disc) / 100;
    const total = subtotal - discAmount;

    setSidebarContent(
      <div className="space-y-4">
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
            {disc > 0 && (
              <div className="flex justify-between text-red-400">
                <span>
                  {t("Discount")} {disc}%:
                </span>
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

      for (const row of items) {
        if (!row.product) continue;
        await documentApi.saveItem(savedId, row.id, {
          product: row.product,
          unit: row.unit,
          quantity: parseFloat(row.quantity) || 1,
          price: parseFloat(row.price) || 0,
          discount_percent: parseFloat(row.discount_percent) || 0,
          cost_price: parseFloat(row.cost_price) || 0,
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

  const subtotal = items.reduce((sum, row) => sum + lineTotal(row), 0);
  const discPercent = parseFloat(header.discount_percent) || 0;
  const discAmount = (subtotal * discPercent) / 100;
  const total = subtotal - discAmount;

  const isMove = header.document_type === "move";
  const needsCounterparty = ["in", "out", "return_in", "return_out"].includes(header.document_type);
  const filteredWarehouses = header.branch ? (scope?.warehouses ?? []).filter((w: any) => w.branch === header.branch) : (scope?.warehouses ?? []);

  // ── Рендер ───────────────────────────────────────────────────────────────────

  return (
    <RBACGuard isLoading={isEdit ? isLoading : false} error={isEdit ? error : null} canView={isEdit ? canPut : canPost} forbiddenText={t("ForbiddenText")}>
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
      />

      <div className="space-y-4">
        <HeadDocument
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
        />

        <Participants setParticipants={setParticipants} participants={participants} isPosted={isPosted} employees={employees} removeParticipant={removeParticipant} />

        <ProductRow
          isPosted={isPosted}
          setItems={setItems}
          items={items}
          updateItem={updateItem}
          products={products}
          lineTotal={lineTotal}
          removeItem={removeItem}
          subtotal={subtotal}
          discPercent={discPercent}
          discAmount={discAmount}
          total={total}
          disabled={!canAddProducts}
          defaultPriceType={header.default_price_type}
          columns={columns}
          onColumnsChange={setAllColumns}
          warehouseId={header.warehouse}
        />
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
    </RBACGuard>
  );
};

export default DocumentFormPage;

// // frontend/src/features/accounting/pages/Documents/DocumentFormPage.tsx
// import { useState, useEffect } from "react";
// import { useParams, useNavigate } from "react-router-dom";
// import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
// import { useTranslation } from "react-i18next";
// import { CheckCircle, XCircle } from "lucide-react";
// import { documentApi } from "../../../services/documentApi";
// import { priceTypeApi } from "../../../services/productApi";
// import { counterpartyApi } from "../../../services/counterpartyApi";
// import { employeeApi } from "../../../services/employeeApi";
// import { productApi } from "../../../services/productApi";
// import { useNotify } from "../../../../../core/context/NotificationContext";
// import { usePageAccess } from "../../../../../core/hooks/usePageAccess";
// import { useSidebar } from "../../../../../core/context/SidebarRightContext";
// import { useDateStore } from "../../../../../core/store/dateStore";
// import { RBACGuard } from "../../../../../components/ui/RBACGuard";
// import { ConfirmModal } from "../../../../../components/ui/Modal/ConfirmModal";
// import { ROUTES } from "../../../../../core/router/routes";
// import { newItemRow, lineTotal, resolveVolumeDiscount } from "./Vars";
// import { type DocHeader, type ItemRow, type ParticipantRow, type DocumentHeader } from "./Interface";
// import Header from "./HeaderPage";
// import HeadDocument from "./HeadDocument";
// import ProductRow from "./ProductRow/ProductRow";
// import Participants from "./Participants";
// import { userScopeApi } from "../../../services/transactionApi";

// // ── Компонент ─────────────────────────────────────────────────────────────────
// const DocumentFormPage = () => {
//   const { id } = useParams<{ id: string }>();
//   const navigate = useNavigate();
//   const { t } = useTranslation();
//   const notify = useNotify();
//   const queryClient = useQueryClient();
//   const { setSidebarContent } = useSidebar();
//   const { canPost, canPut } = usePageAccess("document");
//   const { workDate, workBranch, workWarehouse } = useDateStore();

//   const isEdit = !!id;
//   const docId = id ? Number(id) : null;

//   // ── Состояние шапки ──────────────────────────────────────────────────────────

//   const [header, setHeader] = useState<DocHeader>({
//     document_type: "in",
//     date: workDate ?? new Date().toISOString().slice(0, 10),
//     warehouse: workWarehouse?.id ?? null, // ← из store
//     warehouse_to: null,
//     counterparty: null,
//     default_price_type: null,
//     discount_percent: "0",
//     note: "",
//     branch: null,
//   });
//   const [items, setItems] = useState<ItemRow[]>([newItemRow()]);
//   const [participants, setParticipants] = useState<ParticipantRow[]>([]);
//   const [postConfirm, setPostConfirm] = useState(false);
//   const [unpostConfirm, setUnpostConfirm] = useState(false);
//   const [docStatus, setDocStatus] = useState<"draft" | "posted">("draft");
//   const [docNumber, setDocNumber] = useState<string>("");
//   const [counterpartyBalance, setCounterpartyBalance] = useState<number | null>(null);
//   const canAddProducts = !!header.branch && !!header.warehouse;

//   const isPosted = docStatus === "posted";

//   // ── Справочники ──────────────────────────────────────────────────────────────

//   const counterpartyType = ["in", "return_out"].includes(header.document_type) ? "supplier" : "client";

//   // const { data: warehouses = [] } = useQuery({ queryKey: ["warehouses"], queryFn: warehouseApi.getAll });
//   // const { data: priceTypes = [] } = useQuery({ queryKey: ["price-types"], queryFn: priceTypeApi.getAll });
//   // При инициализации — берём из localStorage или первый из списка
//   const { data: priceTypes = [] } = useQuery({
//     queryKey: ["price-types"],
//     queryFn: priceTypeApi.getAll,
//   });
//   // const { data: counterparties = [] } = useQuery({ queryKey: ["counterparties"], queryFn: counterpartyApi.getAll });
//   const { data: counterparties = [] } = useQuery({
//     queryKey: ["counterparties", counterpartyType],
//     queryFn: () => counterpartyApi.getAll({ type: counterpartyType }),
//   });
//   // const { data: employees = [] } = useQuery({ queryKey: ["employees"], queryFn: employeeApi.getAll });
//   const { data: employees = [] } = useQuery({
//     queryKey: ["employees", workBranch?.id],
//     queryFn: () => employeeApi.getAll(workBranch?.id ? { branch: String(workBranch.id) } : undefined),
//   });
//   const { data: products = [] } = useQuery({ queryKey: ["products-short"], queryFn: () => productApi.getAll() });

//   // ── Загрузка документа при редактировании ────────────────────────────────────

//   const {
//     data: doc,
//     isLoading,
//     error,
//   } = useQuery({
//     queryKey: ["document", docId],
//     queryFn: () => documentApi.getById(docId!),
//     enabled: isEdit,
//   });

//   const { data: scope } = useQuery({
//     queryKey: ["my-scope"],
//     queryFn: () => userScopeApi.getMyScope().then((r) => r.data),
//     staleTime: 60_000,
//   });

//   useEffect(() => {
//     if (!isEdit) {
//       setHeader((p) => ({ ...p, branch: workBranch?.id ?? null }));
//     }
//   }, [workBranch?.id]);

//   // Когда priceTypes загрузились — установить default_price_type
//   useEffect(() => {
//     if (!priceTypes.length) return;
//     if (isEdit) return; // при редактировании берём из документа

//     const saved = localStorage.getItem("default_price_type");
//     const savedId = saved ? Number(saved) : null;

//     // Проверить что сохранённый тип ещё существует
//     const exists = savedId && priceTypes.some((pt: any) => pt.id === savedId);
//     const priceTypeId = exists ? savedId : (priceTypes[0] as any).id;

//     setHeader((p) => ({ ...p, default_price_type: priceTypeId }));
//   }, [priceTypes, isEdit]);

//   useEffect(() => {
//     if (!doc) return;
//     setDocStatus(doc.status);
//     setDocNumber(doc.number);
//     setHeader({
//       document_type: doc.document_type,
//       date: doc.date,
//       warehouse: doc.warehouse,
//       warehouse_to: doc.warehouse_to,
//       counterparty: doc.counterparty,
//       default_price_type: doc.default_price_type,
//       discount_percent: doc.discount_percent,
//       note: doc.note,
//       branch: doc.branch,
//     });
//     setItems(
//       doc.items.length > 0
//         ? doc.items.map((it: any) => ({
//             id: it.id,
//             _key: String(it.id),
//             product: it.product,
//             product_name: it.product_detail?.name ?? "",
//             unit: it.unit,
//             unit_name: it.unit_detail?.name ?? "",
//             quantity: String(it.quantity),
//             price: String(it.price),
//             discount_percent: String(it.discount_percent),
//             cost_price: String(it.cost_price),
//           }))
//         : [newItemRow()],
//     );
//     setParticipants(
//       doc.participants.map((p: any) => ({
//         id: p.id,
//         _key: String(p.id),
//         employee: p.employee,
//         role: p.role,
//       })),
//     );
//     if (doc.counterparty_balance != null) {
//       setCounterpartyBalance(Number(doc.counterparty_balance));
//     }
//   }, [doc]);

//   // Обновляем сальдо при смене контрагента (только при редактировании)
//   useEffect(() => {
//     if (!isEdit || !header.counterparty) {
//       setCounterpartyBalance(null);
//     }
//   }, [header.counterparty, isEdit]);

//   // Синхронизировать склад из rightbar (только при создании)
//   useEffect(() => {
//     if (!isEdit) {
//       setHeader((p) => ({ ...p, warehouse: workWarehouse?.id ?? null }));
//     }
//   }, [workWarehouse?.id, isEdit]);

//   // Синхронизировать дату из rightbar (только при создании)
//   useEffect(() => {
//     if (!isEdit) {
//       setHeader((p) => ({ ...p, date: workDate ?? new Date().toISOString().slice(0, 10) }));
//     }
//   }, [workDate, isEdit]);

//   // ── Сайдбар ──────────────────────────────────────────────────────────────────

//   useEffect(() => {
//     const subtotal = items.reduce((sum, row) => sum + lineTotal(row), 0);
//     const disc = parseFloat(header.discount_percent) || 0;
//     const discAmount = (subtotal * disc) / 100;
//     const total = subtotal - discAmount;

//     setSidebarContent(
//       <div className="space-y-4">
//         {/* Статус */}
//         <div>
//           <h4 className="font-bold text-indigo-300 mb-2">{t("Status")}</h4>
//           <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${isPosted ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>
//             {isPosted ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
//             {isPosted ? t("Posted") : t("Draft")}
//           </span>
//         </div>

//         {/* Итоги */}
//         <div className="pt-3 border-t border-indigo-900/30">
//           <h4 className="font-bold text-indigo-300 mb-2">{t("Total")}</h4>
//           <div className="text-xs text-indigo-200 space-y-1">
//             <div className="flex justify-between">
//               <span>{t("Subtotal")}:</span>
//               <span className="font-mono">{subtotal.toLocaleString("ru-RU", { minimumFractionDigits: 2 })}</span>
//             </div>
//             {disc > 0 && (
//               <div className="flex justify-between text-red-400">
//                 <span>
//                   {t("Discount")} {disc}%:
//                 </span>
//                 <span className="font-mono">−{discAmount.toLocaleString("ru-RU", { minimumFractionDigits: 2 })}</span>
//               </div>
//             )}
//             <div className="flex justify-between font-bold text-white border-t border-indigo-900/30 pt-1">
//               <span>{t("TotalPayable")}:</span>
//               <span className="font-mono">{total.toLocaleString("ru-RU", { minimumFractionDigits: 2 })}</span>
//             </div>
//           </div>
//         </div>

//         {/* Сальдо контрагента */}
//         {counterpartyBalance !== null && (
//           <div className="pt-3 border-t border-indigo-900/30">
//             <h4 className="font-bold text-indigo-300 mb-1">{t("CounterpartyBalance")}</h4>
//             <span className={`font-mono text-sm font-bold ${counterpartyBalance >= 0 ? "text-green-400" : "text-red-400"}`}>
//               {counterpartyBalance.toLocaleString("ru-RU", { minimumFractionDigits: 2 })}
//             </span>
//           </div>
//         )}

//         {/* Инфо */}
//         {isEdit && doc && (
//           <div className="pt-3 border-t border-indigo-900/30">
//             <h4 className="font-bold text-indigo-300 mb-2">{t("Info")}</h4>
//             <div className="text-xs text-indigo-200 space-y-1">
//               <div>
//                 {t("Number")} {doc.number}
//               </div>
//               <div>
//                 {t("Created")}: {new Date(doc.created_at).toLocaleDateString("ru-RU")}
//               </div>
//               {doc.posted_at && (
//                 <div>
//                   {t("PostedAt")}: {new Date(doc.posted_at).toLocaleDateString("ru-RU")}
//                 </div>
//               )}
//             </div>
//           </div>
//         )}
//       </div>,
//     );
//   }, [setSidebarContent, items, header.discount_percent, isPosted, doc, isEdit, counterpartyBalance, t]);

//   // ── Мутации ──────────────────────────────────────────────────────────────────

//   const saveMutation = useMutation({
//     mutationFn: async () => {
//       // 1. Сохраняем шапку
//       const headerData = {
//         ...header,
//         discount_percent: parseFloat(header.discount_percent) || 0,
//       };
//       const res = await documentApi.save(docId, headerData);
//       const savedId = res.data.id;

//       // 2. Сохраняем строки
//       for (const row of items) {
//         if (!row.product) continue;
//         const itemData = {
//           product: row.product,
//           unit: row.unit,
//           quantity: parseFloat(row.quantity) || 1,
//           price: parseFloat(row.price) || 0,
//           discount_percent: parseFloat(row.discount_percent) || 0,
//           cost_price: parseFloat(row.cost_price) || 0,
//         };
//         await documentApi.saveItem(savedId, row.id, itemData);
//       }

//       // 3. Сохраняем участников
//       for (const p of participants) {
//         if (!p.employee) continue;
//         if (!p.id) {
//           await documentApi.saveParticipant(savedId, null, {
//             employee: p.employee,
//             role: p.role,
//           });
//         }
//       }

//       return { savedId, data: res.data };
//     },
//     onSuccess: ({ savedId }) => {
//       queryClient.invalidateQueries({ queryKey: ["documents"] });
//       queryClient.invalidateQueries({ queryKey: ["document", docId] });
//       notify("success", isEdit ? t("SuccessUpdated") : t("SuccessCreated"));
//       if (!isEdit) {
//         navigate(ROUTES.APP.DOCUMENTS_EDIT.replace(":id", String(savedId)), { replace: true });
//       }
//     },
//     onError: (err: any) => {
//       if (err._handled) return;
//       notify("error", err.response?.data?.detail || t("ErrorSaving"));
//     },
//   });

//   const postMutation = useMutation({
//     mutationFn: () => documentApi.post(docId!),
//     onSuccess: () => {
//       queryClient.invalidateQueries({ queryKey: ["document", docId] });
//       queryClient.invalidateQueries({ queryKey: ["documents"] });
//       setDocStatus("posted");
//       notify("success", t("DocumentPosted"));
//       setPostConfirm(false);
//     },
//     onError: (err: any) => {
//       if (err._handled) return;
//       notify("error", err.response?.data?.detail || t("ErrorPosting"));
//       setPostConfirm(false);
//     },
//   });

//   const unpostMutation = useMutation({
//     mutationFn: () => documentApi.unpost(docId!),
//     onSuccess: () => {
//       queryClient.invalidateQueries({ queryKey: ["document", docId] });
//       queryClient.invalidateQueries({ queryKey: ["documents"] });
//       setDocStatus("draft");
//       notify("success", t("DocumentUnposted"));
//       setUnpostConfirm(false);
//     },
//     onError: (err: any) => {
//       if (err._handled) return;
//       notify("error", err.response?.data?.detail || t("ErrorUnposting"));
//       setUnpostConfirm(false);
//     },
//   });

//   // ── Работа со строками ───────────────────────────────────────────────────────

//   const updateItem = (key: string, field: keyof ItemRow, value: any) => {
//     setItems((prev) =>
//       prev.map((row) => {
//         if (row._key !== key) return row;
//         const updated = { ...row, [field]: value };
//         // При выборе товара — подставляем цену и ед. изм.
//         if (field === "product") {
//           const prod = (products as any[]).find((p: any) => p.id === value);
//           if (prod) {
//             updated.product_name = prod.name;
//             updated.unit = prod.unit;
//             updated.unit_name = prod.unit_detail?.name ?? "";
//             updated.cost_price = String(prod.cost_price ?? 0);
//             // Цену берём из default_price_type документа если есть
//             if (header.default_price_type && prod.prices) {
//               const pp = prod.prices.find((p: any) => p.price_type === header.default_price_type);
//               if (pp) updated.price = String(pp.price);
//             }
//           }
//         }
//         return updated;
//       }),
//     );
//   };

//   const removeItem = async (row: ItemRow) => {
//     if (row.id && docId) {
//       try {
//         await documentApi.deleteItem(docId, row.id);
//         queryClient.invalidateQueries({ queryKey: ["document", docId] });
//       } catch {
//         notify("error", t("ErrorDeletingRow"));
//         return;
//       }
//     }
//     setItems((prev) => prev.filter((r) => r._key !== row._key));
//   };

//   const removeParticipant = async (p: ParticipantRow) => {
//     if (p.id && docId) {
//       try {
//         await documentApi.deleteParticipant(docId, p.id);
//       } catch {
//         notify("error", t("ErrorDeletingParticipant"));
//         return;
//       }
//     }
//     setParticipants((prev) => prev.filter((r) => r._key !== p._key));
//   };

//   const handlePriceTypeChange = (priceTypeId: number | null) => {
//     setHeader((p) => ({ ...p, default_price_type: priceTypeId }));
//     if (priceTypeId) {
//       localStorage.setItem("default_price_type", String(priceTypeId));
//     }

//     if (!priceTypeId) return;

//     setItems((prev) =>
//       prev.map((row) => {
//         if (!row.product) return row;
//         const prod = (products as any[]).find((p: any) => p.id === row.product);
//         if (!prod?.prices) return row;

//         // Цена
//         const pp = prod.prices.find((p: any) => p.price_type === priceTypeId);
//         const price = pp ? String(pp.price) : row.price;

//         // Скидка — только если не ручная
//         const qty = parseFloat(row.quantity) || 0;
//         const autoDiscount = !row.discount_manual ? resolveVolumeDiscount(prod, qty, priceTypeId) : null;

//         return {
//           ...row,
//           price,
//           discount_percent: autoDiscount ?? row.discount_percent,
//         };
//       }),
//     );
//   };

//   useEffect(() => {
//     if (!doc || !products.length || !doc.default_price_type) return;

//     setItems((prev) =>
//       prev.map((row) => {
//         if (!row.product) return row;
//         const prod = (products as any[]).find((p: any) => p.id === row.product);
//         if (!prod?.prices) return row;
//         const pp = prod.prices.find((p: any) => p.price_type === doc.default_price_type);
//         if (!pp) return row;
//         return { ...row, price: String(pp.price) };
//       }),
//     );
//   }, [doc?.id, products.length]);

//   // ── Итоги ────────────────────────────────────────────────────────────────────

//   const subtotal = items.reduce((sum, row) => sum + lineTotal(row), 0);
//   const discPercent = parseFloat(header.discount_percent) || 0;
//   const discAmount = (subtotal * discPercent) / 100;
//   const total = subtotal - discAmount;

//   const isMove = header.document_type === "move";
//   const needsCounterparty = ["in", "out", "return_in", "return_out"].includes(header.document_type);

//   // ── Рендер ───────────────────────────────────────────────────────────────────

//   const filteredWarehouses = header.branch ? (scope?.warehouses ?? []).filter((w: any) => w.branch === header.branch) : (scope?.warehouses ?? []);

//   return (
//     <RBACGuard isLoading={isEdit ? isLoading : false} error={isEdit ? error : null} canView={isEdit ? canPut : canPost} forbiddenText={t("ForbiddenText")}>
//       {/* ── Шапка страницы ─────────────────────────────────────────────────── */}
//       <Header
//         docId={docId}
//         isEdit={isEdit}
//         header={header}
//         docNumber={docNumber}
//         isPosted={isPosted}
//         setPostConfirm={setPostConfirm}
//         postMutation={postMutation}
//         setUnpostConfirm={setUnpostConfirm}
//         unpostMutation={unpostMutation}
//         saveMutation={saveMutation}
//       />

//       <div className="space-y-4">
//         {/* ── Шапка документа ── */}
//         <HeadDocument
//           header={header}
//           isPosted={isPosted}
//           isEdit={isEdit}
//           setHeader={setHeader as React.Dispatch<React.SetStateAction<DocumentHeader>>}
//           isMove={isMove}
//           warehouses={filteredWarehouses}
//           needsCounterparty={needsCounterparty}
//           counterpartyBalance={counterpartyBalance}
//           priceTypes={priceTypes}
//           counterparties={counterparties}
//           onPriceTypeChange={handlePriceTypeChange}
//           branches={scope?.branches ?? []} // фильтрованные по scope
//         />

//         {/* ── Участники (над таблицей товаров) ── */}
//         <Participants setParticipants={setParticipants} participants={participants} isPosted={isPosted} employees={employees} removeParticipant={removeParticipant} />

//         {/* ── Строки товаров ── */}
//         <ProductRow
//           isPosted={isPosted}
//           setItems={setItems}
//           items={items}
//           updateItem={updateItem}
//           products={products}
//           lineTotal={lineTotal}
//           removeItem={removeItem}
//           subtotal={subtotal}
//           discPercent={discPercent}
//           discAmount={discAmount}
//           total={total}
//           disabled={!canAddProducts}
//           defaultPriceType={header.default_price_type}
//         />
//       </div>

//       {/* ── Модалки подтверждения ──────────────────────────────────────────── */}
//       <ConfirmModal isOpen={postConfirm} type="info" title={t("PostDocument")} message={t("PostDocumentConfirm")} onClose={() => setPostConfirm(false)} onConfirm={() => postMutation.mutate()} />
//       <ConfirmModal
//         isOpen={unpostConfirm}
//         type="info"
//         title={t("UnpostDocument")}
//         message={t("UnpostDocumentConfirm")}
//         onClose={() => setUnpostConfirm(false)}
//         onConfirm={() => unpostMutation.mutate()}
//       />
//     </RBACGuard>
//   );
// };

// export default DocumentFormPage;
