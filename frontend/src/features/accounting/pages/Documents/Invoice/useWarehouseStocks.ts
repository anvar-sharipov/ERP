// frontend/src/features/accounting/pages/Documents/Invoice/useWarehouseStocks.ts
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../../../core/api/axiosInstance";

export interface StockInfo {
  quantity:  number;
  reserved:  number;
  available: number;
}

// Map: product_id → StockInfo
export type StockMap = Map<number, StockInfo>;

const fetchStocksMap = async (warehouseId: number): Promise<StockMap> => {
  const res = await api.get(`/accounting/products/stocks-map/?warehouse=${warehouseId}`);
  const data: Record<string, StockInfo> = res.data;
  return new Map(
    Object.entries(data).map(([id, info]) => [Number(id), info])
  );
};

export const useWarehouseStocks = (warehouseId: number | null) => {
  const { data: stockMap = new Map() } = useQuery<StockMap>({
    queryKey: ["stocks-map", warehouseId],
    queryFn:  () => fetchStocksMap(warehouseId!),
    enabled:  !!warehouseId,
    staleTime: 30_000, // 30 сек — не дёргаем при каждом рендере
  });

  return stockMap;
};