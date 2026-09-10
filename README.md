# AI Companion — Gemini Live V1

Mobile-first voice conversation prototype built with React + TypeScript + Vite and Gemini Live API.

## Requirements

- Node.js 20+
- A Gemini API key with access to the Live API / selected preview model
- A modern browser with microphone + Web Audio API + AudioWorklet support

## Run

```bash
npm install
```

Copy `.env.example` to `.env` and add your Gemini API key:

Windows CMD:
```bat
copy .env.example .env
```

PowerShell / macOS / Linux:
```bash
cp .env.example .env
```

Then:

```bash
npm run dev:all
```

Open `http://localhost:5173`.

## Included

- Gemini Live API over WebSocket
- Ephemeral token endpoint on the Node server
- Browser mic capture with echo cancellation / noise suppression / auto gain
- AudioWorklet capture
- Resampling to 16 kHz and conversion to raw 16-bit PCM
- Native Gemini audio output playback at 24 kHz
- Server-side automatic voice activity detection / end-of-turn detection
- Barge-in / interruption handling
- Input + output transcription capture
- Context window compression enabled
- Minimal mobile-first UI with one primary talk button
- Basic PWA manifest

## Architecture

```text
Phone browser
  ├─ Microphone → AudioWorklet → PCM 16 kHz ──────┐
  │                                                │
  └─ Speaker ← PCM 24 kHz ← Gemini Live WebSocket │
                                                   ▼
                                            Gemini Live API
                                                   ▲
                                                   │
                                     ephemeral token endpoint
                                                   │
                                             Node + Express
                                                   │
                                            GEMINI_API_KEY
```

The browser receives a short-lived Gemini token from `/api/token`. The long-lived API key stays on the server.

## Production notes

Serve over HTTPS. Put the API server behind the same origin or a secure reverse proxy. Add authentication, rate limiting, logging, and abuse protection before making `/api/token` public.

This is intentionally a V1 prototype: no accounts, database, long-term memory, or tools yet.
