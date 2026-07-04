interface AvatarProps {
  src?: string | null;
  fallbackText: string;
  onClick?: () => void;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  rounded?: boolean;
}

export const Avatar = ({ src, fallbackText, onClick, size = "sm", rounded = false }: AvatarProps) => {
  const sizeClass = {
    xs: "w-6 h-6 text-xs",
    sm: "w-8 h-8 text-xs",
    md: "w-12 h-12 text-sm",
    lg: "w-16 h-16 text-base",
    xl: "w-20 h-20 text-lg",
    "2xl": "w-24 h-24 text-xl",
  }[size];

  const roundedClass = rounded ? "rounded-full" : "rounded";

  return (
    <div className="flex justify-center">
      {src ? (
        <img
          src={src}
          loading="lazy"
          className={`${sizeClass} ${roundedClass} cursor-pointer hover:opacity-80 hover:scale-105 transition object-cover border border-gray-200`}
          onClick={onClick}
        />
      ) : (
        <div
          className={`${sizeClass} ${roundedClass} bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 flex items-center justify-center font-bold border border-indigo-200 dark:border-indigo-700 cursor-pointer`}
          onClick={onClick}
        >
          {fallbackText.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
};
