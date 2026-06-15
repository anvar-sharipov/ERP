// 1. Определяем интерфейс для пропсов
interface FieldRendererProps {
  field: {
    name: string;
    field_type: "text" | "number" | "boolean";
    slug: string;
  };
  value: any;
  onChange: (val: any) => void;
}

// 2. Добавляем типы при деструктуризации
export const FieldRenderer = ({ field, value, onChange }: FieldRendererProps) => {
  const commonClasses = "w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none";

  if (field.field_type === "number") {
    return <input type="number" className={commonClasses} value={value ?? ""} onChange={(e) => onChange(Number(e.target.value))} />;
  }

  if (field.field_type === "boolean") {
    return <input type="checkbox" className="h-5 w-5" checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
  }

  // По умолчанию — текст
  return <input type="text" className={commonClasses} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
};
