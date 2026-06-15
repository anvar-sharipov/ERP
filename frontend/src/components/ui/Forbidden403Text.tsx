// frontend/src/components/ui/Forbidden403Text.tsx

// Описываем интерфейс пропсов
interface Forbidden403TextProps {
  isForbidden: boolean;
  error?: Error | null; // Делаем необязательным, так как при 403 ошибка может быть не нужна
  text? : String | "";
}

const Forbidden403Text = ({ isForbidden, error, text="" }: Forbidden403TextProps) => {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-6xl mb-4">🛡️</div>
      <h2 className="text-xl font-bold text-gray-800">
        {isForbidden ? "Доступ ограничен" : "Ошибка загрузки"}
      </h2>
      <p className="text-gray-500 mt-2">
        {isForbidden 
          ? `${text}.` 
          : `Произошла ошибка: ${error?.message || "Неизвестная ошибка"}`}
      </p>
    </div>
  );
};

export default Forbidden403Text;