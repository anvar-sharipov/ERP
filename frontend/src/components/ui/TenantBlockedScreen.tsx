import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { platformContactApi } from "../../features/admin/services/platformContactApi";
import { LanguageSwitcher } from "./LanguageSwitcher";

interface TenantBlockedScreenProps {
  message?: string;
}

export const TenantBlockedScreen: React.FC<TenantBlockedScreenProps> = ({ message }) => {
  const { t } = useTranslation();
  const { data: contact } = useQuery({
    queryKey: ["platform-contact"],
    queryFn: platformContactApi.get,
    retry: false,
    staleTime: 1000 * 60 * 10,
  });

  

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950 px-4">
      {/* Переключатели в правом верхнем углу */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <LanguageSwitcher />
      </div>

      <div className="max-w-md w-full">
        {/* Иконка */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 border border-red-500/30">
            <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-white mb-2">{t("AccessRestricted")}</h1>
          <p className="text-sm text-slate-400 leading-relaxed">{t(message as any) || t("LicenseExpiredMessage")}</p>
        </div>

        {/* Контакты администратора */}
        {contact?.full_name && (
          <div className="border border-slate-800 rounded-xl p-4 bg-slate-900 space-y-3">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">{t("AdministratorContacts")}</p>
            <div className="flex items-center gap-3">
              {contact.photo ? (
                <img src={contact.photo} alt="" className="w-12 h-12 rounded-full object-cover border border-slate-700" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500">👤</div>
              )}
              <div>
                <p className="text-sm font-medium text-white">{contact.full_name}</p>
                {contact.address && <p className="text-xs text-slate-500">{contact.address}</p>}
              </div>
            </div>
            <div className="space-y-2 pt-1">
              {contact.phone && (
                <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300">
                  <span>📞</span> {contact.phone}
                </a>
              )}
              {contact.phone2 && (
                <a href={`tel:${contact.phone2}`} className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300">
                  <span>📞</span> {contact.phone2}
                </a>
              )}
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300">
                  <span>✉️</span> {contact.email}
                </a>
              )}
              {contact.telegram && (
                <a href={`https://t.me/${contact.telegram.replace("@", "")}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300">
                  <span>✈️</span> {contact.telegram}
                </a>
              )}
            </div>
          </div>
        )}

        <div className="mt-4 text-center">
          <button onClick={() => window.location.reload()} className="text-xs text-slate-600 hover:text-slate-400 transition">
            {t("RefreshPage")}
          </button>
        </div>
      </div>
    </div>
  );
};
