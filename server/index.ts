import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';

const app = express();
const port = Number(process.env.PORT ?? 3001);
const apiKey = process.env.GEMINI_API_KEY;
const model = 'gemini-3.1-flash-live-preview';

if (!apiKey) {
  console.warn('[AI Companion] GEMINI_API_KEY is not set. /api/token will fail until it is configured.');
}

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model });
});

app.get('/api/token', async (_req, res) => {
  try {
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    }

    const ai = new GoogleGenAI({ apiKey });
    const now = Date.now();
    const expireTime = new Date(now + 30 * 60 * 1000).toISOString();
    const newSessionExpireTime = new Date(now + 60 * 1000).toISOString();

    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        liveConnectConstraints: {
          model,
          config: {
            responseModalities: ['AUDIO'],
            inputAudioTranscription: {},
            outputAudioTranscription: {}
          }
        }
      }
    });

    if (!token.name) {
      return res.status(502).json({ error: 'Gemini did not return an ephemeral token.' });
    }

    res.json({ token: token.name, model });
  } catch (error) {
    console.error('[AI Companion] Token creation failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unable to create ephemeral token.'
    });
  }
});

app.listen(port, () => {
  console.log(`[AI Companion] token server listening on http://localhost:${port}`);
});
