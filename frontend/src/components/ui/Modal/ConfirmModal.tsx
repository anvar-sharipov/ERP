import { type ReactNode } from "react";
import { Trash2, CirclePlus, AlertTriangle, Info } from "lucide-react";

import { Modal } from "../Modal/Modal";
import { Button } from "../Button";
import { useTranslation } from "react-i18next";

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
  cancelText = "Cancel",

  loading = false,

  icon,
  variant,

  type = "info",
}: ConfirmModalProps) => {
  const { t } = useTranslation();
  const presets = {
    create: {
      icon: <CirclePlus className="w-8 h-8 text-green-500" />,
      variant: "primary" as const,
      confirmText: "Create",
    },

    delete: {
      icon: <Trash2 className="w-8 h-8 text-red-500" />,
      variant: "danger" as const,
      confirmText: "Delete",
    },

    warning: {
      icon: <AlertTriangle className="w-8 h-8 text-yellow-500" />,
      variant: "danger" as const,
      confirmText: "Continue",
    },

    info: {
      icon: <Info className="w-8 h-8 text-blue-500" />,
      variant: "primary" as const,
      confirmText: "Confirm",
    },
  };

  const current = presets[type];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t(title)} size="sm">
      <div className="space-y-6">
        <div className="flex items-start gap-4">
          {icon || current.icon}

          <div>
            <p className="text-sm text-slate-600 dark:text-slate-300">{t(message)}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button text={t(cancelText)} onClick={onClose} />

          <Button text={loading ? t("PleaseWait") : confirmText ? t(confirmText) : t(current.confirmText)} variant={variant || current.variant} onClick={onConfirm} />
        </div>
      </div>
    </Modal>
  );
};
