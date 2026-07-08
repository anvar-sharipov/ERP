// frontend/src/features/accounting/pages/Employees/AgentsPage.tsx
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { agentApi, employeeApi } from "../../services/employeeApi";
import { useNotify } from "../../../../core/context/NotificationContext";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";
import { useSidebar } from "../../../../core/context/SidebarRightContext";
import { Table, type Column } from "../../../../components/ui/Table/Table";
import { Button } from "../../../../components/ui/Button";
import { Input } from "../../../../components/ui/Input";
import { Modal } from "../../../../components/ui/Modal/Modal";
import { ConfirmModal } from "../../../../components/ui/Modal/ConfirmModal";
import { RBACGuard } from "../../../../components/ui/RBACGuard";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { HelpButton } from "../../../../components/ui/HelpButton";
import SearchableSelect, { type SelectOption } from "../../../../components/ui/SearchableSelect";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTableFilter } from "../../../../core/hooks/useTableFilter";
import { usePageHotkeys } from "../../../../core/hooks/usePageHotkeys";

interface Agent {
  id: number;
  employee: number;
  employee_name: string;
  district: string;
  is_active: boolean;
  display_name: string;
}

interface AgentForm {
  employee: number | null;
  district: string;
  is_active: boolean;
}

const EMPTY: AgentForm = {
  employee: null,
  district: "",
  is_active: true,
};

const AgentsPage = () => {
  const { t } = useTranslation();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { setSidebarContent } = useSidebar();
  const { canView, canPost, canPut, canDelete } = usePageAccess("agent");

  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [form, setForm] = useState<AgentForm>(EMPTY);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");

  const {
    data: agents = [],
    isLoading,
    error,
  } = useQuery<Agent[]>({
    queryKey: ["agents"],
    queryFn: () => agentApi.getAll(),
    enabled: canView,
    retry: false,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: () => employeeApi.getAll(),
    enabled: canView,
    retry: false,
  });
  const employeeOptions: SelectOption[] = (employees as any[]).map((e) => ({ id: e.id, label: e.full_name }));

  useEffect(() => {
    if (editing) {
      setForm({
        employee: editing.employee,
        district: editing.district ?? "",
        is_active: editing.is_active,
      });
    } else {
      setForm(EMPTY);
    }
  }, [editing]);

  const saveMutation = useMutation({
    mutationFn: (data: AgentForm) => agentApi.save(editing?.id ?? null, data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      notify("success", editing ? t("SuccessUpdated") : t("SuccessCreated"));
      setHighlightedId(res.data.id);
      setFormOpen(false);
      setEditing(null);
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", err.response?.data?.detail || t("ErrorSaving"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => agentApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      notify("success", t("SuccessDeleted"));
      setDeleteId(null);
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", err.response?.data?.detail || t("ErrorDeleting"));
    },
  });

  const handleBulkDelete = async (ids: (number | string)[]) => {
    await agentApi.bulkDelete(ids as number[]);
    queryClient.invalidateQueries({ queryKey: ["agents"] });
  };

  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <h4 className="font-bold text-indigo-300">{t("Actions")}</h4>
        <Button
          disabled={!canPost}
          text={t("AddAgent")}
          className="w-full"
          dark={true}
          icon={<Plus className="w-4 h-4" />}
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        />
        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2">{t("StatusFilter")}</h4>
          <div className="flex flex-col gap-1">
            {(["all", "active", "inactive"] as const).map((status) => (
              <Button
                key={status}
                variant="ghost"
                dark={true}
                isActive={activeFilter === status}
                className="w-full justify-start"
                text={status === "all" ? t("All") : status === "active" ? t("OnlyActive") : t("OnlyInactive")}
                onClick={() => setActiveFilter(status)}
              />
            ))}
          </div>
        </div>
      </div>,
    );
  }, [setSidebarContent, canPost, t, activeFilter]);

  const filtered = useTableFilter(agents, {
    search: searchQuery,
    searchFields: ["id", "employee_name", "district"],
    filterKey: activeFilter,
    filters: [
      (item) => {
        if (activeFilter === "active") return item.is_active;
        if (activeFilter === "inactive") return !item.is_active;
        return true;
      },
    ],
  });

  usePageHotkeys({
    canPost,
    onInsert: () => {
      setEditing(null);
      setForm(EMPTY);
      setFormOpen(true);
    },
  });

  const columns: Column<Agent>[] = [
    { header: t("ID"), accessor: "id", sortable: true, excelWidth: 6 },
    { header: t("Employee"), accessor: "employee_name", sortable: true, excelWidth: 30 },
    { header: t("District"), accessor: "district", sortable: true, excelWidth: 20, render: (item) => item.district || "—" },
    {
      header: t("Status"),
      accessor: "is_active",
      sortable: true,
      excelWidth: 10,
      render: (item) => <StatusBadge isActive={item.is_active} activeLabel={t("Active")} inactiveLabel={t("Inactive")} />,
    },
    {
      header: t("Actions"),
      isActionColumn: true,
      hideInPrint: true,
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

  const toDelete = agents.find((x) => x.id === deleteId);

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText={t("ForbiddenText")}>
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-sm md:text-lg font-bold text-gray-800 dark:text-gray-100">{t("Agents")}</h2>
        <HelpButton title={t("Agents")}>
          <p>
            <b>{t("Agents")}</b> — профили агентов, на которые ссылается поле «Агент» в карточке контрагента. Один
            сотрудник (см. вкладку «{t("Employees")}») может иметь несколько таких профилей — например, один и тот же
            человек обслуживает клиентов сразу в двух районах: тогда для него создаются два профиля с разными «Район»,
            но зарплата/% всегда считается по одному сотруднику, суммируя выручку со всех его профилей сразу.
          </p>
          <ul>
            <li>
              <b>Сотрудник</b> — обязателен, тот, кому в итоге идёт начисление.
            </li>
            <li>
              <b>Район</b> — необязательное уточнение (например, «Rayon»/«Dashoguz»); можно оставить пустым, если у
              агента нет деления по районам.
            </li>
            <li>Удаление профиля не затрагивает самого сотрудника — только отвязывает его клиентов от этого профиля.</li>
          </ul>
        </HelpButton>
      </div>

      <Table
        columns={columns}
        data={filtered}
        tableId="agents_list"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedRowId={highlightedId}
        onHighlightConsumed={() => setHighlightedId(null)}
        selectable
        onBulkDelete={handleBulkDelete}
        onRowDoubleClick={(item) => {
          setEditing(item);
          setFormOpen(true);
        }}
      />

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={editing ? t("Edit") : t("AddAgent")} closeOnOutsideClick={false}>
        <div className="space-y-4">
          <div>
            <label className="block mb-1 text-sm font-medium">{t("Employee")}</label>
            <SearchableSelect
              options={employeeOptions}
              value={form.employee}
              onChange={(id) => setForm((p) => ({ ...p, employee: id }))}
              placeholder={t("SelectEmployee")}
              clearable={false}
            />
          </div>

          <Input label={t("District")} value={form.district} onChange={(e) => setForm((p) => ({ ...p, district: e.target.value }))} />

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} />
            {t("IsActive")}
          </label>

          <div className="flex justify-end gap-2">
            <Button text={t("Cancel")} variant="secondary" onClick={() => setFormOpen(false)} />
            <Button
              disabled={!form.employee}
              text={saveMutation.isPending ? t("Saving") : editing ? t("Save") : t("Create")}
              onClick={() => saveMutation.mutate(form)}
            />
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={deleteModal}
        type="delete"
        title={`DELETE - ${t("Delete")}`}
        message={t("Delete", { name: toDelete?.display_name })}
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

export default AgentsPage;
