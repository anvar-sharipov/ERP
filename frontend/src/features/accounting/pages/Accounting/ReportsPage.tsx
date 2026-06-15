import { useEffect } from "react";
import { useSidebar } from "../../../../core/context/SidebarRightContext";

const ReportsPage = () => {
  const { setSidebarContent } = useSidebar();

  useEffect(() => {
    setSidebarContent(null);
  }, [setSidebarContent]);

  return <div>ReportsPage</div>;
};

export default ReportsPage;
