// frontend/src/features/accounting/pages/Employees/EmployeesPage.tsx

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { employeeApi, positionApi } from "../../services/employeeApi";
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
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTableFilter } from "../../../../core/hooks/useTableFilter";
import { usePageHotkeys } from "../../../../core/hooks/usePageHotkeys";


interface Employee {
  id: number;
  full_name: string;
  position: number | null;
  position_name?: string;
  phone: string;
  note: string;
  is_active: boolean;
}

interface Position {
  id: number;
  name: string;
}

interface EmployeeForm {
  full_name: string;
  position: number | null;
  phone: string;
  note: string;
  is_active: boolean;
}

const EMPTY: EmployeeForm = {
  full_name: "",
  position: null,
  phone: "",
  note: "",
  is_active: true,
};

const EmployeesPage = () => {
  const { t } = useTranslation();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { setSidebarContent } = useSidebar();
  const { canView, canPost, canPut, canDelete } = usePageAccess("employee");

  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeForm>(EMPTY);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");


  const [positionFilter, setPositionFilter] = useState<number | "all">("all");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");

  const {
    data: employees = [],
    isLoading,
    error,
  } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: employeeApi.getAll,
    enabled: canView,
    retry: false,
  });

  const { data: positions = [] } = useQuery<Position[]>({
    queryKey: ["positions"],
    queryFn: positionApi.getAll,
  });

  useEffect(() => {
    if (editing) {
      setForm({
        full_name: editing.full_name,
        position: editing.position,
        phone: editing.phone,
        note: editing.note,
        is_active: editing.is_active,
      });
    } else {
      setForm(EMPTY);
    }
  }, [editing]);

  const saveMutation = useMutation({
    mutationFn: (data: EmployeeForm) => employeeApi.save(editing?.id ?? null, data),

    onSuccess: (res) => {
      queryClient.invalidateQueries({
        queryKey: ["employees"],
      });

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
    mutationFn: (id: number) => employeeApi.delete(id),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["employees"],
      });

      notify("success", t("SuccessDeleted"));

      setDeleteId(null);
    },
  });

  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <h4 className="font-bold text-indigo-300">{t("Actions")}</h4>

        <Button
          disabled={!canPost}
          text={t("AddEmployee")}
          className="w-full"
          dark
          icon={<Plus className="w-4 h-4" />}
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        />

        {/* Фильтр по должности */}
        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2">{t("Position")}</h4>

          <div className="flex flex-col gap-1">
            <Button variant="ghost" dark isActive={positionFilter === "all"} text={t("All")} className="w-full justify-start" onClick={() => setPositionFilter("all")} />

            {positions.map((p) => (
              <Button key={p.id} variant="ghost" dark isActive={positionFilter === p.id} text={p.name} className="w-full justify-start" onClick={() => setPositionFilter(p.id)} />
            ))}
          </div>
        </div>

        {/* Фильтр по статусу */}
        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2">{t("StatusFilter")}</h4>

          <div className="flex flex-col gap-1">
            {(["all", "active", "inactive"] as const).map((status) => (
              <Button
                key={status}
                variant="ghost"
                dark
                isActive={activeFilter === status}
                className="w-full justify-start"
                text={status === "all" ? t("AllEmployees") : status === "active" ? t("OnlyActive") : t("OnlyInactive")}
                icon={status !== "all" ? <span className={`w-2 h-2 rounded-full ${status === "active" ? "bg-green-500" : "bg-red-500"}`} /> : undefined}
                onClick={() => setActiveFilter(status)}
              />
            ))}
          </div>
        </div>
      </div>,
    );
  }, [setSidebarContent, canPost, t, positions, positionFilter, activeFilter]);

  const filtered = useTableFilter(employees, {
    search: searchQuery,
    searchFields: ["id", "full_name", "phone", "position_name"],
    filterKey: `${positionFilter}-${activeFilter}`,
    filters: [
      (item) => {
        if (positionFilter === "all") return true;
        return item.position === positionFilter;
      },
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

  const columns: Column<Employee>[] = [
    {
      header: t("ID"),
      accessor: "id",
      sortable: true,
    },
    {
      header: t("FullName"),
      accessor: "full_name",
      sortable: true,
    },
    {
      header: t("Position"),
      accessor: "position_name",
      sortable: true,
    },
    {
      header: t("Phone"),
      accessor: "phone",
      sortable: true,
    },
    {
      header: t("Status"),
      accessor: "is_active",
      render: (item) => <StatusBadge isActive={item.is_active} activeLabel={t("Active")} inactiveLabel={t("Inactive")} />,
    },
    {
      header: t("Actions"),
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

  const toDelete = employees.find((x) => x.id === deleteId);

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText={t("ForbiddenText")}>
      <Table
        columns={columns}
        data={filtered}
        tableId="employees_list"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedRowId={highlightedId}
        onHighlightConsumed={() => setHighlightedId(null)}
        onRowDoubleClick={(item) => {
          setEditing(item);
          setFormOpen(true);
        }}
      />

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={editing ? t("Edit") : t("AddEmployee")} closeOnOutsideClick={false}>
        <div className="space-y-4">
          <Input
            label={t("FullName")}
            value={form.full_name}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                full_name: e.target.value,
              }))
            }
          />

          <div>
            <label className="block mb-1 text-sm font-medium">{t("Position")}</label>

            <select
              className="w-full border rounded p-2"
              value={form.position ?? ""}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  position: e.target.value ? Number(e.target.value) : null,
                }))
              }
            >
              <option value="">{t("Select")}</option>

              {positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <Input
            label={t("Phone")}
            value={form.phone}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                phone: e.target.value,
              }))
            }
          />

          <Input
            label={t("Note")}
            value={form.note}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                note: e.target.value,
              }))
            }
          />

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  is_active: e.target.checked,
                }))
              }
            />
            {t("IsActive")}
          </label>

          <div className="flex justify-end gap-2">
            <Button text={t("Cancel")} onClick={() => setFormOpen(false)} />

            <Button text={saveMutation.isPending ? t("Saving") : editing ? t("Save") : t("Create")} onClick={() => saveMutation.mutate(form)} variant="danger" />
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={deleteModal}
        type="delete"
        title={`DELETE - ${t("Delete")}`}
        message={t("Delete", {
          name: toDelete?.full_name,
        })}
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

export default EmployeesPage;
