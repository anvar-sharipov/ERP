// src/core/hooks/useInitScope.ts
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDateStore } from '../store/dateStore'
import { userScopeApi } from '../../features/accounting/services/transactionApi'

/**
 * Вызывается один раз при старте приложения.
 * Загружает доступные branch/warehouse из my-scope
 * и подставляет их в dateStore если там ещё ничего нет.
 */
export const useInitScope = () => {
  const { workBranch, workWarehouse, setWorkBranch, setWorkWarehouse } = useDateStore()

  const { data: scope } = useQuery({
    queryKey: ['my-scope'],
    queryFn:  () => userScopeApi.getMyScope().then(r => r.data),
    staleTime: 60_000,
  })

  useEffect(() => {
    if (!scope) return

    // Если в store уже есть значения — проверяем что они валидны для текущего scope
    const validBranches   = scope.branches.map(b => b.id)
    const validWarehouses = scope.warehouses.map(w => w.id)

    // Если текущий branch не входит в доступные — сбрасываем
    if (workBranch && validBranches.length > 0 && !validBranches.includes(workBranch.id)) {
      setWorkBranch(null)
      setWorkWarehouse(null)
      return
    }

    // Если текущий warehouse не входит в доступные — сбрасываем
    if (workWarehouse && validWarehouses.length > 0 && !validWarehouses.includes(workWarehouse.id)) {
      setWorkWarehouse(null)
      return
    }

    // Если в store ничего нет — подставляем первый доступный
    if (!workBranch && scope.branches.length > 0) {
      const firstBranch = scope.branches[0]
      setWorkBranch({ id: firstBranch.id, name: firstBranch.name })

      // Подставляем первый склад этого филиала
      const firstWarehouse = scope.warehouses.find(w => (w as any).branch === firstBranch.id)
        ?? scope.warehouses[0]
      if (firstWarehouse) {
        setWorkWarehouse({ id: firstWarehouse.id, name: firstWarehouse.name })
      }
      return
    }

    if (!workWarehouse && scope.warehouses.length > 0) {
      const firstWarehouse = workBranch
        ? scope.warehouses.find(w => (w as any).branch === workBranch.id) ?? scope.warehouses[0]
        : scope.warehouses[0]
      if (firstWarehouse) {
        setWorkWarehouse({ id: firstWarehouse.id, name: firstWarehouse.name })
      }
    }
  }, [scope])
}