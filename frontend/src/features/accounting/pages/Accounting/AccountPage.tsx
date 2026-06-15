// frontend/src/features/accounting/pages/admin/AccountPage.tsx
import { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Folder } from "lucide-react";

import { useSidebar } from "../../../../core/context/SidebarRightContext";
import { useNotify } from "../../../../core/context/NotificationContext";
import { accountApi } from "../../services/usersApi";
import { type Account as AccountInterface } from "../../../../core/types";
import { Modal } from "../../../../components/ui/Modal/Modal";
import { Button } from "../../../../components/ui/Button";
import { Input } from "../../../../components/ui/Input";
import { Table, type Column } from "../../../../components/ui/Table/Table";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";

interface AccountFormData {
  code: string;
  name: string;
  is_group: boolean;
  parent: number | null;
  account_type: string;
}

const EMPTY_FORM: AccountFormData = {
  code: "",
  name: "",
  is_group: false,
  parent: null,
  account_type: "AP",
};

const AccountPage = () => {
  const { setSidebarContent } = useSidebar();
  const notify = useNotify();
  const queryClient = useQueryClient();

  // Состояние
  const [searchQuery, setSearchQuery] = useState("");
  const [filterGroup, setFilterGroup] = useState<"all" | "group" | "account">("all");
  const [formModal, setFormModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountInterface | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AccountInterface | null>(null);
  const [formData, setFormData] = useState<AccountFormData>(EMPTY_FORM);

  const { canView, canPost, canPut, canDelete } = usePageAccess("account");

  // Плоский список для таблицы
  const {
    data: accounts = [],
    isLoading,
    error,
  } = useQuery<AccountInterface[], Error>({
    queryKey: ["accounts"],
    queryFn: accountApi.getAccounts,
    retry: false,
    enabled: canView,
    staleTime: 1000 * 60 * 5,
  });

  // Группы для select родителя
  const groupOptions = accounts.filter((a) => a.is_group);

  // ── Мутации ──────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    // mutationFn: (data: AccountFormData) => accountApi.saveAccounts(editingAccount?.id ?? null, data),
    mutationFn: (data: AccountFormData) => {
      if (!canPost) throw new Error("Нет прав на создание"); // Защита от случайного вызова
      return accountApi.saveAccounts(editingAccount?.id ?? null, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setFormModal(false);
      notify("success", editingAccount ? "Счёт обновлён" : "Счёт создан");
    },
    onError: (err: any) => {
      if (err._handled) return;
      const msg =
        Object.values(err.response?.data || {})
          .flat()
          .join(", ") || "Ошибка сохранения";
      notify("error", msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => {
      if (!canDelete) throw new Error("Нет прав на удаление");
      return accountApi.deleteAccount(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setDeleteModal(false);
      setDeleteTarget(null);
      notify("success", "Счёт удалён");
    },
    onError: (err: any) => {
      if (err._handled) return;
      const msg = err.response?.data?.detail || "Ошибка удаления";
      notify("error", msg);
    },
  });

  // ── Хелперы ──────────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditingAccount(null);
    setFormData(EMPTY_FORM);
    setFormModal(true);
  };

  const openEdit = (account: AccountInterface) => {
    setEditingAccount(account);
    setFormData({
      code: account.code,
      name: account.name,
      is_group: account.is_group,
      parent: account.parent,
      account_type: account.account_type ?? "AP",
    });
    setFormModal(true);
  };

  const openDelete = (account: AccountInterface) => {
    setDeleteTarget(account);
    setDeleteModal(true);
  };

  // ── Колонки таблицы ───────────────────────────────────────────────────────
  const columns: Column<AccountInterface>[] = [
    { header: "ID", accessor: "id", sortable: true, excelWidth: 5, excelAlign: "center" },
    {
      header: "Счет",
      excelWidth: 5,
      excelAlign: "center",
      accessor: "code",
      sortable: true,
      render: (account) => (
        <span className={`${account.is_group ? "font-bold text-amber-700 dark:text-amber-400" : ""} flex items-center gap-2`}>
          <span>{account.is_group && <Folder size={14} className="text-amber-500" />} </span>
          <span>{account.code}</span>
        </span>
      ),
    },
    {
      header: "Наименование",
      accessor: "name",
      sortable: true,
      excelWidth: 30,
    },
    {
      header: "Родитель",
      accessor: "parent_code",
      excelAlign: "center",
      sortable: true,
      excelWidth: 5,
      excelValue: (a) => a.parent_code || "-",
      render: (account) => <span className="text-gray-500 dark:text-gray-400 text-xs font-mono">{account.parent_code ?? "—"}</span>,
    },
    {
      header: "Вид",
      accessor: "account_type_display",
      excelAlign: "center",
      excelWidth: 5,
      sortable: true,
    },
    {
      header: "Тип",
      accessor: "is_group",
      sortable: true,
      sortValue: (a) => (a.is_group ? 1 : 0),
      excelWidth: 15,
      excelValue: (a) => (a.is_group ? "Родитель" : ""),
      render: (account) =>
        account.is_group ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
            <Folder size={11} /> Группа
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Счёт</span>
        ),
    },
    {
      header: "Действия",
      render: (account) => (
        <div className="flex gap-2">
          <Button
            disabled={!canPut}
            variant="1c"
            icon={<span>✏️</span>}
            className="md:h-6 md:w-8 md:!p-0"
            onClick={(e) => {
              e.stopPropagation();
              openEdit(account);
            }}
          />
          <Button
            disabled={!canDelete}
            variant="1c"
            icon={<span>🗑️</span>}
            className="md:h-6 md:w-8 md:!p-0"
            onClick={(e) => {
              e.stopPropagation();
              openDelete(account);
            }}
          />
        </div>
      ),
    },
  ];

  // ── Sidebar ───────────────────────────────────────────────────────────────
  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <div>
          <h4 className="font-bold text-indigo-300 mb-2">Действия</h4>
          <Button text="Добавить счёт" onClick={openCreate} className="w-full" icon={<Plus size={16} />} dark={true} disabled={!canPost} />
        </div>
        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2">Тип счёта</h4>
          <div className="flex flex-col gap-1">
            {(["all", "group", "account"] as const).map((f) => (
              <Button
                key={f}
                text={f === "all" ? "Все" : f === "group" ? "Только группы" : "Только счета"}
                variant="ghost"
                dark={true}
                isActive={filterGroup === f}
                className="w-full justify-start"
                icon={f === "group" ? <Folder size={14} /> : undefined}
                onClick={() => setFilterGroup(f)}
              />
            ))}
          </div>
        </div>
      </div>,
    );
  }, [setSidebarContent, filterGroup, canPost]);

  // Фильтрация и поиск
  const filteredAccounts = useMemo(() => {
    let result = accounts;

    // Фильтр по типу
    if (filterGroup === "group") result = result.filter((a) => a.is_group);
    if (filterGroup === "account") result = result.filter((a) => !a.is_group);

    // Фильтр по поиску
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((a) => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || (a.parent_code ?? "").toLowerCase().includes(q));
    }

    return result;
  }, [accounts, filterGroup, searchQuery]); // ← добавь searchQuery в deps

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText="У вас нет прав на просмотр счетов">
      <Table columns={columns} data={filteredAccounts} tableId="accounts" searchQuery={searchQuery} onSearchChange={setSearchQuery} onRowDoubleClick={(account) => openEdit(account)} />

      {/* ── Модалка: Создание / Редактирование ── */}
      <Modal isOpen={formModal} onClose={() => setFormModal(false)} title={editingAccount ? `Редактировать: ${editingAccount.code}` : "Новый счёт"} closeOnOutsideClick={false}>
        <div className="space-y-4">
          <Input label="Код счёта" placeholder="Например: 60.1" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} />
          <Input label="Наименование" placeholder="Расчёты с поставщиками" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Родительский счёт</label>
            <select
              value={formData.parent ?? ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  parent: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— Корневой счёт —</option>
              {groupOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.code} — {g.name}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_group}
              onChange={(e) => setFormData({ ...formData, is_group: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Это группа (нельзя делать проводки)
          </label>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Вид счёта</label>
            <select
              value={formData.account_type}
              onChange={(e) => setFormData({ ...formData, account_type: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="A">Активный</option>
              <option value="P">Пассивный</option>
              <option value="AP">Активно-Пассивный</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button text="Отмена" onClick={() => setFormModal(false)} />
            <Button text={saveMutation.isPending ? "Сохранение..." : "Сохранить"} variant="danger" onClick={() => saveMutation.mutate(formData)} />
          </div>
        </div>
      </Modal>

      {/* ── Модалка: Удаление ── */}
      <Modal isOpen={deleteModal} onClose={() => setDeleteModal(false)} size="sm" title="Удалить счёт?">
        <div className="mb-6 space-y-2">
          <p className="text-gray-700 dark:text-gray-300">Вы хотите удалить счёт:</p>
          <p className="font-bold text-gray-900 dark:text-gray-100">
            {deleteTarget?.code} — {deleteTarget?.name}
          </p>
          <p className="text-red-500 text-sm">Нельзя удалить счёт с субсчетами или проводками.</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button text="Отмена" onClick={() => setDeleteModal(false)} />
          <Button text={deleteMutation.isPending ? "Удаление..." : "Удалить"} variant="danger" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} />
        </div>
      </Modal>
    </RBACGuard>
  );
};

export default AccountPage;
