import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

interface IncomingMessage {
  role: 'user' | 'model';
  text: string;
}

interface BacSnapshot {
  id: string;
  name: string;
  dureeTxt: string;
  status: 'idle' | 'active' | 'warning' | 'danger';
  remainingFormatted: string;
  endClock: string | null;
}

interface StationContext {
  currentClock: string;
  summary: {
    active: number;
    warning: number;
    danger: number;
    idle: number;
  };
  bacs: BacSnapshot[];
  recentLogs: Array<{
    time: string;
    itemName: string;
    action: string;
  }>;
}

interface ChatRequestBody {
  messages?: IncomingMessage[];
  mode?: 'fast' | 'standard' | 'deep';
  stationContext?: StationContext;
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY manquante sur le serveur.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function buildSystemInstruction(stationContext?: StationContext): string {
  const basePrompt = [
    "Tu es l'assistant opérationnel du poste garniture pour l'application TIME - Poste Garniture.",
    "Tu aides l'équipier ou le responsable de poste en cuisine (restauration rapide / burger / raclette) à gérer ses rotations de bacs, anticiper les rushs, limiter le gaspillage et respecter strictement les règles d'hygiène HACCP et FIFO (First In, First Out).",
    "Réponds toujours en français, de manière claire, structurée, concrète et directement applicable en cuisine (phrases courtes, listes à puces nettes).",
    "Ne mentionne jamais de détails techniques internes ni d'API.",
  ];

  if (stationContext) {
    const bacsSummary = stationContext.bacs
      .map(
        (b) =>
          `- ${b.name} (DLC ${b.dureeTxt}) : état=${b.status}, restant=${b.remainingFormatted}${b.endClock ? `, fin=${b.endClock}` : ''}`
      )
      .join('\n');

    const logsSummary =
      stationContext.recentLogs.length > 0
        ? stationContext.recentLogs
            .slice(0, 10)
            .map((l) => `- ${l.time} : ${l.itemName} -> ${l.action}`)
            .join('\n')
        : 'Aucun événement enregistré sur ce service.';

    basePrompt.push(
      `\nÉtat en direct du poste à ${stationContext.currentClock} :`,
      `Résumé : ${stationContext.summary.active} en cours, ${stationContext.summary.warning} en alerte (< 5 min), ${stationContext.summary.danger} périmé(s), ${stationContext.summary.idle} arrêté(s).`,
      `Détail des 12 bacs :\n${bacsSummary}`,
      `Derniers mouvements du service :\n${logsSummary}`
    );
  }

  return basePrompt.join('\n');
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.post('/api/chat', async (req: Request, res: Response) => {
    const body = req.body as ChatRequestBody;
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const mode = body?.mode || 'standard';

    if (messages.length === 0) {
      res.status(400).json({ error: 'Aucun message fourni.' });
      return;
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user' || !lastMessage.text.trim()) {
      res.status(400).json({ error: 'Le dernier message doit provenir de l’utilisateur.' });
      return;
    }

    let model = 'gemini-4-hydrogen';
    let thinkingConfig: { thinkingLevel: ThinkingLevel } | undefined;

    if (mode === 'fast') {
      model = 'gemini-3.1-flash-lite';
      thinkingConfig = { thinkingLevel: ThinkingLevel.MINIMAL };
    } else if (mode === 'deep') {
      model = 'gemini-4-hydrogen';
      thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
    } else {
      model = 'gemini-4-hydrogen';
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (payload: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      const ai = getAiClient();
      const history = messages.slice(0, -1).map((msg) => ({
        role: msg.role,
        parts: [{ text: msg.text }],
      }));

      const chat = ai.chats.create({
        model,
        history,
        config: {
          systemInstruction: buildSystemInstruction(body.stationContext),
          ...(thinkingConfig ? { thinkingConfig } : {}),
        },
      });

      const stream = await chat.sendMessageStream({
        message: lastMessage.text,
      });

      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) {
          sendEvent({ text });
        }
      }

      sendEvent({ done: true, model });
      res.end();
    } catch (err: unknown) {
      const rawMessage = err instanceof Error ? err.message : 'Erreur serveur Gemini.';
      let userMessage = rawMessage;

      if (rawMessage.includes('GEMINI_API_KEY')) {
        userMessage = 'Clé API Gemini non configurée dans les secrets du projet.';
      } else if (rawMessage.includes('403') || rawMessage.includes('PERMISSION_DENIED') || rawMessage.includes('API_KEY_INVALID')) {
        userMessage = 'Clé API invalide ou accès refusé. Vérifiez votre clé dans Settings > Secrets.';
      } else if (rawMessage.includes('429') || rawMessage.includes('RESOURCE_EXHAUSTED')) {
        userMessage = 'Quota dépassé temporairement. Réessayez dans quelques instants ou passez en mode Rapide.';
      }

      sendEvent({ error: userMessage });
      res.end();
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TIME - Poste Garniture server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
