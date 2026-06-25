import { BackButton } from "../../../../../components/ui/BackButton";
import { ROUTES } from "../../../../../core/router/routes";
import { DOC_TYPES } from "./Vars";
import { Button } from "../../../../../components/ui/Button";
import { CheckCircle, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

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
}

const Header = ({ docId, isEdit, header, docNumber, isPosted, setPostConfirm, postMutation, setUnpostConfirm, unpostMutation, saveMutation }: HeaderProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
      <div className="flex items-center gap-3">
        <BackButton id={docId ?? 0} getBackProps={() => ({ to: ROUTES.APP.DOCUMENTS_INVOICES })} />
        <div>
          <h1 className="text-xl font-bold">{isEdit ? `${DOC_TYPES.find((d) => d.value === header.document_type)?.label ?? "Документ"} №${docNumber}` : "Новый документ"}</h1>
          {isEdit && <p className="text-sm text-gray-500">{isPosted ? "🟢 Проведён" : "🟡 Черновик"}</p>}
        </div>
      </div>

      <div className="flex gap-2">
        {isEdit && !isPosted && <Button text="Провести" variant="danger" icon={<CheckCircle className="w-4 h-4" />} onClick={() => setPostConfirm(true)} disabled={postMutation.isPending} />}
        {isEdit && isPosted && <Button text="Распровести" icon={<XCircle className="w-4 h-4" />} onClick={() => setUnpostConfirm(true)} disabled={unpostMutation.isPending} />}
        <Button text={saveMutation.isPending ? t("Saving") : isEdit ? t("Save") : t("Create")} onClick={() => saveMutation.mutate()} disabled={isPosted} />
        <Button text={t("Cancel")} onClick={() => navigate(ROUTES.APP.DOCUMENTS_INVOICES)} />
      </div>
    </div>
  );
};

export default Header;
