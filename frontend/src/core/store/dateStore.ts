// src/core/store/dateStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface WorkScope {
  id:   number
  name: string
}

interface DateStore {
  // Рабочая дата — подставляется во все новые документы
  workDate: string

  // Период отчётов
  periodFrom: string
  periodTo:   string

  // Рабочий филиал и склад — подставляются во все новые документы
  workBranch:    WorkScope | null
  workWarehouse: WorkScope | null

  setWorkDate:      (date: string) => void
  setPeriodFrom:    (date: string) => void
  setPeriodTo:      (date: string) => void
  setPeriod:        (from: string, to: string) => void
  setWorkBranch:    (branch: WorkScope | null) => void
  setWorkWarehouse: (warehouse: WorkScope | null) => void

  // Быстрые пресеты периода
  setCurrentMonth: () => void
  setCurrentYear:  () => void
  setCurrentDay:   () => void
}

const today = () => new Date().toISOString().slice(0, 10)

const firstDayOfMonth = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

const firstDayOfYear = () => {
  const d = new Date()
  return new Date(d.getFullYear(), 0, 1).toISOString().slice(0, 10)
}

export const useDateStore = create<DateStore>()(
  persist(
    (set) => ({
      workDate:      today(),
      periodFrom:    firstDayOfMonth(),
      periodTo:      today(),
      workBranch:    null,
      workWarehouse: null,

      setWorkDate:      (date)      => set({ workDate: date }),
      setPeriodFrom:    (date)      => set({ periodFrom: date }),
      setPeriodTo:      (date)      => set({ periodTo: date }),
      setPeriod:        (from, to)  => set({ periodFrom: from, periodTo: to }),
      setWorkBranch:    (branch)    => set({ workBranch: branch, workWarehouse: null }),
      setWorkWarehouse: (warehouse) => set({ workWarehouse: warehouse }),

      setCurrentMonth: () => set({ periodFrom: firstDayOfMonth(), periodTo: today() }),
      setCurrentYear:  () => set({ periodFrom: firstDayOfYear(),  periodTo: today() }),
      setCurrentDay:   () => set({ periodFrom: today(),           periodTo: today() }),
    }),
    { name: 'erp-dates' }
  )
)