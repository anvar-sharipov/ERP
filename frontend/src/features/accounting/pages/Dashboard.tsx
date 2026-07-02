// import React from "react";
// import { api } from "../../../core/api/axiosInstance";
import { useSidebar } from "../../../core/context/SidebarRightContext";
import { useEffect } from "react";
import { useNotify } from "../../../core/context/NotificationContext";

const Dashboard = () => {
  const { setSidebarContent } = useSidebar();
  const notify = useNotify();

  const get_test = async () => {
    try {
      // const res = await api.get("/accounting/products/list/");
      // console.log("res", res);
    } catch (err: any) {
      if (!(err as any)._handled) {
        notify("error", "Произошла ошибка при загрузке данных");
      }
    }
  };
  useEffect(() => {
    // Явно очищаем сайдбар при входе на эту страницу
    setSidebarContent(null);
  }, [setSidebarContent]);

  return (
    <div>
      <button
        className="bg-red-400 w-16"
        onClick={() => {
          get_test();
          // console.log("i am cliccked");
        }}
      >
        click
      </button>
    </div>
  );
};

export default Dashboard;
