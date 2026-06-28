// frontend/src/features/accounting/pages/Products/Form/DiscountsTab.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNotify } from "../../../../../core/context/NotificationContext";
import { volumeDiscountApi } from "../../../services/productApi";
import { Button } from "../../../../../components/ui/Button";
import type { PriceType } from "../../../../../core/types";

interface VolumeDiscount {
  id: number;
  price_type: number | null;
  price_type_name: string | null;
  min_qty: string;
  max_qty: string | null;
  discount_percent: string;
}

interface FormRow {
  id: number | null;
  price_type: number | "";
  min_qty: string;
  max_qty: string;
  discount_percent: string;
}

const EMPTY_ROW: FormRow = {
  id: null,
  price_type: "",
  min_qty: "0",
  max_qty: "",
  discount_percent: "0",
};

interface Props {
  productId: number;
  priceTypes: PriceType[];
}

const DiscountsTab = ({ productId, priceTypes }: Props) => {
  const notify = useNotify();
  const queryClient = useQueryClient();

  const [editingRow, setEditingRow] = useState<FormRow | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const { data: discounts = [], isLoading } = useQuery<VolumeDiscount[]>({
    queryKey: ["volume-discounts", productId],
    queryFn: async () => {
      const res = await volumeDiscountApi.getAll(productId);
      return Array.isArray(res) ? res : (res.results ?? []);
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["volume-discounts", productId] });

  const createMutation = useMutation({
    mutationFn: (data: any) => volumeDiscountApi.create(productId, data),
    onSuccess: () => {
      notify("success", "Скидка добавлена");
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
    mutationFn: ({ id, data }: { id: number; data: any }) => volumeDiscountApi.update(productId, id, data),
    onSuccess: () => {
      notify("success", "Скидка обновлена");
      setEditingRow(null);
      invalidate();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.max_qty?.[0] || err.response?.data?.detail || "Ошибка";
      notify("error", msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => volumeDiscountApi.delete(productId, id),
    onSuccess: () => {
      notify("success", "Скидка удалена");
      invalidate();
    },
  });

  const buildPayload = (row: FormRow) => ({
    product: productId, // ← добавить
    price_type: row.price_type === "" ? null : row.price_type,
    min_qty: row.min_qty || "0",
    max_qty: row.max_qty === "" ? null : row.max_qty,
    discount_percent: row.discount_percent,
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

  const handleEdit = (d: VolumeDiscount) => {
    setIsAdding(false);
    setEditingRow({
      id: d.id,
      price_type: d.price_type ?? "",
      min_qty: d.min_qty,
      max_qty: d.max_qty ?? "",
      discount_percent: d.discount_percent,
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
        <h3 className="font-semibold text-base">Скидки по объёму</h3>
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
              <th className="px-3 py-2 text-right">Скидка %</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {discounts.length === 0 && !isAdding && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-gray-400">
                  Скидок нет
                </td>
              </tr>
            )}

            {discounts.map((d) => {
              const isEditingThis = editingRow?.id === d.id;
              return (
                <tr key={d.id} className="border-t border-gray-200 dark:border-gray-700">
                  {isEditingThis && editingRow ? (
                    <InlineEditRow row={editingRow} priceTypes={priceTypes} onChange={setEditingRow} onSave={handleSave} onCancel={handleCancel} isSaving={updateMutation.isPending} />
                  ) : (
                    <>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-200">{d.price_type_name ?? <span className="text-gray-400 italic">Все типы</span>}</td>
                      <td className="px-3 py-2 text-right">{d.min_qty}</td>
                      <td className="px-3 py-2 text-right">{d.max_qty ?? "∞"}</td>
                      <td className="px-3 py-2 text-right font-medium text-green-600">{d.discount_percent}%</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button onClick={() => handleEdit(d)} className="text-blue-500 hover:underline mr-3 text-xs">
                          Изменить
                        </button>
                        <button onClick={() => deleteMutation.mutate(d.id)} className="text-red-500 hover:underline text-xs">
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

      <p className="text-xs text-gray-400">Если тип цены не выбран — скидка применяется для всех типов цен. Поле «До кол-ва» можно оставить пустым — тогда скидка действует без верхнего предела.</p>
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

      {/* % */}
      <td className="px-2 py-1">
        <input type="number" min={0} max={100} step={0.01} value={row.discount_percent} onChange={set("discount_percent")} className={inputCls + " text-right"} placeholder="0" />
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

export default DiscountsTab;
