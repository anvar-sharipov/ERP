import React, { useState } from "react";
import { FieldRenderer } from "./FieldRenderer";

// 1. Определяем интерфейс (лучше вынести в отдельный файл типов)
interface DirectoryRecord {
  id: number;
  name: string;
  data: Record<string, any>; // Для динамических полей
}

interface FieldDefinition {
  name: string;
  field_type: "text" | "number" | "boolean";
  slug: string;
}

interface DirectoryDefinition {
  id: number;
  name: string;
  fields: FieldDefinition[];
}

// Mock-данные для списка всех доступных справочников
const ALL_DIRECTORIES: DirectoryDefinition[] = [
  {
    id: 1,
    name: "Склады",
    fields: [
      { name: "Адрес", field_type: "text", slug: "adres" },
      { name: "Вместимость", field_type: "number", slug: "vmestimost" },
    ],
  },
  {
    id: 2,
    name: "Контрагенты",
    fields: [
      { name: "ИНН", field_type: "number", slug: "inn" },
      { name: "Телефон", field_type: "text", slug: "phone" },
    ],
  },
];

const DirectiryPage = () => {
  const [directories] = useState(ALL_DIRECTORIES);
  const [activeDir, setActiveDir] = useState(ALL_DIRECTORIES[0]);
  const [records, setRecords] = useState<DirectoryRecord[]>([]);
  const [formData, setFormData] = useState<Record<string, any>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newRecord = { id: Date.now(), name: formData.name || "Новая запись", data: { ...formData } };
    setRecords([...records, newRecord]);
    setFormData({});
  };

  return (
    <div className="p-6">
      {/* 1. ПЕРЕКЛЮЧАТЕЛЬ СПРАВОЧНИКОВ */}
      <div className="flex gap-2 mb-6">
        {directories.map((dir) => (
          <button
            key={dir.id}
            onClick={() => {
              setActiveDir(dir);
              setRecords([]);
              setFormData({});
            }}
            className={`px-4 py-2 rounded ${activeDir.id === dir.id ? "bg-indigo-600 text-white" : "bg-gray-200"}`}
          >
            {dir.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-8">
        {/* ЛЕВАЯ ЧАСТЬ: ФОРМА ДЛЯ activeDir */}
        <form onSubmit={handleSubmit} className="p-4 border rounded shadow">
          <h2 className="font-bold mb-4">Создать в: {activeDir.name}</h2>

          <input className="w-full mb-4 p-2 border rounded" placeholder="Название записи" value={formData.name || ""} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />

          {activeDir.fields.map((field) => (
            <div key={field.slug} className="mb-3">
              <label className="block text-sm font-medium mb-1">{field.name}</label>
              <FieldRenderer field={field} value={formData[field.slug]} onChange={(val: string | number) => setFormData({ ...formData, [field.slug]: val })} />
            </div>
          ))}

          <button type="submit" className="bg-green-600 text-white px-4 py-2 mt-4 rounded">
            Сохранить
          </button>
        </form>

        {/* ПРАВАЯ ЧАСТЬ: СПИСОК */}
        <div className="p-4 bg-gray-50 rounded">
          <h2 className="font-bold mb-4">Данные: {activeDir.name}</h2>
          {records.map((rec) => (
            <div key={rec.id} className="p-3 mb-2 bg-white border rounded text-sm">
              <p className="font-semibold">{rec.name}</p>
              <pre className="text-xs text-gray-500 mt-1">{JSON.stringify(rec.data, null, 2)}</pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DirectiryPage;
