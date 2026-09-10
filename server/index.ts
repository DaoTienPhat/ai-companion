import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn('GEMINI_API_KEY is missing. /api/token will return an error.');
}

const app = express();
app.use(cors());

const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, geminiConfigured: Boolean(apiKey) });
});

app.get('/api/token', async (_req, res) => {
  if (!ai) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured.' });
  try {
    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const newSessionExpireTime = new Date(Date.now() + 60 * 1000).toISOString();

    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        liveConnectConstraints: {
          model: 'gemini-3.1-flash-live-preview',
          config: {
            responseModalities: ['AUDIO']
          }
        }
      }
    });

    res.json({ token: token.name });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create Gemini ephemeral token.' });
  }
});

const port = Number(process.env.PORT || 3001);
app.listen(port, () => console.log(`Token server listening on http://localhost:${port}`));
