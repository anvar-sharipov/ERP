import { motion, type Transition } from "framer-motion";

interface LoaderProps {
  size?: number; // Размер лоадера (в пикселях)
  dotSize?: number; // Размер точек
  color?: string; // Tailwind класс цвета (например, "bg-indigo-500")
  containerClass?: string; // Дополнительные классы для позиционирования
  // ✅ Текст под лоадером — что именно сейчас загружается (например "Загрузка отчёта...").
  // Не задан по умолчанию — старые вызовы без text выглядят точно так же, как раньше.
  text?: string;
  // ✅ Прогресс-бар — рендерится только если передан явно (не задан = нет бара,
  // старые вызовы без progress не ломаются). Число 0-100 — когда известна реальная
  // доля выполненной работы (например сколько из нескольких запросов уже завершилось).
  // "indeterminate" — когда посчитать долю не из чего (один запрос без подшагов), но
  // прогресс-бар всё равно нужен показать — рисуется бегущая анимированная полоса
  // вместо фиксированной ширины (см. CLAUDE.md: Loader с text+progress ставится везде).
  progress?: number | "indeterminate";
}

const ring = {
  animate: { scale: [1, 4], opacity: [0.6, 0] },
  transition: {
    duration: 1.8,
    ease: "easeOut",
    repeat: Infinity,
    times: [0, 1],
  } as Transition,
};

export const Loader = ({ size = 48, dotSize = 14, color = "bg-indigo-500", containerClass = "", text, progress }: LoaderProps) => (
  <div className={`flex flex-col items-center justify-center gap-3 ${containerClass}`}>
    {/* Используем style для динамических значений размера */}
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {[0, 0.6, 1.2].map((delay, i) => (
        <motion.div key={i} className={`absolute rounded-full ${color}`} style={{ width: dotSize, height: dotSize }} {...ring} transition={{ ...ring.transition, delay }} />
      ))}
      <div className={`relative rounded-full ${color} z-10`} style={{ width: dotSize, height: dotSize }} />
    </div>

    {text && <p className="text-sm text-gray-500 dark:text-gray-400">{text}</p>}

    {progress != null && (
      <div className="w-40 h-1.5 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
        {progress === "indeterminate" ? (
          <motion.div
            className={`h-full w-1/3 rounded-full ${color}`}
            animate={{ x: ["-100%", "300%"] }}
            transition={{ duration: 1.2, ease: "easeInOut", repeat: Infinity }}
          />
        ) : (
          <div className={`h-full rounded-full ${color} transition-all duration-300`} style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        )}
      </div>
    )}
  </div>
);



// // Маленький красный лоадер для кнопки
// <Loader size={20} dotSize={6} color="bg-red-500" />

// // Большой лоадер для страницы, сдвинутый вниз по центру
// <Loader size={100} dotSize={20} color="bg-emerald-500" containerClass="mx-auto mt-20" />

// // С текстом и прогресс-баром (реальный %, когда известно кол-во шагов/запросов)
// <Loader containerClass="mx-auto mt-20" text="Загрузка отчёта..." progress={60} />

// // С текстом и прогресс-баром, когда реальный % посчитать не из чего (один запрос)
// <Loader containerClass="mx-auto mt-20" text="Загрузка отчёта..." progress="indeterminate" />