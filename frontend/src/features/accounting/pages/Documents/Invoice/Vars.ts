// frontend/src/features/accounting/pages/Documents/Invoice/Vars.ts
import { type ItemRow, type ParticipantRow, type Product } from "./Interface";


export const DOC_TYPES = [
  { value: "in", label: "IncomingInvoice" },
  { value: "out", label: "OutgoingInvoice" },
  { value: "move", label: "Move" },
  { value: "return_in", label: "ReturnIn" },
  { value: "return_out", label: "ReturnOut" },
];

export const newItemRow = (): ItemRow => ({
  id: null,
  _key: crypto.randomUUID(),
  product: null,
  product_name: "",
  unit: null,
  unit_name: "",
  quantity: "1",
  price: "0",
  discount_percent: "0",
  cost_price: "0",
  discount_manual: false,
});


export const newParticipantRow = (): ParticipantRow => ({
  id: null,
  _key: crypto.randomUUID(),
  employee: null,
  role: "other",
});


export const selectClass =
  "w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg " +
  "bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 " +
  "focus:outline-none focus:ring-2 focus:ring-indigo-500";


export const lineTotal = (row: ItemRow): number => {
  const qty = parseFloat(row.quantity) || 0;
  const price = parseFloat(row.price) || 0;
  const disc = parseFloat(row.discount_percent) || 0;
  return qty * price * (1 - disc / 100);
};



/**
 * Подобрать скидку по объёму для строки.
 * Возвращает discount_percent строкой или null если скидки нет.
 */
export const resolveVolumeDiscount = (
  product: Product | undefined,
  qty: number,
  priceTypeId: number | null,
): string | null => {
  if (!product?.volume_discounts?.length) return null;

  // Фильтруем: подходят скидки без price_type (для всех) или с совпадающим
  const matches = product.volume_discounts.filter((vd) => {
    const typeMatch = vd.price_type === null || vd.price_type === priceTypeId;
    const minOk = qty >= Number(vd.min_qty);
    const maxOk = vd.max_qty === null || qty <= Number(vd.max_qty);
    return typeMatch && minOk && maxOk;
  });

  if (!matches.length) return null;

  // Если несколько подходят — берём с максимальной скидкой
  const best = matches.reduce((a, b) =>
    Number(a.discount_percent) >= Number(b.discount_percent) ? a : b,
  );

  return String(best.discount_percent);
};
