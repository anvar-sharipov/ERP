// frontend/src/features/accounting/pages/Documents/Invoice/HeaderPage.tsx
import { BackButton } from "../../../../../components/ui/BackButton";
import { ROUTES } from "../../../../../core/router/routes";
import { DOC_TYPES } from "./Vars";
import { Button } from "../../../../../components/ui/Button";
import { CheckCircle, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
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
}

const Header = ({ docId, isEdit, header, docNumber, isPosted, setPostConfirm, postMutation, setUnpostConfirm, unpostMutation, saveMutation, disableSave }: HeaderProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { getBackProps } = useRestoreScroll("selectedDocumentId", () => {});

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

      <div className="flex gap-2 print:hidden">
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
