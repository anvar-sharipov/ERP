// src/features/accounting/pages/Journal/JournalEntryForm.tsx
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
// import { transactionApi, type JournalEntry, type TransactionLine, type TransactionSide } from "../../services/transactionApi";
import { accountApi } from "../../services/accountingApi";
import { Button } from "../../../../components/ui/Button";
import { Input } from "../../../../components/ui/Input";
import { useNotify } from "../../../../core/context/NotificationContext";
import { useDateStore } from "../../../../core/store/dateStore";
import { useClosedPeriod } from "../../../../core/hooks/useClosedPeriod";
import { transactionApi, journalApi, type JournalEntry, type TransactionLine, type TransactionSide } from "../../services/transactionApi";

interface Props {
  initial: JournalEntry | null;
  onSuccess: () => void;
  onCancel: () => void;
}

const emptyLine = (side: TransactionSide): Omit<TransactionLine, "id"> => ({
  side,
  account: 0,
  amount: "",
  subcontos: {},
});

export default function JournalEntryForm({ initial, onSuccess, onCancel }: Props) {
  const { t } = useTranslation();
  const notify = useNotify();
  const isEdit = !!initial;

  const workDate = useDateStore((s) => s.workDate);
  const { isClosed } = useClosedPeriod();
  const [date, setDate] = useState(initial?.date?.slice(0, 10) ?? workDate);

  console.log("isClosed", isClosed);

  const [number, setNumber] = useState(initial?.number ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [lines, setLines] = useState<Omit<TransactionLine, "id">[]>(
    initial?.lines?.map((l) => ({
      order: l.order,
      side: l.side,
      account: l.account,
      amount: l.amount,
      subcontos: l.subcontos,
    })) ?? [emptyLine("debit"), emptyLine("credit")],
  );

  // Только листовые счета (не группы)
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts-leaf"],
    queryFn: () => accountApi.getAccounts({ is_group: "false" }),
  });
  const mutation = useMutation({
    // mutationFn: (payload: Parameters<typeof transactionApi.create>[0]) => (isEdit ? transactionApi.update(initial!.id, payload) : transactionApi.create(payload)),
    mutationFn: (payload: Parameters<typeof journalApi.create>[0]) => (isEdit ? journalApi.update(initial!.id, payload) : journalApi.create(payload)),
    onSuccess: () => {
      notify("success", isEdit ? t("SuccessUpdated") : t("SuccessCreated"));
      onSuccess();
    },
    onError: (err: any) => {
      if (err._handled) return;
      const detail = err?.response?.data?.lines ?? err?.response?.data?.detail ?? err?.response?.data ?? t("ErrorSaving");
      notify("error", typeof detail === "string" ? detail : JSON.stringify(detail));
    },
  });

  // Живой баланс
  const debitTotal = lines.filter((l) => l.side === "debit").reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const creditTotal = lines.filter((l) => l.side === "credit").reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const balanced = debitTotal > 0 && debitTotal === creditTotal;

  const setLine = (idx: number, patch: Partial<Omit<TransactionLine, "id">>) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const addLine = (side: TransactionSide) => setLines((ls) => [...ls, emptyLine(side)]);
  const removeLine = (idx: number) => setLines((ls) => ls.filter((_, i) => i !== idx));

  const handleSubmit = () => {
    if (!balanced) return;
    mutation.mutate({
      number,
      date: `${date}T00:00:00`,
      description,
      lines: lines as TransactionLine[],
    });
  };

  return (
    <div className="space-y-4">
      {/* Шапка */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Input label="Номер" value={number} onChange={(e) => setNumber(e.target.value)} />
        <Input label="Дата" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Input label="Содержание" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      {/* Таблица строк */}
      <div className="rounded-lg border dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-slate-900/60">
            <tr>
              <th className="px-3 py-2 text-left w-20 text-xs font-semibold text-gray-500 dark:text-indigo-400/80 uppercase tracking-wider">Дт/Кт</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-indigo-400/80 uppercase tracking-wider">Счёт</th>
              <th className="px-3 py-2 text-right w-36 text-xs font-semibold text-gray-500 dark:text-indigo-400/80 uppercase tracking-wider">Сумма</th>
              <th className="px-3 py-2 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700/50">
            {lines.map((line, idx) => (
              <tr key={idx} className={line.side === "debit" ? "bg-blue-50/30 dark:bg-blue-900/5" : "bg-red-50/30 dark:bg-red-900/5"}>
                {/* Дт / Кт */}
                <td className="px-3 py-1.5">
                  <select
                    value={line.side}
                    onChange={(e) => setLine(idx, { side: e.target.value as TransactionSide })}
                    className="
                      w-full px-2 py-1 rounded-lg border text-sm outline-none
                      bg-white dark:bg-slate-950
                      text-gray-900 dark:text-indigo-100
                      border-gray-300 dark:border-indigo-900/50
                      focus:border-indigo-500 dark:focus:border-indigo-500/50
                    "
                  >
                    <option value="debit">Дт</option>
                    <option value="credit">Кт</option>
                  </select>
                </td>

                {/* Счёт */}
                <td className="px-3 py-1.5">
                  <select
                    value={line.account || ""}
                    onChange={(e) => setLine(idx, { account: Number(e.target.value) })}
                    className="
                      w-full px-2 py-1 rounded-lg border text-sm outline-none
                      bg-white dark:bg-slate-950
                      text-gray-900 dark:text-indigo-100
                      border-gray-300 dark:border-indigo-900/50
                      focus:border-indigo-500 dark:focus:border-indigo-500/50
                    "
                  >
                    <option value="">— выбрать счёт —</option>
                    {accounts.map((acc: any) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.code} — {acc.name}
                      </option>
                    ))}
                  </select>
                </td>

                {/* Сумма */}
                <td className="px-3 py-1.5">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={line.amount}
                    onChange={(e) => setLine(idx, { amount: e.target.value })}
                    className="
                      w-full px-2 py-1 rounded-lg border text-sm text-right outline-none
                      bg-white dark:bg-slate-950
                      text-gray-900 dark:text-indigo-100
                      border-gray-300 dark:border-indigo-900/50
                      focus:border-indigo-500 dark:focus:border-indigo-500/50
                    "
                  />
                </td>

                {/* Удалить строку */}
                <td className="px-2 py-1.5 text-center">
                  {lines.length > 2 && (
                    <button onClick={() => removeLine(idx)} className="text-gray-400 hover:text-red-500 transition-colors text-xs">
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Добавить строку */}
      <div className="flex gap-3">
        <button onClick={() => addLine("debit")} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
          + строка Дт
        </button>
        <button onClick={() => addLine("credit")} className="text-xs text-red-500 dark:text-red-400 hover:underline">
          + строка Кт
        </button>
      </div>

      {/* Сводка баланса */}
      <div className="flex items-center gap-6 text-sm px-4 py-3 rounded-lg bg-gray-50 dark:bg-slate-900/60 border dark:border-gray-700/50">
        <span>
          Дт: <span className="font-mono font-medium text-blue-600 dark:text-blue-400">{debitTotal.toLocaleString("ru-RU", { minimumFractionDigits: 2 })}</span>
        </span>
        <span>
          Кт: <span className="font-mono font-medium text-red-500 dark:text-red-400">{creditTotal.toLocaleString("ru-RU", { minimumFractionDigits: 2 })}</span>
        </span>
        <span className={`font-medium ${balanced ? "text-green-600 dark:text-green-400" : "text-orange-500"}`}>{balanced ? "✓ Баланс сходится" : "⚠ Не сходится"}</span>
      </div>

      {/* Кнопки */}
      <div className="flex justify-end gap-2 pt-1">
        <Button text={t("Cancel")} onClick={onCancel} variant="ghost" />
        {/* <Button text={isEdit ? t("Save") : t("Create")} onClick={handleSubmit} disabled={!balanced || mutation.isPending} /> */}
        <Button
          text={isEdit ? t("Save") : t("Create")}
          onClick={handleSubmit}
          disabled={!balanced || mutation.isPending || isClosed}
          title={isClosed ? "День закрыт — операции запрещены" : undefined}
        />
      </div>
    </div>
  );
}
