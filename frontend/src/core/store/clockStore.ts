// frontend/src/core/store/clockStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ClockPosition {
  x: number
  y: number
}

interface ClockStore {
  visible: boolean
  // ✅ null — часы ни разу не позиционировались явно (первое включение без
  // anchorPosition) — FloatingClock.tsx сам выбирает дефолтную позицию.
  position: ClockPosition | null

  // anchorPosition — координаты кнопки-переключателя в хедере (см. Header.tsx),
  // передаются только при включении, чтобы часы появлялись ПОД кнопкой, а не
  // там, где их в прошлый раз утащили и выключили.
  toggle: (anchorPosition?: ClockPosition) => void
  setPosition: (pos: ClockPosition) => void
}

export const useClockStore = create<ClockStore>()(
  persist(
    (set) => ({
      visible: false,
      position: null,

      toggle: (anchorPosition) =>
        set((state) => {
          const nextVisible = !state.visible
          return nextVisible && anchorPosition
            ? { visible: true, position: anchorPosition }
            : { visible: nextVisible }
        }),

      setPosition: (pos) => set({ position: pos }),
    }),
    { name: 'erp-floating-clock' }
  )
)
