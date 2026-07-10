// frontend/src/features/accounting/pages/Documents/Invoice/HeadDocument.tsx
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { selectClass, DOC_TYPES } from "./Vars";
import { Input } from "../../../../../components/ui/Input";
import { type DocumentHeader, type ParticipantRow, DOC_TYPE_ICONS } from "./Interface";
import SearchableSelect, { type SelectOption, type SearchableSelectHandle } from "../../../../../components/ui/SearchableSelect";
import { useTranslation } from "react-i18next";
import { HelpCircle } from "lucide-react";
import Dropdown from "../../../../../components/ui/Invoice/Dropdown";
import { formatDateDisplay } from "../../../../../core/utils/formatDate";
import { directoryApi, directoryRecordApi } from "../../../services/directoryApi";
import { InvoiceHeaderView } from "./InvoiceHeaderView";

// Слаг справочника с типовыми комментариями к документу — создаётся пользователем
// через конструктор справочников (Directory). Если такого справочника нет —
// подсказки просто не показываются, поле остаётся обычным текстовым.
const COMMENTS_DIRECTORY_SLUG = "document-comments";

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
  onWarehouseChange: (id: number | null) => void;
  onDocumentTypeChange: (newType: string) => void;
  participants: ParticipantRow[];
  setParticipants: React.Dispatch<React.SetStateAction<ParticipantRow[]>>;
  employees: any[];
  onAdvance?: () => void;
}

export interface HeadDocumentHandle {
  focusEmployee: () => void;
  focusCounterparty: () => void;
  focusNote: () => void;
}

const fieldLabel = "block text-xs font-medium text-gray-500 dark:text-gray-500 mb-0.5";
const fieldValue = "text-sm font-medium text-gray-800 dark:text-gray-100 py-1 px-0.5";

const HeadDocument = forwardRef<HeadDocumentHandle, HeadDocumentProps>(
  (
    {
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
      onWarehouseChange,
      onDocumentTypeChange,
      participants,
      setParticipants,
      employees,
      onAdvance,
    },
    ref,
  ) => {
  const { t } = useTranslation();
  const employeeSelectRef = useRef<SearchableSelectHandle | null>(null);
  const counterpartySelectRef = useRef<SearchableSelectHandle | null>(null);
  const noteInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [noteSuggestOpen, setNoteSuggestOpen] = useState(false);
  const [noteHelpOpen, setNoteHelpOpen] = useState(false);
  const [noteHighlightedIndex, setNoteHighlightedIndex] = useState(-1);

  // ── Подсказки для комментария — из справочника, который создаёт сам пользователь ──
  const { data: directories = [] } = useQuery({
    queryKey: ["directories"],
    queryFn: () => directoryApi.getDirectory(),
  });
  const commentsDirectory = (directories as any[]).find((d) => d.slug === COMMENTS_DIRECTORY_SLUG);
  const { data: commentRecords = [] } = useQuery({
    queryKey: ["directory-records", commentsDirectory?.id],
    queryFn: () => directoryRecordApi.getRecords(commentsDirectory.id),
    enabled: !!commentsDirectory?.id,
  });
  const noteSuggestions = (commentRecords as any[])
    .filter((r) => r.is_active !== false)
    .filter((r) => !header.note.trim() || r.name.toLowerCase().includes(header.note.trim().toLowerCase()))
    .slice(0, 8);

  const selectNoteSuggestion = (name: string) => {
    setHeader((p) => ({ ...p, note: name }));
    setNoteSuggestOpen(false);
    setNoteHighlightedIndex(-1);
    noteInputRef.current?.focus();
  };

  useImperativeHandle(ref, () => ({
    focusEmployee: () => employeeSelectRef.current?.open(),
    focusCounterparty: () => {
      if (needsCounterparty) counterpartySelectRef.current?.open();
      else noteInputRef.current?.focus();
    },
    focusNote: () => noteInputRef.current?.focus(),
  }));

  // ── Первый участник (сотрудник/водитель) — обязателен, всегда первый в массиве ──
  const primaryParticipant = participants[0];
  // ✅ useMemo — без него этот .map() пересчитывался бы на каждый рендер
  // (в т.ч. на каждое нажатие клавиши в любом другом поле формы, т.к. header/items
  // живут в родителе), что при большом числе сотрудников заметно тормозило открытие
  // SearchableSelect. Пересчёт нужен только когда реально изменился список.
  const employeeOptions: SelectOption[] = useMemo(
    () =>
      employees.map((e: any) => ({
        id: e.id,
        label: e.full_name,
        sublabel: e.position_name ?? e.branch_name ?? undefined,
        thumbnail: e.photo_thumbnail ?? null,
        fullImage: e.photo ?? null,
      })),
    [employees],
  );

  const handleEmployeeChange = (employeeId: number | null) => {
    setParticipants((prev) =>
      prev.map((r, idx) => {
        if (idx !== 0) return r;
        const emp = employees.find((e: any) => e.id === employeeId);
        const role = emp?.position_name ?? String(emp?.position ?? "other");
        return { ...r, employee: employeeId, role };
      }),
    );
  };

  const goToCounterparty = () => {
    if (needsCounterparty) counterpartySelectRef.current?.open();
    else noteInputRef.current?.focus();
  };

  const counterpartyOptions: SelectOption[] = useMemo(
    () =>
      counterparties.map((c) => ({
        id: c.id,
        label: c.name,
        thumbnail: c.photo_thumbnail ?? null,
        fullImage: c.photo ?? null,
        sublabel: c.inn ? `${t("INN")}: ${c.inn}` : c.phone || undefined,
      })),
    [counterparties, t],
  );

  const warehouseName = warehouses.find((w) => w.id === header.warehouse)?.name ?? "—";
  const warehouseToName = warehouses.find((w) => w.id === header.warehouse_to)?.name ?? "—";
  const formattedDate = header.date ? formatDateDisplay(header.date) : "—";

  return (
    <div className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-gray-200 dark:bg-slate-800 print:p-0 print:border-none print:bg-transparent">
      {/* ── Печатная версия: компактно, без инпутов, как настоящий документ ── */}
      <div className="hidden print:block">
        <InvoiceHeaderView
          formattedDate={formattedDate}
          isMove={isMove}
          warehouseName={warehouseName}
          warehouseToName={warehouseToName}
          documentType={header.document_type}
          discountPercent={header.discount_percent}
          needsCounterparty={needsCounterparty}
          counterpartyName={counterparties.find((c) => c.id === header.counterparty)?.name}
          counterpartyPhone={counterparties.find((c) => c.id === header.counterparty)?.phone}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-x-4 gap-y-1.5 print:hidden">
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
              onChange={onDocumentTypeChange}
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
          {isEdit && !isPosted ? (
            <select value={header.warehouse ?? ""} onChange={(e) => onWarehouseChange(e.target.value ? Number(e.target.value) : null)} className={selectClass}>
              <option value="">{t("SelectWarehouse")}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          ) : (
            <p className={fieldValue}>{warehouseName}</p>
          )}
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

        {/* Скидка — не актуальна для "Приход": себестоимость и так берётся из
            фактически введённой цены строки, отдельного поля скидки не нужно. */}
        {header.document_type !== "in" && (
          <div>
            <label className={fieldLabel}>{t("DiscountPercent")}</label>
            {isPosted ? (
              <p className={fieldValue}>{header.discount_percent}</p>
            ) : (
              <Input value={header.discount_percent} type="number" onChange={(e) => setHeader((p) => ({ ...p, discount_percent: e.target.value }))} />
            )}
          </div>
        )}
      </div>

      {/* ── Сотрудник → Контрагент → Комментарий: один ряд, стрелки влево/вправо ── */}
      {primaryParticipant && (
        <div className="flex flex-col sm:flex-row gap-3 pt-2 mt-2 border-t border-gray-200 dark:border-slate-600 print:hidden">
          <div className="flex-1">
            <label className={fieldLabel}>{t("Employee")}</label>
            {isPosted ? (
              <p className={`${fieldValue} text-base font-semibold`}>{employees.find((e: any) => e.id === primaryParticipant.employee)?.full_name ?? "—"}</p>
            ) : (
              <SearchableSelect
                ref={employeeSelectRef}
                options={employeeOptions}
                value={primaryParticipant.employee}
                onChange={handleEmployeeChange}
                onSelect={goToCounterparty}
                onEnterWhenClosed={goToCounterparty}
                placeholder={t("SelectEmployee")}
                clearable={false}
                size="lg"
              />
            )}
          </div>

          {needsCounterparty && (
            <div className="flex-1">
              <label className={fieldLabel}>
                {t("Counterparty")} *
                {counterpartyBalance !== null && (
                  <span className={`ml-2 font-mono ${counterpartyBalance >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {t("Balance")}: {counterpartyBalance.toLocaleString("ru-RU", { minimumFractionDigits: 2 })}
                  </span>
                )}
              </label>
              <SearchableSelect
                ref={counterpartySelectRef}
                options={counterpartyOptions}
                value={header.counterparty ?? null}
                onChange={(id) => setHeader((p) => ({ ...p, counterparty: id }))}
                onSelect={() => noteInputRef.current?.focus()}
                onEnterWhenClosed={() => noteInputRef.current?.focus()}
                onArrowLeft={() => employeeSelectRef.current?.open()}
                placeholder={t("SelectCounterparty")}
                disabled={isPosted}
                size="lg"
              />
            </div>
          )}

          <div className="flex-1 relative">
            <label className={`${fieldLabel} flex items-center gap-1`}>
              {t("Note")}
              {!isPosted && (
                <span className="relative inline-flex">
                  <button
                    type="button"
                    onClick={() => setNoteHelpOpen((v) => !v)}
                    onBlur={() => setTimeout(() => setNoteHelpOpen(false), 150)}
                    className="text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                  </button>

                  {noteHelpOpen && (
                    <div className="absolute z-20 top-5 left-0 w-64 p-2.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg text-xs font-normal text-gray-600 dark:text-gray-300 normal-case">
                      {t("NoteSuggestionsHelp", { slug: COMMENTS_DIRECTORY_SLUG })}
                    </div>
                  )}
                </span>
              )}
            </label>
            {isPosted ? (
              <p className={`${fieldValue} text-gray-500`}>{header.note || "—"}</p>
            ) : (
              <>
                <textarea
                  ref={noteInputRef}
                  rows={3}
                  value={header.note}
                  onChange={(e) => {
                    setHeader((p) => ({ ...p, note: e.target.value }));
                    setNoteHighlightedIndex(-1);
                  }}
                  onFocus={() => setNoteSuggestOpen(true)}
                  onBlur={() => setTimeout(() => setNoteSuggestOpen(false), 150)}
                  onKeyDown={(e) => {
                    const el = e.currentTarget;
                    if (noteSuggestOpen && noteSuggestions.length > 0 && e.key === "ArrowDown") {
                      e.preventDefault();
                      setNoteHighlightedIndex((i) => (i + 1) % noteSuggestions.length);
                    } else if (noteSuggestOpen && noteSuggestions.length > 0 && e.key === "ArrowUp") {
                      e.preventDefault();
                      setNoteHighlightedIndex((i) => (i <= 0 ? noteSuggestions.length - 1 : i - 1));
                    } else if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (noteSuggestOpen && noteHighlightedIndex >= 0 && noteSuggestions[noteHighlightedIndex]) {
                        selectNoteSuggestion(noteSuggestions[noteHighlightedIndex].name);
                      } else {
                        setNoteSuggestOpen(false);
                        onAdvance?.();
                      }
                    } else if (e.key === "ArrowRight" && el.selectionStart === el.value.length) {
                      e.preventDefault();
                      setNoteSuggestOpen(false);
                      onAdvance?.();
                    } else if (e.key === "ArrowLeft" && el.selectionStart === 0) {
                      e.preventDefault();
                      setNoteSuggestOpen(false);
                      if (needsCounterparty) counterpartySelectRef.current?.open();
                      else employeeSelectRef.current?.open();
                    } else if (e.key === "Escape") {
                      setNoteSuggestOpen(false);
                      setNoteHighlightedIndex(-1);
                    }
                  }}
                  className={`${selectClass} resize-y min-h-[4.5rem]`}
                  placeholder={t("Optional")}
                />

                {noteSuggestOpen && noteSuggestions.length > 0 && (
                  <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-lg py-1">
                    {noteSuggestions.map((r, idx) => (
                      <li
                        key={r.id}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectNoteSuggestion(r.name);
                        }}
                        onMouseEnter={() => setNoteHighlightedIndex(idx)}
                        className={`px-3 py-1.5 text-sm cursor-pointer truncate ${
                          idx === noteHighlightedIndex
                            ? "bg-indigo-50 dark:bg-indigo-900/40 text-gray-900 dark:text-gray-100"
                            : "text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-slate-700"
                        }`}
                      >
                        {r.name}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
  },
);

HeadDocument.displayName = "HeadDocument";
export default HeadDocument;
