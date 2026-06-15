// src/components/ui/Badge.tsx
interface BadgeProps {
  text?: string;
  emptyText?: string;
  text_position?: string;
}

export const Badge = ({ text, emptyText="Нет ролей", text_position="center" }: BadgeProps) => {
  if (!text) {
    return <span className="text-gray-400 dark:text-gray-500 text-xs italic">{emptyText}</span>;
  }

  return (
    <div className={`flex flex-wrap gap-1  justify-${text_position}`}>

        <span className={`px-2 py-1 text-xs bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-300 rounded-full font-medium`}>
          {text}
        </span>

    </div>
  );
};
