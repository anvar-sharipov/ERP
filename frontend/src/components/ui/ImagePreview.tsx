import { X } from "lucide-react";


interface ImagePreviewProps {
  src: string | null;
  onClose: () => void;
}

export const ImagePreview = ({ src, onClose }: ImagePreviewProps) => {
  if (!src) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-80 backdrop-blur-sm p-4" onClick={onClose}>
      {/* Кнопка закрытия */}
      <button onClick={onClose} className="absolute top-6 right-6 p-2 text-white hover:bg-white/20 rounded-full transition-colors z-[101]">
        <X size={32} />
      </button>

      {/* Контейнер для изображения с предотвращением закрытия при клике по нему */}
      <img src={src} alt="Preview" className="max-w-full max-h-full rounded-lg shadow-2xl object-contain" onClick={(e) => e.stopPropagation()} />
    </div>
  );
};
