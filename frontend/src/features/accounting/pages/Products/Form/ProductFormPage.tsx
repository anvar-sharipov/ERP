// frontend/src/features/accounting/pages/Products/Products/ProductFormPage.tsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNotify } from "../../../../../core/context/NotificationContext";
import { usePageAccess } from "../../../../../core/hooks/usePageAccess";
import { useSidebar } from "../../../../../core/context/SidebarRightContext";
import { productApi, productImageApi, productPriceApi, priceTypeApi, unitApi, brandApi, tagApi, productCategoryApi, warehouseApi } from "../../../services/productApi";
import { ROUTES } from "../../../../../core/router/routes";
import { Button } from "../../../../../components/ui/Button";
import { Input } from "../../../../../components/ui/Input";
import { RBACGuard } from "../../../../../components/ui/RBACGuard";
import { ConfirmModal } from "../../../../../components/ui/Modal/ConfirmModal";
import { BackButton } from "../../../../../components/ui/BackButton";
import { SegmentedControl } from "../../../../../components/ui/Tabs/SegmentedControl";
import { Trash2, Star, Upload } from "lucide-react";
import type { Product, ProductImage, ProductPrice, PriceType } from "../../../../../core/types";

// ── Типы формы ────────────────────────────────────────────────────────────────

interface ProductFormData {
  name: string;
  sku: string;
  barcode: string;
  qr_code: string;
  category: number | null;
  brand: number | null;
  unit: number | null;
  tag_ids: number[];
  cost_price: string;
  min_stock_level: string;
  image_mode: "contain" | "cover";
  is_active: boolean;
  length: string;
  width: string;
  height: string;
  weight: string;
  volume_m3: string;
  description: string;
}

const EMPTY: ProductFormData = {
  name: "",
  sku: "",
  barcode: "",
  qr_code: "",
  category: null,
  brand: null,
  unit: null,
  tag_ids: [],
  cost_price: "0",
  min_stock_level: "0",
  image_mode: "contain",
  is_active: true,
  length: "0",
  width: "0",
  height: "0",
  weight: "0",
  volume_m3: "0",
  description: "",
};

const selectClass =
  "w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500";

// ── Таб: Основное ─────────────────────────────────────────────────────────────

interface MainTabProps {
  form: ProductFormData;
  setForm: React.Dispatch<React.SetStateAction<ProductFormData>>;
  units: any[];
  brands: any[];
  tags: any[];
  categories: any[];
  isEdit: boolean;
  description?: string;
}

const MainTab = ({ form, setForm, units, brands, tags, categories, isEdit }: MainTabProps) => {
  const f = (key: keyof ProductFormData) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [key]: e.target.value }));

  const toggleTag = (id: number) =>
    setForm((p) => ({
      ...p,
      tag_ids: p.tag_ids.includes(id) ? p.tag_ids.filter((t) => t !== id) : [...p.tag_ids, id],
    }));

  return (
    <div className="space-y-4">
      <Input label="Название *" value={form.name} onChange={f("name")} />

      <div className="grid grid-cols-2 gap-3">
        <Input label="Артикул" value={form.sku} onChange={() => {}} disabled={true} placeholder={isEdit ? "" : "авто"} />
        {/* <Input label="Штрихкод" value={form.barcode} onChange={f("barcode")} /> */}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Штрихкод" value={form.barcode} onChange={f("barcode")} placeholder="авто" />
          <Input label="QR-код" value={form.qr_code} onChange={f("qr_code")} placeholder="авто" />
        </div>
      </div>

      <Input label="QR-код / Серийный номер" value={form.qr_code} onChange={f("qr_code")} />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ед. изм. *</label>
          <select value={form.unit ?? ""} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value ? Number(e.target.value) : null }))} className={selectClass}>
            <option value="">— выберите —</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.short_name})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Категория</label>
          <select value={form.category ?? ""} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value ? Number(e.target.value) : null }))} className={selectClass}>
            <option value="">— без категории —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Бренд</label>
        <select value={form.brand ?? ""} onChange={(e) => setForm((p) => ({ ...p, brand: e.target.value ? Number(e.target.value) : null }))} className={selectClass}>
          <option value="">— без бренда —</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input label="Себестоимость" type="number" value={form.cost_price} onChange={f("cost_price")} />
        <Input label="Мин. остаток" type="number" value={form.min_stock_level} onChange={f("min_stock_level")} />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Режим изображения</label>
        <select value={form.image_mode} onChange={(e) => setForm((p) => ({ ...p, image_mode: e.target.value as "contain" | "cover" }))} className={selectClass}>
          <option value="contain">Вписать</option>
          <option value="cover">Заполнить</option>
        </select>
      </div>

      {/* Теги */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Теги</label>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => {
            const active = form.tag_ids.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                  active ? "bg-indigo-600 border-indigo-600 text-white" : "border-gray-300 dark:border-slate-600 text-gray-600 dark:text-gray-400 hover:border-indigo-400"
                }`}
              >
                {tag.name}
              </button>
            );
          })}
        </div>
      </div>

      <Input label="description" value={form.description} onChange={f("description")} placeholder="description" />

      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
        <input
          type="checkbox"
          checked={form.is_active}
          onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
          className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
        Активен
      </label>
    </div>
  );
};

// ── Таб: Характеристики ───────────────────────────────────────────────────────
interface SpecsTabProps {
  form: ProductFormData;
  setForm: React.Dispatch<React.SetStateAction<ProductFormData>>;
  product?: Product; // для показа volume_m3 (read-only)
}

const SpecsTab = ({ form, setForm }: SpecsTabProps) => {
  const f = (key: keyof ProductFormData) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [key]: e.target.value }));

  return (
    <div className="space-y-4">
      {/* Габариты */}
      <div>
        <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Габариты (см)</p>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Длина" type="number" value={form.length} onChange={f("length")} />
          <Input label="Ширина" type="number" value={form.width} onChange={f("width")} />
          <Input label="Высота" type="number" value={form.height} onChange={f("height")} />
        </div>
      </div>

      {/* Вес */}
      <Input label="Вес (кг)" type="number" value={form.weight} onChange={f("weight")} />
      <Input label="Объём (м³)" type="number" value={form.volume_m3} onChange={f("volume_m3")} />
    </div>
  );
};

// ── Таб: Изображения ──────────────────────────────────────────────────────────

interface ImagesTabProps {
  productId: number;
  images: ProductImage[];
  imageMode: "contain" | "cover";
  onRefresh: () => void;
}

const ImagesTab = ({ productId, images, imageMode, onRefresh }: ImagesTabProps) => {
  const notify = useNotify();
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await productImageApi.upload(productId, file, images.length === 0);
      }
      onRefresh();
      notify("success", "Изображения загружены");
    } catch {
      notify("error", "Ошибка загрузки");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSetMain = async (imageId: number) => {
    try {
      await productImageApi.setMain(imageId);
      onRefresh();
    } catch {
      notify("error", "Ошибка");
    }
  };

  const handleDelete = async (imageId: number) => {
    try {
      await productImageApi.delete(imageId);
      onRefresh();
      notify("success", "Удалено");
    } catch {
      notify("error", "Ошибка удаления");
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Загрузка */}
      <label className="flex items-center gap-2 cursor-pointer w-fit px-4 py-2 rounded-lg border-2 border-dashed border-indigo-400 hover:border-indigo-600 transition-colors text-sm text-indigo-600 dark:text-indigo-400">
        <Upload className="w-4 h-4" />
        {uploading ? "Загрузка..." : "Загрузить изображения"}
        <input type="file" multiple accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
      </label>

      {/* Галерея */}
      {images.length === 0 ? (
        <p className="text-sm text-gray-400">Изображений нет</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {images.map((img) => (
            <div key={img.id} className={`relative group rounded-lg overflow-hidden border-2 transition-colors ${img.is_main ? "border-indigo-500" : "border-gray-200 dark:border-slate-600"}`}>
              <div className="aspect-square bg-gray-100 dark:bg-slate-800">
                <img src={img.thumbnail_url ?? img.image_url ?? ""} alt={img.alt_text} className={`w-full h-full object-${imageMode}`} />
              </div>

              {/* Оверлей с кнопками */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                {!img.is_main && (
                  <button onClick={() => handleSetMain(img.id)} className="p-1.5 bg-yellow-500 rounded text-white hover:bg-yellow-600" title="Сделать главным">
                    <Star className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => setDeleteId(img.id)} className="p-1.5 bg-red-500 rounded text-white hover:bg-red-600" title="Удалить">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {img.is_main && <span className="absolute top-1 left-1 bg-indigo-500 text-white text-xs px-1.5 py-0.5 rounded">Главное</span>}
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={deleteId !== null}
        type="delete"
        title="Удалить изображение?"
        message="Изображение будет удалено без возможности восстановления."
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && handleDelete(deleteId)}
      />
    </div>
  );
};

// ── Таб: Цены ─────────────────────────────────────────────────────────────────

interface PricesTabProps {
  productId: number;
  prices: ProductPrice[];
  priceTypes: PriceType[];
  warehouses: any[];
  onRefresh: () => void;
}

interface PriceFormData {
  price_type: number | null;
  warehouse: number | null;
  price: string;
  is_active: boolean;
}

const EMPTY_PRICE: PriceFormData = {
  price_type: null,
  warehouse: null,
  price: "0",
  is_active: true,
};

const PricesTab = ({ productId, prices, priceTypes, warehouses, onRefresh }: PricesTabProps) => {
  const notify = useNotify();
  const [form, setForm] = useState<PriceFormData>(EMPTY_PRICE);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const startEdit = (price: ProductPrice) => {
    setEditingId(price.id);
    setForm({
      price_type: price.price_type,
      warehouse: price.warehouse,
      price: price.price,
      is_active: price.is_active,
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_PRICE);
  };

  const handleSave = async () => {
    if (!form.price_type) {
      notify("error", "Выберите тип цены");
      return;
    }
    setSaving(true);
    try {
      await productPriceApi.save(editingId, {
        ...form,
        product: productId,
        price: Number(form.price),
      });
      onRefresh();
      notify("success", editingId ? "Цена обновлена" : "Цена добавлена");
      resetForm();
    } catch {
      notify("error", "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await productPriceApi.delete(id);
      onRefresh();
      notify("success", "Цена удалена");
    } catch {
      notify("error", "Ошибка удаления");
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Форма добавления/редактирования */}
      <div className="p-4 border border-gray-200 dark:border-slate-600 rounded-lg space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{editingId ? "Редактировать цену" : "Добавить цену"}</h3>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Тип цены *</label>
            <select value={form.price_type ?? ""} onChange={(e) => setForm((p) => ({ ...p, price_type: e.target.value ? Number(e.target.value) : null }))} className={selectClass}>
              <option value="">— выберите —</option>
              {priceTypes.map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {pt.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Склад (необязательно)</label>
            <select value={form.warehouse ?? ""} onChange={(e) => setForm((p) => ({ ...p, warehouse: e.target.value ? Number(e.target.value) : null }))} className={selectClass}>
              <option value="">— глобальная —</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 items-end">
          <Input label="Цена" type="number" value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} />
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer pb-2">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Активна
          </label>
        </div>

        <div className="flex gap-2">
          <Button text={saving ? "Сохранение..." : editingId ? "Сохранить" : "Добавить"} onClick={handleSave} />
          {editingId && <Button text="Отмена" onClick={resetForm} />}
        </div>
      </div>

      {/* Таблица цен */}
      {prices.length === 0 ? (
        <p className="text-sm text-gray-400">Цен нет</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-600">
                <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Тип цены</th>
                <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Склад</th>
                <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Цена</th>
                <th className="text-center py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Активна</th>
                <th className="py-2 px-3" />
              </tr>
            </thead>
            <tbody>
              {prices.map((p) => (
                <tr
                  key={p.id}
                  className={`border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50 ${editingId === p.id ? "bg-indigo-50 dark:bg-indigo-900/20" : ""}`}
                >
                  <td className="py-2 px-3">{p.price_type_name}</td>
                  <td className="py-2 px-3 text-gray-500">{p.warehouse_name ?? "—"}</td>
                  <td className="py-2 px-3 text-right font-medium">{Number(p.price).toLocaleString()}</td>
                  <td className="py-2 px-3 text-center">
                    <span className={`inline-block w-2 h-2 rounded-full ${p.is_active ? "bg-green-500" : "bg-gray-300"}`} />
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex gap-1 justify-end">
                      <Button variant="1c" icon={<span>✏️</span>} className="md:h-6 md:w-8 md:!p-0" onClick={() => startEdit(p)} />
                      <Button variant="1c" icon={<span>🗑️</span>} className="md:h-6 md:w-8 md:!p-0" onClick={() => setDeleteId(p.id)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        isOpen={deleteId !== null}
        type="delete"
        title="Удалить цену?"
        message="Цена будет удалена."
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && handleDelete(deleteId)}
      />
    </div>
  );
};

// ── Главный компонент ─────────────────────────────────────────────────────────

const TABS = ["Основное", "Характеристики", "Изображения", "Цены"] as const;
type Tab = (typeof TABS)[number];

const ProductFormPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { setSidebarContent } = useSidebar();
  const { canPost, canPut } = usePageAccess("product");

  console.log("ID from params:", id, "isEdit:", !!id);

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
        // После создания переходим на страницу редактирования
        navigate(ROUTES.APP.PRODUCTS_EDIT.replace(":id", String(res.data.id)));
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
        <BackButton
          id={productId ?? 0}
          getBackProps={(navigate) => ({
            onClick: () => navigate(ROUTES.APP.PRODUCTS_LIST),
          })}
          className="!px-2"
        />
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
            <MainTab
              form={form}
              setForm={setForm}
              units={units as any[]}
              brands={brands as any[]}
              tags={tags as any[]}
              categories={categories as any[]}
              isEdit={isEdit}
              description={form.description}
            />
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
              <Button text={saveMutation.isPending ? t("Saving") : t("Save")} onClick={() => saveMutation.mutate(form)} />
              <Button text={t("Cancel")} onClick={() => navigate(ROUTES.APP.PRODUCTS_LIST)} />
            </div>
          </>
        )}

        {activeTab === "Изображения" && isEdit && product && <ImagesTab productId={product.id} images={product.images} imageMode={form.image_mode} onRefresh={refreshProduct} />}

        {activeTab === "Цены" && isEdit && product && (
          <PricesTab productId={product.id} prices={product.prices} priceTypes={priceTypes as PriceType[]} warehouses={warehouses as any[]} onRefresh={refreshProduct} />
        )}
      </div>
    </RBACGuard>
  );
};

export default ProductFormPage;
