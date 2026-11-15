import { BacStatus, ConfirmAction, GarnishItem } from '../types/station';
import { formatClock, formatHMS } from '../data/garnishItems';

interface GarnishCardProps {
  item: GarnishItem;
  status: BacStatus;
  remainingSec: number;
  endTime: number | null;
  confirmPending?: ConfirmAction;
  onPrimaryClick: (item: GarnishItem) => void;
  onStopClick: (item: GarnishItem) => void;
}

export function GarnishCard({
  item,
  status,
  remainingSec,
  endTime,
  confirmPending,
  onPrimaryClick,
  onStopClick,
}: GarnishCardProps) {
  const pct =
    status === 'idle'
      ? 0
      : status === 'danger'
      ? 100
      : Math.max(0, Math.min(100, (remainingSec / item.sec) * 100));

  const cardSurface =
    status === 'danger'
      ? 'bg-[#1f1218] border-red-500 card-pulse-danger'
      : status === 'warning'
      ? 'bg-[#121826] border-amber-500 card-pulse-warn'
      : status === 'active'
      ? 'bg-[#121826] border-emerald-500'
      : 'bg-[#121826] border-[#263147]';

  const timerColor =
    status === 'danger'
      ? 'text-red-500'
      : status === 'warning'
      ? 'text-amber-400'
      : status === 'active'
      ? 'text-emerald-400'
      : 'text-slate-500';

  const statusTagStyle =
    status === 'danger'
      ? 'bg-red-500/25 text-red-200'
      : status === 'warning'
      ? 'bg-amber-500/15 text-amber-400'
      : status === 'active'
      ? 'bg-emerald-500/15 text-emerald-400'
      : 'bg-[#1a2234] text-slate-400';

  const statusLabel =
    status === 'danger'
      ? 'Périmé'
      : status === 'warning'
      ? 'Bientôt'
      : status === 'active'
      ? 'En cours'
      : 'Arrêté';

  const progressColor =
    status === 'danger'
      ? 'bg-red-500'
      : status === 'warning'
      ? 'bg-amber-500'
      : status === 'active'
      ? 'bg-emerald-500'
      : 'bg-slate-600';

  const primaryLabel =
    confirmPending === 'start'
      ? 'CONFIRMER ?'
      : status === 'idle'
      ? 'DÉMARRER'
      : status === 'danger'
      ? 'RENOUVELER'
      : 'RECHARGER';

  const primaryBtnStyle =
    confirmPending === 'start'
      ? 'bg-red-600 text-white hover:bg-red-500'
      : status === 'danger'
      ? 'bg-red-600 text-white hover:bg-red-500'
      : status === 'warning'
      ? 'bg-amber-600 text-white hover:bg-amber-500'
      : status === 'active'
      ? 'bg-emerald-600 text-white hover:bg-emerald-500'
      : 'bg-[#273549] text-slate-50 hover:bg-[#31425b]';

  const stopLabel = confirmPending === 'stop' ? 'SÛR ?' : 'VIDER';
  const stopBtnStyle =
    confirmPending === 'stop'
      ? 'bg-red-600 text-white border-red-600'
      : 'bg-[#1a2234] text-slate-300 border-[#263147] hover:text-white hover:border-slate-500';

  const endTextColor =
    status === 'danger'
      ? 'text-red-300'
      : status === 'warning'
      ? 'text-amber-200'
      : status === 'active'
      ? 'text-emerald-300'
      : 'text-slate-400';

  return (
    <article
      className={`rounded-2xl border-2 p-3.5 flex flex-col justify-between gap-2.5 transition-colors duration-150 ${cardSurface}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-3xl leading-none shrink-0" aria-hidden="true">
          {item.icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className="text-[1.02rem] font-bold text-slate-50 truncate tracking-[0.01em]"
            title={item.name}
          >
            {item.name}
          </h3>
          <div className="flex items-center gap-1.5 mt-0.5 text-xs font-medium text-slate-400">
            <span className="font-mono-tabular text-slate-300">{item.dureeTxt}</span>
            <span aria-hidden="true">·</span>
            <span className={`font-mono-tabular truncate ${endTextColor}`}>
              {endTime ? `Fin ${formatClock(endTime, false)}` : 'En attente'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <div className={`font-mono-tabular text-[1.95rem] font-extrabold leading-none tracking-tight ${timerColor}`}>
          {status === 'danger' ? '00:00:00' : formatHMS(status === 'idle' ? item.sec : remainingSec)}
        </div>
        <span
          className={`text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-md shrink-0 whitespace-nowrap ${statusTagStyle}`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="w-full h-1.5 bg-[#1a2234] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width,background-color] duration-500 ease-linear ${progressColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPrimaryClick(item)}
          className={`flex-[2] min-h-[46px] px-3 py-2.5 rounded-xl text-sm font-extrabold tracking-wide whitespace-nowrap transition-transform active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${primaryBtnStyle}`}
        >
          {primaryLabel}
        </button>
        <button
          type="button"
          onClick={() => onStopClick(item)}
          disabled={status === 'idle'}
          className={`flex-1 min-h-[46px] px-2.5 py-2.5 rounded-xl text-xs font-bold border whitespace-nowrap transition-transform active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${stopBtnStyle}`}
        >
          {stopLabel}
        </button>
      </div>
    </article>
  );
}
