// frontend/src/components/ui/FloatingClock.tsx
import React, { useEffect, useRef, useState } from "react";
import { useClockStore } from "../../core/store/clockStore";

// ✅ Дизайн — как в C:\...\POS_magazin\src\POS.App\Controls\AnalogClock.xaml
// (WPF-виджет того же назначения): круг 220x220 с лёгкой радиальной
// стеклянной заливкой и accent-обводкой, тёмные часовая/минутная стрелки,
// accent-цвет — секундная стрелка и центр, засечки без цифр. Здесь — та же
// палитра (Accent #0D9488 = teal-600, TextPrimary #0F172A = slate-900),
// пропорционально уменьшено под SIZE=200 (масштаб 200/220).
const SIZE = 200;

interface DragState {
  dragging: boolean;
  startX: number;
  startY: number;
  startPosX: number;
  startPosY: number;
}

const defaultPosition = () => ({ x: Math.max(window.innerWidth - SIZE - 24, 0), y: 88 });

const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), Math.max(max, 0));

/**
 * Круглые аналоговые часы поверх всего приложения (глобальный виджет, см.
 * AppLayout.tsx), перетаскиваются мышью/тач в любое место экрана.
 * Включаются/выключаются кнопкой в хедере (Header.tsx), состояние видимости
 * и позиция — в useClockStore (persist в localStorage), поэтому переживают
 * перезагрузку и переход между страницами.
 */
export const FloatingClock: React.FC = () => {
  const { visible, position, setPosition } = useClockStore();
  const [pos, setPos] = useState(() => position ?? defaultPosition());
  const [now, setNow] = useState(() => new Date());
  const dragRef = useRef<DragState | null>(null);

  // ✅ Подхватываем позицию из стора ТОЛЬКО в момент включения (переход
  // visible false→true) — именно тогда Header.tsx кладёт туда координаты
  // "под кнопкой". Если синхронизировать на любое изменение position, то
  // собственный setPosition() при отпускании мыши (см. endDrag) тут же
  // перезаписал бы pos обратно, и перетаскивание визуально залипало бы.
  const wasVisible = useRef(visible);
  useEffect(() => {
    if (visible && !wasVisible.current) {
      setPos(position ?? defaultPosition());
    }
    wasVisible.current = visible;
  }, [visible, position]);

  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, [visible]);

  if (!visible) return null;

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, startPosX: pos.x, startPosY: pos.y };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const ds = dragRef.current;
    if (!ds?.dragging) return;
    const nextX = clamp(ds.startPosX + (e.clientX - ds.startX), window.innerWidth - SIZE);
    const nextY = clamp(ds.startPosY + (e.clientY - ds.startY), window.innerHeight - SIZE);
    setPos({ x: nextX, y: nextY });
  };

  const endDrag = () => {
    if (!dragRef.current) return;
    dragRef.current.dragging = false;
    setPosition(pos);
  };

  const seconds = now.getSeconds();
  const minutes = now.getMinutes();
  const hours = now.getHours() % 12;

  // ✅ Те же формулы, что и UpdateHands() в AnalogClock.xaml.cs (минутная и
  // часовая стрелки чуть "подтекают" вслед за секундами/минутами, а не
  // прыгают дискретно).
  const secondAngle = seconds * 6;
  const minuteAngle = minutes * 6 + seconds * 0.1;
  const hourAngle = hours * 30 + minutes * 0.5;

  return (
    <div
      className="fixed z-[70] select-none touch-none cursor-move print:hidden"
      style={{ left: pos.x, top: pos.y, width: SIZE, height: SIZE }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      title="Часы — перетащите в любое место"
    >
      <div className="relative w-full h-full rounded-full">
        {/* Стеклянная подложка — радиальный градиент белого (20%→8%) + accent-обводка,
            как Ellipse+RadialGradientBrush+DropShadowEffect в AnalogClock.xaml. */}
        <div
          className="absolute inset-0 rounded-full border-[3px] border-teal-600"
          style={{
            background: "radial-gradient(circle, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.08) 100%)",
            boxShadow: "0 3px 18px rgba(15,23,42,0.25)",
          }}
        />

        <div className="absolute inset-0 rounded-full overflow-hidden">
          {/* Часовые деления — без цифр, как в оригинале: 4 крупные (12/3/6/9) + 8 мелких. */}
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="absolute inset-0" style={{ transform: `rotate(${i * 30}deg)` }}>
              <div className={`absolute left-1/2 top-1 -translate-x-1/2 rounded-full bg-slate-900 ${i % 3 === 0 ? "w-[3px] h-[14px]" : "w-[1.5px] h-[7px]"}`} />
            </div>
          ))}

          {/* Цифры */}
          {Array.from({ length: 12 }).map((_, idx) => {
            const hourNum = idx === 0 ? 12 : idx;
            const angle = idx * 30;
            return (
              <div key={idx} className="absolute inset-0" style={{ transform: `rotate(${angle}deg)` }}>
                <span
                  className="absolute left-1/2 top-[20px] text-[14px] font-bold text-slate-900 leading-none"
                  style={{ transform: `translateX(-50%) rotate(${-angle}deg)` }}
                >
                  {hourNum}
                </span>
              </div>
            );
          })}

          {/* Часовая стрелка */}
          <div className="absolute inset-0" style={{ transform: `rotate(${hourAngle}deg)` }}>
            <div className="absolute left-1/2 top-1/2 w-[5px] h-[50px] -mt-[50px] -translate-x-1/2 rounded-full bg-slate-900" />
          </div>

          {/* Минутная стрелка */}
          <div className="absolute inset-0" style={{ transform: `rotate(${minuteAngle}deg)` }}>
            <div className="absolute left-1/2 top-1/2 w-[3.5px] h-[73px] -mt-[73px] -translate-x-1/2 rounded-full bg-slate-900" />
          </div>

          {/* Секундная стрелка — accent-цвет, тонкая */}
          <div className="absolute inset-0 transition-transform duration-150" style={{ transform: `rotate(${secondAngle}deg)` }}>
            <div className="absolute left-1/2 top-1/2 w-[2px] h-[82px] -mt-[82px] -translate-x-1/2 rounded-full bg-teal-600" />
          </div>

          {/* Центр */}
          <div className="absolute left-1/2 top-1/2 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-600" />
        </div>
      </div>
    </div>
  );
};

export default FloatingClock;
