import { Button } from "../../../../../components/ui/Button";
import { Plus, Trash2 } from "lucide-react";
import { newParticipantRow } from "./Vars";
import { type ParticipantRow } from "./Interface";
import SearchableSelect from "../../../../../components/ui/SearchableSelect";

interface ParticipantsProps {
  setParticipants: React.Dispatch<React.SetStateAction<ParticipantRow[]>>;
  participants: ParticipantRow[];
  isPosted: boolean;
  employees: any[];
  removeParticipant: (p: ParticipantRow) => void;
}

const Participants = ({ setParticipants, participants, isPosted, employees, removeParticipant }: ParticipantsProps) => {
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
    <div className="border border-gray-200 dark:border-slate-600 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400">Участники</h2>
        {!isPosted && <Button text="Добавить" variant="ghost" icon={<Plus className="w-4 h-4" />} onClick={() => setParticipants((prev) => [...prev, newParticipantRow()])} />}
      </div>

      {participants.length === 0 ? (
        <p className="text-xs text-gray-400">Нет участников</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {participants.map((p) => {
            const emp = employees.find((e) => e.id === p.employee);
            const roleLabel = emp?.position_name ?? p.role ?? "—";

            return (
              <div key={p._key} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/50">
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
                    placeholder="— сотрудник —"
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
  );
};

export default Participants;
