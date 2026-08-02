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
import { CounterpartyBalanceCard } from "./CounterpartyBalanceCard";
import ProductRow, { type ProductRowHandle } from "./ProductRow/ProductRow";
import Participants from "./Participants";
import { userScopeApi } from "../../../services/transactionApi";
import { documentSettingsApi } from "../../../services/documentSettingsApi";
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

  // ✅ id === "new" — сентинел создания нового документа (см. ROUTES.APP.
  // DOCUMENTS_CREATE в routes.ts: "/documents/new/edit" — тот же <Route>, что и
  // редактирование, вместо отдельного маршрута, иначе первый autosave, переходя
  // на URL с реальным id, размонтировал бы весь компонент и ронял фокус ввода).
  const isEdit = !!id && id !== "new";
  const docId = isEdit ? Number(id) : null;

  // ── Состояние шапки ──────────────────────────────────────────────────────────

  const [header, setHeader] = useState<DocHeader>({
    document_type: "out",
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
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const canAddProducts = !!header.branch && !!header.warehouse;
  const isPosted = docStatus === "posted";
  const disableSave = !isEdit && (!workBranch || !workWarehouse);

  // ── Рефы для клавиатурного флоу: сотрудник → контрагент → комментарий → товар ─
  const headDocumentRef = useRef<HeadDocumentHandle>(null);
  const productRowRef = useRef<ProductRowHandle>(null);

  // ✅ Автосохранение черновика (см. эффект ниже, после saveMutation) — рефы вместо
  // useState, т.к. не должны вызывать ре-рендер. justHydratedRef переживает сам
  // эффект гидратации (см. useEffect([doc]) выше); isAutosaveRef различает
  // авто- и ручное сохранение внутри одного saveMutation (тост "Сохранено" — только
  // для ручного, автосохранение молча обновляет lastSavedAt).
  const justHydratedRef = useRef(false);
  const isAutosaveRef = useRef(false);
  const [autosaveError, setAutosaveError] = useState(false);
  // ✅ id документа, для которого items/header/participants уже были ПОЛНОСТЬЮ
  // собраны из ["document", docId] (со сборкой "_key: String(it.id)" для каждой
  // строки/участника) — см. useEffect([doc]) ниже. Полная пересборка должна
  // произойти РОВНО ОДИН РАЗ на документ (первое открытие/переключение на другой
  // документ) — иначе каждый рефетч после автосохранения (или просто фоновый
  // рефетч react-query) пересобирает items с НОВЫМИ _key (id, которого раньше не
  // было, теперь есть) → React видит другой key у той же визуальной строки →
  // размонтирует старый DOM-узел инпута и монтирует новый → фокус ввода теряется
  // прямо во время печати. Реальные ERP не гоняют форму через полный ре-рендер на
  // каждое автосохранение — локальное состояние остаётся источником истины, сервер
  // только сообщает присвоенные id (см. onSuccess у saveMutation).
  const hydratedDocIdRef = useRef<number | null>(null);

  // Без выбранного филиала и склада в правой панели создавать накладные нельзя
  useEffect(() => {
    if (!isEdit && (!workBranch || !workWarehouse)) {
      notify("error", t("SelectBranchAndWarehouse"));
      navigate(ROUTES.APP.DOCUMENTS_INVOICES, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, workBranch, workWarehouse]);

  // Фокус на сотруднике при входе на форму — только при создании нового документа,
  // при открытии существующего (update) фокус на водителе не нужен
  useEffect(() => {
    if (!isEdit && !isPosted) {
      setTimeout(() => headDocumentRef.current?.focusEmployee(), 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Колонки таблицы ───────────────────────────────────────────────────────
  // Ключ зависит от типа документа — у каждого типа свои настройки в localStorage

  const { columns, setAllColumns } = useColumnVisibility(header.document_type);

  // ── Справочники ──────────────────────────────────────────────────────────────

  const counterpartyType = ["in", "return_out"].includes(header.document_type) ? "supplier" : "client";

  // ✅ staleTime — справочники (типы цен/контрагенты/сотрудники/товары) меняются
  // редко в рамках одной сессии; без staleTime react-query рефетчит их заново
  // при каждом заходе на форму документа (список товаров — самый тяжёлый запрос,
  // см. ProductSerializer), из-за чего SearchableSelect-поля ощутимо долго
  // "загружались" при повторном открытии/создании документов подряд.
  const { data: priceTypes = [] } = useQuery({
    queryKey: ["price-types"],
    queryFn: priceTypeApi.getAll,
    staleTime: 60_000,
  });

  // ✅ Настройка "Тип цены для прихода" (админка → Настройка фактуры) — подставляется
  // по умолчанию в шапку нового документа типа "Приход", см. CLAUDE.md/DocumentSettings.
  const { data: documentSettingsList } = useQuery({
    queryKey: ["document-settings"],
    queryFn: documentSettingsApi.getSettings,
  });
  const purchasePriceType = documentSettingsList?.[0]?.purchase_price_type ?? null;

  const { data: counterparties = [] } = useQuery({
    queryKey: ["counterparties", counterpartyType],
    queryFn: () => counterpartyApi.getAll({ type: counterpartyType }),
    staleTime: 60_000,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees", workBranch?.id],
    queryFn: () => employeeApi.getAll(workBranch?.id ? { branch: String(workBranch.id) } : undefined),
    staleTime: 60_000,
  });

  // ✅ Ассортиментная матрица "товар × склад" (Product.allowed_warehouses) —
  // фильтруем по складу/филиалу ЭТОГО документа (header.warehouse/branch), а
  // не по глобальному WorkDateWidget — при редактировании старого документа
  // они могут отличаться.
  const { data: products = [] } = useQuery({
    queryKey: ["products-for-document", header.warehouse, header.branch],
    queryFn: () => productApi.getAllForDocument(header.warehouse ? { warehouse: header.warehouse } : header.branch ? { branch: header.branch } : {}),
    staleTime: 60_000,
  });

  // ✅ Сальдо контрагента — поднято на уровень страницы (не внутрь
  // CounterpartyBalanceCard), чтобы одни и те же данные использовались и для
  // виджета под таблицей товаров, и для Ctrl+P печати, и для Excel-экспорта —
  // без трёх независимых копий (см. CLAUDE.md про паритет экран/печать/Excel).
  const counterpartyCardEnabled = !!header.counterparty && !!header.warehouse && !!header.document_type && !!header.date;
  const { data: counterpartyCard, isLoading: counterpartyCardLoading } = useQuery({
    queryKey: ["counterparty-card", header.counterparty, header.warehouse, header.document_type, header.date],
    queryFn: () =>
      documentApi.getCounterpartyCard({
        counterparty: header.counterparty as number,
        warehouse: header.warehouse as number,
        document_type: header.document_type,
        date: header.date,
      }),
    enabled: counterpartyCardEnabled,
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

  // ✅ Настоящая причина, почему фокус ронялся именно на первом автосохранении:
  // до первого сохранения запрос ["document", docId] выключен (enabled: isEdit
  // было false), а сразу после — включается ВПЕРВЫЕ и висит в isLoading=true, пока
  // не резолвится сетевой запрос. RBACGuard (см. ниже) при isLoading=true рендерит
  // ВМЕСТО children спиннер — то есть вся форма целиком размонтируется под спиннер
  // и монтируется заново, стоило только React Router сменить :id-параметр (никакой
  // remount самого DocumentFormPage тут уже нет — это чинил прошлый фикс маршрута,
  // но RBACGuard ломает то же самое своими силами, скрывая children). Раз этот
  // документ уже гидратирован локально (hydratedDocIdRef, см. выше — мы его только
  // что сами создали), спиннер не нужен: реальных данных ждать не от кого.
  const showDocLoading = isEdit && isLoading && hydratedDocIdRef.current !== docId;

  // ── Эффекты синхронизации ────────────────────────────────────────────────────

  useEffect(() => {
    if (!isEdit) setHeader((p) => ({ ...p, branch: workBranch?.id ?? null }));
  }, [workBranch?.id, isEdit]);

  // ✅ Обычный дефолт (последний использованный/первый тип цены) — только для
  // НЕ-приходных документов. Для "Приход" типом цены управляет отдельный эффект ниже
  // (настройка из админки, либо явный null → фолбэк на себестоимость в ProductRow).
  useEffect(() => {
    if (!priceTypes.length || isEdit || header.document_type === "in") return;
    const saved = localStorage.getItem("default_price_type");
    const savedId = saved ? Number(saved) : null;
    const exists = savedId && priceTypes.some((pt: any) => pt.id === savedId);
    const priceTypeId = exists ? savedId : (priceTypes[0] as any).id;
    setHeader((p) => ({ ...p, default_price_type: priceTypeId }));
  }, [priceTypes, isEdit, header.document_type]);

  // ✅ Для нового документа типа "Приход" — тип цены управляется ТОЛЬКО настройкой
  // "Настройка фактуры" (админка): если задана — подставляется она; если нет —
  // явно обнуляем default_price_type, чтобы сработал фолбэк на cost_price в ProductRow
  // (а не случайный "последний использованный" тип цены от другого документа).
  useEffect(() => {
    if (isEdit || header.document_type !== "in") return;
    setHeader((p) => ({ ...p, default_price_type: purchasePriceType ?? null }));
  }, [purchasePriceType, header.document_type, isEdit]);

  useEffect(() => {
    if (!doc) return;
    setDocStatus(doc.status);
    setDocNumber(doc.number);
    if (doc.counterparty_balance != null) {
      setCounterpartyBalance(Number(doc.counterparty_balance));
    }

    // ✅ Тот же документ, что уже собран локально (рефетч после автосохранения,
    // фоновый рефетч react-query и т.п.) — статус/номер/сальдо выше уже обновлены,
    // но items/header/participants НЕ пересобираем: локальное состояние сейчас —
    // источник истины (это же мы сами только что сохранили), а полная пересборка
    // сгенерировала бы новые "_key" для строк, только что получивших id с сервера,
    // и React перемонтировал бы их DOM-узлы, роняя фокус ввода. См. hydratedDocIdRef.
    if (hydratedDocIdRef.current === doc.id) return;
    hydratedDocIdRef.current = doc.id;

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
    // ✅ Это заполнение состояния пришло с сервера (первое открытие документа), а
    // не от правки пользователем — эффект автосохранения ниже должен пропустить
    // именно этот цикл, иначе открытие документа тут же планировало бы автосейв.
    justHydratedRef.current = true;
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
              {doc.posted_by_name && (
                <div>
                  {t("PostedByLabel")}: {doc.posted_by_name}
                </div>
              )}
            </div>
          </div>
        )}
      </div>,
    );
  }, [setSidebarContent, items, header.discount_percent, isPosted, doc, isEdit, t]);

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

      // ✅ Строки/участники, созданные только что (row.id ещё null) — после
      // сохранения получают реальный id с сервера. Патчим его в локальный стейт
      // ЦЕЛЕНАПРАВЛЕННО (по _key), не трогая сам _key — см. onSuccess и комментарий
      // у hydratedDocIdRef выше про то, почему это критично для фокуса ввода.
      const itemIdPatches: { key: string; id: number }[] = [];
      for (const row of items) {
        if (!row.product) continue;
        const itemRes = await documentApi.saveItem(savedId, row.id, {
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
        if (!row.id && itemRes.data?.id) {
          itemIdPatches.push({ key: row._key, id: itemRes.data.id });
        }
      }

      const participantIdPatches: { key: string; id: number }[] = [];
      for (const p of participants) {
        if (!p.employee || p.id) continue;
        const partRes = await documentApi.saveParticipant(savedId, null, {
          employee: p.employee,
          role: p.role,
        });
        if (partRes.data?.id) {
          participantIdPatches.push({ key: p._key, id: partRes.data.id });
        }
      }

      return { savedId, data: res.data, itemIdPatches, participantIdPatches };
    },
    onSuccess: ({ savedId, itemIdPatches, participantIdPatches }) => {
      const wasAutosave = isAutosaveRef.current;
      isAutosaveRef.current = false;

      // ✅ Патчим id новых строк/участников ПРЯМО в локальном состоянии (не через
      // рефетч с сервера) — _key не меняется, значит React не перемонтирует DOM-узлы
      // этих строк и фокус ввода не теряется. Без этого следующее автосохранение
      // снова слало бы row.id=null и создавало ДУБЛИКАТ строки на сервере.
      // justHydratedRef — эти setItems/setParticipants не являются правкой
      // пользователя, эффект автосохранения ниже не должен планировать по ним ещё
      // один цикл (иначе после каждого автосейва летел бы лишний повторный).
      if (itemIdPatches.length) {
        justHydratedRef.current = true;
        setItems((prev) => prev.map((r) => {
          const patch = itemIdPatches.find((p) => p.key === r._key);
          return patch ? { ...r, id: patch.id } : r;
        }));
      }
      if (participantIdPatches.length) {
        justHydratedRef.current = true;
        setParticipants((prev) => prev.map((r) => {
          const patch = participantIdPatches.find((p) => p.key === r._key);
          return patch ? { ...r, id: patch.id } : r;
        }));
      }
      // ✅ Локальное состояние уже отражает то, что мы только что сами сохранили —
      // помечаем документ "уже гидратированным", чтобы грядущий рефетч
      // ["document", docId] (invalidateQueries ниже, либо активация запроса после
      // перехода на /edit для только что созданного документа) не пересобрал
      // items/header/participants с нуля и не сбросил фокус (см. useEffect([doc])).
      hydratedDocIdRef.current = savedId;

      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["document", docId] });
      setLastSavedAt(new Date());
      setAutosaveError(false);
      // ✅ Автосохранение — молча, без тоста на каждую паузу в наборе (см. CLAUDE.md
      // про "не спамить": тост здесь только для ручного нажатия "Сохранить").
      if (!wasAutosave) notify("success", isEdit ? t("SuccessUpdated") : t("SuccessCreated"));
      if (!isEdit) {
        navigate(ROUTES.APP.DOCUMENTS_EDIT.replace(":id", String(savedId)), { replace: true });
      }
    },
    onError: (err: any) => {
      const wasAutosave = isAutosaveRef.current;
      isAutosaveRef.current = false;
      if (err._handled) return;
      // ✅ Автосохранение при ошибке не бросает тост при каждой попытке (например
      // "период закрыт" повторялось бы на каждую паузу в наборе) — вместо этого
      // маленький индикатор рядом с кнопкой "Сохранить" (см. HeaderPage.tsx).
      // Ручное нажатие "Сохранить" — по-прежнему тост с точной причиной.
      if (wasAutosave) {
        setAutosaveError(true);
        return;
      }
      // ✅ Ошибка "период закрыт" (DocumentSerializer.validate(), см. utils.py::
      // check_period_open) приходит как {"date": ["текст"]}, а не {"detail": ...} —
      // без фолбэка в тост улетал бы дженерик ErrorSaving вместо понятной причины.
      notify("error", err.response?.data?.detail || err.response?.data?.date?.[0] || t("ErrorSaving"));
    },
  });

  // ✅ Автосохранение черновика — реальные ERP не сохраняют на каждое нажатие
  // клавиши: ждут паузу в наборе (debounce) и сохраняют молча в фоне, пока документ
  // в статусе черновика. Стартует только после первой значимой строки товара — чтобы
  // просто открытая и тут же закрытая форма нового документа не плодила пустые
  // черновики в БД (решение согласовано с пользователем).
  useEffect(() => {
    // ✅ Это состояние пришло от гидратации с сервера (открыли существующий документ /
    // документ перезагрузился после автосохранения) — не считается правкой пользователя.
    if (justHydratedRef.current) {
      justHydratedRef.current = false;
      return;
    }
    if (isPosted) return;
    if (!items.some((row) => !!row.product)) return;

    const timer = setTimeout(() => {
      isAutosaveRef.current = true;
      saveMutation.mutate();
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [header, items, participants, isPosted]);

  const postMutation = useMutation({
    mutationFn: () => documentApi.post(docId!),
    onSuccess: () => {
      // ✅ В отличие от автосохранения — здесь, наоборот, НУЖНА полная пересборка
      // items/header из ["document", docId] (см. useEffect([doc]) и hydratedDocIdRef
      // выше): проведение документа пересчитывает данные на сервере (себестоимость
      // строк и т.п., см. CLAUDE.md про Document.post()), а фокус ввода в этот момент
      // не защищаем намеренно — форма всё равно тут же становится нередактируемой.
      hydratedDocIdRef.current = null;
      queryClient.invalidateQueries({ queryKey: ["document", docId] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      // ✅ Проведение документа меняет проводки по счёту контрагента — сальдо в
      // сайдбаре (CounterpartyBalanceCard) должно пересчитаться сразу же.
      queryClient.invalidateQueries({ queryKey: ["counterparty-card"] });
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
      // ✅ См. комментарий в postMutation выше — отмена проведения тоже должна
      // подтянуть реальное состояние документа с сервера целиком.
      hydratedDocIdRef.current = null;
      queryClient.invalidateQueries({ queryKey: ["document", docId] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["counterparty-card"] });
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
      // ✅ "Приход" не поддерживает скидку — сбрасываем, чтобы она не осталась
      // от предыдущего типа документа, для которого поле было заполнено.
      discount_percent: newType === "in" ? "0" : p.discount_percent,
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
        const autoDiscount = header.document_type !== "in" && !row.discount_manual ? resolveVolumeDiscount(prod, qty, priceTypeId) : null;
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
  // ✅ Слоган филиала — текст внизу счёта-фактуры (только печать/Excel, на экране скрыт)
  const branchSlogan = scope?.branches.find((b) => b.id === header.branch)?.slogan || "";

  // ✅ Временное требование заказчика: перед проведением сотрудник/контрагент/примечание
  // обязательны — ТОЛЬКО на фронте (валидация перед открытием confirm-модалки), бэкенд не трогаем.
  // Когда заказчик попросит убрать обязательность — просто удалить эту проверку.
  const handlePostClick = () => {
    const missing: string[] = [];
    if (!participants[0]?.employee) missing.push(t("Employee"));
    if (needsCounterparty && !header.counterparty) missing.push(t("Counterparty"));
    if (!header.note.trim()) missing.push(t("Note"));

    if (missing.length > 0) {
      notify("error", t("FillRequiredFields", { fields: missing.join(", ") }));
      return;
    }
    setPostConfirm(true);
  };

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
    const employeeName = employees.find((e: any) => e.id === primaryParticipant?.employee)?.full_name;
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
          ...(header.document_type !== "in" && discPercentNum !== 0 ? [{ label: t("DiscountPercent") + ":", value: `${header.discount_percent}%` }] : []),
          ...(extraParticipantsText ? [{ label: t("Participants") + ":", value: extraParticipantsText }] : []),
        ],
        counterpartyLine: needsCounterparty ? { name: counterparty?.name ?? "—", phone: counterparty?.phone } : undefined,
        driverLine: employeeName ? { label: t("DriverLabel"), name: employeeName } : undefined,
        postedByLine: isPosted && doc?.posted_by_name ? { label: t("PostedByLabel"), name: doc.posted_by_name } : undefined,
        branchSlogan: branchSlogan || undefined,
        // ✅ Excel следует галочкам "ПЕЧАТЬ" в кнопке "Колонки" (та же логика, что и Ctrl+P),
        // а не "ЭКРАН" — это позволяет включить в Excel/печать колонку, скрытую на экране.
        // "Приход" не поддерживает скидку — исключаем её колонки, даже если для них
        // осталась включённой печать от предыдущего типа документа.
        columns: columns.filter((c) => c.visiblePrint && !(header.document_type === "in" && (c.key === "discount_percent" || c.key === "discount_amount"))),
        mainItems,
        bundleItems,
        promoItems,
        lineTotal,
        totals: { subtotal, discAmount, total },
        // ✅ То же самое сальдо, что показано на экране/печати под таблицей товаров
        // (CounterpartyBalanceCard) — та же query, никаких отдельных расчётов.
        saldo: counterpartyCard?.available ? counterpartyCard : undefined,
      });
    } catch (e) {
      console.error("Ошибка экспорта в Excel:", e);
      notify("error", t("ErrorExportExcel"));
    }
  };

  // ── Рендер ───────────────────────────────────────────────────────────────────

  return (
    <RBACGuard isLoading={showDocLoading} error={isEdit ? error : null} canView={isEdit ? canPut : canPost} forbiddenText={t("ForbiddenText")}>
      <div className="h-full flex flex-col min-h-0">
        {/* ── Шапка страницы и шапка документа — всегда видимы, не скроллятся ── */}
        <div className="shrink-0">
          <Header
            docId={docId}
            isEdit={isEdit}
            header={header}
            docNumber={docNumber}
            isPosted={isPosted}
            setPostConfirm={handlePostClick}
            postMutation={postMutation}
            setUnpostConfirm={setUnpostConfirm}
            unpostMutation={unpostMutation}
            saveMutation={saveMutation}
            disableSave={disableSave}
            lastSavedAt={lastSavedAt}
            autosaveError={autosaveError}
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
            flex-initial (не flex-1!) — растягиваться до конца доступного места должна только
            когда строк действительно много и не помещаются; когда строк 1-2, блок должен сжаться
            до размера контента, а не растягиваться на весь экран (иначе сальдо контрагента ниже
            уезжает далеко вниз с пустым разрывом). flex-initial (grow:0, shrink:1, basis:auto) +
            min-h-0 даёт именно это: сидит по контенту, но может сжаться и заскроллить внутри себя,
            если места не хватает (см. flex-1 внутри самого ProductRow.tsx — оно тянется на всю
            высоту ЭТОГО контейнера, который теперь сам не тянется просто так). В печати то же самое
            через print:flex-none print:h-auto. */}
        <div className="flex-initial min-h-0 mt-3 print:mt-1 print:flex-none print:h-auto">
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
            isPurchase={header.document_type === "in"}
            filterByStock={["out", "move", "return_out"].includes(header.document_type)}
            onBack={() => headDocumentRef.current?.focusNote()}
            columns={columns}
            onColumnsChange={setAllColumns}
            warehouseId={header.warehouse}
          />
        </div>

        {/* ── Сальдо контрагента под таблицей товаров — как "footer": вне скроллируемой
            flex-1 области выше, поэтому не уезжает при скролле товаров. Видно и при
            печати (Ctrl+P) — та же вёрстка, без print:hidden. ── */}
        <div className="shrink-0 border-t-2 border-gray-300 dark:border-slate-600 print:border-black mt-2 pt-2 print:mt-1 print:pt-1">
          <CounterpartyBalanceCard data={counterpartyCard} isLoading={counterpartyCardLoading} enabled={counterpartyCardEnabled} />
        </div>

        {/* ── Печатная версия: "Авто" (водитель, если назначен) и кто провёл документ — под таблицей товаров ── */}
        {(() => {
          const driverName = participants[0]?.employee ? employees.find((e: any) => e.id === participants[0].employee)?.full_name : undefined;
          const postedByName = isPosted ? doc?.posted_by_name : undefined;
          if (!driverName && !postedByName) return null;
          return (
            <div className="hidden print:block text-xs pt-1 mt-1 border-t border-gray-300">
              {driverName && (
                <div>
                  <span className="font-semibold">{t("DriverLabel")}:</span> {driverName}
                </div>
              )}
              {postedByName && (
                <div>
                  <span className="font-semibold">{t("PostedByLabel")}:</span> {postedByName}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Печатная версия: слоган филиала — внизу счёта-фактуры, на экране скрыт ── */}
        {branchSlogan && <div className="hidden print:block print:text-3xl font-bold italic text-center mt-3 font-serif">{branchSlogan}</div>}
      </div>

      <ConfirmModal
        isOpen={postConfirm}
        type="info"
        variant="danger"
        title={t("PostDocument")}
        message={t("PostDocumentConfirm")}
        onClose={() => setPostConfirm(false)}
        onConfirm={() => postMutation.mutate()}
      />
      <ConfirmModal
        isOpen={unpostConfirm}
        type="info"
        variant="danger"
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
