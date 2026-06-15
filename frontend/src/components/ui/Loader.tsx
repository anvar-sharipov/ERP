import { motion, type Transition } from "framer-motion";

interface LoaderProps {
  size?: number; // Размер лоадера (в пикселях)
  dotSize?: number; // Размер точек
  color?: string; // Tailwind класс цвета (например, "bg-indigo-500")
  containerClass?: string; // Дополнительные классы для позиционирования
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

export const Loader = ({ size = 48, dotSize = 14, color = "bg-indigo-500", containerClass = "" }: LoaderProps) => (
  // Используем style для динамических значений размера
  <div className={`relative flex items-center justify-center ${containerClass}`} style={{ width: size, height: size }}>
    {[0, 0.6, 1.2].map((delay, i) => (
      <motion.div key={i} className={`absolute rounded-full ${color}`} style={{ width: dotSize, height: dotSize }} {...ring} transition={{ ...ring.transition, delay }} />
    ))}
    <div className={`relative rounded-full ${color} z-10`} style={{ width: dotSize, height: dotSize }} />
  </div>
);



// // Маленький красный лоадер для кнопки
// <Loader size={20} dotSize={6} color="bg-red-500" />

// // Большой лоадер для страницы, сдвинутый вниз по центру
// <Loader size={100} dotSize={20} color="bg-emerald-500" containerClass="mx-auto mt-20" />