import React from "react";
import { Trash2 } from "lucide-react";
import { Input } from "../../../../../components/ui/Input";
import type { Product } from "../../../../../core/types";
import type { ProductFormData } from "./Interface";

interface SpecsTabProps {
  form: ProductFormData;
  setForm: React.Dispatch<React.SetStateAction<ProductFormData>>;
  product?: Product;
}

const SpecsTab = ({ form, setForm }: SpecsTabProps) => {
  const f = (key: keyof ProductFormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({
      ...p,
      [key]: e.target.value,
    }));

  const extraEntries = Object.entries(form.extra_data);

  const addAttr = () => {
    setForm((p) => ({
      ...p,
      extra_data: {
        ...p.extra_data,
        "": "",
      },
    }));
  };

  const updateKey = (oldKey: string, newKey: string) => {
    setForm((p) => {
      const entries = Object.entries(p.extra_data);
      const updated = entries.map(([k, v]) => (k === oldKey ? [newKey, v] : [k, v]));

      return {
        ...p,
        extra_data: Object.fromEntries(updated),
      };
    });
  };

  const updateValue = (key: string, value: string) => {
    setForm((p) => ({
      ...p,
      extra_data: {
        ...p.extra_data,
        [key]: value,
      },
    }));
  };

  const removeAttr = (key: string) => {
    setForm((p) => {
      const copy = { ...p.extra_data };
      delete copy[key];

      return {
        ...p,
        extra_data: copy,
      };
    });
  };

  return (
    <div className="space-y-4">
      {/* Габариты */}
      <div>
        <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Габариты (см)</p>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Длина" type="number" value={form.length} onChange={f("length")} />
          <Input label="Ширина" type="number" value={form.width} onChange={f("width")} />
          <Input label="Высота" type="number" value={form.height} onChange={f("height")} />
        </div>
      </div>
      <Input label="Вес (кг)" type="number" value={form.weight} onChange={f("weight")} />
      <Input label="Объём (м³)" type="number" value={form.volume_m3} onChange={f("volume_m3")} />

      {/* Доп. атрибуты */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">Доп. атрибуты</p>
          <button type="button" onClick={addAttr} className="text-xs px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
            + Добавить
          </button>
        </div>

        {extraEntries.length === 0 ? (
          <p className="text-xs text-gray-400">Нет атрибутов</p>
        ) : (
          <div className="space-y-2">
            {extraEntries.map(([key, value], idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <input
                  type="text"
                  placeholder="Название"
                  value={key}
                  onChange={(e) => updateKey(key, e.target.value)}
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="text"
                  placeholder="Значение"
                  value={value}
                  onChange={(e) => updateValue(key, e.target.value)}
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button type="button" onClick={() => removeAttr(key)} className="p-1.5 text-red-400 hover:text-red-600 transition-colors" title="Удалить">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SpecsTab;
