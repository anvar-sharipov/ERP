// frontend/src/features/accounting/pages/Products/Products/ProductFormPage.tsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNotify } from "../../../../../core/context/NotificationContext";
import { usePageAccess } from "../../../../../core/hooks/usePageAccess";
import { useSidebar } from "../../../../../core/context/SidebarRightContext";
import { productApi, priceTypeApi, unitApi, brandApi, tagApi, productCategoryApi, warehouseApi } from "../../../services/productApi";
import { ROUTES } from "../../../../../core/router/routes";
import { Button } from "../../../../../components/ui/Button";
import { RBACGuard } from "../../../../../components/ui/RBACGuard";
import { BackButton } from "../../../../../components/ui/BackButton";
import { SegmentedControl } from "../../../../../components/ui/Tabs/SegmentedControl";
import type { Product, PriceType } from "../../../../../core/types";
import { useRestoreScroll } from "../../../../../core/hooks/useRestoreScroll";
import BundlesTab from "./BundlesTab";
import { type ProductFormData, EMPTY } from "./Interface";
import { MainTab } from "./MainTab";
import SpecsTab from "./SpecsTab";
import ImagesTab from "./ImagesTab";
import PricesTab from "./PricesTab";

// const TABS = ["Основное", "Характеристики", "Изображения", "Цены"] as const;
const TABS = ["Основное", "Характеристики", "Изображения", "Цены", "Комплектующие"] as const;
type Tab = (typeof TABS)[number];

const ProductFormPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { setSidebarContent } = useSidebar();
  const { canPost, canPut } = usePageAccess("product");
  const { getBackProps } = useRestoreScroll("selectedProductId", () => {});

  // console.log("ID from params:", id, "isEdit:", !!id);

  const toOptions = (arr: readonly string[]) => arr.map((s) => ({ value: s, label: s }));

  const isEdit = !!id;
  const productId = id ? Number(id) : null;

  const [activeTab, setActiveTab] = useState<Tab>("Основное");
  const [form, setForm] = useState<ProductFormData>(EMPTY);

  // ── Запросы ──────────────────────────────────────────────────────────────────

  const {
    data: product,
    isLoading: productLoading,
    error: productError,
  } = useQuery<Product>({
    queryKey: ["product", productId],
    queryFn: () => productApi.getOne(productId!),
    enabled: isEdit,
  });

  const { data: units = [] } = useQuery({ queryKey: ["units"], queryFn: unitApi.getAll });
  const { data: brands = [] } = useQuery({ queryKey: ["brands"], queryFn: brandApi.getAll });
  const { data: tags = [] } = useQuery({ queryKey: ["tags"], queryFn: tagApi.getAll });
  const { data: categories = [] } = useQuery({ queryKey: ["product-categories"], queryFn: productCategoryApi.getAll });
  const { data: warehouses = [] } = useQuery({ queryKey: ["warehouses"], queryFn: warehouseApi.getAll });
  const { data: priceTypes = [] } = useQuery({ queryKey: ["price-types"], queryFn: priceTypeApi.getAll });

  // ── Заполнение формы при редактировании ──────────────────────────────────────

  useEffect(() => {
    if (product) {
      setForm({
        name: product.name,
        sku: product.sku ?? "",
        barcode: product.barcode ?? "",
        qr_code: product.qr_code ?? "",
        category: product.category,
        brand: product.brand,
        unit: product.unit,
        tag_ids: product.tag_ids ?? [],
        cost_price: product.cost_price,
        min_stock_level: String(product.min_stock_level),
        image_mode: product.image_mode,
        is_active: product.is_active,
        length: product.length,
        width: product.width,
        height: product.height,
        weight: product.weight,
        volume_m3: product.volume_m3,
        description: product.description,
        extra_data: (product.extra_data as Record<string, string>) ?? {},
      });
    }
  }, [product]);

  // ── Сайдбар ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    setSidebarContent(
      <div className="space-y-4">
        <div>
          <h4 className="font-bold text-indigo-300 mb-2">Информация</h4>
          {isEdit && product && (
            <div className="text-xs text-indigo-200 space-y-1">
              <div>
                Артикул: <span className="font-mono">{product.sku}</span>
              </div>
              <div>Создан: {new Date(product.created_at).toLocaleDateString()}</div>
              <div>Обновлён: {new Date(product.updated_at).toLocaleDateString()}</div>
            </div>
          )}
        </div>
      </div>,
    );
  }, [setSidebarContent, isEdit, product]);

  // ── Мутация сохранения ───────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: (data: ProductFormData) =>
      productApi.save(productId, {
        ...data,
        cost_price: Number(data.cost_price),
        min_stock_level: Number(data.min_stock_level),
        sku: data.sku || undefined,
        barcode: data.barcode || null,
        qr_code: data.qr_code || null,
        length: Number(data.length),
        width: Number(data.width),
        height: Number(data.height),
        weight: Number(data.weight),
        volume_m3: Number(data.volume_m3),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product", productId] });
      notify("success", isEdit ? t("SuccessUpdated") : t("SuccessCreated"));

      if (!isEdit) {
        // replace: true — заменяет /products/create на /products/:id/edit
        // в history стеке остаётся только одна запись, не две
        navigate(ROUTES.APP.PRODUCTS_EDIT.replace(":id", String(res.data.id)), { replace: true });
      }
    },
    onError: (err: any) => {
      if (err._handled) return;
      const data = err.response?.data;
      const msg = data?.sku?.[0] || data?.barcode?.[0] || data?.detail || t("ErrorSaving");
      notify("error", msg);
    },
  });

  // ── Refresh для изображений и цен ────────────────────────────────────────────

  const refreshProduct = () => {
    queryClient.invalidateQueries({ queryKey: ["product", productId] });
  };

  // ── Рендер ───────────────────────────────────────────────────────────────────

  return (
    <RBACGuard isLoading={isEdit ? productLoading : false} error={isEdit ? productError : null} canView={isEdit ? canPut : canPost} forbiddenText={t("ForbiddenText")}>
      {/* Шапка */}
      <div className="flex items-center gap-3 mb-4">
        <BackButton id={productId ?? 0} getBackProps={getBackProps} className="!px-2" />
        <div>
          <h1 className="text-xl font-bold">{isEdit ? `Товар: ${product?.name ?? "..."}` : "Новый товар"}</h1>
          {isEdit && product && <p className="text-sm text-gray-500">Артикул: {product.sku}</p>}
        </div>
      </div>

      {/* Табы — показываем "Изображения" и "Цены" только при редактировании */}
      <SegmentedControl options={isEdit ? toOptions(TABS) : toOptions(["Основное"] as const)} value={activeTab} onChange={(v) => setActiveTab(v as Tab)} />

      {/* Контент табов */}
      <div className="max-w-2xl">
        {activeTab === "Основное" && (
          <>
            <MainTab form={form} setForm={setForm} units={units} brands={brands} tags={tags} categories={categories} isEdit={isEdit} />;
            <div className="flex gap-2 mt-6">
              <Button text={saveMutation.isPending ? t("Saving") : isEdit ? t("Save") : t("Create")} onClick={() => saveMutation.mutate(form)} />
              <Button text={t("Cancel")} onClick={() => navigate(ROUTES.APP.PRODUCTS_LIST)} />
            </div>
          </>
        )}

        {activeTab === "Характеристики" && (
          <>
            <SpecsTab form={form} setForm={setForm} product={product} />
            <div className="flex gap-2 mt-6">
              <Button text={saveMutation.isPending ? t("Saving") : t("Save")} onClick={() => saveMutation.mutate(form)} variant="danger" />
              <Button text={t("Cancel")} onClick={() => navigate(ROUTES.APP.PRODUCTS_LIST)} />
            </div>
          </>
        )}

        {activeTab === "Изображения" && isEdit && product && <ImagesTab productId={product.id} images={product.images} imageMode={form.image_mode} onRefresh={refreshProduct} />}

        {activeTab === "Цены" && isEdit && product && (
          <PricesTab productId={product.id} prices={product.prices} priceTypes={priceTypes as PriceType[]} warehouses={warehouses} onRefresh={refreshProduct} />
        )}
        
        {activeTab === "Комплектующие" && isEdit && product && <BundlesTab productId={product.id} />}
      </div>
    </RBACGuard>
  );
};

export default ProductFormPage;
