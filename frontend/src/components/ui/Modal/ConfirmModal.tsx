import { type ReactNode } from "react";
import { Trash2, CirclePlus, AlertTriangle, Info } from "lucide-react";

import { Modal } from "../Modal/Modal";
import { Button } from "../Button";

type ConfirmModalType = "create" | "delete" | "warning" | "info";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;

  title?: string;
  message: string;

  confirmText?: string;
  cancelText?: string;

  loading?: boolean;

  icon?: ReactNode;

  variant?: "primary" | "danger";

  type?: ConfirmModalType;
}

export const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,

  title = "Подтверждение",
  message,

  confirmText,
  cancelText = "Отмена",

  loading = false,

  icon,
  variant,

  type = "info",
}: ConfirmModalProps) => {
  const presets = {
    create: {
      icon: <CirclePlus className="w-8 h-8 text-green-500" />,
      variant: "primary" as const,
      confirmText: "Создать",
    },

    delete: {
      icon: <Trash2 className="w-8 h-8 text-red-500" />,
      variant: "danger" as const,
      confirmText: "Удалить",
    },

    warning: {
      icon: <AlertTriangle className="w-8 h-8 text-yellow-500" />,
      variant: "danger" as const,
      confirmText: "Продолжить",
    },

    info: {
      icon: <Info className="w-8 h-8 text-blue-500" />,
      variant: "primary" as const,
      confirmText: "Подтвердить",
    },
  };

  const current = presets[type];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="space-y-6">
        <div className="flex items-start gap-4">
          {icon || current.icon}

          <div>
            <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button text={cancelText} onClick={onClose} />

          <Button text={loading ? "Подождите..." : confirmText || current.confirmText} variant={variant || current.variant} onClick={onConfirm} />
        </div>
      </div>
    </Modal>
  );
};



// // primery
// Удаление пользователя:
// <ConfirmModal
//   isOpen={deleteModal}
//   type="delete"
//   title="Удаление пользователя"
//   message={`Удалить пользователя "${userToDelete?.username}"?`}
//   onClose={() => setDeleteModal(false)}
//   onConfirm={handleDelete}
// />


// Создание справочника:
// <ConfirmModal
//   isOpen={confirmModal}
//   type="create"
//   title="Создание справочника"
//   message={`Создать справочник "${name}"?`}
//   onClose={() => setConfirmModal(false)}
//   onConfirm={handleCreate}
// />


// Проведение документа:
// <ConfirmModal
//   isOpen={postModal}
//   type="warning"
//   title="Проведение документа"
//   message="После проведения остатки на складе будут изменены."
//   onClose={() => setPostModal(false)}
//   onConfirm={handlePost}
// />
