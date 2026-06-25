// src/core/hooks/useClosedPeriod.ts
import { useQuery } from '@tanstack/react-query'
import { closedPeriodApi } from '../../features/accounting/services/transactionApi'
import { useDateStore } from '../store/dateStore'

interface UseClosedPeriodOptions {
  branch?:    number | null
  warehouse?: number | null
}

export const useClosedPeriod = (options?: UseClosedPeriodOptions) => {
  const workDate = useDateStore(s => s.workDate)

  const { data, isLoading } = useQuery({
    queryKey: ['closed-period-check', workDate, options?.branch, options?.warehouse],
    queryFn:  () => closedPeriodApi.check(workDate, options).then(r => r.data),
    staleTime: 30_000,
    enabled: !!workDate,  // ← добавь это
  })

  return {
    isLoading,
    isClosed: data?.is_closed ?? false,
    workDate,
  }
}