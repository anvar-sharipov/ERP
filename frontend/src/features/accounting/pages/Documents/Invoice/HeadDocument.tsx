// frontend/src/features/accounting/pages/Documents/Invoice/HeadDocument.tsx
import { selectClass, DOC_TYPES } from "./Vars";
import { Input } from "../../../../../components/ui/Input";
import { type DocumentHeader, DOC_TYPE_ICONS } from "./Interface";
import SearchableSelect, { type SelectOption } from "../../../../../components/ui/SearchableSelect";
import { useTranslation } from "react-i18next";
import Dropdown from "../../../../../components/ui/Invoice/Dropdown";

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

const fieldLabel = "block text-xs font-medium text-gray-400 dark:text-gray-500 mb-0.5";
const fieldValue = "text-sm font-medium text-gray-800 dark:text-gray-100 py-1 px-0.5";

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
  const { t } = useTranslation();

  const counterpartyOptions: SelectOption[] = counterparties.map((c) => ({
    id: c.id,
    label: c.name,
    sublabel: c.inn ? `${t("INN")}: ${c.inn}` : c.phone || undefined,
  }));

  const warehouseName = warehouses.find((w) => w.id === header.warehouse)?.name ?? "—";
  const warehouseToName = warehouses.find((w) => w.id === header.warehouse_to)?.name ?? "—";
  const formattedDate = header.date ? new Date(header.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" }) : "—";

  return (
    <div className="px-4 py-3 border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-x-4 gap-y-2">
        {/* Тип документа */}
        <div>
          <label className={fieldLabel}>{t("Type")}</label>
          {isPosted ? (
            <p className={`${fieldValue} flex items-center gap-1.5`}>
              {DOC_TYPE_ICONS[header.document_type]}
              <span>{t(DOC_TYPES.find((d) => d.value === header.document_type)?.label ?? header.document_type)}</span>
            </p>
          ) : (
            <Dropdown
              value={header.document_type}
              options={DOC_TYPES.map((d) => ({
                value: d.value,
                label: t(d.label),
                icon: DOC_TYPE_ICONS[d.value],
              }))}
              onChange={(newType) =>
                setHeader((p) => ({
                  ...p,
                  document_type: newType,
                  warehouse_to: newType === "move" ? p.warehouse_to : null,
                }))
              }
            />
          )}
        </div>

        {/* Дата */}
        <div>
          <label className={fieldLabel}>{t("Date")}</label>
          {isEdit && !isPosted ? (
            <input type="date" value={header.date} onChange={(e) => setHeader((p) => ({ ...p, date: e.target.value }))} className={selectClass} />
          ) : (
            <p className={fieldValue}>{formattedDate}</p>
          )}
        </div>

        {/* Филиал */}
        <div>
          <label className={fieldLabel}>{t("Branch")}</label>
          <p className={fieldValue}>{branches.find((b) => b.id === header.branch)?.name ?? "—"}</p>
        </div>

        {/* Склад */}
        <div>
          <label className={fieldLabel}>{isMove ? t("SourceWarehouse") : t("Warehouse")}</label>
          <p className={fieldValue}>{warehouseName}</p>
        </div>

        {/* Склад-получатель (только при перемещении) */}
        {isMove && (
          <div>
            <label className={fieldLabel}>{t("DestinationWarehouse")} *</label>
            {isPosted ? (
              <p className={fieldValue}>{warehouseToName}</p>
            ) : (
              <select value={header.warehouse_to ?? ""} onChange={(e) => setHeader((p) => ({ ...p, warehouse_to: e.target.value ? Number(e.target.value) : null }))} className={selectClass}>
                <option value="">{t("Select")}</option>
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
          <div className="xl:col-span-2">
            <label className={fieldLabel}>
              {t("Counterparty")} *
              {counterpartyBalance !== null && (
                <span className={`ml-2 font-mono ${counterpartyBalance >= 0 ? "text-green-500" : "text-red-500"}`}>
                  {t("Balance")}: {counterpartyBalance.toLocaleString("ru-RU", { minimumFractionDigits: 2 })}
                </span>
              )}
            </label>
            <SearchableSelect
              options={counterpartyOptions}
              value={header.counterparty ?? null}
              onChange={(id) => setHeader((p) => ({ ...p, counterparty: id }))}
              placeholder={t("SelectCounterparty")}
              disabled={isPosted}
            />
          </div>
        )}

        {/* Тип цены */}
        <div>
          <label className={fieldLabel}>{t("PriceType")}</label>
          {isPosted ? (
            <p className={fieldValue}>{priceTypes.find((pt) => pt.id === header.default_price_type)?.name ?? "—"}</p>
          ) : (
            <select value={header.default_price_type ?? ""} onChange={(e) => onPriceTypeChange(e.target.value ? Number(e.target.value) : null)} className={selectClass}>
              <option value="">{t("NotSet")}</option>
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
          <label className={fieldLabel}>{t("DiscountPercent")}</label>
          {isPosted ? (
            <p className={fieldValue}>{header.discount_percent}</p>
          ) : (
            <Input value={header.discount_percent} type="number" onChange={(e) => setHeader((p) => ({ ...p, discount_percent: e.target.value }))} />
          )}
        </div>

        {/* Примечание — растягивается на оставшееся место */}
        <div className="col-span-2 xl:col-span-2">
          <label className={fieldLabel}>{t("Note")}</label>
          {isPosted ? (
            <p className={`${fieldValue} text-gray-500`}>{header.note || "—"}</p>
          ) : (
            <input type="text" value={header.note} onChange={(e) => setHeader((p) => ({ ...p, note: e.target.value }))} className={selectClass} placeholder={t("Optional")} />
          )}
        </div>
      </div>
    </div>
  );
};

export default HeadDocument;
