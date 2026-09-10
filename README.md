# AI Companion — Gemini Live V2

Mobile-first React + TypeScript + Vite app for continuous realtime voice conversation with Gemini Live API.

## Stack

- React + TypeScript + Vite
- Tiny Express token server
- Gemini Live API over raw WebSocket
- Ephemeral token authentication
- Browser microphone → PCM 16 kHz mono
- Gemini audio → PCM 24 kHz playback
- Automatic voice activity detection and interruption/barge-in
- Input/output transcription
- PWA manifest

## Requirements

- Node.js 20+
- A Gemini API key with access to Gemini Live API
- A browser that supports microphone access

## Run locally

1. Copy `.env.example` to `.env`.
2. Put your key in `.env`:

```env
GEMINI_API_KEY=your_key_here
```

3. Install packages:

```bash
npm install
```

4. Start both services:

```bash
npm run dev:all
```

Or use two terminals:

```bash
npm run server
npm run dev
```

Open http://localhost:5173.

## Important security rule

Never put the long-lived Gemini API key in frontend code or commit `.env` to GitHub. The Express server exchanges the key for a short-lived ephemeral token, and the browser connects to the constrained Live API WebSocket with that token.

## Current Gemini model

`gemini-3.1-flash-live-preview`

## Notes

The Live API expects raw 16-bit PCM audio at 16 kHz, little-endian for input. Model audio is returned as base64 PCM and played at 24 kHz in this app.

This is a V2 local-development baseline. For production, add rate limiting, authentication, HTTPS, stronger origin restrictions, session resumption, and serverless deployment support.
