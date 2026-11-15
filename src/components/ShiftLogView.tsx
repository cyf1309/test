import { useState } from 'react';
import { Trash2, ClipboardList } from 'lucide-react';
import { ShiftLogEntry } from '../types/station';

interface ShiftLogViewProps {
  logs: ShiftLogEntry[];
  onClearLogs: () => void;
  onReturnToStation: () => void;
}

export function ShiftLogView({ logs, onClearLogs, onReturnToStation }: ShiftLogViewProps) {
  const [confirmClear, setConfirmClear] = useState(false);

  const handleClear = () => {
    if (confirmClear) {
      onClearLogs();
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
      window.setTimeout(() => setConfirmClear(false), 3500);
    }
  };

  return (
    <section className="bg-[#121826] border border-[#263147] rounded-2xl p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#263147]">
        <div>
          <h2 className="text-lg font-bold text-slate-50">Journal du service</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Traçabilité horodatée des démarrages, recharges, alertes et retraits HACCP.
          </p>
        </div>

        {logs.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className={`min-h-[42px] px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap transition-colors ${
              confirmClear
                ? 'bg-red-600 text-white'
                : 'bg-[#1a2234] text-slate-300 border border-[#263147] hover:text-white'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            {confirmClear ? 'Confirmer effacement ?' : 'Effacer le journal'}
          </button>
        )}
      </div>

      {logs.length === 0 ? (
        <div className="py-12 px-4 text-center flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-[#1a2234] border border-[#263147] flex items-center justify-center text-slate-400">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div className="max-w-md">
            <p className="text-base font-semibold text-slate-200">Aucun mouvement enregistré</p>
            <p className="text-sm text-slate-400 mt-1">
              Lancez ou rechargez un bac sur le poste pour tracer automatiquement les rotations de ce service.
            </p>
          </div>
          <button
            type="button"
            onClick={onReturnToStation}
            className="mt-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold whitespace-nowrap"
          >
            Revenir au poste
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#263147] text-xs font-semibold text-slate-400">
                <th className="py-3 pr-4">Heure</th>
                <th className="py-3 px-4">Bac</th>
                <th className="py-3 pl-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a2234] text-sm">
              {logs.map((entry) => {
                const actionColor =
                  entry.tone === 'ok'
                    ? 'text-emerald-400'
                    : entry.tone === 'warn'
                    ? 'text-amber-400'
                    : entry.tone === 'danger'
                    ? 'text-red-400'
                    : 'text-slate-300';

                return (
                  <tr key={entry.id} className="hover:bg-[#1a2234]/50 transition-colors">
                    <td className="py-3 pr-4 font-mono-tabular text-slate-300 whitespace-nowrap">
                      {entry.timeFormatted}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-100">
                      <span className="mr-2" aria-hidden="true">
                        {entry.itemIcon}
                      </span>
                      {entry.itemName}
                    </td>
                    <td className={`py-3 pl-4 text-right font-bold whitespace-nowrap ${actionColor}`}>
                      {entry.action}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
