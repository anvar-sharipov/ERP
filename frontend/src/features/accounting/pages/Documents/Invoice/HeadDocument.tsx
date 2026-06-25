import { selectClass, DOC_TYPES } from "./Vars";
import { Input } from "../../../../../components/ui/Input";
import { type DocumentHeader } from "./Interface";
import SearchableSelect, { type SelectOption } from "../../../../../components/ui/SearchableSelect";

interface HeadDocumentProps {
  header: DocumentHeader;
  isPosted: boolean;
  isEdit: boolean;
  setHeader: React.Dispatch<React.SetStateAction<DocumentHeader>>;
  isMove: boolean;
  warehouses: any[];
  needsCounterparty: boolean;
  counterpartyBalance: number | null;
  priceTypes: any[];
  counterparties: any[];
  onPriceTypeChange: (id: number | null) => void;
  branches: { id: number; name: string }[];
}

const fieldLabel = "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1";
const fieldValue = "text-sm font-medium text-gray-800 dark:text-gray-100 py-1.5 px-0.5";

const HeadDocument = ({
  header,
  isPosted,
  isEdit,
  setHeader,
  isMove,
  warehouses,
  needsCounterparty,
  counterpartyBalance,
  priceTypes,
  counterparties,
  onPriceTypeChange,
  branches,
}: HeadDocumentProps) => {
  const counterpartyOptions: SelectOption[] = counterparties.map((c) => ({
    id: c.id,
    label: c.name,
    sublabel: c.inn ? `ИНН: ${c.inn}` : c.phone || undefined,
  }));

  // Найти название склада для отображения текстом
  const warehouseName = warehouses.find((w) => w.id === header.warehouse)?.name ?? "—";
  const warehouseToName = warehouses.find((w) => w.id === header.warehouse_to)?.name ?? "—";

  // Форматировать дату
  const formattedDate = header.date ? new Date(header.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" }) : "—";

  return (
    <div className="p-4 border border-gray-200 dark:border-slate-600 rounded-lg">
      <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Реквизиты</h2>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
        {/* Тип документа */}
        <div>
          <label className={fieldLabel}>Тип</label>
          {isPosted ? (
            <p className={fieldValue}>{DOC_TYPES.find((d) => d.value === header.document_type)?.label ?? header.document_type}</p>
          ) : (
            <select
              value={header.document_type}
              onChange={(e) => {
                const newType = e.target.value;
                setHeader((p) => ({
                  ...p,
                  document_type: newType,
                  // Очищаем warehouse_to если тип не "move"
                  warehouse_to: newType === "move" ? p.warehouse_to : null,
                }));
              }}
              className={selectClass}
            >
              {DOC_TYPES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Дата — всегда текст */}
        <div>
          <label className={fieldLabel}>Дата</label>
          {isEdit && !isPosted ? (
            <input type="date" value={header.date} onChange={(e) => setHeader((p) => ({ ...p, date: e.target.value }))} className={selectClass} />
          ) : (
            <p className={fieldValue}>{formattedDate}</p>
          )}
        </div>

        <div>
          <label className={fieldLabel}>Филиал</label>
          <p className={fieldValue}>{branches.find((b) => b.id === header.branch)?.name ?? "—"}</p>
        </div>

        {/* Склад — текст (берётся из правой панели) */}
        <div>
          <label className={fieldLabel}>{isMove ? "Склад-источник" : "Склад"}</label>
          <p className={`${fieldValue} flex items-center gap-1`}>{warehouseName}</p>
        </div>

        {/* Склад-получатель при перемещении — тоже текст если не редактируется */}
        {isMove && (
          <div>
            <label className={fieldLabel}>Склад-получатель *</label>
            {isPosted ? (
              <p className={fieldValue}>{warehouseToName}</p>
            ) : (
              <select value={header.warehouse_to ?? ""} onChange={(e) => setHeader((p) => ({ ...p, warehouse_to: e.target.value ? Number(e.target.value) : null }))} className={selectClass}>
                <option value="">— выберите —</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Контрагент */}
        {needsCounterparty && (
          <div>
            <label className={fieldLabel}>
              Контрагент *
              {counterpartyBalance !== null && (
                <span className={`ml-2 font-mono ${counterpartyBalance >= 0 ? "text-green-500" : "text-red-500"}`}>
                  сальдо: {counterpartyBalance.toLocaleString("ru-RU", { minimumFractionDigits: 2 })}
                </span>
              )}
            </label>
            <SearchableSelect
              options={counterpartyOptions}
              value={header.counterparty ?? null}
              onChange={(id) => setHeader((p) => ({ ...p, counterparty: id }))}
              placeholder="— выберите контрагента —"
              disabled={isPosted}
            />
          </div>
        )}

        {/* Тип цены */}
        <div>
          <label className={fieldLabel}>Тип цены</label>
          {isPosted ? (
            <p className={fieldValue}>{priceTypes.find((pt) => pt.id === header.default_price_type)?.name ?? "—"}</p>
          ) : (
            <select value={header.default_price_type ?? ""} onChange={(e) => onPriceTypeChange(e.target.value ? Number(e.target.value) : null)} className={selectClass}>
              <option value="">— не задан —</option>
              {priceTypes.map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {pt.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Скидка */}
        <div>
          <label className={fieldLabel}>Скидка %</label>
          {isPosted ? (
            <p className={fieldValue}>{header.discount_percent}</p>
          ) : (
            <Input value={header.discount_percent} type="number" onChange={(e) => setHeader((p) => ({ ...p, discount_percent: e.target.value }))} />
          )}
        </div>
      </div>

      {/* Примечание */}
      <div className="mt-3">
        <label className={fieldLabel}>Примечание</label>
        {isPosted ? (
          <p className={`${fieldValue} text-gray-500`}>{header.note || "—"}</p>
        ) : (
          <input type="text" value={header.note} onChange={(e) => setHeader((p) => ({ ...p, note: e.target.value }))} className={selectClass} placeholder="Необязательно" />
        )}
      </div>
    </div>
  );
};

export default HeadDocument;
