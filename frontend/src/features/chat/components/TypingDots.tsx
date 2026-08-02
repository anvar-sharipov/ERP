// frontend/src/features/chat/components/TypingDots.tsx
import { motion } from "framer-motion";

const DOT_COUNT = 3;

export const TypingDots: React.FC = () => {
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: DOT_COUNT }).map((_, i) => (
        <motion.span
          key={i}
          className="w-1 h-1 rounded-full bg-[#3390ec] dark:bg-[#6ab2f2]"
          animate={{ y: [0, -3, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
};
