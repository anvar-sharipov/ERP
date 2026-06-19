import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { directoryApi } from "../../services/directoryApi";

import { useNotify } from "../../../../core/context/NotificationContext";
import { slugify } from "../../../../core/utils/slugify";
import { DIRECTORY_ICONS } from "../../../../core/utils/icons";
import { ColorPicker } from "../../../../components/ui/Icon/ColorPicker";

import { Input } from "../../../../components/ui/Input";
import { Button } from "../../../../components/ui/Button";
import { ConfirmModal } from "../../../../components/ui/Modal/ConfirmModal";
import { TextArea } from "../../../../components/ui/TextArea";
import { IconPicker } from "../../../../components/ui/Icon/IconPicker";
import { useSidebar } from "../../../../core/context/SidebarRightContext";
import { usePageAccess } from "../../../../core/hooks/usePageAccess";

interface DirectoryFormData {
  name: string;
  slug: string;
  icon: string;
  color: string;
  description: string;
  is_active: boolean;
}

const CreateDirectoryPage = () => {
  const queryClient = useQueryClient();
  const notify = useNotify();

  const { canPost } = usePageAccess("directory");

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [icon, setIcon] = useState("Warehouse");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [color, setColor] = useState("#3b82f6");

  const [nameSlugEdited, setNameSlugEdited] = useState(false);

  const [confirmModal, setConfirmModal] = useState(false);
  const { setSidebarContent } = useSidebar();

  const saveMutation = useMutation({
    mutationFn: (data: DirectoryFormData) => {
      if (!canPost) throw new Error("У вас нет прав на редактирование");
      return directoryApi.saveDirectory(null, data);
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["directories"],
      });

      notify("success", "Справочник успешно создан");

      setName("");
      setSlug("");
      setDescription("");
      setIcon("Warehouse");
      setColor("#3b82f6");
      setIsActive(true);
      setNameSlugEdited(false);
    },

    onError: (err: any) => {
      const msg = err.response?.data?.detail || "Ошибка сохранения";

      notify("error", msg);
    },
  });

  useEffect(() => {
    setSidebarContent(<div>CreateDirectory</div>);
  }, [setSidebarContent]);

  return (
    <div>
      <div className="rounded-xl bg-white dark:bg-slate-900 p-6 shadow">
        <h1 className="text-2xl font-bold mb-6">Создание справочника</h1>

        <div className="space-y-4">
          <Input
            label="Название"
            value={name}
            onChange={(e) => {
              const value = e.target.value;

              setName(value);

              if (!nameSlugEdited) {
                setSlug(slugify(value));
              }
            }}
          />
          <Input
            label="Slug"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setNameSlugEdited(true);
            }}
          />
          <TextArea label="Описание" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Введите описание справочника..." />
          <ColorPicker selectedColor={color} onSelect={setColor} />
          
          <IconPicker label="Иконка справочника" options={DIRECTORY_ICONS} selectedIcon={icon} onSelect={setIcon} />
          <div className="flex justify-end">
            <Button disabled={!canPost} text={saveMutation.isPending ? "Создание..." : "Создать справочник"} onClick={() => setConfirmModal(true)} />
          </div>
        </div>
      </div>

      {/* MODAL CONFIRM */}
      <ConfirmModal
        isOpen={confirmModal}
        type="create"
        title="Создание справочника"
        message={`Создать справочник "${name}"?`}
        onClose={() => setConfirmModal(false)}
        onConfirm={() => {
          saveMutation.mutate({
            name,
            slug,
            icon,
            color,
            description,
            is_active: isActive,
          });

          setConfirmModal(false);
        }}
      />
    </div>
  );
};

export default CreateDirectoryPage;
