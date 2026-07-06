// src/core/store/authStore.ts
import { create } from "zustand";

// ✅ Раньше UserContext.tsx проверял авторизацию через прямое чтение
// localStorage.getItem("access_token") внутри enabled у useQuery — это НЕ
// реактивно: React Query перезапускает запрос при изменении enabled только
// когда компонент, читающий его, реально перерендеривается с новым значением.
// localStorage сам по себе не триггерит рендер, поэтому после логина/логаута
// в той же вкладке (без полной перезагрузки страницы) enabled оставался
// "залипшим" на предыдущем значении — permissions/scope и данные хедера не
// обновлялись, пока не сделаешь F5 (что ремонтирует всё дерево заново).
// Теперь Login.tsx/logout-хендлеры явно вызывают setAuthenticated(...), это
// вызывает ре-рендер любого компонента, подписанного на этот store (в первую
// очередь UserProvider), и React Query подхватывает изменение enabled сразу.
interface AuthState {
  isAuthenticated: boolean;
  setAuthenticated: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: !!localStorage.getItem("access_token"),
  setAuthenticated: (value) => set({ isAuthenticated: value }),
}));
