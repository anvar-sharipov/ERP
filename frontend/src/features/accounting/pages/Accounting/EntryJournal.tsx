import { useEffect } from "react";
import { useSidebar } from "../../../../core/context/SidebarRightContext";

const EntryJournal = () => {
  const { setSidebarContent } = useSidebar();

  useEffect(() => {
    setSidebarContent(null);
  }, [setSidebarContent]);

  return <div>EntryJournal</div>;
};

export default EntryJournal;
