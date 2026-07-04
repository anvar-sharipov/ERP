// // frontend/src/features/accounting/pages/Counterparties/CounterpartiesPage.tsx
// frontend/src/features/accounting/pages/Counterparties/CounterpartiesPage.tsx
import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { counterpartyApi } from "../../services/productApi";
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
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { Avatar } from "../../../../components/ui/Avatar";
import { ImagePreview } from "../../../../components/ui/ImagePreview";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeaderText } from "../../../../components/ui/Tabs/PageHeaderText";
import { usePageHotkeys } from "../../../../core/hooks/usePageHotkeys";

const COUNTERPARTY_TYPES = (t: any) => [
  { value: "client", label: t("Client") },
  { value: "supplier", label: t("Supplier") },
  { value: "both", label: t("ClientAndSupplier") },
];

interface CounterpartyForm {
  name: string;
  type: string;
  inn: string;
  phone: string;
  email: string;
  address: string;
  is_active: boolean;
}

const EMPTY: CounterpartyForm = {
  name: "",
  type: "both",
  inn: "",
  phone: "",
  email: "",
  address: "",
  is_active: true,
};

const CounterpartiesPage = () => {
  const { t } = useTranslation();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { setSidebarContent } = useSidebar();
  const { canView, canPost, canPut, canDelete } = usePageAccess("counterparty");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<CounterpartyForm>(EMPTY);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoCleared, setPhotoCleared] = useState(false);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "client" | "supplier">("all");

  const {
    data: counterparties = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["counterparties"],
    queryFn: () => counterpartyApi.getAll(),
    enabled: canView,
    retry: false,
  });

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        type: editing.type,
        inn: editing.inn ?? "",
        phone: editing.phone ?? "",
        email: editing.email ?? "",
        address: editing.address ?? "",
        is_active: editing.is_active,
      });
      setExistingPhotoUrl(editing.photo ?? null);
    } else {
      setForm(EMPTY);
      setExistingPhotoUrl(null);
    }
    setPhotoFile(null);
    setPhotoCleared(false);
  }, [editing]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const data = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (value !== null && value !== undefined) data.append(key, String(value));
      });
      if (photoFile) data.append("photo", photoFile);
      else if (photoCleared) data.append("photo", "");
      return counterpartyApi.save(editing?.id ?? null, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["counterparties"] });
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
    mutationFn: (id: number) => counterpartyApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["counterparties"] });
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
        <div>
          <h4 className="font-bold text-indigo-300 mb-2">{t("Actions")}</h4>
          <Button
            title={`Insert - ${t("Add")}`}
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
        </div>
        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2">{t("TypeFilter")}</h4>
          <div className="flex flex-col gap-1">
            {(
              [
                ["all", t("All")],
                ["client", t("Clients")],
                ["supplier", t("Suppliers")],
              ] as const
            ).map(([val, label]) => (
              <Button key={val} onClick={() => setTypeFilter(val)} text={label} variant="ghost" dark={true} isActive={typeFilter === val} className="w-full justify-start" />
            ))}
          </div>
        </div>
      </div>,
    );
  }, [setSidebarContent, canPost, typeFilter, t]);

  const filtered = useMemo(() => {
    let result = counterparties as any[];
    if (typeFilter === "client") result = result.filter((c) => c.type === "client" || c.type === "both");
    if (typeFilter === "supplier") result = result.filter((c) => c.type === "supplier" || c.type === "both");
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((c) => c.name?.toLowerCase().includes(q) || c.inn?.toLowerCase().includes(q) || c.phone?.toLowerCase().includes(q));
    }
    return result;
  }, [counterparties, typeFilter, searchQuery]);

  const getTypeLabel = (type: string) => {
    const types = COUNTERPARTY_TYPES(t);
    return types.find((t) => t.value === type)?.label ?? type;
  };

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
      header: t("Photo"),
      accessor: "photo_thumbnail",
      hideInPrint: true,
      render: (item) => <Avatar src={item.photo_thumbnail} fallbackText={item.name} size="sm" onClick={() => item.photo && setPreviewSrc(item.photo)} />,
    },
    { header: t("Name"), accessor: "name", sortable: true, excelWidth: 30 },
    {
      header: t("Type"),
      accessor: "type",
      sortable: true,
      excelWidth: 18,
      render: (item) => (
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            item.type === "client"
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
              : item.type === "supplier"
                ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
          }`}
        >
          {getTypeLabel(item.type)}
        </span>
      ),
      excelValue: (item) => getTypeLabel(item.type),
    },
    { header: t("INN"), accessor: "inn", sortable: true, excelWidth: 15 },
    { header: t("Phone"), accessor: "phone", sortable: true, excelWidth: 15 },
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

  const toDelete = (counterparties as any[]).find((c) => c.id === deleteId);

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText={t("ForbiddenText")}>
      <PageHeaderText title={t("Counterparties")} />
      <Table
        columns={columns}
        data={filtered}
        tableId="counterparties_list"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRowDoubleClick={(item) => {
          setEditing(item);
          setFormOpen(true);
        }}
      />

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={editing ? t("Edit") : t("Add")} closeOnOutsideClick={false}>
        <div className="space-y-4">
          {(() => {
            const previewUrl = photoFile ? URL.createObjectURL(photoFile) : !photoCleared ? existingPhotoUrl : null;
            return (
              <div className="flex items-center gap-3">
                {previewUrl && (
                  <div className="relative inline-block">
                    <Avatar src={previewUrl} fallbackText={form.name || "?"} size="xl" onClick={() => setPreviewSrc(previewUrl)} />
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

          <Input label={t("Name")} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("Type")}</label>
            <select
              value={form.type}
              onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {COUNTERPARTY_TYPES(t).map((ct) => (
                <option key={ct.value} value={ct.value}>
                  {ct.label}
                </option>
              ))}
            </select>
          </div>

          <Input label={t("INN")} value={form.inn} onChange={(e) => setForm((p) => ({ ...p, inn: e.target.value }))} />
          <Input label={t("Phone")} value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
          <Input label={t("Email")} type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
          <TextArea label={t("Address")} rows={2} value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />

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
            <Button text={saveMutation.isPending ? t("Saving") : editing ? t("Save") : t("Create")} onClick={() => saveMutation.mutate()} />
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={deleteModal}
        type="delete"
        title={`DELETE - ${t("Delete")}`}
        message={t("DeleteCounterpartyMessage", { name: toDelete?.name })}
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

export default CounterpartiesPage;
