// src/core/hooks/useClosedPeriod.ts
import { useQuery } from '@tanstack/react-query'
import { closedPeriodApi } from '../../features/accounting/services/transactionApi'
import { useDateStore } from '../store/dateStore'

export const useClosedPeriod = () => {
  const workDate = useDateStore(s => s.workDate)

  const { data, isLoading } = useQuery({
    queryKey: ['closed-period-check', workDate],
    queryFn:  () => closedPeriodApi.check(workDate).then(r => r.data),
    staleTime: 30_000,
  })

  return {
    isLoading,
    isClosed: data?.is_closed ?? false,
    workDate,
  }
}

// // src/core/hooks/useClosedPeriod.ts
// import { useQuery } from '@tanstack/react-query'
// import { api } from '../api/axiosInstance'
// import { useDateStore } from '../store/dateStore'

// interface CheckResult {
//   date:      string
//   is_closed: boolean
// }

// export const useClosedPeriod = () => {
//   const workDate = useDateStore(s => s.workDate)

//   const { data, isLoading } = useQuery({
//     queryKey: ['closed-period-check', workDate],
//     queryFn:  () =>
//       api.get<CheckResult>(`/accounting/closed-periods/check/`, {
//         params: { date: workDate }
//       }).then(r => r.data),
//     staleTime: 30_000,
//   })

//   return {
//     isLoading,
//     isClosed:  data?.is_closed ?? false,
//     workDate,
//   }
// }