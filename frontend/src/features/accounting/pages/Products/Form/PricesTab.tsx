// // frontend/src/features/accounting/pages/Products/Form/PricesTab.tsx
// frontend/src/features/accounting/pages/Products/Form/PricesTab.tsx
import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../../../../components/ui/Button";
import { Input } from "../../../../../components/ui/Input";
import { ConfirmModal } from "../../../../../components/ui/Modal/ConfirmModal";
import { useNotify } from "../../../../../core/context/NotificationContext";
import type { ProductPrice, PriceType } from "../../../../../core/types";
import { productPriceApi } from "../../../services/productApi";
import { userScopeApi } from "../../../services/transactionApi";
import { useDateStore } from "../../../../../core/store/dateStore";
import { api } from "../../../../../core/api/axiosInstance";
import { selectClass } from "./Interface";

interface PricesTabProps {
  productId: number;
  prices: ProductPrice[];
  priceTypes: PriceType[];
  warehouses: any[];
  onRefresh: () => void;
}

type ScopeMode = "warehouse" | "branch" | "global";

interface PriceFormData {
  price_type: number | null;
  warehouse: number | null;
  branch: number | null;
  price: string;
  is_active: boolean;
}

const EMPTY_PRICE: PriceFormData = {
  price_type: null,
  warehouse: null,
  branch: null,
  price: "0",
  is_active: true,
};

const PricesTab = ({ productId, prices, priceTypes, warehouses, onRefresh }: PricesTabProps) => {
  const notify = useNotify();
  const { workBranch, workWarehouse } = useDateStore();

  const { data: scope } = useQuery({
    queryKey: ["my-scope"],
    queryFn: () => userScopeApi.getMyScope().then((r) => r.data),
    staleTime: 60_000,
  });

  const isGlobalUser = scope?.is_global === true;

  const [scopeMode, setScopeMode] = useState<ScopeMode>("warehouse");
  const [selectedBranch, setSelectedBranch] = useState<number | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<number | null>(null);

  const [form, setForm] = useState<PriceFormData>(EMPTY_PRICE);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [affectedCount, setAffectedCount] = useState<number | null>(null);
  const [confirmScopeOpen, setConfirmScopeOpen] = useState(false);

  // Филиалы для селекта (только из scope, не отдельный запрос)
  const branches = useMemo(() => scope?.branches ?? [], [scope]);

  const startEdit = (price: ProductPrice) => {
    setEditingId(price.id);
    setForm({
      price_type: price.price_type,
      warehouse: price.warehouse,
      branch: (price as any).branch ?? null,
      price: price.price,
      is_active: price.is_active,
    });
    if (price.warehouse) {
      setScopeMode("warehouse");
      setSelectedWarehouse(price.warehouse);
    } else if ((price as any).branch) {
      setScopeMode("branch");
      setSelectedBranch((price as any).branch);
    } else {
      setScopeMode("global");
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_PRICE);
    setScopeMode("warehouse");
    setSelectedBranch(null);
    setSelectedWarehouse(null);
  };

  // Резолвим warehouse/branch для сохранения в зависимости от роли и выбора
  const resolveScopeForSave = (): { warehouse: number | null; branch: number | null } | null => {
    if (!isGlobalUser) {
      // Обычный юзер — берём из right bar
      if (workWarehouse?.id) {
        return { warehouse: workWarehouse.id, branch: null };
      }
      if (workBranch?.id) {
        return { warehouse: null, branch: workBranch.id };
      }
      notify("error", "Выберите рабочий филиал или склад в правой панели");
      return null;
    }

    // Superuser — по scopeMode
    if (scopeMode === "warehouse") {
      if (!selectedWarehouse) {
        notify("error", "Выберите склад");
        return null;
      }
      return { warehouse: selectedWarehouse, branch: null };
    }
    if (scopeMode === "branch") {
      if (!selectedBranch) {
        notify("error", "Выберите филиал");
        return null;
      }
      return { warehouse: null, branch: selectedBranch };
    }
    // global
    return { warehouse: null, branch: null };
  };

  const doSave = async (scopeValues: { warehouse: number | null; branch: number | null }) => {
    setSaving(true);
    try {
      await productPriceApi.save(editingId, {
        ...form,
        ...scopeValues,
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
      setConfirmScopeOpen(false);
      setAffectedCount(null);
    }
  };

  const handleSave = async () => {
    if (!form.price_type) {
      notify("error", "Выберите тип цены");
      return;
    }

    const scopeValues = resolveScopeForSave();
    if (!scopeValues) return;

    // Предупреждение для branch/global — считаем затронутые склады
    if (scopeValues.branch || (!scopeValues.warehouse && !scopeValues.branch)) {
      try {
        const params = scopeValues.branch ? { scope: "branch", branch: scopeValues.branch } : { scope: "global" };
        const res = await api.get("/accounting/product-prices/affected-count/", { params });
        setAffectedCount(res.data.affected_warehouses);
        setConfirmScopeOpen(true);
        // сохраняем scopeValues во временное замыкание через ref-подобный паттерн
        pendingScopeRef.current = scopeValues;
        return;
      } catch {
        // если не удалось посчитать — сохраняем без предупреждения
      }
    }

    doSave(scopeValues);
  };

  // const pendingScopeRef = useState<{ warehouse: number | null; branch: number | null } | null>(null);
  const pendingScopeRef = useRef<{ warehouse: number | null; branch: number | null } | null>(null);
  // ^ см. примечание ниже про ref

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
      <div className="p-4 border border-gray-200 dark:border-slate-600 rounded-lg space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{editingId ? "Редактировать цену" : "Добавить цену"}</h3>

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

        {/* Область действия цены */}
        {isGlobalUser ? (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Область действия</label>
            <div className="flex gap-2">
              {(
                [
                  ["warehouse", "Один склад"],
                  ["branch", "Весь филиал"],
                  ["global", "Все филиалы"],
                ] as [ScopeMode, string][]
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setScopeMode(mode)}
                  className={`px-3 py-1.5 text-sm rounded-lg border ${
                    scopeMode === mode ? "bg-indigo-600 text-white border-indigo-600" : "bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-slate-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {scopeMode === "warehouse" && (
              <select value={selectedWarehouse ?? ""} onChange={(e) => setSelectedWarehouse(e.target.value ? Number(e.target.value) : null)} className={selectClass}>
                <option value="">— выберите склад —</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            )}

            {scopeMode === "branch" && (
              <select value={selectedBranch ?? ""} onChange={(e) => setSelectedBranch(e.target.value ? Number(e.target.value) : null)} className={selectClass}>
                <option value="">— выберите филиал —</option>
                {branches.map((b: any) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}

            {scopeMode === "global" && <p className="text-xs text-amber-600 dark:text-amber-400">⚠ Цена будет применена ко всем филиалам и складам компании, у которых нет собственной цены.</p>}
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Область действия (из рабочей панели)</label>
            <input
              disabled
              value={workWarehouse?.name ?? workBranch?.name ?? "— выберите филиал/склад справа —"}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400 cursor-not-allowed"
            />
          </div>
        )}

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
                <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Область</th>
                <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Цена</th>
                <th className="text-center py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Активна</th>
                <th className="py-2 px-3" />
              </tr>
            </thead>
            <tbody>
              {prices.map((p: any) => {
                const isGlobalRow = !p.warehouse && !p.branch;
                const canModifyThisRow = !isGlobalRow || isGlobalUser;

                return (
                  <tr
                    key={p.id}
                    className={`border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50 ${editingId === p.id ? "bg-indigo-50 dark:bg-indigo-900/20" : ""}`}
                  >
                    <td className="py-2 px-3">{p.price_type_name}</td>
                    <td className="py-2 px-3 text-gray-500">{p.warehouse_name ?? p.branch_name ?? <span className="text-amber-600 dark:text-amber-400 font-medium">Глобально</span>}</td>
                    <td className="py-2 px-3 text-right font-medium">{Number(p.price).toLocaleString("ru-RU", { minimumFractionDigits: 3 })}</td>
                    <td className="py-2 px-3 text-center">
                      <span className={`inline-block w-2 h-2 rounded-full ${p.is_active ? "bg-green-500" : "bg-gray-300"}`} />
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex gap-1 justify-end">
                        <Button variant="1c" icon={<span>✏️</span>} className="md:h-6 md:w-8 md:!p-0" disabled={!canModifyThisRow} onClick={() => startEdit(p)} />
                        <Button variant="1c" icon={<span>🗑️</span>} className="md:h-6 md:w-8 md:!p-0" disabled={!canModifyThisRow} onClick={() => setDeleteId(p.id)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {/* {prices.map((p: any) => (
                <tr
                  key={p.id}
                  className={`border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50 ${editingId === p.id ? "bg-indigo-50 dark:bg-indigo-900/20" : ""}`}
                >
                  <td className="py-2 px-3">{p.price_type_name}</td>
                  <td className="py-2 px-3 text-gray-500">{p.warehouse_name ?? p.branch_name ?? <span className="text-amber-600 dark:text-amber-400 font-medium">Глобально</span>}</td>
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
              ))} */}
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

      <ConfirmModal
        isOpen={confirmScopeOpen}
        type="warning"
        title="Подтвердите изменение"
        message={`Эта цена затронет ${affectedCount ?? "?"} склад(ов). Продолжить?`}
        onClose={() => {
          setConfirmScopeOpen(false);
          setAffectedCount(null);
        }}
        onConfirm={() => {
          const pending = pendingScopeRef.current;
          if (pending) doSave(pending);
        }}
      />
    </div>
  );
};

export default PricesTab;

