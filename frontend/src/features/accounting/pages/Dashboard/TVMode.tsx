// frontend/src/features/accounting/pages/Dashboard/TVMode.tsx
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { ArrowUp, ArrowDown, Sparkles } from "lucide-react";
import { RevenueByWarehouseChart, type RevenueByWarehouseRow } from "./RevenueByWarehouseChart";
import { RevenueTrendChart, type RevenueTrendPoint } from "./RevenueTrendChart";
import { TopList } from "./TopList";
import { DocumentsTicker, type TickerDocument } from "./DocumentsTicker";
import type { Delta } from "./dashboardHelpers";

interface Props {
  onClose: () => void;
  totalRevenue: number;
  totalDocuments: number;
  avgCheck: number;
  revenueDelta?: Delta;
  documentsDelta?: Delta;
  avgCheckDelta?: Delta;
  byWarehouse: RevenueByWarehouseRow[];
  daily: RevenueTrendPoint[];
  topProducts: { product_id: number; product_name: string; revenue: string; quantity: string }[];
  topCounterparties: { counterparty_id: number; counterparty_name: string; revenue: string; documents_count: number }[];
  todayDocuments: TickerDocument[];
  periodFrom: string;
  periodTo: string;
}

const fmt = (v: number | string) => Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const BigDelta = ({ delta }: { delta?: Delta }) => {
  const { t } = useTranslation();
  if (!delta) return null;
  if (delta.isNew) {
    return (
      <span className="inline-flex items-center gap-1 text-2xl font-semibold text-indigo-600 dark:text-indigo-400">
        <Sparkles className="w-6 h-6" /> {t("New")}
      </span>
    );
  }
  if (delta.pct == null) return null;
  const isUp = delta.pct > 0;
  const isFlat = delta.pct === 0;
  const colorClass = isFlat ? "text-gray-500 dark:text-gray-400" : isUp ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400";
  return (
    <span className={`inline-flex items-center gap-1 text-2xl font-semibold tabular-nums ${colorClass}`}>
      {!isFlat && (isUp ? <ArrowUp className="w-6 h-6" /> : <ArrowDown className="w-6 h-6" />)}
      {isUp ? "+" : ""}{delta.pct.toFixed(1)}%
    </span>
  );
};

const BigTile = ({ label, value, delta }: { label: string; value: string; delta?: Delta }) => (
  <div className="flex-1 rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-6 py-5 text-center">
    <div className="text-xl text-gray-500 dark:text-gray-400 mb-1">{label}</div>
    <div className="text-6xl font-bold text-gray-900 dark:text-white tabular-nums mb-1">{value}</div>
    <BigDelta delta={delta} />
  </div>
);

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 p-5">
    <h2 className="text-2xl font-semibold text-gray-600 dark:text-gray-300 mb-3">{title}</h2>
    {children}
  </div>
);

// ✅ Полноэкранный "режим проекции" (переговорка/большой экран) — показывает
// ВСЁ сразу одной сеткой (по просьбе пользователя, было по слайдам), стиль
// подчиняется обычной глобальной теме (dark:), а не зафиксирован хардкодом —
// поэтому графики/списки больше не получают forceDark, просто обычные
// компоненты дашборда, только крупнее. Esc/крестик — выход.
export const TVMode = ({
  onClose,
  totalRevenue,
  totalDocuments,
  avgCheck,
  revenueDelta,
  documentsDelta,
  avgCheckDelta,
  byWarehouse,
  daily,
  topProducts,
  topCounterparties,
  todayDocuments,
  periodFrom,
  periodTo,
}: Props) => {
  const { t } = useTranslation();

  useEffect(() => {
    const el = document.documentElement;
    el.requestFullscreen?.().catch(() => {});
    return () => {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-gray-100 p-8 flex items-center justify-center">
      <div className="w-full max-w-[1700px] mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold">{t("Desktop")}</h1>
            <p className="text-xl text-gray-500 dark:text-gray-400">
              {new Date(periodFrom).toLocaleDateString("ru-RU")} — {new Date(periodTo).toLocaleDateString("ru-RU")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-14 h-14 flex items-center justify-center rounded-full border border-gray-300 dark:border-white/20 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-7 h-7" />
          </button>
        </div>

        <DocumentsTicker documents={todayDocuments} large />

        <div className="flex gap-5 flex-wrap">
          <BigTile label={t("TotalRevenue")} value={fmt(totalRevenue)} delta={revenueDelta} />
          <BigTile label={t("TotalDocuments")} value={String(Math.round(totalDocuments))} delta={documentsDelta} />
          <BigTile label={t("AverageCheck")} value={fmt(avgCheck)} delta={avgCheckDelta} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card title={t("RevenueByWarehouse")}>
            <RevenueByWarehouseChart data={byWarehouse} />
          </Card>
          <Card title={t("RevenueTrend")}>
            <RevenueTrendChart data={daily} />
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card title={t("TopProducts")}>
            <TopList
              rows={topProducts.map((p) => ({
                id: p.product_id,
                name: p.product_name,
                revenue: p.revenue,
                extraLabel: t("Quantity"),
                extraValue: Number(p.quantity).toLocaleString("ru-RU", { maximumFractionDigits: 2 }),
              }))}
              large
            />
          </Card>
          <Card title={t("TopCounterparties")}>
            <TopList
              rows={topCounterparties.map((c) => ({
                id: c.counterparty_id,
                name: c.counterparty_name,
                revenue: c.revenue,
                extraLabel: t("DocumentsCount"),
                extraValue: String(c.documents_count),
              }))}
              large
            />
          </Card>
        </div>
      </div>
    </div>,
    document.body,
  );
};
