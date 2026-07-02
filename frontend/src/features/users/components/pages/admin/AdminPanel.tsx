// frontend/src/features/users/components/pages/admin/AdminPanel.tsx
import { useEffect, useState } from "react";
import { useSidebar } from "../../../../../core/context/SidebarRightContext";

const AdminPanel = () => {
  const { setSidebarContent } = useSidebar();

  const [tabUsers, setTabUsers] = useState(false);
  const [tabRoles, setTabRoles] = useState(false);

  // В любой странице
  useEffect(() => {
    setSidebarContent(
      <>
        {/* Секция 1: Заголовок + Карточка */}
        <div>
          <h4 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-2">Управление</h4>
          <div className="p-3 bg-indigo-900/20 border border-indigo-500/20 rounded-lg shadow-sm backdrop-blur-sm">{/* Контент */}</div>
        </div>

        <div
          onClick={() => {
            setTabUsers(true);
            setTabRoles(false);
          }}
        >
          Polzowateli
        </div>
        <div
          onClick={() => {
            setTabRoles(true);
            setTabUsers(false);
          }}
        >
          Roli
        </div>
      </>,
    );
  }, []);

  return (
    <div className="p-6">
      {tabUsers && <div>polzowateli</div>}

      {tabRoles && <div>Roli</div>}
    </div>
  );
};

export default AdminPanel;
