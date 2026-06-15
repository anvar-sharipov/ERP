// frontend/src/components/ui/CompanyHeaderInfo.tsx
import React from 'react';

interface Props {
  logoUrl?: string | null;
  name?: string;
  className?: string;
}

export const CompanyHeaderInfo: React.FC<Props> = ({ logoUrl, name, className = "" }) => {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {logoUrl ? (
        <img 
          src={logoUrl} 
          alt="Company Logo" 
          className="h-10 w-10 object-contain rounded border border-gray-100" 
          style={{ backgroundColor: "white" }} 
        />
      ) : (
        <div className="w-10 h-10 flex items-center justify-center bg-gray-100 rounded text-gray-400 text-xs font-bold">
          {name?.substring(0, 2).toUpperCase() || "??"}
        </div>
      )}
      <span className="text-base font-bold text-gray-800 truncate">{name || "—"}</span>
    </div>
  );
};