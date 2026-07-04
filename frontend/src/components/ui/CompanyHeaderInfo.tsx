// frontend/src/components/ui/CompanyHeaderInfo.tsx
import React from "react";

interface BranchInfo {
  name?: string;
  logo?: string | null;
  address?: string;
  phone?: string;
  email?: string;
  manager_name?: string;
}

interface Props {
  logoUrl?: string | null;
  name?: string;
  branch?: BranchInfo | null;
  className?: string;
}

export const CompanyHeaderInfo: React.FC<Props> = ({ logoUrl, name, branch, className = "" }) => {
  // Branch перекрывает лого и название (название филиала вместо названия компании)
  const effectiveLogo = branch?.logo ?? logoUrl;
  const effectiveName = branch?.name ? `${name ?? ""} — ${branch.name}` : name;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {effectiveLogo ? (
        <img src={effectiveLogo} alt="Company Logo" className="h-10 w-10 object-contain rounded border border-gray-100" style={{ backgroundColor: "white" }} />
      ) : (
        <div className="w-10 h-10 flex items-center justify-center bg-gray-100 rounded text-gray-400 text-xs font-bold">{(branch?.name || name)?.substring(0, 2).toUpperCase() || "??"}</div>
      )}
      <div className="flex flex-col">
        <span className="text-base font-bold text-gray-800 truncate">{effectiveName || "—"}</span>
        {branch?.address && <span className="text-xs text-gray-500 truncate">{branch.address}</span>}
      </div>
    </div>
  );
};
