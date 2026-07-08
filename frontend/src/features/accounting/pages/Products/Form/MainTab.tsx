import React from "react";
import { Input } from "../../../../../components/ui/Input";
import CategoryTreeSelect from "../../../../../components/ui/Category/CategotyTree/TreeSelect/CategoryTreeSelect";

import { type ProductFormData, selectClass } from "./Interface";
import { type MainTabProps } from "./Interface";


export const MainTab = ({
  form,
  setForm,
  units,
  brands,
  tags,
  warehouses,
  categories,
  isEdit,
}: MainTabProps) => {
  const f = (key: keyof ProductFormData) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [key]: e.target.value }));

    const toggleTag = (id: number) =>
      setForm((p) => ({
        ...p,
        tag_ids: p.tag_ids.includes(id) ? p.tag_ids.filter((t) => t !== id) : [...p.tag_ids, id],
      }));

    const toggleWarehouse = (id: number) =>
      setForm((p) => ({
        ...p,
        allowed_warehouse_ids: p.allowed_warehouse_ids.includes(id) ? p.allowed_warehouse_ids.filter((w) => w !== id) : [...p.allowed_warehouse_ids, id],
      }));
  
    return (
      <div className="space-y-4">
        <Input label="Название *" value={form.name} onChange={f("name")} />
  
        <div className="grid grid-cols-2 gap-3">
          <Input label="Артикул" value={form.sku} onChange={() => {}} disabled={true} placeholder={isEdit ? "" : "авто"} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Штрихкод" value={form.barcode} onChange={f("barcode")} placeholder="авто" />
            <Input label="QR-код" value={form.qr_code} onChange={f("qr_code")} placeholder="авто" />
          </div>
        </div>
  
  
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ед. изм. *</label>
            <select value={form.unit ?? ""} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value ? Number(e.target.value) : null }))} className={selectClass}>
              <option value="">— выберите —</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.short_name})
                </option>
              ))}
            </select>
          </div>
  
          {/* ✅ CategoryTreeSelect вместо <select> */}
          <CategoryTreeSelect items={categories} value={form.category} onChange={(id) => setForm((p) => ({ ...p, category: id }))} label="Категория" />
        </div>
  
        {/* остальное без изменений... */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Бренд</label>
          <select value={form.brand ?? ""} onChange={(e) => setForm((p) => ({ ...p, brand: e.target.value ? Number(e.target.value) : null }))} className={selectClass}>
            <option value="">— без бренда —</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
  
        <div className="grid grid-cols-2 gap-3">
          <Input label="Себестоимость" type="number" value={form.cost_price} onChange={f("cost_price")} />
          <Input label="Мин. остаток" type="number" value={form.min_stock_level} onChange={f("min_stock_level")} />
        </div>
  
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Режим изображения</label>
          <select value={form.image_mode} onChange={(e) => setForm((p) => ({ ...p, image_mode: e.target.value as "contain" | "cover" }))} className={selectClass}>
            <option value="contain">Вписать</option>
            <option value="cover">Заполнить</option>
          </select>
        </div>
  
        {/* Теги */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Теги</label>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const active = form.tag_ids.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                    active ? "bg-indigo-600 border-indigo-600 text-white" : "border-gray-300 dark:border-slate-600 text-gray-600 dark:text-gray-400 hover:border-indigo-400"
                  }`}
                >
                  {tag.name}
                </button>
              );
            })}
          </div>
        </div>
  
        {/* ✅ Ассортиментная матрица "товар × склад" — пусто = виден на любом
            складе (опт-аут, см. Product.allowed_warehouses). Тот же паттерн
            чипов-переключателей, что и у тегов выше. */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Разрешённые склады <span className="font-normal text-gray-400">(ничего не выбрано — виден на всех)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {warehouses.map((w) => {
              const active = form.allowed_warehouse_ids.includes(w.id);
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => toggleWarehouse(w.id)}
                  className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                    active ? "bg-indigo-600 border-indigo-600 text-white" : "border-gray-300 dark:border-slate-600 text-gray-600 dark:text-gray-400 hover:border-indigo-400"
                  }`}
                >
                  {w.name}
                </button>
              );
            })}
          </div>
        </div>

        <Input label="description" value={form.description} onChange={f("description")} placeholder="description" />
  
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          Активен
        </label>
      </div>
    );
};