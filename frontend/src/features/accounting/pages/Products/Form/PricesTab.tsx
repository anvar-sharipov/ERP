import { useState } from "react";
import { Button } from "../../../../../components/ui/Button";
import { Input } from "../../../../../components/ui/Input";
import { ConfirmModal } from "../../../../../components/ui/Modal/ConfirmModal";
import { useNotify } from "../../../../../core/context/NotificationContext";
import type { ProductPrice, PriceType } from "../../../../../core/types";
import { productPriceApi } from "../../../services/productApi";
import { selectClass } from "./Interface";

interface PricesTabProps {
  productId: number;
  prices: ProductPrice[];
  priceTypes: PriceType[];
  warehouses: any[];
  onRefresh: () => void;
}

interface PriceFormData {
  price_type: number | null;
  warehouse: number | null;
  price: string;
  is_active: boolean;
}

const EMPTY_PRICE: PriceFormData = {
  price_type: null,
  warehouse: null,
  price: "0",
  is_active: true,
};

const PricesTab = ({ productId, prices, priceTypes, warehouses, onRefresh }: PricesTabProps) => {
  const notify = useNotify();

  const [form, setForm] = useState<PriceFormData>(EMPTY_PRICE);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const startEdit = (price: ProductPrice) => {
    setEditingId(price.id);
    setForm({
      price_type: price.price_type,
      warehouse: price.warehouse,
      price: price.price,
      is_active: price.is_active,
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_PRICE);
  };

  const handleSave = async () => {
    if (!form.price_type) {
      notify("error", "Выберите тип цены");
      return;
    }

    setSaving(true);

    try {
      await productPriceApi.save(editingId, {
        ...form,
        product: productId,
        price: Number(form.price),
      });

      onRefresh();
      notify("success", editingId ? "Цена обновлена" : "Цена добавлена");
      resetForm();
    } catch {
      notify("error", "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await productPriceApi.delete(id);
      onRefresh();
      notify("success", "Цена удалена");
    } catch {
      notify("error", "Ошибка удаления");
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Форма добавления/редактирования */}
      <div className="p-4 border border-gray-200 dark:border-slate-600 rounded-lg space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{editingId ? "Редактировать цену" : "Добавить цену"}</h3>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Тип цены *</label>
            <select value={form.price_type ?? ""} onChange={(e) => setForm((p) => ({ ...p, price_type: e.target.value ? Number(e.target.value) : null }))} className={selectClass}>
              <option value="">— выберите —</option>
              {priceTypes.map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {pt.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Склад (необязательно)</label>
            <select value={form.warehouse ?? ""} onChange={(e) => setForm((p) => ({ ...p, warehouse: e.target.value ? Number(e.target.value) : null }))} className={selectClass}>
              <option value="">— глобальная —</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 items-end">
          <Input label="Цена" type="number" value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} />
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer pb-2">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Активна
          </label>
        </div>

        <div className="flex gap-2">
          <Button text={saving ? "Сохранение..." : editingId ? "Сохранить" : "Добавить"} onClick={handleSave} />
          {editingId && <Button text="Отмена" onClick={resetForm} />}
        </div>
      </div>

      {/* Таблица цен */}
      {prices.length === 0 ? (
        <p className="text-sm text-gray-400">Цен нет</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-600">
                <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Тип цены</th>
                <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Склад</th>
                <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Цена</th>
                <th className="text-center py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Активна</th>
                <th className="py-2 px-3" />
              </tr>
            </thead>
            <tbody>
              {prices.map((p) => (
                <tr
                  key={p.id}
                  className={`border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50 ${editingId === p.id ? "bg-indigo-50 dark:bg-indigo-900/20" : ""}`}
                >
                  <td className="py-2 px-3">{p.price_type_name}</td>
                  <td className="py-2 px-3 text-gray-500">{p.warehouse_name ?? "—"}</td>
                  <td className="py-2 px-3 text-right font-medium">{Number(p.price).toLocaleString()}</td>
                  <td className="py-2 px-3 text-center">
                    <span className={`inline-block w-2 h-2 rounded-full ${p.is_active ? "bg-green-500" : "bg-gray-300"}`} />
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex gap-1 justify-end">
                      <Button variant="1c" icon={<span>✏️</span>} className="md:h-6 md:w-8 md:!p-0" onClick={() => startEdit(p)} />
                      <Button variant="1c" icon={<span>🗑️</span>} className="md:h-6 md:w-8 md:!p-0" onClick={() => setDeleteId(p.id)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        isOpen={deleteId !== null}
        type="delete"
        title="Удалить цену?"
        message="Цена будет удалена."
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && handleDelete(deleteId)}
      />
    </div>
  );
};

export default PricesTab;
