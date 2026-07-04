// frontend/src/features/accounting/pages/Documents/Invoice/Participants.tsx
import { useState } from "react";
import { Button } from "../../../../../components/ui/Button";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { newParticipantRow } from "./Vars";
import { type ParticipantRow } from "./Interface";
import SearchableSelect from "../../../../../components/ui/SearchableSelect";
import { useTranslation } from "react-i18next";

interface ParticipantsProps {
  setParticipants: React.Dispatch<React.SetStateAction<ParticipantRow[]>>;
  participants: ParticipantRow[];
  isPosted: boolean;
  employees: any[];
  removeParticipant: (p: ParticipantRow) => void;
}

// ✅ Первый участник (обязательный "сотрудник/водитель") отображается отдельно,
// в одном ряду с контрагентом и комментарием — см. HeadDocument.tsx.
// Этот компонент отвечает только за дополнительных участников (со 2-го и далее).
const Participants = ({ setParticipants, participants, isPosted, employees, removeParticipant }: ParticipantsProps) => {
  const { t } = useTranslation();
  const extra = participants.slice(1);

  // ✅ Блок используется редко — по умолчанию свёрнут, состояние запоминаем в localStorage
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    const saved = localStorage.getItem("document_participants_collapsed");
    return saved !== null ? JSON.parse(saved) : true;
  });

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("document_participants_collapsed", JSON.stringify(next));
      return next;
    });
  };

  const handleEmployeeChange = (key: string, employeeId: number | null) => {
    setParticipants((prev) =>
      prev.map((r) => {
        if (r._key !== key) return r;
        const emp = employees.find((e) => e.id === employeeId);
        const role = emp?.position_name ?? String(emp?.position ?? "other");
        return { ...r, employee: employeeId, role };
      }),
    );
  };

  // Опции для SearchableSelect
  const employeeOptions = employees.map((e) => ({
    id: e.id,
    label: e.full_name,
    sublabel: e.position_name ?? e.branch_name ?? undefined,
  }));

  return (
    <div className="border border-gray-300 dark:border-slate-600 border-l-4 border-l-indigo-400 dark:border-l-indigo-500 rounded-lg bg-gray-200 dark:bg-slate-800 print:border-none print:bg-transparent print:p-0">
      {/* ── Печатная версия: компактный список, не зависит от свёрнутости на экране ── */}
      {extra.length > 0 && (
        <div className="hidden print:block text-xs leading-snug mb-2">
          <span className="font-semibold">{t("Participants")}:</span>{" "}
          {extra
            .map((p) => {
              const emp = employees.find((e) => e.id === p.employee);
              const roleLabel = emp?.position_name ?? p.role ?? "—";
              return `${roleLabel}: ${emp?.full_name ?? "—"}`;
            })
            .join("; ")}
        </div>
      )}

      <div className="w-full flex items-center justify-between gap-2 px-4 py-2.5 print:hidden">
        <button type="button" onClick={toggleCollapsed} className="flex items-center gap-1.5 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {t("Participants")}
          {extra.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 text-xs font-medium">
              {extra.length}
            </span>
          )}
        </button>
        {!isPosted && (
          <Button
            variant="secondary"
            size="sm"
            text={t("Add")}
            icon={<Plus className="w-4 h-4" />}
            onClick={() => {
              setCollapsed(false);
              localStorage.setItem("document_participants_collapsed", "false");
              setParticipants((prev) => [...prev, newParticipantRow()]);
            }}
          />
        )}
      </div>

      {!collapsed && (
        <div className="px-4 pb-4 print:hidden">
          {extra.length === 0 ? (
            <p className="text-xs text-gray-400">{t("NoParticipants")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {extra.map((p) => {
                const emp = employees.find((e) => e.id === p.employee);
                const roleLabel = emp?.position_name ?? p.role ?? "—";

                return (
                  <div key={p._key} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700/50 shadow-sm">
                    {/* Должность — read only */}
                    <span className="text-xs text-indigo-500 dark:text-indigo-400 font-medium whitespace-nowrap">{roleLabel}:</span>

                    {/* Выбор сотрудника через SearchableSelect */}
                    {isPosted ? (
                      <span className="text-xs text-gray-900 dark:text-gray-100">{emp?.full_name ?? "—"}</span>
                    ) : (
                      <SearchableSelect
                        options={employeeOptions}
                        value={p.employee}
                        onChange={(id) => handleEmployeeChange(p._key, id)}
                        placeholder={t("SelectEmployee")}
                        className="min-w-[160px]"
                        clearable={false}
                      />
                    )}

                    {!isPosted && (
                      <button onClick={() => removeParticipant(p)} className="text-red-400 hover:text-red-600 transition-colors ml-1">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Participants;
