import React, { useState } from "react";
import { api } from "../../../core/api/axiosInstance";
import { useNotify } from "../../../core/context/NotificationContext";
import { Button } from "../../../components/ui/Button";
import { Building, Plus, User, Key, Mail, Link, Building2 } from "lucide-react";
import { Input } from "../../../components/ui/Input";

const CreateCompany: React.FC = () => {
  const baseDomain = import.meta.env.VITE_BASE_DOMAIN || "localhost";
  const notify = useNotify();
  const [companyName, setCompanyName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [adminEmail, setAdminEmail] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword !== confirmPassword) {
      notify("error", "Пароли не совпадают!");
      //   setMessage("Пароли не совпадают!");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      // Стучимся на бэкенд, который создаст схему в БД под эту компанию
      await api.post("companies/register/", {
        name: companyName,
        schema_name: subdomain.toLowerCase(),
        admin_email: adminEmail, // Передаем на бэкенд
        admin_password: adminPassword,
        admin_username: adminUsername,
      });
      //   setMessage(`Успех! Компания "${companyName}" создана на поддомене ${subdomain}.${baseDomain}`);
      notify("success", `Успех! Компания "${companyName}" создана на поддомене ${subdomain}.${baseDomain}`);
      setCompanyName("");
      setSubdomain("");
    } catch (err: any) {
      notify("error", "Ошибка при создании компании. Возможно, поддомен занят.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-slate-950 p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 border-b border-gray-200 dark:border-slate-800 pb-4">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Панель Управления Uchet.SaaS</h1>
          <p className="text-sm text-gray-500">Режим Главного Суперадминистратора</p>
        </header>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm max-w-lg">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-slate-200">Развернуть новую компанию</h2>

          {message && (
            <div className="p-3 mb-4 text-sm bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900 rounded-lg">{message}</div>
          )}

          <form onSubmit={handleCreateCompany} className="space-y-4">
            <Input
              label="Название организации"
              leftIcon={<Building2 className="w-4 h-4" />}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              type="text"
              placeholder="ООО Вектор Плюс"
              required
            />

            <Input label="Желаемый поддомен" leftIcon={<Link className="w-4 h-4" />} value={subdomain} onChange={(e) => setSubdomain(e.target.value)} type="text" placeholder="Vector" required />

            <Input label="Логин администратора" leftIcon={<User className="w-4 h-4" />} value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} type="text" required />

            <Input label="Email администратора" leftIcon={<Mail className="w-4 h-4" />} value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} type="email" />

            <Input label="Пароль" leftIcon={<Key className="w-4 h-4" />} value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} required type="password" />

            <Input label="Подтвердите пароль" leftIcon={<Key className="w-4 h-4" />} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required type="password" />

            <Button
              text={loading ? "Создание схемы в БД..." : "Создать компанию"}
              icon={
                <div className="flex items-center gap-1">
                  <Building className="w-5 h-5" />
                  <Plus className="w-3 h-3" />
                </div>
              }
              isLoading={loading}
              className="w-full"
            />
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateCompany;
