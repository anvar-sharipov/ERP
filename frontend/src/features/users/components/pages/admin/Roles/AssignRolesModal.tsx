import { useState, useEffect } from "react"; // 1. Добавь useEffect
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rolesApi, usersApi } from "../../../../../accounting/services/usersApi";
import { Modal } from "../../../../../../components/ui/Modal/Modal";
import { Button } from "../../../../../../components/ui/Button";
import { useNotify } from "../../../../../../core/context/NotificationContext";

export const AssignRolesModal = ({ userId, isOpen, onClose, currentRoles }: any) => {
  // 2. Инициализируем пустым массивом
  const [selectedRoles, setSelectedRoles] = useState<number[]>([]);
  const queryClient = useQueryClient();
  const notify = useNotify();

  // 3. Добавляем эффект для сброса/обновления состояния при открытии модалки
  useEffect(() => {
    if (isOpen) {
      setSelectedRoles(currentRoles || []);
    }
  }, [isOpen, currentRoles]);

  const { data: allRoles } = useQuery({
    queryKey: ["roles"],
    queryFn: rolesApi.getRoles,
    staleTime: 1000 * 60 * 5
  });

  // const assignMutation = useMutation({
  //   mutationFn: (roles: number[]) => usersApi.assignRole(userId, roles),
  //   onSuccess: () => {
  //     queryClient.invalidateQueries({ queryKey: ["users"] });
  //     notify("success", "Role assigned successfully" );
  //     onClose();
  //   },
  // });

  const assignMutation = useMutation({
    mutationFn: (roles: number[]) => usersApi.assignRole(userId, roles),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      notify("success", "Role assigned successfully");
      onClose();
    },
    onError: (error: any) => {
      
      if (error._handled) return;
      notify("error", "Ошибка при назначении ролей");
    },
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Назначение ролей">
      <div className="space-y-4">
        {allRoles?.map((role: any) => (
          <label key={role.id} className="flex items-center gap-2 p-2 border rounded hover:bg-slate-50 cursor-pointer">
            <input
              type="checkbox"
              // Теперь selectedRoles будет актуален
              checked={selectedRoles.includes(role.id)}
              onChange={() => setSelectedRoles((prev) => (prev.includes(role.id) ? prev.filter((r) => r !== role.id) : [...prev, role.id]))}
            />
            {role.name}
          </label>
        ))}
        <div className="flex justify-end gap-2 mt-4">
          <Button text="Отмена" onClick={onClose} />
          <Button text="Сохранить" onClick={() => assignMutation.mutate(selectedRoles)} variant="danger" />
        </div>
      </div>
    </Modal>
  );
};
