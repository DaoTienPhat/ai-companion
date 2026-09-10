import { useRef, useState } from 'react';
import './App.css';
import { GeminiLive } from './gemini/GeminiLive';
import { AudioPipeline } from './audio/AudioPipeline';

type Status = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

type Line = { speaker: 'you' | 'gemini'; text: string };

export default function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState('');
  const liveRef = useRef<GeminiLive | null>(null);
  const audioRef = useRef<AudioPipeline | null>(null);

  const appendTranscript = (speaker: Line['speaker'], text: string, interim = false) => {
    setLines((current) => {
      if (interim) {
        const next = [...current];
        let index = -1;
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].speaker === speaker) { index = i; break; }
        }
        if (index >= 0 && next[index].text.startsWith('…')) {
          next[index] = { speaker, text: `…${text}` };
          return next;
        }
      }
      return [...current, { speaker, text }];
    });
  };

  const start = async () => {
    try {
      setError('');
      setStatus('connecting');

      const audio = new AudioPipeline({
        onPcm16k: (base64) => liveRef.current?.sendAudio(base64),
        onInputActivity: (active) => {
          if (active) audioRef.current?.stopPlayback();
        }
      });
      audioRef.current = audio;
      await audio.start();

      const live = new GeminiLive({
        onOpen: () => setStatus('listening'),
        onAudio: (base64) => {
          setStatus('speaking');
          audio.playPcm24k(base64);
        },
        onInputTranscript: (text, interim) => appendTranscript('you', interim ? text : text, interim),
        onOutputTranscript: (text) => appendTranscript('gemini', text),
        onTurnComplete: () => setStatus('listening'),
        onError: (message) => {
          setError(message);
          setStatus('error');
        },
        onClose: () => {
          if (status !== 'error') setStatus('idle');
        }
      });
      liveRef.current = live;
      await live.connect();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unable to start the companion.';
      setError(message);
      setStatus('error');
      await audioRef.current?.stop();
      audioRef.current = null;
    }
  };

  const stop = async () => {
    liveRef.current?.close();
    liveRef.current = null;
    await audioRef.current?.stop();
    audioRef.current = null;
    setStatus('idle');
  };

  const toggle = () => (status === 'idle' || status === 'error' ? start() : stop());
  const active = status !== 'idle' && status !== 'error';

  return (
    <main className="app-shell">
      <section className={`companion ${active ? 'active' : ''}`}>
        <div className="eyebrow">AI COMPANION</div>
        <div className={`orb orb-${status}`} aria-label={status}>
          <div className="orb-core" />
        </div>
        <h1>{status === 'idle' ? 'I’m here.' : status === 'speaking' ? 'I’m listening.' : status === 'error' ? 'Something went wrong.' : 'Talk to me.'}</h1>
        <p className="hint">
          {status === 'idle' ? 'Tap once. Then just talk naturally.' :
           status === 'connecting' ? 'Connecting to Gemini…' :
           status === 'speaking' ? 'You can interrupt me anytime.' :
           status === 'error' ? error : 'Listening…'}
        </p>

        <button className={`talk-button ${active ? 'stop' : ''}`} onClick={toggle} aria-label={active ? 'Stop conversation' : 'Start conversation'}>
          <span className="mic-dot" />
          {active ? 'END' : 'TALK'}
        </button>

        <div className="transcript" aria-live="polite">
          {lines.slice(-8).map((line, index) => (
            <div className={`line ${line.speaker}`} key={`${index}-${line.text}`}>
              <span>{line.speaker === 'you' ? 'YOU' : 'GEMINI'}</span>
              <p>{line.text}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
