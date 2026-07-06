import { useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface ImagePreviewProps {
  src: string | null;
  // ✅ Если передан массив из нескольких фото — показываем стрелки листания
  // (клик/клавиши ←/→) и счётчик "N / M", а startIndex — с какого фото начать
  // (обычно индекс главного фото). Без images (или с одним элементом) ведёт
  // себя как раньше — просто одно фото без стрелок.
  images?: (string | null | undefined)[];
  startIndex?: number;
  onClose: () => void;
}

export const ImagePreview = ({ src, images, startIndex = 0, onClose }: ImagePreviewProps) => {
  const gallery = (images ?? []).filter((u): u is string => !!u);
  const [index, setIndex] = useState(startIndex);

  useEffect(() => {
    setIndex(startIndex);
  }, [startIndex, src]);

  const hasGallery = gallery.length > 1;
  const current = gallery.length > 0 ? gallery[index] ?? gallery[0] : src;

  useEffect(() => {
    if (!current) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (hasGallery && e.key === "ArrowLeft") setIndex((i) => (i - 1 + gallery.length) % gallery.length);
      else if (hasGallery && e.key === "ArrowRight") setIndex((i) => (i + 1) % gallery.length);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [current, hasGallery, gallery.length, onClose]);

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-80 backdrop-blur-sm p-4" onClick={onClose}>
      {/* Кнопка закрытия */}
      <button onClick={onClose} className="absolute top-6 right-6 p-2 text-white hover:bg-white/20 rounded-full transition-colors z-[101]">
        <X size={32} />
      </button>

      {hasGallery && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => (i - 1 + gallery.length) % gallery.length);
            }}
            className="absolute left-4 md:left-6 p-2 text-white hover:bg-white/20 rounded-full transition-colors z-[101]"
          >
            <ChevronLeft size={32} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => (i + 1) % gallery.length);
            }}
            className="absolute right-4 md:right-6 p-2 text-white hover:bg-white/20 rounded-full transition-colors z-[101]"
          >
            <ChevronRight size={32} />
          </button>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white/10 text-white text-sm z-[101]">
            {index + 1} / {gallery.length}
          </div>
        </>
      )}

      {/* Контейнер для изображения с предотвращением закрытия при клике по нему */}
      <img src={current} alt="Preview" className="max-w-full max-h-full rounded-lg shadow-2xl object-contain" onClick={(e) => e.stopPropagation()} />
    </div>
  );
};
