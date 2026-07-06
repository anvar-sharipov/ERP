import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Folder } from "lucide-react";

import { useSidebar } from "../../../../core/context/SidebarRightContext";
import { useNotify } from "../../../../core/context/NotificationContext";
import { accountApi } from "../../services/accountingApi";
import { type Account as AccountInterface } from "../../../../core/types";
import { Modal } from "../../../../components/ui/Modal/Modal";
import { Button } from "../../../../components/ui/Button";
import { Input } from "../../../../components/ui/Input";
import { Table, type Column } from "../../../../components/ui/Table/Table";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { useTranslation } from "react-i18next";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { useTableFilter } from "../../../../core/hooks/useTableFilter";
import { usePageHotkeys } from "../../../../core/hooks/usePageHotkeys";

interface AccountFormData {
  code: string;
  name: string;
  is_group: boolean;
  parent: number | null;
  account_type: string;
  is_active: boolean;
}

const EMPTY_FORM: AccountFormData = {
  code: "",
  name: "",
  is_group: false,
  parent: null,
  account_type: "AP",
  is_active: true,
};

const AccountPage = () => {
  const { t } = useTranslation();
  const { setSidebarContent } = useSidebar();
  const notify = useNotify();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterGroup, setFilterGroup] = useState<"all" | "group" | "account">("all");
  const [formModal, setFormModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountInterface | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AccountInterface | null>(null);
  const [formData, setFormData] = useState<AccountFormData>(EMPTY_FORM);
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [highlightedId, setHighlightedId] = useState<number | null>(null);

  const [selectedSubcontoType, setSelectedSubcontoType] = useState<number | null>(null);

  const { canView, canPost, canPut, canDelete } = usePageAccess("account");

  const { data: subcontoTypes = [] } = useQuery({
    queryKey: ["subconto-types"],
    queryFn: accountApi.getSubcontoTypes,
  });

  const addSubcontoMutation = useMutation({
    mutationFn: ({ subconto_type, order }: { subconto_type: number; order: number }) => accountApi.addSubconto(editingAccount!.id, { subconto_type, order }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      notify("success", "Субконто добавлено");
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || err.response?.data?.non_field_errors?.[0] || "Ошибка";
      notify("error", msg);
    },
  });

  const removeSubcontoMutation = useMutation({
    mutationFn: (subcontoId: number) => accountApi.removeSubconto(editingAccount!.id, subcontoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      notify("success", "Субконто удалено");
    },
  });

  const {
    data: accounts = [],
    isLoading,
    error,
  } = useQuery<AccountInterface[], Error>({
    queryKey: ["accounts"],
    queryFn: () => accountApi.getAccounts(),
    retry: false,
    enabled: canView,
    staleTime: 1000 * 60 * 5,
  });

  // console.log("accounts", accounts);

  const groupOptions = accounts.filter((a) => a.is_group);

  const saveMutation = useMutation({
    mutationFn: (data: AccountFormData) => {
      if (!canPost) throw new Error(t("NoCreateRights"));
      return accountApi.saveAccounts(editingAccount?.id ?? null, data);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setFormModal(false);
      notify("success", editingAccount ? t("AccountUpdated") : t("AccountCreated"));
      setHighlightedId(res.data.id);
    },
    onError: (err: any) => {
      if (err._handled) return;
      const msg =
        Object.values(err.response?.data || {})
          .flat()
          .join(", ") || t("SaveError");
      notify("error", msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => {
      if (!canDelete) throw new Error(t("NoDeleteRights"));
      return accountApi.deleteAccount(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setDeleteModal(false);
      setDeleteTarget(null);
      notify("success", t("AccountDeleted"));
    },
    onError: (err: any) => {
      if (err._handled) return;
      const msg = err.response?.data?.detail || t("DeleteError");
      notify("error", msg);
    },
  });

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
      is_active: account.is_active,
    });
    setFormModal(true);
  };

  // ✅ editingAccount — снимок, сделанный при открытии модалки; после add/removeSubconto
  // инвалидируется только запрос accounts, а не сам editingAccount — синхронизируем
  // его со свежими данными, чтобы список субконто в модалке обновлялся реактивно.
  useEffect(() => {
    if (editingAccount) {
      const fresh = accounts.find((a) => a.id === editingAccount.id);
      if (fresh) setEditingAccount(fresh);
    }
  }, [accounts]);

  const openDelete = (account: AccountInterface) => {
    setDeleteTarget(account);
    setDeleteModal(true);
  };

  usePageHotkeys({
    canPost,
    onInsert: () => {
      openCreate();
    },
  });

  const columns: Column<AccountInterface>[] = [
    { header: t("ID"), accessor: "id", sortable: true, excelWidth: 5, excelAlign: "center" },
    {
      header: t("Account"),
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
      header: t("Name"),
      accessor: "name",
      sortable: true,
      excelWidth: 30,
    },
    {
      header: t("Status"),
      excelWidth: 5,
      excelAlign: "center",
      accessor: "is_active",
      excelValue: (i) => (i.is_active ? "+" : ""),
      sortable: true,
      sortValue: (i) => (i.is_active ? 1 : 0),
      render: (i) => <StatusBadge isActive={i.is_active} activeLabel={t("Active")} inactiveLabel={t("Inactive")} />,
    },
    {
      header: t("Parent"),
      accessor: "parent_code",
      excelAlign: "center",
      sortable: true,
      excelWidth: 5,
      excelValue: (a) => a.parent_code || "-",
      render: (account) => <span className="text-gray-500 dark:text-gray-400 text-xs font-mono">{account.parent_code ?? "—"}</span>,
    },
    {
      header: t("Type"),
      accessor: "account_type_display",
      excelAlign: "center",
      excelWidth: 5,
      sortable: true,
    },
    {
      header: t("GroupType"),
      accessor: "is_group",
      sortable: true,
      sortValue: (a) => (a.is_group ? 1 : 0),
      excelWidth: 15,
      excelValue: (a) => (a.is_group ? t("Group") : ""),
      render: (account) =>
        account.is_group ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
            <Folder size={11} /> {t("Group")}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">{t("AccountLabel")}</span>
        ),
    },
    {
      header: t("Actions"),
      isActionColumn: true,
      render: (account) => (
        <div className="flex gap-2">
          <Button
            title={`F2 - ${t("Edit")}`}
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
            title={`DELETE - ${t("Delete")}`}
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

  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <div>
          <h4 className="font-bold text-indigo-300 mb-2">{t("ActionsSidebar")}</h4>
          <Button title={`Insert - ${t("AddAccount")}`} text={t("AddAccount")} onClick={openCreate} className="w-full" icon={<Plus size={16} />} dark={true} disabled={!canPost} />
        </div>
        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2">{t("HierarchyFilter")}</h4>
          <div className="flex flex-col gap-1">
            {(["all", "group", "account"] as const).map((f) => (
              <Button
                key={f}
                text={f === "all" ? t("All") : f === "group" ? t("OnlyGroups") : t("OnlyAccounts")}
                variant="ghost"
                dark={true}
                isActive={filterGroup === f} // Теперь React увидит обновление
                className="w-full justify-start"
                icon={f === "group" ? <Folder size={14} /> : undefined}
                onClick={() => setFilterGroup(f)}
              />
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2">{t("StatusFilter")}</h4>
          <div className="flex flex-col gap-1">
            {(["all", "active", "inactive"] as const).map((status) => (
              <Button
                key={status}
                onClick={() => setActiveFilter(status)}
                text={status === "all" ? t("AllAccounts") : status === "active" ? t("OnlyActive") : t("OnlyInactive")}
                variant="ghost"
                dark={true}
                isActive={activeFilter === status} // Теперь React увидит обновление
                className="w-full justify-start"
                icon={status !== "all" ? <span className={`w-2 h-2 rounded-full ${status === "active" ? "bg-green-500" : "bg-red-500"}`} /> : undefined}
              />
            ))}
          </div>
        </div>
      </div>,
    );
  }, [setSidebarContent, filterGroup, activeFilter, canPost, t]);

  // const filteredAccounts = useTableFilter(accounts, {
  //   search: searchQuery,
  //   searchFields: ["code", "name", "parent_code"],
  //   filters: [
  //     (a) => {
  //       if (filterGroup === "group") return a.is_group;
  //       if (filterGroup === "account") return !a.is_group;
  //       return true;
  //     },
  //     (a) => {
  //       if (activeFilter === "active") return a.is_active;
  //       if (activeFilter === "inactive") return !a.is_active;
  //       return true;
  //     },
  //   ],
  // });

  const filteredAccounts = useTableFilter(accounts, {
    search: searchQuery,
    searchFields: ["code", "name", "parent_code"],
    filterKey: `${filterGroup}:${activeFilter}`, // ← добавить
    filters: [
      (a) => {
        if (filterGroup === "group") return a.is_group;
        if (filterGroup === "account") return !a.is_group;
        return true;
      },
      (a) => {
        if (activeFilter === "active") return a.is_active;
        if (activeFilter === "inactive") return !a.is_active;
        return true;
      },
    ],
  });

  console.log("editingAccount", editingAccount);
  

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText={t("NoViewRights")}>
      <Table
        columns={columns}
        data={filteredAccounts}
        tableId="accounts"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRowDoubleClick={(account) => openEdit(account)}
        selectedRowId={highlightedId}
        onHighlightConsumed={() => setHighlightedId(null)}
      />

      <Modal isOpen={formModal} onClose={() => setFormModal(false)} title={editingAccount ? `${t("EditAccount")} ${editingAccount.code}` : t("NewAccount")} closeOnOutsideClick={false}>
        <div className="space-y-4">
          <Input label={t("AccountCode")} placeholder="60.1" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} />
          <Input label={t("AccountName")} placeholder="Расчёты с поставщиками" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("ParentAccount")}</label>
            <select
              value={formData.parent ?? ""}
              onChange={(e) => setFormData({ ...formData, parent: e.target.value ? Number(e.target.value) : null })}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">{t("RootAccount")}</option>
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
            {t("IsGroup")}
          </label>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("AccountKind")}</label>
            <select
              value={formData.account_type}
              onChange={(e) => setFormData({ ...formData, account_type: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="A">{t("Active")}</option>
              <option value="P">{t("Passive")}</option>
              <option value="AP">{t("ActivePassive")}</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer mb-4">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            {t("IsActive")}
          </label>

          {editingAccount && !formData.is_group && (
            <div className="border-t border-gray-200 dark:border-slate-600 pt-4">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Субконто (аналитика)</h4>

              {/* Текущие субконто */}
              {editingAccount.account_subcontos?.length === 0 ? (
                <p className="text-xs text-gray-400 mb-3">Субконто не назначены</p>
              ) : (
                <div className="space-y-1 mb-3">
                  {editingAccount.account_subcontos?.map((as) => (
                    <div key={as.id} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-slate-700/50 text-sm">
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-4">{as.order}.</span>
                        <span className="font-medium text-gray-700 dark:text-gray-200">{as.subconto_type_detail?.name}</span>
                        <span className="text-xs text-gray-400 font-mono">{as.subconto_type_detail?.slug}</span>
                      </span>
                      <Button variant="1c" icon={<span>🗑️</span>} className="md:h-6 md:w-8 md:!p-0" onClick={() => removeSubcontoMutation.mutate(as.id)} />
                    </div>
                  ))}
                </div>
              )}

              {/* Добавить субконто */}
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Вид субконто</label>
                  <select
                    value={selectedSubcontoType ?? ""}
                    onChange={(e) => setSelectedSubcontoType(e.target.value ? Number(e.target.value) : null)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">— выберите —</option>
                    {subcontoTypes
                      .filter((st: any) => !editingAccount.account_subcontos?.some((as) => as.subconto_type === st.id))
                      .map((st: any) => (
                        <option key={st.id} value={st.id}>
                          {st.name}
                        </option>
                      ))}
                  </select>
                </div>
                <Button
                  text="+ Добавить"
                  disabled={!selectedSubcontoType || addSubcontoMutation.isPending}
                  onClick={() => {
                    if (!selectedSubcontoType) return;
                    const nextOrder = (editingAccount.account_subcontos?.length ?? 0) + 1;
                    addSubcontoMutation.mutate({
                      subconto_type: selectedSubcontoType,
                      order: nextOrder,
                    });
                    setSelectedSubcontoType(null);
                  }}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button text={t("Cancel")} variant="secondary" onClick={() => setFormModal(false)} />
            <Button text={saveMutation.isPending ? t("Saving") : t("Save")} onClick={() => saveMutation.mutate(formData)} />
          </div>
        </div>
      </Modal>

      <Modal isOpen={deleteModal} onClose={() => setDeleteModal(false)} size="sm" title={t("DeleteAccountQuestion")}>
        <div className="mb-6 space-y-2">
          <p className="text-gray-700 dark:text-gray-300">{t("DeleteConfirmation")}</p>
          <p className="font-bold text-gray-900 dark:text-gray-100">
            {deleteTarget?.code} — {deleteTarget?.name}
          </p>
          <p className="text-red-500 text-sm">{t("DeleteWarning")}</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button text={t("Cancel")} variant="secondary" onClick={() => setDeleteModal(false)} />
          <Button text={deleteMutation.isPending ? t("Deleting") : t("Delete")} variant="danger" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} />
        </div>
      </Modal>
    </RBACGuard>
  );
};

export default AccountPage;
