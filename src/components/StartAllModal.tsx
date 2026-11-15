interface StartAllModalProps {
  isOpen: boolean;
  activeCount: number;
  idleCount: number;
  onClose: () => void;
  onLaunchIdleOnly: () => void;
  onRestartAll: () => void;
}

export function StartAllModal({
  isOpen,
  activeCount,
  idleCount,
  onClose,
  onLaunchIdleOnly,
  onRestartAll,
}: StartAllModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="start-all-title"
    >
      <div className="w-full max-w-md bg-[#121826] border border-[#263147] rounded-2xl p-5 shadow-2xl">
        <h2 id="start-all-title" className="text-lg font-bold text-slate-50">
          Tout lancer
        </h2>
        <p className="text-sm text-slate-300 mt-1.5 mb-5 leading-relaxed">
          {idleCount > 0
            ? `${activeCount} bac(s) déjà en cours et ${idleCount} arrêté(s). Que souhaitez-vous faire ?`
            : `Les 12 bacs sont déjà en cours. Voulez-vous tout redémarrer à zéro ?`}
        </p>

        <div className="flex flex-col gap-2.5">
          {idleCount > 0 && (
            <button
              type="button"
              onClick={onLaunchIdleOnly}
              className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors"
            >
              Lancer uniquement les arrêtés ({idleCount})
            </button>
          )}
          <button
            type="button"
            onClick={onRestartAll}
            className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-bold transition-colors"
          >
            Tout redémarrer à zéro (12 bacs)
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[#1a2234] hover:bg-[#232e45] text-slate-200 border border-[#263147] text-sm font-semibold transition-colors"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
