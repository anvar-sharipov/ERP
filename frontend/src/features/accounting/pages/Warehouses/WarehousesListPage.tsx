// frontend/src/features/accounting/pages/Warehouses/WarehousesListPage.tsx
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { warehouseApi } from "../../services/productApi";
import { useNotify } from "../../../../core/context/NotificationContext";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { useSidebar } from "../../../../core/context/SidebarRightContext";
import { Table, type Column } from "../../../../components/ui/Table/Table";
import { Button } from "../../../../components/ui/Button";
import { Input } from "../../../../components/ui/Input";
import { TextArea } from "../../../../components/ui/TextArea";
import { Modal } from "../../../../components/ui/Modal/Modal";
import { ConfirmModal } from "../../../../components/ui/Modal/ConfirmModal";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import { HelpButton } from "../../../../components/ui/HelpButton";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { branchApi } from "../../services/branchApi";
import { accountApi } from "../../services/accountingApi";
import { usePageHotkeys } from "../../../../core/hooks/usePageHotkeys";

interface WarehouseForm {
  name: string;
  branch: number | null;
  address: string;
  is_active: boolean;
  is_main: boolean;
  // ✅ Счета для автогенерации проводки при проведении "Расхода"/"Прихода" с этого
  // склада — заполняются пользователем вручную, ничего не подставляется по умолчанию.
  receivable_account: number | null;
  revenue_account: number | null;
  cogs_account: number | null;
  inventory_account: number | null;
  payable_account: number | null;
  // ✅ Необязательный — без него скидка просто netted в total, как раньше.
  discount_account: number | null;
  // ✅ Альтернативная схема проводки "Расхода" — заполняются ВМЕСТЕ (оба или ни одного).
  // Если заполнены — inventory_account списывается по полной цене продажи (а не
  // revenue_account), и по каждой строке пишется отдельная нога Дт profit_account/
  // Кт fund_account на прибыль строки, вместо Дт cogs_account/Кт inventory_account
  // на себестоимость. См. Document._generate_out_posting.
  profit_account: number | null;
  fund_account: number | null;
  // ✅ Override-счета для контрагентов-поставщиков (Counterparty.type === "supplier") —
  // если заполнены, берутся вместо обычных receivable_account/payable_account/profit_account,
  // когда контрагент документа — поставщик. См. Document._resolve_role_account.
  receivable_account_supplier: number | null;
  payable_account_supplier: number | null;
  profit_account_supplier: number | null;
}

const EMPTY: WarehouseForm = {
  name: "",
  branch: null,
  address: "",
  is_active: true,
  is_main: false,
  receivable_account: null,
  revenue_account: null,
  cogs_account: null,
  inventory_account: null,
  payable_account: null,
  discount_account: null,
  profit_account: null,
  fund_account: null,
  receivable_account_supplier: null,
  payable_account_supplier: null,
  profit_account_supplier: null,
};

const WarehousesListPage = () => {
  const { t } = useTranslation();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { setSidebarContent } = useSidebar();
  const { canView, canPost, canPut, canDelete } = usePageAccess("warehouse");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<WarehouseForm>(EMPTY);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const {
    data: warehouses = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["warehouses"],
    queryFn: warehouseApi.getAll,
    enabled: canView,
    retry: false,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ["branches"],
    queryFn: branchApi.getBranches,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => accountApi.getAccounts(),
  });
  // ✅ Проводки нельзя делать по счёту-группе — в селектах показываем только листовые счета.
  const postableAccounts = (accounts as any[]).filter((a) => !a.is_group);

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        branch: editing.branch ?? null,
        address: editing.address ?? "",
        is_active: editing.is_active,
        is_main: editing.is_main,
        receivable_account: editing.receivable_account ?? null,
        revenue_account: editing.revenue_account ?? null,
        cogs_account: editing.cogs_account ?? null,
        inventory_account: editing.inventory_account ?? null,
        payable_account: editing.payable_account ?? null,
        discount_account: editing.discount_account ?? null,
        profit_account: editing.profit_account ?? null,
        fund_account: editing.fund_account ?? null,
        receivable_account_supplier: editing.receivable_account_supplier ?? null,
        payable_account_supplier: editing.payable_account_supplier ?? null,
        profit_account_supplier: editing.profit_account_supplier ?? null,
      });
    } else {
      setForm(EMPTY);
    }
  }, [editing]);

  const saveMutation = useMutation({
    mutationFn: (data: WarehouseForm) => warehouseApi.save(editing?.id ?? null, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      notify("success", editing ? t("SuccessUpdated") : t("SuccessCreated"));
      setFormOpen(false);
      setEditing(null);
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", err.response?.data?.detail || t("ErrorSaving"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => warehouseApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      notify("success", t("SuccessDeleted"));
      setDeleteId(null);
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", t("ErrorDeleting"));
    },
  });

  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <h4 className="font-bold text-indigo-300 mb-2">{t("Actions")}</h4>
        <Button
          disabled={!canPost}
          text={t("Add")}
          className="w-full"
          dark={true}
          icon={<Plus className="w-4 h-4" />}
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        />
      </div>,
    );
  }, [setSidebarContent, canPost, t]);

  usePageHotkeys({
    canPost,
    onInsert: () => {
      setEditing(null);
      setForm(EMPTY);
      setFormOpen(true);
    },
  });

  const columns: Column<any>[] = [
    { header: t("ID"), accessor: "id", sortable: true, excelWidth: 5 },
    {
      header: t("Name"),
      sortable: true,
      excelWidth: 25,
      render: (item) => (
        <span className="flex items-center gap-2">
          {item.is_main && <span className="text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 px-1.5 py-0.5 rounded font-medium">{t("Main")}</span>}
          {item.name}
        </span>
      ),
      sortValue: (item) => item.name,
      excelValue: (item) => item.name,
    },
    {
      header: t("Branch"),
      sortable: true,
      excelWidth: 20,
      render: (item) => <span className="text-gray-500 text-sm">{item.branch_name ?? "—"}</span>,
      sortValue: (item) => item.branch_name ?? "",
      excelValue: (item) => item.branch_name ?? "—",
    },
    { header: t("Address"), accessor: "address", sortable: true, excelWidth: 25 },
    {
      header: t("Status"),
      accessor: "is_active",
      sortable: true,
      excelWidth: 8,
      sortValue: (item) => (item.is_active ? 1 : 0),
      excelValue: (item) => (item.is_active ? "+" : ""),
      render: (item) => <StatusBadge isActive={item.is_active} activeLabel={t("Active")} inactiveLabel={t("Inactive")} />,
    },
    {
      header: t("Actions"),
      hideInPrint: true,
      isActionColumn: true,
      render: (item) => (
        <div className="flex gap-2">
          <Button
            disabled={!canPut}
            variant="1c"
            icon={<span>✏️</span>}
            className="md:h-6 md:w-8 md:!p-0"
            onClick={(e) => {
              e.stopPropagation();
              setEditing(item);
              setFormOpen(true);
            }}
          />
          <Button
            disabled={!canDelete}
            variant="1c"
            icon={<span>🗑️</span>}
            className="md:h-6 md:w-8 md:!p-0"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteId(item.id);
              setDeleteModal(true);
            }}
          />
        </div>
      ),
    },
  ];

  const toDelete = (warehouses as any[]).find((w) => w.id === deleteId);

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText={t("ForbiddenText")}>
      <Table
        columns={columns}
        data={warehouses}
        tableId="warehouses_list"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRowDoubleClick={(item) => {
          setEditing(item);
          setFormOpen(true);
        }}
      />

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={editing ? t("Edit") : t("Add")} closeOnOutsideClick={false}>
        <div className="space-y-4">
          <Input label={t("Name")} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("Branch")} <span className="text-red-500">*</span>
            </label>
            <select
              value={form.branch ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, branch: e.target.value ? Number(e.target.value) : null }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="" disabled>
                {t("SelectBranch")}
              </option>
              {(branches as any[]).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <TextArea label={t("Address")} rows={2} value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />

          {/* ✅ Счета для автогенерации проводки "Расхода"/"Прихода" с этого склада —
              заполняются вручную, ничего не подставляется автоматически (см. правило в CLAUDE.md). */}
          <div className="border-t border-gray-200 dark:border-slate-700 pt-3 space-y-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">{t("PostingAccountsLabel")}</p>
            {(
              [
                {
                  key: "receivable_account",
                  label: t("ReceivableAccountLabel"),
                  help: (
                    <>
                      <p>
                        Это счёт <b>актива</b> (обычно <b>62.1</b>) — отражает, сколько денег тебе должен покупатель за уже отгруженный, но
                        ещё не оплаченный товар.
                      </p>
                      <p>
                        При каждой продаже с этого склада система пишет: <b>Дт 62.1 (долг покупателя) — Кт 90.1 (выручка)</b>, на всю сумму
                        документа.
                      </p>
                      <p>
                        Если на счёте настроено субконто «Контрагент» — в проводке автоматически проставится конкретный покупатель из
                        документа, чтобы потом можно было посмотреть, кто именно сколько должен.
                      </p>
                      <p>
                        <b>Один счёт на несколько складов?</b> Да — если склады в одной валютной группе, им можно указать один и тот же счёт.
                        Например: все склады, торгующие в USD (Sklad1, Sklad2, Sklad3…) — ставим счёт <b>60</b>. Все склады, торгующие в TMT
                        (Sklad4, Sklad5…) — ставим счёт <b>70</b>. Так доллары и манаты не смешиваются в ОСВ, а заводить отдельный счёт под
                        каждый склад не нужно.
                      </p>
                      <p>
                        <b>Пример:</b>
                        <br />• Sklad1 (USD) → 60
                        <br />• Sklad2 (USD) → 60
                        <br />• Sklad3 (TMT) → 70
                        <br />
                        Клиент купил и на Sklad1, и на Sklad3 — его долг за USD-покупку попадёт в 60, а долг за TMT-покупку — в 70. Общая
                        сумма долга клиента (в разрезе каждой валюты) видна по обоим счетам, каждая — в своей валюте, без смешивания.
                      </p>
                      <p>
                        <b>А как увидеть баланс клиента именно по конкретному складу</b> (например, «сколько именно Sklad1 должны клиенту»),
                        если счёт 60 общий на несколько USD-складов? Для этого отдельный счёт заводить не нужно — у каждой проводки уже
                        записан склад, с которого она возникла (поле «Склад» в журнале проводок). Отчёт по балансу клиента можно отфильтровать
                        одновременно по счёту (60) <b>и</b> по складу (Sklad1) — суммы всё равно разложатся по складам корректно.
                      </p>
                      <p>
                        <b>А доступ кассира только к своему складу?</b> Это отдельный механизм — «доступ по scope» (назначается
                        администратором пользователю). Кассиру Sklad1 можно ограничить видимость так, что он вообще не увидит проводки/данные
                        других складов — даже если все они пишутся на один и тот же счёт 60. Директору, у которого таких ограничений нет,
                        доступны все склады сразу, и в отчётах он может как смотреть общую картину, так и фильтровать по конкретному складу
                        или магазину.
                      </p>
                    </>
                  ),
                },
                {
                  key: "revenue_account",
                  label: t("RevenueAccountLabel"),
                  help: (
                    <>
                      <p>
                        Это счёт <b>пассива</b> (обычно <b>90.1</b>) — отражает выручку: сумму, на которую был продан товар (цену продажи, а
                        не себестоимость).
                      </p>
                      <p>
                        При каждой продаже с этого склада система пишет: <b>Дт 62.1/60/70 (долг покупателя) — Кт 90.1 (выручка)</b>, на всю
                        сумму документа — ту же сумму, что и в «Счёте расчётов с покупателем».
                      </p>
                      <p>
                        Вместе со «Счётом себестоимости продаж» (90.2) это даёт прибыль: <b>Выручка − Себестоимость = Прибыль</b>.
                      </p>
                      <p>
                        <b>Пример:</b> продали товар со склада Sklad1 (USD) на сумму <b>$500</b>. Система пишет одну пару строк на весь
                        документ:
                        <br />• Дт 60 (клиент должен) — <b>500</b>
                        <br />• Кт 90.1 (выручка) — <b>500</b>
                        <br />
                        Отдельно, по каждой позиции документа, — проводка по себестоимости (например на 300):
                        <br />• Дт 90.2 (себестоимость) — 300
                        <br />• Кт 40.1 (товар) — 300
                        <br />
                        Прибыль по этой продаже: 90.1 − 90.2 = 500 − 300 = <b>$200</b>.
                      </p>
                      <p>
                        <b>Один счёт на несколько складов?</b> Да, по тому же правилу, что и «Счёт расчётов с покупателем» — общий счёт можно
                        указать всем складам одной валютной группы: все USD-склады → <b>90.1</b>, все TMT-склады → отдельный счёт (например{" "}
                        <b>90.1.2</b>, родитель — сам 90.1, переведённый в группу), чтобы выручка в разных валютах не смешивалась в ОСВ.
                      </p>
                      <p>
                        <b>А выручка отдельно по каждому складу?</b> Отдельный счёт для этого не нужен — у каждой проводки уже есть привязка к
                        складу (поле «Склад» в журнале операций), так что отчёт можно отфильтровать по конкретному складу поверх общего счёта
                        90.1, даже если несколько складов пишут в один и тот же счёт.
                      </p>
                      <p>
                        <b>Субконто:</b> если на счёте 90.1 настроено субконто «Контрагент» (или «Контрагент-клиент», отфильтрованный вид) — в
                        проводку автоматически подставится покупатель из документа, и потом можно смотреть выручку в разрезе конкретного
                        клиента.
                      </p>
                    </>
                  ),
                },
                {
                  key: "cogs_account",
                  label: t("CogsAccountLabel"),
                  help: (
                    <>
                      <p>
                        Это счёт <b>расхода</b> (обычно <b>90.2</b>) — отражает, сколько реально стоил проданный товар (в отличие от «Счёта
                        учёта товаров», который отражает физический остаток на складе).
                      </p>
                      <p>
                        При каждой продаже с этого склада система пишет: <b>Дт 90.2 (себестоимость) — Кт 40.1/41.1 (товар)</b>, на сумму{" "}
                        <code>себестоимость × количество</code>.
                      </p>
                      <p>
                        Вместе со «Счётом выручки» это даёт прибыль по формуле: <b>Выручка − Себестоимость = Прибыль</b>.
                      </p>
                      <p>
                        <b>Можно ли использовать один и тот же счёт для нескольких складов?</b> Да — если склады в одной и той же валютной
                        группе (например Sklad1 USD и Sklad2 USD), им можно указать один и тот же счёт «90.2» — суммы корректно сложатся.
                        Отдельный счёт нужен только для склада в <b>другой</b> валюте (например TMT), чтобы его суммы не смешивались с USD в
                        отчётах (ОСВ).
                      </p>
                      <p>
                        <b>Как завести отдельные счета по валютам (например 90.2.1 для USD, 90.2.2 для TMT):</b> родителем для них должен быть
                        сам <b>90.2</b> (а не 90 напрямую) — так же, как уже устроено в плане счетов (например <code>41</code> →{" "}
                        <code>41.1</code>/<code>41.2</code>). При этом сам <b>90.2 нужно перевести в группу</b> («Это группа» = да) — иначе
                        можно будет случайно провести напрямую в 90.2 вместо конкретного валютного субсчёта, и разделение потеряет смысл.
                        После этого проводки идут только в 90.2.1/90.2.2, а 90.2 в отчётах просто суммирует оба.
                      </p>
                    </>
                  ),
                },
                {
                  key: "inventory_account",
                  label: t("InventoryAccountLabel"),
                  help: (
                    <>
                      <p>
                        1. Сначала убедись, что нужный счёт (например <b>40.1</b>) уже создан в плане счетов (раздел «Счета») — как обычный
                        счёт, <b>не группа</b>, с родителем-группой (например <b>40 — СкладUSD</b>).
                      </p>
                      <p>
                        2. Открой список складов, найди/отредактируй нужный склад (например «Sklad1 USD») — двойной клик по строке или кнопка ✏️.
                      </p>
                      <p>
                        3. В поле <b>«Счёт учёта товаров»</b> выбери этот счёт — например <b>40.1 — СкладUSD1</b>. Сохрани.
                      </p>
                      <p>
                        После этого при проведении «Расхода» с этого склада списание товара пойдёт именно по этому счёту — ничего больше
                        настраивать не нужно. Тот же счёт используется и в «Приходе» — там он, наоборот, дебетуется (товар приходит).
                      </p>
                    </>
                  ),
                },
                {
                  key: "payable_account",
                  label: t("PayableAccountLabel"),
                  help: (
                    <>
                      <p>
                        Это счёт <b>пассива</b> (обычно <b>60</b>) — отражает, сколько денег ты должен поставщику за уже полученный, но ещё не
                        оплаченный товар. Аналог «Счёта расчётов с покупателем», только наоборот — не тебе должны, а ты должен.
                      </p>
                      <p>
                        При проведении «Прихода» с этого склада система пишет по каждой позиции документа: <b>Дт 40.1/41.1 (товар пришёл) — Кт
                        60 (долг перед поставщиком)</b>, на сумму <code>цена строки × количество</code> — то же самое значение, которое
                        становится новой себестоимостью товара.
                      </p>
                      <p>
                        В отличие от «Расхода», здесь нет ни выручки, ни себестоимости продаж — просто товар встаёт на баланс, и растёт долг
                        перед поставщиком. Проводка идёт по каждой позиции отдельно (а не одной строкой на весь документ), потому что «Счёт
                        учёта товаров» обычно требует субконто «Номенклатура», а в документе может быть несколько разных товаров.
                      </p>
                      <p>
                        <b>Пример:</b> пришёл товар на склад Sklad1 (USD) — 2 шт. по 80 = <b>$160</b>. Система пишет:
                        <br />• Дт 40.1 (товар) — <b>160</b>, субконто: Номенклатура (этот товар)
                        <br />• Кт 60 (долг поставщику) — <b>160</b>, субконто: Контрагент (этот поставщик), если настроено
                      </p>
                      <p>
                        <b>Один счёт на несколько складов?</b> Да, по тому же правилу — общий счёт можно указать всем складам одной валютной
                        группы (все USD-склады → 60, все TMT-склады → отдельный счёт, например 70). Если нужно видеть долг по конкретному
                        складу отдельно — отдельный счёт не нужен, отчёт фильтруется по полю «Склад» в проводке, как и с остальными счетами.
                      </p>
                      <p>
                        <b>Оплата поставщику</b> (когда реально заплатил) — это отдельная, ручная проводка (Дт 60 — Кт 50/51), система её не
                        создаёт автоматически, так же как и с оплатой от покупателя на «Счёте расчётов с покупателем».
                      </p>
                    </>
                  ),
                },
                {
                  key: "discount_account",
                  label: t("DiscountAccountLabel"),
                  help: (
                    <>
                      <p>
                        <b>Необязательное</b> поле. Если не заполнено — скидка просто уменьшает сумму, которая проводится в «Счёт расчётов с
                        покупателем»/«Счёт выручки» (как было раньше), и отдельной строкой в проводке не видна.
                      </p>
                      <p>
                        Если заполнить — «Расход» (и «Возврат от покупателя») начинают проводиться <b>по полной цене</b> (до скидки), а сама
                        скидка списывается отдельной строкой на этот счёт — контр-счёт выручки. Так в ОСВ видно отдельно: сколько продали по
                        прайсу, сколько скидок дали, и сколько реально осталось выручки.
                      </p>
                      <p>
                        <b>Пример:</b> продали товар на $200, скидка 10% ($20), клиент платит $180. Без этого счёта проводка была бы: Дт62=180 /
                        Кт90.1=180. С этим счётом (например <b>90.1.9 — Предоставленные скидки</b>):
                        <br />• Дт 62 (клиент должен) — <b>200</b>
                        <br />• Кт 90.1 (выручка) — <b>200</b>
                        <br />• Дт 90.1.9 (скидка) — <b>20</b>
                        <br />• Кт 62 (уменьшаем долг клиента на скидку) — <b>20</b>
                        <br />
                        Итог по клиенту: 200 − 20 = <b>180</b> — то же самое, что и без этого счёта, просто скидка теперь видна отдельно.
                      </p>
                      <p>
                        <b>Один счёт на несколько складов?</b> Да, по тому же правилу — общий счёт для всех складов одной валютной группы,
                        отдельный — для другой.
                      </p>
                    </>
                  ),
                },
                {
                  key: "profit_account",
                  label: t("ProfitAccountLabel"),
                  help: (
                    <>
                      <p>
                        <b>Необязательное поле, часть альтернативной схемы учёта.</b> Заполняется ВМЕСТЕ со «Счётом фонда прибыли» — если хотя
                        бы одно из двух пусто, используется обычная схема (Счёт выручки + Счёт себестоимости продаж).
                      </p>
                      <p>
                        Если оба поля заполнены — при продаже «Счёт учёта товаров» списывается сразу по <b>полной цене продажи</b> (а не по
                        себестоимости), а «Счёт выручки»/«Счёт себестоимости продаж» в проводке вообще не участвуют. Отдельной строкой по
                        каждой позиции документа пишется только прибыль: <b>Дт «Счёт прибыли» — Кт «Счёт фонда прибыли»</b>, на сумму{" "}
                        <code>(цена продажи − себестоимость) × количество</code>.
                      </p>
                      <p>
                        Эта схема — для складов, у которых учёт исторически ведётся так (перенос данных из другой системы), а не по
                        классической связке выручка/себестоимость. Для новых складов обычно не нужна — оставьте оба поля пустыми.
                      </p>
                    </>
                  ),
                },
                {
                  key: "fund_account",
                  label: t("FundAccountLabel"),
                  help: (
                    <>
                      <p>
                        <b>Необязательное поле, часть альтернативной схемы учёта</b> — см. «Счёт прибыли». Заполняется вместе с ним, оба поля
                        сразу.
                      </p>
                      <p>
                        Кредитуется на ту же сумму прибыли, что дебетуется на «Счёт прибыли» — это счёт, куда фактически «оседает» заработанная
                        прибыль (например, фонд/капитал), отдельно от товарооборота на «Счёте учёта товаров».
                      </p>
                    </>
                  ),
                },
                {
                  key: "receivable_account_supplier",
                  label: t("ReceivableAccountSupplierLabel"),
                  help: (
                    <>
                      <p>
                        <b>Необязательное override-поле.</b> Если контрагент документа — «Поставщик» (Counterparty.type = supplier), при
                        проведении «Расхода» вместо обычного «Счёта расчётов с покупателем» используется ЭТОТ счёт. Если не заполнено — для
                        поставщиков используется обычный счёт, как и для остальных.
                      </p>
                      <p>
                        Нужно, если у вас часть контрагентов заведены как «Поставщики», но с ними тоже бывают операции «Расхода» (например,
                        возврат/списание товара им), и вести расчёты с ними нужно по отдельному счёту, а не смешивать с обычными покупателями.
                      </p>
                    </>
                  ),
                },
                {
                  key: "payable_account_supplier",
                  label: t("PayableAccountSupplierLabel"),
                  help: (
                    <>
                      <p>
                        <b>Необязательное override-поле.</b> Если контрагент документа — «Поставщик», при проведении «Прихода» вместо обычного
                        «Счёта расчётов с поставщиком» используется ЭТОТ счёт.
                      </p>
                      <p>
                        Полезно, если часть поставщиков на самом деле особые (например, инвесторы/учредители бизнеса) и с ними расчёты ведутся
                        отдельно от обычных товарных поставщиков.
                      </p>
                    </>
                  ),
                },
                {
                  key: "profit_account_supplier",
                  label: t("ProfitAccountSupplierLabel"),
                  help: (
                    <>
                      <p>
                        <b>Необязательное override-поле, только для альтернативной схемы</b> (см. «Счёт прибыли» выше). Если контрагент
                        документа — «Поставщик», прибыль по строке пишется на ЭТОТ счёт вместо обычного «Счёта прибыли».
                      </p>
                    </>
                  ),
                },
              ] as const
            ).map(({ key, label, help }) => (
              <div key={key}>
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {label}
                  {help && <HelpButton title={label}>{help}</HelpButton>}
                </label>
                <select
                  value={form[key] ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">{t("NotSet")}</option>
                  {postableAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_main}
              onChange={(e) => setForm((p) => ({ ...p, is_main: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300 text-yellow-500 focus:ring-yellow-400"
            />
            {t("MainWarehouse")}
          </label>

          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            {t("IsActive")}
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button text={t("Cancel")} variant="secondary" onClick={() => setFormOpen(false)} />
            {/* <Button text={saveMutation.isPending ? t("Saving") : editing ? t("Save") : t("Create")} onClick={() => saveMutation.mutate(form)} variant="danger" /> */}
            <Button
              text={saveMutation.isPending ? t("Saving") : editing ? t("Save") : t("Create")}
              onClick={() => {
                if (!form.branch) {
                  notify("error", t("BranchRequired"));
                  return;
                }
                saveMutation.mutate(form);
              }}
            />
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={deleteModal}
        type="delete"
        title={`DELETE - ${t("Delete")}`}
        message={t("DeleteWarehouseMessage", { name: toDelete?.name })}
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

export default WarehousesListPage;
