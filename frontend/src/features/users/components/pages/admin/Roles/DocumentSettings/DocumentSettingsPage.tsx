// frontend/src/features/users/components/pages/admin/Roles/DocumentSettings/DocumentSettingsPage.tsx
import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { documentSettingsApi } from "../../../../../../accounting/services/documentSettingsApi";
import { priceTypeApi } from "../../../../../../accounting/services/productApi";
import { Button } from "../../../../../../../components/ui/Button";
import { RBACGuard } from "../../../../../../../components/ui/RBACGuard";
import { usePageAccess } from "../../../../../../../core/hooks/usePageAccess";
import { useNotify } from "../../../../../../../core/context/NotificationContext";
import { PageHeaderText } from "../../../../../../../components/ui/Tabs/PageHeaderText";
import { HelpButton } from "../../../../../../../components/ui/HelpButton";

const selectClass =
  "w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg shadow-sm " +
  "bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 " +
  "focus:outline-none focus:ring-2 focus:ring-indigo-500";

// ✅ Настройки документов — растущий раздел (см. CLAUDE.md): сейчас только "какой
// тип цены подставлять по умолчанию в приход", позже сюда добавятся правила проводки и т.д.
const DocumentSettingsPage = () => {
  const { t } = useTranslation();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { canView, canPost, canPut } = usePageAccess("documentsettings");

  const [purchasePriceType, setPurchasePriceType] = useState<number | "">("");

  const { data: settingsList, isLoading, error } = useQuery({
    queryKey: ["document-settings"],
    queryFn: documentSettingsApi.getSettings,
    enabled: canView,
    retry: false,
  });
  const settings = settingsList?.[0] ?? null;

  const { data: priceTypes = [] } = useQuery({
    queryKey: ["price-types"],
    queryFn: priceTypeApi.getAll,
  });

  useEffect(() => {
    setPurchasePriceType(settings?.purchase_price_type ?? "");
  }, [settings]);

  const mutation = useMutation({
    mutationFn: () =>
      documentSettingsApi.saveSettings(settings?.id ?? null, {
        purchase_price_type: purchasePriceType === "" ? null : Number(purchasePriceType),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-settings"] });
      notify("success", t("SuccessUpdated"));
    },
    onError: (err: any) => {
      if (err._handled) return;
      notify("error", err.message || t("ErrorSaving"));
    },
  });

  return (
    <RBACGuard isLoading={isLoading} error={error} canView={canView} forbiddenText={t("ForbiddenText")}>
      <PageHeaderText
        title={t("DocumentSettings")}
        actions={
          <HelpButton title={t("DocumentSettings")}>
            <p>
              Эта страница задаёт <b>общие настройки документов</b> для всей компании — сейчас это только тип цены, который
              подставляется в приходную накладную, но со временем сюда добавятся другие правила (например правила проводки).
            </p>
            <p>
              <b>«Тип цены для прихода»</b> — при создании нового документа «Приход» цена в строке товара будет автоматически
              подставляться из выбранного здесь типа цены (например «Опт»).
            </p>
            <ul>
              <li>Если тип цены не выбран («Не задано») — цена строки прихода подставится из себестоимости (`cost_price`) товара.</li>
              <li>Это только значение по умолчанию — оператор всегда может вручную поменять тип цены или саму цену в конкретном документе.</li>
              <li>При проведении прихода себестоимость товара обновляется той ценой, что реально осталась в строке.</li>
            </ul>
            <p>
              <b>Кнопка «Сохранить»</b> — записывает выбранный тип цены как настройку для всей компании.
            </p>
          </HelpButton>
        }
      />

      <div className="max-w-md space-y-4 p-1">
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">{t("PurchasePriceTypeLabel")}</label>
          <select
            className={selectClass}
            value={purchasePriceType}
            onChange={(e) => setPurchasePriceType(e.target.value ? Number(e.target.value) : "")}
            disabled={!canPost && !canPut}
          >
            <option value="">{t("NotSet")}</option>
            {(priceTypes as { id: number; name: string }[]).map((pt) => (
              <option key={pt.id} value={pt.id}>
                {pt.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-400">{t("PurchasePriceTypeHint")}</p>
        </div>

        <Button
          text={mutation.isPending ? t("Saving") : t("Save")}
          onClick={() => {
            if (!canPost && !canPut) {
              notify("error", t("InsufficientRights"));
              return;
            }
            mutation.mutate();
          }}
          disabled={mutation.isPending}
        />
      </div>
    </RBACGuard>
  );
};

export default DocumentSettingsPage;
