// frontend/src/core/hooks/useClosedPeriod.ts
import { useQuery } from '@tanstack/react-query'
import { closedPeriodApi } from '../../features/accounting/services/transactionApi'
import { useDateStore } from '../store/dateStore'

// Добавьте интерфейс для ответа API
interface ClosedPeriodResponse {
  date: string;
  is_closed: boolean;
  closed_period_id?: number | null; // Добавьте это поле
}

export const useClosedPeriod = (warehouseId?: number | null) => {
  const workDate = useDateStore(s => s.workDate)

  const { data, isLoading } = useQuery<ClosedPeriodResponse>({ // Явно указываем тип
    queryKey: ['closed-period-check', workDate, warehouseId],
    queryFn: () => closedPeriodApi.check(workDate, warehouseId as number).then(r => r.data),
    staleTime: 30_000,
    enabled: !!workDate && !!warehouseId,
    placeholderData: (previousData) => previousData,
  })

  return {
    isLoading,
    isClosed: data?.is_closed ?? false,
    closedPeriodId: data?.closed_period_id ?? null,
    workDate,
  }
}

// Проверка, закрыты ли ВСЕ склады филиала (для инфо-текста без конкретного warehouse)
export const useBranchWarehousesClosed = (warehouseIds: number[]) => {
  const workDate = useDateStore(s => s.workDate)

  const { data, isLoading } = useQuery({
    queryKey: ['closed-period-branch-check', workDate, warehouseIds],
    queryFn: () => closedPeriodApi.checkWarehouses(workDate, warehouseIds).then(r => r.data),
    staleTime: 30_000,
    enabled: !!workDate && warehouseIds.length > 0,
  })

  const closedCount = data?.length ?? 0
  const allClosed = warehouseIds.length > 0 && closedCount === warehouseIds.length

  return { isLoading, allClosed, workDate }
}
