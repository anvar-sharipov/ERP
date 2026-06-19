// src/core/store/dateStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface DateStore {
  // Рабочая дата — подставляется во все новые документы
  workDate: string

  // Период отчётов
  periodFrom: string
  periodTo:   string

  setWorkDate:   (date: string) => void
  setPeriodFrom: (date: string) => void
  setPeriodTo:   (date: string) => void
  setPeriod:     (from: string, to: string) => void

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
      workDate:   today(),
      periodFrom: firstDayOfMonth(),
      periodTo:   today(),

      setWorkDate:   (date) => set({ workDate: date }),
      setPeriodFrom: (date) => set({ periodFrom: date }),
      setPeriodTo:   (date) => set({ periodTo: date }),
      setPeriod:     (from, to) => set({ periodFrom: from, periodTo: to }),

      setCurrentMonth: () => set({ periodFrom: firstDayOfMonth(), periodTo: today() }),
      setCurrentYear:  () => set({ periodFrom: firstDayOfYear(),  periodTo: today() }),
      setCurrentDay:   () => set({ periodFrom: today(),           periodTo: today() }),
    }),
    { name: 'erp-dates' }  // сохраняется в localStorage
  )
)