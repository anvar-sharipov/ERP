// frontend/src/core/context/CompanyContext.tsx
import React, { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { companyApi } from "../../features/accounting/services/companyApi";
import { getTenantInfo } from "../utils/tenant";

interface CompanyContextType {
  company: any;
  isLoading: boolean;
  error: any;
  refetch: () => void;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export const CompanyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isSubdomain } = getTenantInfo();

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
    enabled: isSubdomain, // ← запрос идёт только в зоне тенанта (поддомен компании)
  });

  const companyData = Array.isArray(company) ? company[0] : company;

  // return (
  //   <CompanyContext.Provider value={{ company: companyData, isLoading, error, refetch }}>
  //     {children}
  //   </CompanyContext.Provider>
  // );

  const value = useMemo(() => ({ company: companyData, isLoading, error, refetch }), [companyData, isLoading, error, refetch]);
  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
};

export const useCompany = () => {
  const context = useContext(CompanyContext);
  if (!context) throw new Error("useCompany must be used within CompanyProvider");
  return context;
};

