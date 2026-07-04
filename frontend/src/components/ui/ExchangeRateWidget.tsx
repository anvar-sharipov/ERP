// frontend/src/components/ui/ExchangeRateWidget.tsx
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { accountApi } from "../../features/accounting/services/accountingApi";
import { ROUTES } from "../../core/router/routes";
import { playClick2Sound } from "../../core/utils/sound";

export const ExchangeRateWidget: React.FC = () => {
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["exchange-rates-latest"],
    queryFn: accountApi.getLatestRates, // теперь возвращает массив напрямую
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const rates = Array.isArray(data) ? data : [];

  if (rates.length === 0) return null;

  return (
    <button onClick={() => {
      playClick2Sound();
      navigate(ROUTES.APP.EXCHANGE_RATES)
    }} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-700 transition-colors group" title="Курсы валют">
      {rates.map((rate: any) => (
        <div key={rate.id} className="flex items-center gap-1">
          <span className="text-xs text-slate-400 group-hover:text-slate-300">{rate.currency_code}:</span>
          <span className="text-xs font-semibold text-yellow-400 group-hover:text-yellow-300">{Number(rate.rate).toFixed(2)}</span>
        </div>
      ))}
    </button>
  );
};
