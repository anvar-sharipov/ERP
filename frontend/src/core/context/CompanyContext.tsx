import React, { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { companyApi } from "../../features/accounting/services/usersApi";

interface CompanyContextType {
  company: any;
  isLoading: boolean;
  error: any; // ← Добавили ошибку
  refetch: () => void;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export const CompanyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const {
    data: company,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["company-profile"],
    queryFn: companyApi.getCompany,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  // Если API возвращает массив (как мы видели раньше),
  // часто удобнее сразу достать первый элемент:
  const companyData = Array.isArray(company) ? company[0] : company;

  return <CompanyContext.Provider value={{ company: companyData, isLoading, error, refetch }}>{children}</CompanyContext.Provider>;
};

export const useCompany = () => {
  const context = useContext(CompanyContext);
  if (!context) throw new Error("useCompany must be used within CompanyProvider");
  return context;
};
