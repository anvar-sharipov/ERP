import React from 'react';

interface ColorPickerProps {
  label?: string;
  selectedColor: string;
  onSelect: (color: string) => void;
}

const COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#84cc16", 
  "#10b981", "#06b6d4", "#3b82f6", "#6366f1", 
  "#8b5cf6", "#d946ef", "#f43f5e", "#64748b"
];

export const ColorPicker: React.FC<ColorPickerProps> = ({ 
  label = "Цвет", 
  selectedColor, 
  onSelect 
}) => {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onSelect(c)}
            className={`w-8 h-8 rounded-full transition-all focus:outline-none ${
              selectedColor === c 
                ? "ring-2 ring-offset-2 ring-indigo-500 scale-110 shadow-lg" 
                : "hover:scale-105 hover:shadow-sm"
            }`}
            style={{ backgroundColor: c }}
            aria-label={`Выбрать цвет ${c}`}
          />
        ))}
      </div>
    </div>
  );
};