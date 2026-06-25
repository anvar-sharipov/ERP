import { type ItemRow, type ParticipantRow } from "./Interface";


export const DOC_TYPES = [
  { value: "in", label: "Приходная накладная" },
  { value: "out", label: "Расходная накладная" },
  { value: "move", label: "Перемещение" },
  { value: "return_in", label: "Возврат от покупателя" },
  { value: "return_out", label: "Возврат поставщику" },
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
