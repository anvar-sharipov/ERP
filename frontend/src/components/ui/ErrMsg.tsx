interface StatusMessageProps {
  error: any; // Сюда передаем весь объект ошибки
  defaultText?: string;
}

const ErMeg = ({ error, defaultText = "Недостаточно прав" }: StatusMessageProps) => {
  const isForbidden = error?.response?.status === 403;
  
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-6xl mb-4">{isForbidden ? "🛡️" : "⚠️"}</div>
      <h2 className="text-xl font-bold text-gray-800">
        {isForbidden ? "Доступ ограничен" : "Ошибка загрузки"}
      </h2>
      <p className="text-gray-500 mt-2">
        {isForbidden ? defaultText : (error?.message || "Произошла непредвиденная ошибка")}
      </p>
    </div>
  );
};

export default ErMeg;