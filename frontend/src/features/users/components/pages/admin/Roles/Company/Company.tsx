// frontend/src/features/users/components/pages/admin/roles/company/company.tsx
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../../../../../../components/ui/Button";
import { Input } from "../../../../../../../components/ui/Input";
import { useNotify } from "../../../../../../../core/context/NotificationContext";
import { Avatar } from "../../../../../../../components/ui/Avatar";
import { ImagePreview } from "../../../../../../../components/ui/ImagePreview";
import { Modal } from "../../../../../../../components/ui/Modal/Modal";
import { useSidebar } from "../../../../../../../core/context/SidebarRightContext";
import { companyApi } from "../../../../../../accounting/services/companyApi";
import { RBACGuard } from "../../../../../../../components/ui/RBACGuard";
import { usePageAccess } from "../../../../../../../core/hooks/usePageAccess";
import { useTranslation } from "react-i18next";

const CompanyAdmin = () => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { setSidebarContent } = useSidebar();
  const { canView, canPut } = usePageAccess("companyprofile");
  const { t } = useTranslation();

  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState(false);
  const [clearedFiles, setClearedFiles] = useState<string[]>([]);
  const [formData, setFormData] = useState<any>({});
  const [files, setFiles] = useState<{ [key: string]: File | null }>({
    logo: null,
    logo2: null,
    stamp_image: null,
    signature_image: null,
  });

  const handleClearFile = (field: string) => {
    setFiles((prev) => ({ ...prev, [field]: null }));
    setFormData((prev: any) => ({ ...prev, [field]: null }));
    setClearedFiles((prev) => [...new Set([...prev, field])]);
  };

  useEffect(() => {
    setSidebarContent(null);
  }, [setSidebarContent]);

  const {
    data: company,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["company-profile"],
    queryFn: companyApi.getCompany,
    enabled: canView,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (company?.[0]) setFormData(company[0]);
  }, [company]);

  const companyItem = company?.[0];

  const mutation = useMutation({
    mutationFn: (data: FormData) => companyApi.saveCompany(companyItem?.id || null, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company"] });
      notify("success", t("company_data_saved"));
    },
    onError: (error: any) => {
      if (error._handled) return;
      notify("error", t("save_error") + (error.response?.data?.detail || error.message));
    },
  });

  const handleSave = () => {
    if (!canPut) {
      notify("error", t("no_edit_rights"));
      return;
    }
    const data = new FormData();
    const skipFields = ["logo", "logo2", "stamp_image", "signature_image", "logo_thumbnail", "logo2_thumbnail", "stamp_image_thumbnail", "signature_image_thumbnail"];

    Object.keys(formData).forEach((key) => {
      if (skipFields.includes(key)) return;
      const value = formData[key];
      if (value !== null && value !== undefined) {
        data.append(key, value);
      }
    });

    Object.keys(files).forEach((key) => {
      if (files[key]) data.append(key, files[key] as File);
    });

    clearedFiles.forEach((field) => data.append(field, ""));

    mutation.mutate(data);
  };

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText={t("no_view_rights")}>
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">{t("company_details")}</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label={t("company_name")} value={formData.name || ""} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
        <Input label={t("tax_id")} value={formData.tax_id || ""} onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })} />
        <Input label={t("director")} value={formData.director_name || ""} onChange={(e) => setFormData({ ...formData, director_name: e.target.value })} />
        <Input label={t("chief_accountant")} value={formData.chief_accountant_name || ""} onChange={(e) => setFormData({ ...formData, chief_accountant_name: e.target.value })} />

        <Input label={t("bank_name")} value={formData.bank_name || ""} onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })} />
        <Input label={t("bank_account")} value={formData.bank_account || ""} onChange={(e) => setFormData({ ...formData, bank_account: e.target.value })} />
        <Input label={t("mfo")} value={formData.mfo || ""} onChange={(e) => setFormData({ ...formData, mfo: e.target.value })} />
        <Input label={t("reg_date")} type="date" value={formData.legal_reg_date || ""} onChange={(e) => setFormData({ ...formData, legal_reg_date: e.target.value })} />

        <Input label={`${t("phone")} 1`} value={formData.phone_official || ""} onChange={(e) => setFormData({ ...formData, phone_official: e.target.value })} />
        <Input label={`${t("phone")} 2`} value={formData.phone_official2 || ""} onChange={(e) => setFormData({ ...formData, phone_official2: e.target.value })} />
        <Input label={`${t("email")} 1`} value={formData.email_official || ""} onChange={(e) => setFormData({ ...formData, email_official: e.target.value })} />
        <Input label={`${t("email")} 2`} value={formData.email_official2 || ""} onChange={(e) => setFormData({ ...formData, email_official2: e.target.value })} />
        <Input label={`${t("website")} 1`} value={formData.website || ""} onChange={(e) => setFormData({ ...formData, website: e.target.value })} />
        <Input label={`${t("website")} 2`} value={formData.website2 || ""} onChange={(e) => setFormData({ ...formData, website2: e.target.value })} />
        <Input label={t("base_currency")} value={formData.base_currency || "TMT"} onChange={(e) => setFormData({ ...formData, base_currency: e.target.value })} />

        <div className="md:col-span-2">
          <Input label={t("address")} value={formData.address || ""} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
        </div>

        {/* Секция файлов */}
        <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          {["logo", "logo2", "stamp_image", "signature_image"].map((field) => {
            const previewUrl = files[field] ? URL.createObjectURL(files[field] as File) : formData?.[field] || null;
            return (
              <div key={field} className="border border-gray-300 dark:border-indigo-900/50 p-3 rounded-lg bg-white dark:bg-slate-900 transition-colors">
                <label className="block mb-2 capitalize text-xs font-bold text-gray-600 dark:text-indigo-400">{field.replace(/_/g, " ")}</label>
                {previewUrl && (
                  <div className="relative inline-block mb-2">
                    <Avatar src={previewUrl} fallbackText={field[0].toUpperCase()} onClick={() => setPreviewSrc(previewUrl)} />
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
                  onChange={(e) => setFiles({ ...files, [field]: e.target.files?.[0] || null })}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-8 flex justify-end pb-10">
        <Button text={t("save_profile")} onClick={() => setConfirmModal(true)} className="w-full md:w-auto" disabled={!canPut} />
      </div>

      <ImagePreview src={previewSrc} onClose={() => setPreviewSrc(null)} />

      <Modal isOpen={confirmModal} onClose={() => setConfirmModal(false)} size="sm" title={t("confirmation")}>
        <div className="mb-6">
          <p>{t("confirm_save")}</p>
          <p className="font-bold text-gray-900 dark:text-gray-200 mt-2">{formData.name || t("no_name")}</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button text={t("cancel")} onClick={() => setConfirmModal(false)} variant="secondary" />
          <Button
            text={mutation.isPending ? t("saving") : t("confirm")}
            onClick={() => {
              setConfirmModal(false);
              handleSave();
            }}
          />
        </div>
      </Modal>
    </RBACGuard>
  );
};

export default CompanyAdmin;
