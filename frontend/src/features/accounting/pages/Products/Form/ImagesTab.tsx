import React, { useState } from "react";
import { Trash2, Star, Upload } from "lucide-react";

import { ConfirmModal } from "../../../../../components/ui/Modal/ConfirmModal";
import { useNotify } from "../../../../../core/context/NotificationContext";
import type { ProductImage } from "../../../../../core/types";
import { productImageApi } from "../../../services/productApi";

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
      <label className="flex items-center gap-2 cursor-pointer w-fit px-4 py-2 rounded-lg border-2 border-dashed border-indigo-400 hover:border-indigo-600 transition-colors text-sm text-indigo-600 dark:text-indigo-400">
        <Upload className="w-4 h-4" />
        {uploading ? "Загрузка..." : "Загрузить изображения"}

        <input type="file" multiple accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
      </label>

      {images.length === 0 ? (
        <p className="text-sm text-gray-400">Изображений нет</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {images.map((img) => (
            <div key={img.id} className={`relative group rounded-lg overflow-hidden border-2 transition-colors ${img.is_main ? "border-indigo-500" : "border-gray-200 dark:border-slate-600"}`}>
              <div className="aspect-square bg-gray-100 dark:bg-slate-800">
                <img src={img.thumbnail_url ?? img.image_url ?? ""} alt={img.alt_text} className={`w-full h-full object-${imageMode}`} />
              </div>

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

export default ImagesTab;
