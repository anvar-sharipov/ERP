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
import { Avatar } from "../../../../components/ui/Avatar";
import { ImagePreview } from "../../../../components/ui/ImagePreview";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTableFilter } from "../../../../core/hooks/useTableFilter";
import { usePageHotkeys } from "../../../../core/hooks/usePageHotkeys";
import { userScopeApi } from "../../services/transactionApi";
import { usersApi } from "../../../users/services/userApi";
import { useDateStore } from "../../../../core/store/dateStore";
import SearchableSelect, { type SelectOption } from "../../../../components/ui/SearchableSelect";

interface Employee {
  id: number;
  full_name: string;
  position: number | null;
  position_name?: string;
  branch: number | null;
  branch_name?: string;
  phone: string;
  note: string;
  is_active: boolean;
  photo?: string | null;
  photo_thumbnail?: string | null;
  user: number | null;
  user_username?: string | null;
}

interface Position {
  id: number;
  name: string;
}

// interface Branch {
//   id: number;
//   name: string;
// }

interface EmployeeForm {
  full_name: string;
  position: number | null;
  branch: number | null;
  phone: string;
  note: string;
  is_active: boolean;
  user: number | null;
}

const EMPTY: EmployeeForm = {
  full_name: "",
  position: null,
  branch: null,
  phone: "",
  note: "",
  is_active: true,
  user: null,
};

const selectCls =
  "w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg " +
  "bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 " +
  "focus:outline-none focus:ring-2 focus:ring-indigo-500";

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
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoCleared, setPhotoCleared] = useState(false);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState<number | "all">("all");
  const [branchFilter] = useState<number | "all">("all");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  // const { workBranch } = useDateStore();
  const workBranch = useDateStore((s) => s.workBranch);

  const { data: positions = [] } = useQuery<Position[]>({
    queryKey: ["positions"],
    queryFn: positionApi.getAll,
  });

  const { data: usersLookup = [] } = useQuery({
    queryKey: ["users-lookup"],
    queryFn: usersApi.getUsersLookup,
    enabled: canView,
    retry: false,
  });
  const userOptions: SelectOption[] = (usersLookup as any[]).map((u) => ({
    id: u.id,
    label: u.full_name,
  }));

  // const { data: branches = [] } = useQuery<Branch[]>({
  //   queryKey: ["branches"],
  //   queryFn: async () => {
  //     const res = await api.get("/accounting/branches/");
  //     return Array.isArray(res.data) ? res.data : (res.data.results ?? []);
  //   },
  // });

  const { data: scope } = useQuery({
    queryKey: ["my-scope"],
    queryFn: () => userScopeApi.getMyScope().then((r) => r.data),
    staleTime: 60_000,
  });
  const branches = scope?.branches ?? [];
  const hasScope = !scope?.is_global;

  const {
    data: employees = [],
    isLoading,
    error,
  } = useQuery<Employee[]>({
    queryKey: ["employees", workBranch?.id],
    queryFn: () => employeeApi.getAll(workBranch?.id ? { branch: String(workBranch.id) } : undefined),
    enabled: canView,
    retry: false,
  });

  const handleAdd = () => {
    setEditing(null);
    setForm({ ...EMPTY, branch: workBranch?.id ?? null });
    setFormOpen(true);
  };

  useEffect(() => {
    if (editing) {
      setForm({
        full_name: editing.full_name,
        position: editing.position,
        branch: editing.branch,
        phone: editing.phone,
        note: editing.note,
        is_active: editing.is_active,
        user: editing.user ?? null,
      });
      setExistingPhotoUrl(editing.photo ?? null);
    } else {
      setForm({ ...EMPTY, branch: workBranch?.id ?? null });
      setExistingPhotoUrl(null);
    }
    setPhotoFile(null);
    setPhotoCleared(false);
  }, [editing, workBranch]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const data = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (value !== null && value !== undefined) data.append(key, String(value));
      });
      if (photoFile) data.append("photo", photoFile);
      else if (photoCleared) data.append("photo", "");
      return employeeApi.save(editing?.id ?? null, data);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
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
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      notify("success", t("SuccessDeleted"));
      setDeleteId(null);
    },
  });

  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <h4 className="font-bold text-indigo-300">{t("Actions")}</h4>
        {/* <Button disabled={!canPost} text={t("AddEmployee")} className="w-full" dark icon={<Plus className="w-4 h-4" />} onClick={handleAdd} /> */}
        <Button disabled={!canPost} text={t("AddEmployee")} className="w-full" dark icon={<Plus className="w-4 h-4" />} onClick={handleAdd} />

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
  }, [setSidebarContent, canPost, t, positions, positionFilter, branchFilter, activeFilter, branches]);

  const filtered = useTableFilter(employees, {
    search: searchQuery,
    searchFields: ["id", "full_name", "phone", "position_name", "branch_name"],
    filterKey: `${branchFilter}-${positionFilter}-${activeFilter}`,
    filters: [
      (item) => {
        if (branchFilter === "all") return true;
        return item.branch === branchFilter;
      },
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
    onInsert: handleAdd,
  });

  const columns: Column<Employee>[] = [
    { header: t("ID"), accessor: "id", sortable: true },
    {
      header: t("Photo"),
      accessor: "photo_thumbnail",
      hideInPrint: true,
      render: (item) => <Avatar src={item.photo_thumbnail} fallbackText={item.full_name} size="sm" onClick={() => item.photo && setPreviewSrc(item.photo)} />,
    },
    { header: t("FullName"), accessor: "full_name", sortable: true },
    { header: t("Position"), accessor: "position_name", sortable: true },
    {
      header: t("Branchs"),
      accessor: "branch_name",
      sortable: true,
      render: (item) => (item.branch_name ? <span>{item.branch_name}</span> : <span className="text-gray-400 text-xs">Общий</span>),
    },
    { header: t("Phone"), accessor: "phone", sortable: true },
    {
      header: t("SystemUser"),
      accessor: "user_username",
      sortable: true,
      render: (item) => item.user_username ?? "—",
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
          {(() => {
            const previewUrl = photoFile ? URL.createObjectURL(photoFile) : !photoCleared ? existingPhotoUrl : null;
            return (
              <div className="flex items-center gap-3">
                {previewUrl && (
                  <div className="relative inline-block">
                    <Avatar src={previewUrl} fallbackText={form.full_name || "?"} size="xl" onClick={() => setPreviewSrc(previewUrl)} />
                    <button
                      type="button"
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center hover:bg-red-600"
                      onClick={() => {
                        setPhotoFile(null);
                        setPhotoCleared(true);
                      }}
                    >
                      ×
                    </button>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="text-[10px] flex-1 text-gray-500 dark:text-indigo-300 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[10px] file:font-semibold file:bg-indigo-50 dark:file:bg-indigo-950 file:text-indigo-700 dark:file:text-indigo-300 hover:file:bg-indigo-100 dark:hover:file:bg-indigo-900 cursor-pointer"
                  onChange={(e) => {
                    setPhotoFile(e.target.files?.[0] || null);
                    setPhotoCleared(false);
                  }}
                />
              </div>
            );
          })()}

          <Input label={t("FullName")} value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} />

          <div>
            <label className="block mb-1 text-sm font-medium">{t("Position")}</label>
            <select className={selectCls} value={form.position ?? ""} onChange={(e) => setForm((p) => ({ ...p, position: e.target.value ? Number(e.target.value) : null }))}>
              <option value="">{t("Select")}</option>
              {positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block mb-1 text-sm font-medium">{t("Branch")}</label>
            <select className={selectCls} value={form.branch ?? ""} onChange={(e) => setForm((p) => ({ ...p, branch: e.target.value ? Number(e.target.value) : null }))}>
              {!hasScope && <option value="">— Общий (виден всем) —</option>}
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <Input label={t("Phone")} value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />

          <div>
            <label className="block mb-1 text-sm font-medium">{t("SystemUser")}</label>
            <SearchableSelect
              options={userOptions}
              value={form.user}
              onChange={(id) => setForm((p) => ({ ...p, user: id }))}
              placeholder={t("SelectSystemUser")}
            />
          </div>

          <Input label={t("Note")} value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} />

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} />
            {t("IsActive")}
          </label>

          <div className="flex justify-end gap-2">
            <Button text={t("Cancel")} variant="secondary" onClick={() => setFormOpen(false)} />
            <Button text={saveMutation.isPending ? t("Saving") : editing ? t("Save") : t("Create")} onClick={() => saveMutation.mutate()} />
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={deleteModal}
        type="delete"
        title={`DELETE - ${t("Delete")}`}
        message={t("Delete", { name: toDelete?.full_name })}
        onClose={() => setDeleteModal(false)}
        onConfirm={() => {
          if (deleteId) {
            deleteMutation.mutate(deleteId);
            setDeleteModal(false);
          }
        }}
      />

      <ImagePreview src={previewSrc} onClose={() => setPreviewSrc(null)} />
    </RBACGuard>
  );
};

export default EmployeesPage;
