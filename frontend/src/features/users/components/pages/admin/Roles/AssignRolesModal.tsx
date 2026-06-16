import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rolesApi } from "../../../../../accounting/services/rolesApi";
import { usersApi } from "../../../../services/userApi";
import { Modal } from "../../../../../../components/ui/Modal/Modal";
import { Button } from "../../../../../../components/ui/Button";
import { useNotify } from "../../../../../../core/context/NotificationContext";
import { useTranslation } from "react-i18next";

export const AssignRolesModal = ({ userId, isOpen, onClose, currentRoles }: any) => {
  const { t } = useTranslation();
  const [selectedRoles, setSelectedRoles] = useState<number[]>([]);
  const queryClient = useQueryClient();
  const notify = useNotify();

  useEffect(() => {
    if (isOpen) {
      setSelectedRoles(currentRoles || []);
    }
  }, [isOpen, currentRoles]);

  const { data: allRoles } = useQuery({
    queryKey: ["roles"],
    queryFn: rolesApi.getRoles,
    staleTime: 1000 * 60 * 5,
  });

  const assignMutation = useMutation({
    mutationFn: (roles: number[]) => usersApi.assignRole(userId, roles),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      notify("success", t("Success"));
      onClose();
    },
    onError: (error: any) => {
      if (error._handled) return;
      notify("error", t("Error"));
    },
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("Title")}>
      <div className="space-y-4">
        {allRoles?.map((role: any) => (
          <label key={role.id} className="flex items-center gap-2 p-2 border rounded hover:bg-slate-50 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedRoles.includes(role.id)}
              onChange={() => setSelectedRoles((prev) => (prev.includes(role.id) ? prev.filter((r) => r !== role.id) : [...prev, role.id]))}
            />
            {role.name}
          </label>
        ))}
        <div className="flex justify-end gap-2 mt-4">
          <Button text={t("Cancel")} onClick={onClose} />
          <Button text={t("Save")} onClick={() => assignMutation.mutate(selectedRoles)} variant="danger" />
        </div>
      </div>
    </Modal>
  );
};
