import { useEffect } from "react";
import { useSidebar } from "../../../../core/context/SidebarRightContext";

const AnalyticsPage = () => {
  const { setSidebarContent } = useSidebar();

  useEffect(() => {
    setSidebarContent(null);
  }, [setSidebarContent]);

  return <div>AnalyticsPage</div>;
};

export default AnalyticsPage;
