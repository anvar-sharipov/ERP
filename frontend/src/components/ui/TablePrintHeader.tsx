// frontend/src/components/ui/TablePrintHeader.tsx
import { CompanyHeaderInfo } from "./CompanyHeaderInfo";


export const TablePrintHeader = ({ companyName, logoUrl, userName, userPosition }: any) => {
  return (
    <div className="hidden print:flex print:justify-between print:mb-4 print:border-b print:pb-2">
      <CompanyHeaderInfo logoUrl={logoUrl} name={companyName} />
      
      <div className="text-right text-xs">
        <p><strong>{userName}</strong></p>
        <p className="text-gray-500">{userPosition}</p>
      </div>
    </div>
  );
};