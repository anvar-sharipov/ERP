// frontend/src/components/Layouts/Header.tsx

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "../../core/router/routes";
import { LanguageSwitcher } from "../ui/LanguageSwitcher";
import { ThemeToggle } from "../ui/ThemeToggle";
import { logoutRequest } from "../../features/auth/services/authApi";
import { Avatar } from "../ui/Avatar";
import { ImagePreview } from "../ui/ImagePreview";
import { ChevronDown } from "lucide-react";
import { Modal } from "../ui/Modal/Modal";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { useUser } from "../../core/context/UserContext";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateProfile } from "../../features/users/services/userApi";
import { useNotify } from "../../core/context/NotificationContext";
import { playAside2Sound } from "../../core/utils/sound";
import { useCompany } from "../../core/context/CompanyContext";

// Добавьте это над компонентом Header
interface ProfileFormData {
  first_name: string;
  last_name: string;
  phone: string;
  position: string;
  photo: File | null; // Разрешаем либо файл, либо null
}

const Header: React.FC = () => {
  const { user: currentUser } = useUser();
  const { company: currentCompany } = useCompany();

  
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [formData, setFormData] = useState<ProfileFormData>({
    first_name: "",
    last_name: "",
    phone: "",
    position: "",
    photo: null,
  });

  const queryClient = useQueryClient();
  const notify = useNotify();

  const mutation = useMutation({
    mutationFn: (data: FormData) => updateProfile(data),
    onSuccess: () => {
      // 1. Обновляем данные текущего пользователя
      queryClient.invalidateQueries({ queryKey: ["user-me"] });

      // 2. Обновляем список пользователей, если это нужно для других частей приложения
      queryClient.invalidateQueries({ queryKey: ["users"] });

      setIsEditModalOpen(false);
      notify("success", "Профиль обновлен!");
    },
    onError: (error: any) => {
      if (error._handled) return;
      notify("error", "Ошибка при обновлении профиля");
    },
  });

  const handleSave = () => {
    const data = new FormData();
    data.append("first_name", formData.first_name);
    data.append("last_name", formData.last_name);
    data.append("phone", formData.phone);
    data.append("position", formData.position);

    if (formData.photo) {
      data.append("photo", formData.photo);
    }

    mutation.mutate(data);
  };

  // Заполняем форму при открытии модалки данными текущего пользователя
  const openEditModal = () => {
    if (currentUser) {
      setFormData({
        first_name: currentUser.first_name,
        last_name: currentUser.last_name,
        phone: currentUser.phone,
        position: currentUser.position || "",
        photo: null, // файл отправляется отдельно
      });
    }
    setIsProfileMenuOpen(false);
    setIsEditModalOpen(true);
  };

  const handleLogout = async () => {
    await logoutRequest();
    queryClient.clear();
    // localStorage.removeItem("access_token");
    // localStorage.removeItem("refresh_token");
    navigate(ROUTES.AUTH.LOGIN, { replace: true });
  };

  return (
    <header className="relative h-16 border-b border-slate-500 bg-slate-800 dark:bg-slate-900 px-6 flex items-center justify-between print:hidden">
      {/* Логотип и название компании */}
      <div className="flex items-center gap-3">
        {currentCompany?.logo ? (
          <img src={currentCompany.logo} alt={currentCompany.name} className="h-10 w-10 object-contain rounded" />
        ) : currentCompany?.logo2 ? (
          <img src={currentCompany.logo2} alt={currentCompany.name} className="h-10 w-10 object-contain rounded" />
        ) : (
          // Заглушка, если логотипа нет
          <div className="h-10 w-10 bg-slate-700 rounded flex items-center justify-center text-yellow-500 font-bold">{currentCompany?.name?.charAt(0) || "H"}</div>
        )}

        <div className="flex flex-col">
          <span className="font-bold text-lg text-white leading-tight">{currentCompany?.name || "Hasap.Pro"}</span>
          {currentCompany?.name && <span className="text-[10px] text-yellow-500 uppercase tracking-wider">Hasap.Pro</span>}
        </div>
      </div>

      {/* Кнопка гамбургера (видна только на мобильных) */}
      <button className="lg:hidden p-2 text-gray-400 hover:text-white" onClick={() => setIsMenuOpen(!isMenuOpen)}>
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
        </svg>
      </button>

      {/* Контейнер элементов (на десктопе в ряд, на мобильных выпадающий список) */}
      <div
        className={`
        absolute top-16 left-0 w-full bg-slate-900 border-b border-slate-800 p-6 flex-col gap-4 z-50
        lg:static lg:w-auto lg:p-0 lg:flex-row lg:flex lg:items-center lg:border-0 lg:bg-transparent
        ${isMenuOpen ? "flex" : "hidden"}
      `}
      >
        <div className="flex items-center gap-4 flex-col lg:flex-row">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>

        <div className="hidden lg:block w-[1px] h-6 bg-gray-800" />

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Avatar
              // Добавляем timestamp к URL картинки
              src={currentUser?.photo_thumbnail || currentUser?.photo ? `${currentUser.photo_thumbnail || currentUser.photo}?t=${new Date().getTime()}` : null}
              fallbackText={currentUser?.username?.charAt(0) || "U"}
              onClick={() => {
                playAside2Sound();
                currentUser?.photo && setSelectedImage(currentUser.photo);
              }}
            />

            {/* Кнопка-стрелочка для меню */}
            <button onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)} className="p-1 text-gray-400 hover:text-white transition-colors">
              <ChevronDown size={18} className={`transition-transform ${isProfileMenuOpen ? "rotate-180" : ""}`} />
            </button>

            {/* Выпадающее меню (позиционирование относительно общего контейнера) */}
            {isProfileMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIsProfileMenuOpen(false)} />
                <div className="absolute right-0 top-14 w-48 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-20 overflow-hidden">
                  <div className="px-4 py-2 border-b border-slate-800">
                    <p className="font-bold text-white truncate">{currentUser?.full_name.trim() || currentUser?.username}</p>
                    <p className="text-indigo-400">
                      {currentUser?.position || "Пользователь"} ({currentUser?.username})
                    </p>
                  </div>
                  <button onClick={openEditModal} className="w-full text-left px-4 py-2 text-gray-300 hover:bg-slate-800">
                    ✏️ Редактировать
                  </button>
                  <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-rose-500 hover:bg-slate-800">
                    🚪 Выйти
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <ImagePreview src={selectedImage} onClose={() => setSelectedImage(null)} />
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Редактирование профиля">
        <div className="space-y-4 p-4">
          {/* Поле для фото */}
          <input
            type="file"
            onChange={(e) => {
              // Безопасная проверка: есть ли событие, есть ли файлы, есть ли первый файл
              if (e.target.files && e.target.files.length > 0) {
                setFormData({ ...formData, photo: e.target.files[0] });
              }
            }}
          />

          <Input label="Имя" value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} />

          <Input label="Фамилия" value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} />

          <Input label="Телефон" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />

          <Input label="Должность" value={formData.position} onChange={(e) => setFormData({ ...formData, position: e.target.value })} />

          <Button text={mutation.isPending ? "Сохранение..." : "Сохранить"} disabled={mutation.isPending} onClick={handleSave} />
        </div>
      </Modal>
    </header>
  );
};

export default Header;
