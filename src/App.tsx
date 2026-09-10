import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioPipeline } from './audio/AudioPipeline';
import { GeminiLive } from './gemini/GeminiLive';
import './App.css';

type Status = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

type TranscriptLine = { role: 'user' | 'ai'; text: string };

export default function App() {
  const audio = useMemo(() => new AudioPipeline(), []);
  const geminiRef = useRef<GeminiLive | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [lastSpeech, setLastSpeech] = useState('');
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);

  useEffect(() => () => {
    geminiRef.current?.close();
    void audio.stop();
  }, [audio]);

  const label = {
    idle: 'Chạm để nói chuyện',
    connecting: 'Đang kết nối…',
    listening: 'Mình đang nghe',
    speaking: 'Gemini đang nói',
    error: 'Có lỗi xảy ra'
  }[status];

  const start = async () => {
    setError('');
    setStatus('connecting');
    try {
      const gemini = new GeminiLive({
        onOpen: () => setStatus('listening'),
        onError: e => {
          setError(e.message);
          setStatus('error');
        },
        onClose: reason => {
          if (reason && status !== 'idle') setError(`Kết nối đã đóng: ${reason}`);
        },
        onAudio: async audioChunk => {
          setStatus('speaking');
          await audio.playPcm24k(audioChunk);
          setLastSpeech(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        },
        onInputTranscript: text => {
          setTranscript(t => [...t, { role: 'user', text }]);
        },
        onOutputTranscript: text => {
          setTranscript(t => [...t, { role: 'ai', text }]);
        },
        onTurnComplete: () => setStatus('listening'),
        onInterrupted: () => {
          audio.stopPlayback();
          setStatus('listening');
        },
        onActivityStart: () => setStatus('listening')
      });
      geminiRef.current = gemini;
      await gemini.connect();
      await audio.start(chunk => gemini.sendAudio(chunk));
    } catch (e) {
      await audio.stop();
      geminiRef.current?.close();
      geminiRef.current = null;
      setError(e instanceof Error ? e.message : 'Unknown error');
      setStatus('error');
    }
  };

  const stop = async () => {
    geminiRef.current?.close();
    geminiRef.current = null;
    await audio.stop();
    setStatus('idle');
  };

  const toggle = () => status === 'idle' || status === 'error' ? void start() : void stop();

  return (
    <main className={`app state-${status}`}>
      <header className="topbar">
        <div className="brand">COMPANION</div>
        <div className="live-dot" aria-hidden="true" />
      </header>

      <section className="stage">
        <div className="orb" aria-hidden="true"><div className="orb-inner" /><div className="orb-ring" /></div>
        <div className="status-label">{label}</div>
        {error && <div className="error-label">{error}</div>}
      </section>

      <section className="bottom">
        <button className="talk" onClick={toggle} aria-label={label}>
          <span className="talk-core" />
        </button>
        <div className="hint">Không cần nhìn màn hình.</div>
        {lastSpeech && <div className="last-seen">Voice session · {lastSpeech}</div>}
      </section>

      {transcript.length > 0 && (
        <aside className="transcript" aria-live="polite">
          {transcript.slice(-4).map((line, i) => <p key={`${i}-${line.text}`}><b>{line.role === 'user' ? 'Bạn' : 'AI'}</b>{line.text}</p>)}
        </aside>
      )}
    </main>
  );
}
