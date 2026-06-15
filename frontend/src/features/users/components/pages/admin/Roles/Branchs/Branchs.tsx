import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { branchApi, companyApi } from "../../../../../../accounting/services/usersApi";
import { useSidebar } from "../../../../../../../core/context/SidebarRightContext";
import { useEffect, useState, useMemo } from "react";
import { Button } from "../../../../../../../components/ui/Button";
import { Plus } from "lucide-react";
import { Input } from "../../../../../../../components/ui/Input";
import { Table, type Column } from "../../../../../../../components/ui/Table/Table";
import { type Branch as BranchInterface, type CompanyProfile as CompanyInterface } from "../../../../../../../core/types";
import { Modal } from "../../../../../../../components/ui/Modal/Modal";
import { useNotify } from "../../../../../../../core/context/NotificationContext";
import { Avatar } from "../../../../../../../components/ui/Avatar";
import { ImagePreview } from "../../../../../../../components/ui/ImagePreview";
import { Badge } from "../../../../../../../components/ui/Badge";
import { RBACGuard } from "../../../../../../../components/ui/RBACGuard";
import { usePageAccess } from "../../../../../../../core/hooks/usePageAccess";
import { useTranslation } from "react-i18next";

const Branches = () => {
  const { t } = useTranslation();
  const { setSidebarContent } = useSidebar();
  const notify = useNotify();
  const queryClient = useQueryClient();

  const { canView, canPost, canPut, canDelete } = usePageAccess("branch");

  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [editingBranch, setEditingBranch] = useState<BranchInterface | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [clearedFiles, setClearedFiles] = useState<string[]>([]);

  const { data: company } = useQuery<CompanyInterface[]>({
    queryKey: ["company-profile"],
    queryFn: companyApi.getCompany,
    staleTime: 1000 * 60 * 60,
  });

  const companyId = company?.[0]?.id;

  const emptyForm = {
    name: "",
    code: "",
    is_head_office: false,
    is_active: true,
    address: "",
    city: "",
    phone: "",
    email: "",
    website: "",
    manager_name: "",
    manager_position: "",
    logo: null as File | null,
    signature_image: null as File | null,
  };

  const [formData, setFormData] = useState(emptyForm);

  const {
    data: branches,
    isLoading,
    error,
  } = useQuery<BranchInterface[]>({
    queryKey: ["branches"],
    queryFn: branchApi.getBranches,
    enabled: canView,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  const handleClearFile = (field: string) => {
    setFormData((prev: any) => ({ ...prev, [field]: null }));
    setClearedFiles((prev) => [...new Set([...prev, field])]);
  };

  useEffect(() => {
    if (editingBranch) {
      setClearedFiles([]);
      setFormData({
        name: editingBranch.name || "",
        code: editingBranch.code || "",
        is_head_office: editingBranch.is_head_office ?? false,
        is_active: editingBranch.is_active ?? true,
        address: editingBranch.address || "",
        city: editingBranch.city || "",
        phone: editingBranch.phone || "",
        email: editingBranch.email || "",
        website: editingBranch.website || "",
        manager_name: editingBranch.manager_name || "",
        manager_position: editingBranch.manager_position || "",
        logo: null,
        signature_image: null,
      });
    } else {
      setClearedFiles([]);
      setFormData(emptyForm);
    }
  }, [editingBranch]);

  const mutation = useMutation({
    mutationFn: (data: typeof emptyForm) => {
      if (!companyId) {
        throw new Error(t("ErrorLoadingCompany"));
      }
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if ((key === "logo" || key === "signature_image") && value instanceof File) {
          formData.append(key, value);
        } else if (value !== null && value !== undefined) {
          formData.append(key, String(value));
        }
      });

      clearedFiles.forEach((field) => formData.append(field, ""));
      if (companyId) formData.append("company_profile", String(companyId));
      return branchApi.saveBranch(editingBranch?.id || null, formData);
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      setModalOpen(false);
      notify("success", editingBranch ? t("BranchUpdated") : t("BranchCreated"));
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", err.message || t("ErrorSaving"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => {
      if (!canDelete) throw new Error(t("InsufficientRights"));
      return branchApi.deleteBranch(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      setDeleteTargetId(null);
      notify("success", t("DeleteBranch"));
    },
    onError: (error: any) => {
      if (error._handled) return;
      notify("error", t("ErrorSaving"));
    },
  });

  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <div>
          <h4 className="font-bold text-indigo-300 mb-2">{t("Actions")}</h4>
          <Button
            text={t("AddBranch")}
            disabled={!canPost}
            onClick={() => {
              setEditingBranch(null);
              setModalOpen(true);
            }}
            className="w-full"
            icon={<Plus className="w-4 h-4" />}
            dark={true}
          />
        </div>

        <div className="pt-4 border-t border-indigo-900/30">
          <h4 className="font-bold text-indigo-300 mb-2">{t("StatusFilter")}</h4>
          <div className="flex flex-col gap-1">
            {(["all", "active", "inactive"] as const).map((status) => (
              <Button
                key={status}
                onClick={() => setActiveFilter(status)}
                text={status === "all" ? t("AllBranches") : status === "active" ? t("OnlyActive") : t("OnlyInactive")}
                variant="ghost"
                dark={true}
                isActive={activeFilter === status}
                className="w-full justify-start"
                icon={status !== "all" ? <span className={`w-2 h-2 rounded-full ${status === "active" ? "bg-green-500" : "bg-red-500"}`} /> : undefined}
              />
            ))}
          </div>
        </div>
      </div>,
    );
  }, [setSidebarContent, activeFilter, canPost, t]);

  const filtered = useMemo(() => {
    if (!branches) return [];
    let result = branches;
    if (activeFilter === "active") result = result.filter((b) => b.is_active);
    if (activeFilter === "inactive") result = result.filter((b) => !b.is_active);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((b) => b.name?.toLowerCase().includes(q) || b.city?.toLowerCase().includes(q) || b.manager_name?.toLowerCase().includes(q));
    }
    return result;
  }, [branches, searchQuery, activeFilter]);

  const columns: Column<BranchInterface>[] = [
    { header: "ID", accessor: "id", sortable: true, excelAlign: "center", excelWidth: 5 },
    { header: t("Name"), accessor: "name", sortable: true, excelWidth: 25 },
    { header: t("Code"), accessor: "code", sortable: true, excelWidth: 25 },
    {
      header: t("HeadOffice"),
      accessor: "is_head_office",
      sortable: true,
      excelWidth: 8,
      excelValue: (b) => (b.is_head_office ? t("Yes") : t("No")),
      render: (b) => <Badge text={b.is_head_office ? t("Yes") : t("No")} />,
    },
    { header: t("City"), accessor: "city", sortable: true, excelWidth: 18 },
    { header: t("Address"), accessor: "address", sortable: true, excelWidth: 18 },
    { header: t("Phone"), accessor: "phone", sortable: true },
    { header: t("Manager"), accessor: "manager_name", sortable: true, excelWidth: 12 },
    {
      header: t("Logo"),
      excelWidth: 6,
      excelImageUrl: (b) => b.logo || null,
      render: (b) => <Avatar src={b.logo} fallbackText={b.name[0]} onClick={() => b.logo && setSelectedImage(b.logo)} />,
    },
    {
      header: t("Signature"),
      excelWidth: 6,
      excelImageUrl: (b) => b.signature_image || null,
      render: (b) => <Avatar src={b.signature_image} fallbackText="П" onClick={() => b.signature_image && setSelectedImage(b.signature_image)} />,
    },
    {
      header: t("Status"),
      accessor: "is_active",
      sortable: true,
      excelWidth: 13,
      sortValue: (b) => (b.is_active ? 1 : 0),
      excelValue: (b) => (b.is_active ? t("Active") : t("Inactive")),
      render: (b) => (
        <div className="flex items-center justify-center gap-2">
          <span className={`w-2 h-2 rounded-full ${b.is_active ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-xs">{b.is_active ? t("Active") : t("Inactive")}</span>
        </div>
      ),
    },
    {
      header: t("Actions"),
      render: (b) => (
        <div className="flex gap-2">
          <Button
            title={t("Edit")}
            disabled={!canPut}
            variant="1c"
            icon={<span>✏️</span>}
            className="md:h-6 md:w-8 md:!p-0"
            onClick={(e) => {
              e.stopPropagation();
              setEditingBranch(b);
              setModalOpen(true);
            }}
          />

          <Button
            title={t("Delete")}
            disabled={!canDelete}
            variant="1c"
            icon={<span>🗑️</span>}
            className="md:h-6 md:w-8 md:!p-0"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTargetId(b.id);
              setDeleteModal(true);
            }}
          />
        </div>
      ),
    },
  ];

  const branchToDelete = branches?.find((b) => b.id === deleteTargetId);

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText={t("ForbiddenText")}>
      <Table
        columns={columns}
        data={filtered}
        tableId="branches"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRowDoubleClick={(b) => {
          setEditingBranch(b);
          setModalOpen(true);
        }}
      />

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingBranch ? t("EditBranch") : t("NewBranch")} closeOnOutsideClick={false} size="lg">
        <div className="space-y-3 p-1">
          <Input label={t("Name")} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
          <Input label={t("Code")} value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} />
          <Input label={t("City")} value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} />
          <Input label={t("Address")} value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
          <Input label={t("Phone")} value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
          <Input label={t("Email")} value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
          <Input label={t("Website")} value={formData.website} onChange={(e) => setFormData({ ...formData, website: e.target.value })} />
          <Input label={t("Manager")} value={formData.manager_name} onChange={(e) => setFormData({ ...formData, manager_name: e.target.value })} />
          <Input label={t("ManagerPosition")} value={formData.manager_position} onChange={(e) => setFormData({ ...formData, manager_position: e.target.value })} />

          <div className="grid grid-cols-2 gap-4">
            {(["logo", "signature_image"] as const).map((field) => {
              const existingUrl = editingBranch?.[field === "logo" ? "logo_thumbnail" : "signature_image_thumbnail"];
              const newFile = formData[field];
              const previewUrl = newFile ? URL.createObjectURL(newFile as File) : clearedFiles.includes(field) ? null : existingUrl || null;

              return (
                <div key={field} className="border border-gray-300 dark:border-indigo-900/50 p-3 rounded-lg bg-white dark:bg-slate-900">
                  <label className="block mb-2 text-xs font-bold text-gray-600 dark:text-indigo-400">{field === "logo" ? t("Logo") : t("Signature")}</label>

                  {previewUrl && (
                    <div className="relative inline-block mb-2">
                      <Avatar src={previewUrl} fallbackText={field[0].toUpperCase()} onClick={() => setSelectedImage(previewUrl)} />
                      <button
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center hover:bg-red-600"
                        onClick={(e) => {
                          e.preventDefault();
                          handleClearFile(field);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  )}

                  <input
                    type="file"
                    className="text-[10px] w-full mt-2 text-gray-500 dark:text-indigo-300 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[10px] file:font-semibold file:bg-indigo-50 dark:file:bg-indigo-950 file:text-indigo-700 dark:file:text-indigo-300 hover:file:bg-indigo-100 dark:hover:file:bg-indigo-900 cursor-pointer"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setFormData({ ...formData, [field]: file });
                      setClearedFiles((prev) => prev.filter((f) => f !== field));
                    }}
                  />
                </div>
              );
            })}
          </div>

          <label className="flex items-center gap-2 font-medium text-gray-700">
            <input
              type="checkbox"
              checked={formData.is_head_office}
              onChange={(e) => setFormData({ ...formData, is_head_office: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600"
            />
            {t("HeadOffice")}
          </label>

          <label className="flex items-center gap-2 font-medium text-gray-700">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600"
            />
            {t("Active")}
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button text={t("Cancel")} onClick={() => setModalOpen(false)} />
            <Button
              text={mutation.isPending ? t("Saving") : t("Save")}
              onClick={() => {
                if ((editingBranch && !canPut) || (!editingBranch && !canPost)) {
                  notify("error", t("InsufficientRights"));
                  return;
                }
                mutation.mutate(formData);
              }}
              disabled={mutation.isPending}
            />
          </div>
        </div>
      </Modal>

      <Modal isOpen={deleteModal} onClose={() => setDeleteModal(false)} size="sm">
        <div className="mb-6">
          <p>{t("ConfirmDelete")}</p>
          <p className="font-bold text-gray-900 dark:text-gray-200 mt-2">
            {branchToDelete?.name} {branchToDelete?.city ? `(${branchToDelete.city})` : ""}
          </p>
          <p className="text-red-500 mt-4">{t("Irreversible")}</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button text={t("Cancel")} onClick={() => setDeleteModal(false)} />
          <Button
            variant="danger"
            text={t("Delete")}
            onClick={() => {
              if (deleteTargetId) {
                deleteMutation.mutate(deleteTargetId);
                setDeleteModal(false);
              }
            }}
          />
        </div>
      </Modal>
      <ImagePreview src={selectedImage} onClose={() => setSelectedImage(null)} />
    </RBACGuard>
  );
};

export default Branches;
