// frontend/src/components/ui/UserProfileBlock.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { Avatar } from "./Avatar";
import { ImagePreview } from "./ImagePreview";
import { Modal } from "./Modal/Modal";
import { Button } from "./Button";
import { Input } from "./Input";
import { useUser } from "../../core/context/UserContext";
import { useNotify } from "../../core/context/NotificationContext";
import { updateProfile } from "../../features/users/services/userApi";
import { logoutRequest } from "../../features/auth/services/authApi";
import { playAside2Sound } from "../../core/utils/sound";
import { ROUTES } from "../../core/router/routes";

interface UserProfileBlockProps {
  showName?: boolean;
  variant?: "inline" | "dropdown" | "header-inline";
}

export const UserProfileBlock: React.FC<UserProfileBlockProps> = ({ showName = true, variant = "inline" }) => {
  const { user: currentUser } = useUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notify = useNotify();
  // console.log("photo_thumbnail:", currentUser?.photo_thumbnail);

  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    position: "",
    photo: null as File | null,
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) => updateProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-me"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setIsEditModalOpen(false);
      notify("success", "Профиль обновлен!");
    },
    onError: (error: any) => {
      if (error._handled) return;
      notify("error", "Ошибка при обновлении профиля");
    },
  });

  const openEditModal = () => {
    if (currentUser) {
      setFormData({
        first_name: currentUser.first_name,
        last_name: currentUser.last_name,
        phone: currentUser.phone,
        position: currentUser.position || "",
        photo: null,
      });
    }
    setMenuOpen(false);
    setIsEditModalOpen(true);
  };

  const handleSave = () => {
    const data = new FormData();
    data.append("first_name", formData.first_name);
    data.append("last_name", formData.last_name);
    data.append("phone", formData.phone);
    data.append("position", formData.position);
    if (formData.photo) data.append("photo", formData.photo);
    mutation.mutate(data);
  };

  const handleLogout = async () => {
    await logoutRequest();
    queryClient.clear();
    navigate(ROUTES.AUTH.LOGIN, { replace: true });
  };

  const avatarSrc = currentUser?.photo_thumbnail || currentUser?.photo ? `${currentUser.photo_thumbnail || currentUser.photo}?t=${Date.now()}` : null;

  // ── Общий блок модалок ─────────────────────────────────────────────────────
  const modals = (
    <>
      <ImagePreview src={selectedImage} onClose={() => setSelectedImage(null)} />
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Редактирование профиля">
        <div className="space-y-4 p-4">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              if (e.target.files?.[0]) {
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
    </>
  );

  // ── header-inline: аватар + имя + кнопки прямо в хедере ───────────────────
  if (variant === "header-inline") {
    return (
      <>
        <div className="flex items-center gap-2">
          <div className="shrink-0">
            <Avatar
              src={avatarSrc}
              fallbackText={currentUser?.username?.charAt(0) || "U"}
              onClick={() => {
                playAside2Sound();
                if (currentUser?.photo) setSelectedImage(currentUser.photo);
              }}
            />
          </div>

          <div className="flex flex-col min-w-0">
            <span className="text-white font-bold truncate max-w-[140px]">{currentUser?.full_name?.trim() || currentUser?.username}</span>
            <span className="text-indigo-400 text-[10px]">{currentUser?.position || "Пользователь"}</span>
          </div>

          <div className="flex items-center gap-0.5 ml-1">
            <button onClick={openEditModal} title="Редактировать профиль" className="p-1.5 text-gray-400 hover:text-white hover:bg-slate-700 rounded transition-colors">
              ✏️
            </button>
            <button onClick={handleLogout} title="Выйти" className="p-1.5 text-gray-400 hover:text-rose-400 hover:bg-slate-700 rounded transition-colors">
              🚪
            </button>
          </div>
        </div>
        {modals}
      </>
    );
  }

  // ── dropdown: аватар + выпадающее меню ────────────────────────────────────
  if (variant === "dropdown") {
    return (
      <>
        <div className="relative flex items-center gap-1">
          <div className="shrink-0">
            <Avatar
              src={avatarSrc}
              fallbackText={currentUser?.username?.charAt(0) || "U"}
              onClick={() => {
                playAside2Sound();
                if (currentUser?.photo) setSelectedImage(currentUser.photo);
              }}
            />
          </div>

          <button onClick={() => setMenuOpen((v) => !v)} className="p-1 text-gray-400 hover:text-white transition-colors">
            <ChevronDown size={18} className={`transition-transform ${menuOpen ? "rotate-180" : ""}`} />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-10 w-52 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-20 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800">
                  <p className="font-bold text-white truncate">{currentUser?.full_name?.trim() || currentUser?.username}</p>
                  <p className="text-indigo-400 text-xs mt-0.5">
                    {currentUser?.position || "Пользователь"} ({currentUser?.username})
                  </p>
                </div>
                <button onClick={openEditModal} className="w-full text-left px-4 py-2 text-gray-300 hover:bg-slate-800 transition-colors">
                  ✏️ Редактировать
                </button>
                <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-rose-500 hover:bg-slate-800 transition-colors">
                  🚪 Выйти
                </button>
              </div>
            </>
          )}
        </div>
        {modals}
      </>
    );
  }

  // ── inline: сайдбар ────────────────────────────────────────────────────────
  return (
    <>
      <div className="flex items-center gap-2 px-1 py-1">
        <div className="shrink-0">
          <Avatar
            src={avatarSrc}
            fallbackText={currentUser?.username?.charAt(0) || "U"}
            onClick={() => {
              playAside2Sound();
              if (currentUser?.photo) setSelectedImage(currentUser.photo);
            }}
          />
        </div>
        {showName && (
          <div className="flex flex-col min-w-0">
            <span className="text-white text-xs font-bold truncate">{currentUser?.full_name?.trim() || currentUser?.username}</span>
            <span className="text-indigo-400 text-[10px]">{currentUser?.position || "Пользователь"}</span>
          </div>
        )}
      </div>

      <button onClick={openEditModal} className="flex items-center gap-2 px-2 py-1.5 text-gray-300 hover:bg-slate-700 rounded transition-colors w-full">
        <span>✏️</span>
        <span>Редактировать</span>
      </button>

      <button onClick={handleLogout} className="flex items-center gap-2 px-2 py-1.5 text-rose-400 hover:bg-slate-700 rounded transition-colors w-full">
        <span>🚪</span>
        <span>Выйти</span>
      </button>

      {modals}
    </>
  );
};
