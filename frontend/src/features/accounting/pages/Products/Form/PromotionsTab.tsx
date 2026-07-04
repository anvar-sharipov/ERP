// frontend/src/features/accounting/pages/Products/Form/PromotionsTab.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNotify } from "../../../../../core/context/NotificationContext";
import { quantityPromotionApi } from "../../../services/productApi";
import { Button } from "../../../../../components/ui/Button";
import type { PriceType } from "../../../../../core/types";

interface QuantityPromotion {
  id: number;
  price_type: number | null;
  price_type_name: string | null;
  min_qty: string;
  max_qty: string | null;
  free_qty: string;
}

interface FormRow {
  id: number | null;
  price_type: number | "";
  min_qty: string;
  max_qty: string;
  free_qty: string;
}

const EMPTY_ROW: FormRow = {
  id: null,
  price_type: "",
  min_qty: "0",
  max_qty: "",
  free_qty: "1",
};

interface Props {
  productId: number;
  priceTypes: PriceType[];
}

const PromotionsTab = ({ productId, priceTypes }: Props) => {
  const notify = useNotify();
  const queryClient = useQueryClient();

  const [editingRow, setEditingRow] = useState<FormRow | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const { data: promotions = [], isLoading } = useQuery<QuantityPromotion[]>({
    queryKey: ["quantity-promotions", productId],
    queryFn: async () => {
      const res = await quantityPromotionApi.getAll(productId);
      return Array.isArray(res) ? res : (res.results ?? []);
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["quantity-promotions", productId] });

  const createMutation = useMutation({
    mutationFn: (data: any) => quantityPromotionApi.create(productId, data),
    onSuccess: () => {
      notify("success", "Акция добавлена");
      setIsAdding(false);
      setEditingRow(null);
      invalidate();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.max_qty?.[0] || err.response?.data?.detail || "Ошибка";
      notify("error", msg);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => quantityPromotionApi.update(productId, id, data),
    onSuccess: () => {
      notify("success", "Акция обновлена");
      setEditingRow(null);
      invalidate();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.max_qty?.[0] || err.response?.data?.detail || "Ошибка";
      notify("error", msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => quantityPromotionApi.delete(productId, id),
    onSuccess: () => {
      notify("success", "Акция удалена");
      invalidate();
    },
  });

  const buildPayload = (row: FormRow) => ({
    product: productId,
    price_type: row.price_type === "" ? null : row.price_type,
    min_qty: row.min_qty || "0",
    max_qty: row.max_qty === "" ? null : row.max_qty,
    free_qty: row.free_qty,
  });

  const handleSave = () => {
    if (!editingRow) return;
    const payload = buildPayload(editingRow);
    if (editingRow.id) {
      updateMutation.mutate({ id: editingRow.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleEdit = (p: QuantityPromotion) => {
    setIsAdding(false);
    setEditingRow({
      id: p.id,
      price_type: p.price_type ?? "",
      min_qty: p.min_qty,
      max_qty: p.max_qty ?? "",
      free_qty: p.free_qty,
    });
  };

  const handleAdd = () => {
    setEditingRow({ ...EMPTY_ROW });
    setIsAdding(true);
  };

  const handleCancel = () => {
    setEditingRow(null);
    setIsAdding(false);
  };

  if (isLoading) return <div className="text-sm text-gray-400 mt-4">Загрузка...</div>;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-base">Акции «количество за количество»</h3>
        <Button text="+ Добавить" onClick={handleAdd} />
      </div>

      {/* Таблица */}
      <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
            <tr>
              <th className="px-3 py-2 text-left">Тип цены</th>
              <th className="px-3 py-2 text-right">От кол-ва</th>
              <th className="px-3 py-2 text-right">До кол-ва</th>
              <th className="px-3 py-2 text-right">Бесплатно</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {promotions.length === 0 && !isAdding && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-gray-400">
                  Акций нет
                </td>
              </tr>
            )}

            {promotions.map((p) => {
              const isEditingThis = editingRow?.id === p.id;
              return (
                <tr key={p.id} className="border-t border-gray-200 dark:border-gray-700">
                  {isEditingThis && editingRow ? (
                    <InlineEditRow row={editingRow} priceTypes={priceTypes} onChange={setEditingRow} onSave={handleSave} onCancel={handleCancel} isSaving={updateMutation.isPending} />
                  ) : (
                    <>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-200">{p.price_type_name ?? <span className="text-gray-400 italic">Все типы</span>}</td>
                      <td className="px-3 py-2 text-right">{p.min_qty}</td>
                      <td className="px-3 py-2 text-right">{p.max_qty ?? "∞"}</td>
                      <td className="px-3 py-2 text-right font-medium text-emerald-600">+{p.free_qty}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button onClick={() => handleEdit(p)} className="text-blue-500 hover:underline mr-3 text-xs">
                          Изменить
                        </button>
                        <button onClick={() => deleteMutation.mutate(p.id)} className="text-red-500 hover:underline text-xs">
                          Удалить
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}

            {/* Строка добавления */}
            {isAdding && editingRow && (
              <tr className="border-t border-gray-200 dark:border-gray-700">
                <InlineEditRow row={editingRow} priceTypes={priceTypes} onChange={setEditingRow} onSave={handleSave} onCancel={handleCancel} isSaving={createMutation.isPending} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        Например: от 10 до 19 шт — бесплатно 1 шт; от 20 — бесплатно 2 шт. Бесплатное количество того же товара добавляется в документ отдельной строкой (со
        списанием со склада), а не скидкой на цену.
      </p>
    </div>
  );
};

// ── Инлайн-редактирование строки ─────────────────────────────────────────────

interface InlineEditRowProps {
  row: FormRow;
  priceTypes: PriceType[];
  onChange: (row: FormRow) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}

const inputCls = "w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400";

const InlineEditRow = ({ row, priceTypes, onChange, onSave, onCancel, isSaving }: InlineEditRowProps) => {
  const set = (field: keyof FormRow) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...row, [field]: e.target.value });

  return (
    <>
      {/* Тип цены */}
      <td className="px-2 py-1">
        <select value={row.price_type} onChange={set("price_type")} className={inputCls}>
          <option value="">— Все типы —</option>
          {priceTypes.map((pt) => (
            <option key={pt.id} value={pt.id}>
              {pt.name}
            </option>
          ))}
        </select>
      </td>

      {/* От */}
      <td className="px-2 py-1">
        <input type="number" min={0} value={row.min_qty} onChange={set("min_qty")} className={inputCls + " text-right"} placeholder="0" />
      </td>

      {/* До */}
      <td className="px-2 py-1">
        <input type="number" min={0} value={row.max_qty} onChange={set("max_qty")} className={inputCls + " text-right"} placeholder="∞" />
      </td>

      {/* Бесплатно */}
      <td className="px-2 py-1">
        <input type="number" min={0.001} step={0.001} value={row.free_qty} onChange={set("free_qty")} className={inputCls + " text-right"} placeholder="0" />
      </td>

      {/* Кнопки */}
      <td className="px-2 py-1 text-right whitespace-nowrap">
        <button onClick={onSave} disabled={isSaving} className="text-green-600 hover:underline text-xs mr-2 disabled:opacity-50">
          {isSaving ? "..." : "Сохранить"}
        </button>
        <button onClick={onCancel} className="text-gray-500 hover:underline text-xs">
          Отмена
        </button>
      </td>
    </>
  );
};

export default PromotionsTab;
