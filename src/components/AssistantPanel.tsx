import React, { useEffect, useRef, useState } from 'react';
import { Brain, Send, Sparkles, Trash2, Zap, X } from 'lucide-react';
import { AssistantMode, ChatMessage } from '../types/station';

interface StationSnapshot {
  currentClock: string;
  summary: {
    active: number;
    warning: number;
    danger: number;
    idle: number;
  };
  bacs: Array<{
    id: string;
    name: string;
    dureeTxt: string;
    status: 'idle' | 'active' | 'warning' | 'danger';
    remainingFormatted: string;
    endClock: string | null;
  }>;
  recentLogs: Array<{
    time: string;
    itemName: string;
    action: string;
  }>;
}

interface AssistantPanelProps {
  messages: ChatMessage[];
  mode: AssistantMode;
  onModeChange: (mode: AssistantMode) => void;
  onUpdateMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  getStationContext: () => StationSnapshot;
  onClose?: () => void;
}

const QUICK_PROMPTS: Array<{ label: string; prompt: string; suggestedMode: AssistantMode }> = [
  {
    label: 'Priorités immédiates',
    prompt: 'Analyse l’état actuel de mes 12 bacs et dis-moi ce que je dois traiter en priorité maintenant.',
    suggestedMode: 'fast',
  },
  {
    label: 'Planifier le rush',
    prompt:
      'Avec les temps restants actuels sur mes bacs, établis un plan de rotation optimal pour tenir un rush de 2 heures sans rupture ni perte HACCP.',
    suggestedMode: 'deep',
  },
  {
    label: 'Règles DLC & FIFO',
    prompt: 'Quelles sont les bonnes pratiques FIFO et de sécurité alimentaire pour mes sauces, fromages et salades ?',
    suggestedMode: 'standard',
  },
];

function FormattedText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-slate-100">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="h-1" />;
        }

        const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('* ');
        const cleanLine = isBullet ? trimmed.slice(2) : line;

        const parts = cleanLine.split(/(\*\*[^*]+\*\*)/g).map((part, pIdx) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return (
              <strong key={pIdx} className="font-bold text-white">
                {part.slice(2, -2)}
              </strong>
            );
          }
          return <React.Fragment key={pIdx}>{part}</React.Fragment>;
        });

        if (isBullet) {
          return (
            <div key={idx} className="flex gap-2 pl-1">
              <span className="text-sky-400 select-none">•</span>
              <div className="flex-1">{parts}</div>
            </div>
          );
        }

        return <p key={idx}>{parts}</p>;
      })}
    </div>
  );
}

export function AssistantPanel({
  messages,
  mode,
  onModeChange,
  onUpdateMessages,
  getStationContext,
  onClose,
}: AssistantPanelProps) {
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  const sendMessage = async (textToSend: string, overrideMode?: AssistantMode) => {
    const trimmed = textToSend.trim();
    if (!trimmed || isStreaming) return;

    const activeMode = overrideMode || mode;
    if (overrideMode && overrideMode !== mode) {
      onModeChange(overrideMode);
    }

    setErrorMsg(null);
    setInput('');

    const userMsg: ChatMessage = {
      id: `${Date.now()}_u`,
      role: 'user',
      text: trimmed,
      mode: activeMode,
      timestamp: Date.now(),
    };

    const assistantId = `${Date.now()}_m`;
    const placeholderAssistant: ChatMessage = {
      id: assistantId,
      role: 'model',
      text: '',
      mode: activeMode,
      timestamp: Date.now(),
    };

    const nextHistory = [...messages, userMsg];
    onUpdateMessages([...nextHistory, placeholderAssistant]);
    setIsStreaming(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextHistory.map((m) => ({ role: m.role, text: m.text })),
          mode: activeMode,
          stationContext: getStationContext(),
        }),
      });

      if (!response.ok || !response.body) {
        const fallbackErr = await response.json().catch(() => ({ error: 'Erreur de communication avec le serveur.' }));
        throw new Error(fallbackErr.error || 'Erreur serveur.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const evt of events) {
          const dataLine = evt
            .split('\n')
            .find((l) => l.startsWith('data: '));
          if (!dataLine) continue;

          try {
            const payload = JSON.parse(dataLine.slice(6)) as {
              text?: string;
              error?: string;
              done?: boolean;
            };

            if (payload.error) {
              throw new Error(payload.error);
            }

            if (payload.text) {
              accumulated += payload.text;
              onUpdateMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, text: accumulated } : m))
              );
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== 'Unexpected end of JSON input') {
              throw parseErr;
            }
          }
        }
      }

      if (!accumulated.trim()) {
        onUpdateMessages((prev) => prev.filter((m) => m.id !== assistantId));
        setErrorMsg("Aucune réponse reçue de l'assistant. Veuillez réessayer.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Impossible de joindre l’assistant.';
      setErrorMsg(msg);
      onUpdateMessages((prev) =>
        prev.filter((m) => !(m.id === assistantId && m.text.trim() === ''))
      );
    } finally {
      setIsStreaming(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  const handleClearChat = () => {
    if (isStreaming) return;
    onUpdateMessages([]);
    setErrorMsg(null);
  };

  return (
    <aside className="bg-[#121826] border border-[#263147] rounded-2xl flex flex-col h-[calc(100dvh-165px)] min-h-[460px] max-h-[820px] overflow-hidden">
      <div className="p-4 border-b border-[#263147] flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-50">Assistant Poste Garniture</h2>
            <p className="text-xs text-slate-400">
              Connecté en direct aux 12 chronos et aux règles HACCP
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleClearChat}
                disabled={isStreaming}
                title="Nouvelle conversation"
                className="min-h-[40px] min-w-[40px] px-2.5 rounded-xl bg-[#1a2234] border border-[#263147] text-slate-300 hover:text-white flex items-center justify-center disabled:opacity-40"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                title="Fermer l’assistant"
                className="min-h-[40px] min-w-[40px] px-2.5 rounded-xl bg-[#1a2234] border border-[#263147] text-slate-300 hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div
          className="grid grid-cols-3 gap-1 p-1 bg-[#090d16] rounded-xl border border-[#263147]"
          role="group"
          aria-label="Mode de réflexion de l'assistant"
        >
          <button
            type="button"
            onClick={() => onModeChange('fast')}
            className={`min-h-[38px] px-2 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
              mode === 'fast'
                ? 'bg-[#1a2234] text-sky-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5 shrink-0" />
            <span>Rapide</span>
          </button>
          <button
            type="button"
            onClick={() => onModeChange('standard')}
            className={`min-h-[38px] px-2 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
              mode === 'standard'
                ? 'bg-[#1a2234] text-sky-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>Standard</span>
          </button>
          <button
            type="button"
            onClick={() => onModeChange('deep')}
            className={`min-h-[38px] px-2 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
              mode === 'deep'
                ? 'bg-sky-500/20 text-sky-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Brain className="w-3.5 h-3.5 shrink-0" />
            <span>Réflexion haute</span>
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="space-y-4 py-2">
            <div className="text-sm text-slate-300 leading-relaxed">
              Posez une question sur vos bacs en cours, l’ordre de recharge avant le rush ou les règles HACCP.
              Le mode <span className="font-semibold text-sky-300">Réflexion haute</span> raisonne en profondeur sur vos plannings complexes.
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400">Actions rapides</p>
              <div className="flex flex-col gap-2">
                {QUICK_PROMPTS.map((qp) => (
                  <button
                    key={qp.label}
                    type="button"
                    onClick={() => void sendMessage(qp.prompt, qp.suggestedMode)}
                    className="w-full text-left px-3.5 py-2.5 rounded-xl bg-[#1a2234] border border-[#263147] hover:border-sky-500/50 text-sm font-medium text-slate-100 transition-colors"
                  >
                    {qp.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white text-sm font-medium'
                    : 'bg-[#1a2234] border border-[#263147] text-slate-100'
                }`}
              >
                {msg.role === 'user' ? (
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                ) : msg.text ? (
                  <FormattedText text={msg.text} />
                ) : (
                  <div className="flex items-center gap-2 text-xs text-slate-300 py-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                    <span>
                      {msg.mode === 'deep'
                        ? 'Réflexion approfondie en cours...'
                        : 'Analyse du poste...'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {errorMsg && (
          <div className="rounded-xl bg-red-500/15 border border-red-500/40 px-3.5 py-2.5 text-xs text-red-200">
            {errorMsg}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-3 border-t border-[#263147] bg-[#090d16]/50 shrink-0">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              mode === 'deep'
                ? 'Question complexe (planning rush, audit)...'
                : 'Question rapide sur le poste...'
            }
            disabled={isStreaming}
            className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-[#1a2234] border border-[#263147] text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            aria-label="Envoyer le message"
            className="min-h-[44px] min-w-[44px] px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </aside>
  );
}
