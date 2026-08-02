// frontend/src/features/accounting/pages/Documents/Invoice/HeaderPage.tsx
import { useEffect } from "react";
import { BackButton } from "../../../../../components/ui/BackButton";
import { ROUTES } from "../../../../../core/router/routes";
import { DOC_TYPES } from "./Vars";
import { Button } from "../../../../../components/ui/Button";
import { CheckCircle, XCircle, Check, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { useRestoreScroll } from "../../../../../core/hooks/useRestoreScroll";

// 1. Определение интерфейса для пропсов
interface HeaderProps {
  docId?: number | null;
  isEdit: boolean;
  header: { document_type: string };
  docNumber: string;
  isPosted: boolean;
  setPostConfirm: (val: boolean) => void;
  postMutation: { isPending: boolean };
  setUnpostConfirm: (val: boolean) => void;
  unpostMutation: { isPending: boolean };
  saveMutation: { isPending: boolean; mutate: () => void };
  disableSave?: boolean;
  // ✅ Статус автосохранения черновика (см. DocumentFormPage.tsx) — молча
  // показываем "Сохранено чч:мм:сс", пока пользователь не нажал "Сохранить" сам.
  lastSavedAt?: Date | null;
  autosaveError?: boolean;
}

const Header = ({ docId, isEdit, header, docNumber, isPosted, setPostConfirm, postMutation, setUnpostConfirm, unpostMutation, saveMutation, disableSave, lastSavedAt, autosaveError }: HeaderProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { getBackProps } = useRestoreScroll("selectedDocumentId", () => {});
  // ✅ getBackProps сам пишет sessionStorage только по клику на BackButton/Alt+←
  // (см. useRestoreScroll.ts) — но нативная кнопка "Назад" браузера (или свайп,
  // Backspace) вызывает popstate напрямую, в обход нашего onClick, и запись просто
  // не успевает произойти (см. тот же фикс в ProductTurnoverDetailPage.tsx). Поэтому
  // пишем id проактивно, как только документ открылся — тогда неважно, каким
  // способом вернулись на список накладных.
  useEffect(() => {
    if (!docId) return;
    try {
      sessionStorage.setItem("selectedDocumentId", String(docId));
    } catch {}
  }, [docId]);

  // ✅ Страница списка (InvoicesPage.tsx::onRowDoubleClick), с которой открыли этот
  // документ — передаётся через location.state, а не через постоянно пишущийся
  // sessionStorage: иначе переход на любую ДРУГУЮ вкладку приложения и обратно на
  // список накладных тоже "восстанавливал" бы последнюю страницу, хотя пользователь
  // туда не за этим вернулся. state.fromInvoicesPage есть только когда документ
  // открыли именно двойным кликом по строке списка — тогда и только тогда пишем
  // страницу в sessionStorage (тем же проактивным способом, что и selectedDocumentId
  // выше, чтобы тоже работать с нативной кнопкой "Назад" браузера).
  useEffect(() => {
    const state = location.state as { fromInvoicesPage?: number; fromInvoicesFilters?: Record<string, unknown> } | null;
    const fromPage = state?.fromInvoicesPage;
    if (fromPage == null) return;
    try {
      sessionStorage.setItem("invoices_list_return_page", String(fromPage));
      if (state?.fromInvoicesFilters) {
        sessionStorage.setItem("invoices_list_filters", JSON.stringify(state.fromInvoicesFilters));
      }
    } catch {}
  }, [location.state]);

  return (
    <div className="flex items-center justify-between gap-3 mb-3 print:mb-1 flex-wrap">
      <div className="flex items-center gap-3 print:w-full print:justify-center">
        {/* <BackButton id={docId ?? 0} getBackProps={() => ({ to: ROUTES.APP.DOCUMENTS_INVOICES })} /> */}
        <div className="print:hidden">
          <BackButton id={docId ?? 0} getBackProps={getBackProps} />
        </div>
        <div className="print:w-full">
          {/* ── Заголовок документа — merge'ится (на всю ширину) и центрируется при печати, как в Excel ── */}
          <h1 className="text-xl print:text-base print:text-center print:w-full font-bold">
            {isEdit ? `${t(DOC_TYPES.find((d) => d.value === header.document_type)?.label ?? t("Document"))} №${docNumber}` : t("NewDocument")}
          </h1>
          {isEdit && <p className="text-sm text-gray-500 print:hidden">{isPosted ? t("PostedBadge") : t("DraftBadge")}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2 print:hidden">
        {/* ✅ Статус автосохранения черновика — молча, без тостов на каждую паузу
            в наборе (см. DocumentFormPage.tsx). Ручное "Сохранить" остаётся рядом
            для явного форс-сохранения перед уходом со страницы. */}
        {!isPosted && !saveMutation.isPending && (
          <span className="text-xs flex items-center gap-1 text-gray-400 dark:text-gray-500 select-none">
            {autosaveError ? (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                <span className="text-red-500">{t("AutosaveError")}</span>
              </>
            ) : (
              lastSavedAt && (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  {t("SavedAt", { time: lastSavedAt.toLocaleTimeString("ru-RU") })}
                </>
              )
            )}
          </span>
        )}
        {isEdit && !isPosted && <Button text={t("Post")} variant="danger" icon={<CheckCircle className="w-4 h-4" />} onClick={() => setPostConfirm(true)} disabled={postMutation.isPending} />}
        {isEdit && isPosted && <Button text={t("Unpost")} icon={<XCircle className="w-4 h-4" />} onClick={() => setUnpostConfirm(true)} disabled={unpostMutation.isPending} />}
        <Button
          text={saveMutation.isPending ? t("Saving") : t("Save")}
          onClick={() => saveMutation.mutate()}
          disabled={isPosted || disableSave}
          title={disableSave ? t("SelectBranchAndWarehouse") : undefined}
        />
        <Button variant="secondary" text={t("Cancel")} onClick={() => navigate(ROUTES.APP.DOCUMENTS_INVOICES)} />
      </div>
    </div>
  );
};

export default Header;
