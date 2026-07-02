// frontend/src/features/admin/components/PlatformContactPage.tsx
import React, { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { platformContactApi } from "../services/platformContactApi";

export const PlatformContactPage: React.FC = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["platform-contact"],
    queryFn: platformContactApi.get,
  });

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    phone2: "",
    email: "",
    telegram: "",
    address: "",
    is_active: true,
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        full_name: data.full_name || "",
        phone: data.phone || "",
        phone2: data.phone2 || "",
        email: data.email || "",
        telegram: data.telegram || "",
        address: data.address || "",
        is_active: data.is_active ?? true,
      });
      if (data.photo) setPhotoPreview(data.photo);
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, String(v)));
      if (photoFile) fd.append("photo", photoFile);
      return platformContactApi.save(fd);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-contact"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const inputCls = `
    w-full px-3 py-2 rounded-lg border text-sm
    bg-slate-900 text-slate-100
    border-slate-700 focus:border-indigo-500 focus:outline-none
    placeholder:text-slate-500
  `;

  if (isLoading) {
    return <div className="p-8 text-slate-400 text-sm">{t("Loading")}...</div>;
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">{t("PlatformAdministratorContacts")}</h2>
        <p className="text-xs text-slate-500 mt-1">{t("PlatformAdministratorContactsDescription")}</p>
      </div>

      {/* Фото */}
      <div className="flex items-center gap-4">
        <div
          onClick={() => fileRef.current?.click()}
          className="w-20 h-20 rounded-full bg-slate-800 border border-slate-700 cursor-pointer overflow-hidden flex items-center justify-center hover:border-indigo-500 transition"
        >
          {photoPreview ? <img src={photoPreview} alt="photo" className="w-full h-full object-cover" /> : <span className="text-2xl text-slate-500">👤</span>}
        </div>
        <div>
          <button onClick={() => fileRef.current?.click()} className="text-xs text-indigo-400 hover:text-indigo-300">
            {t("ChangePhoto")}
          </button>
          <p className="text-xs text-slate-600 mt-0.5">{t("PhotoRequirements")}</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setPhotoFile(file);
              setPhotoPreview(URL.createObjectURL(file));
            }
          }}
        />
      </div>

      {/* Поля */}
      <div className="space-y-3">
        {[
          { key: "full_name", label: t("FullName"), placeholder: t("FullNamePlaceholder") },
          { key: "phone", label: t("Phone"), placeholder: "+993 12 345678" },
          { key: "phone2", label: t("Phone2"), placeholder: "+993 65 345678" },
          { key: "email", label: t("Email"), placeholder: "admin@example.com" },
          { key: "telegram", label: t("Telegram"), placeholder: "@username" },
          { key: "address", label: t("Address"), placeholder: t("AddressPlaceholder") },
        ].map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className="text-xs text-slate-400 mb-1 block">{label}</label>
            <input className={inputCls} placeholder={placeholder} value={(form as any)[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
          </div>
        ))}

        <label className="flex items-center gap-2 cursor-pointer pt-1">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4 accent-indigo-500" />
          <span className="text-sm text-slate-300">{t("ShowContactsOnLockScreen")}</span>
        </label>
      </div>

      {/* Кнопка */}
      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition disabled:opacity-50"
      >
        {mutation.isPending ? t("Saving") + "..." : saved ? `✓ ${t("Saved")}` : t("Save")}
      </button>

      {mutation.isError && <p className="text-xs text-red-400 text-center">{t("ErrorSaving")}</p>}
    </div>
  );
};
