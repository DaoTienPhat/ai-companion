export type GeminiCallbacks = {
  onOpen?: () => void;
  onClose?: (reason: string) => void;
  onError?: (error: Error) => void;
  onAudio?: (base64Pcm24k: string) => void;
  onInputTranscript?: (text: string) => void;
  onOutputTranscript?: (text: string) => void;
  onTurnComplete?: () => void;
  onInterrupted?: () => void;
  onActivityStart?: () => void;
  onActivityEnd?: () => void;
};

const MODEL = 'gemini-3.1-flash-live-preview';

function bytesToBase64(bytes: Int16Array): string {
  const u8 = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < u8.length; i += step) {
    binary += String.fromCharCode(...u8.subarray(i, Math.min(i + step, u8.length)));
  }
  return btoa(binary);
}

export type GeminiCallbacks = {
  onOpen?: () => void;
  onClose?: (reason: string) => void;
  onError?: (error: Error) => void;
  onAudio?: (base64Pcm24k: string) => void;
  onInputTranscript?: (text: string) => void;
  onOutputTranscript?: (text: string) => void;
  onTurnComplete?: () => void;
  onInterrupted?: () => void;
  onActivityStart?: () => void;
  onActivityEnd?: () => void;
};

const MODEL = 'gemini-3.1-flash-live-preview';

function bytesToBase64(bytes: Int16Array): string {
  const u8 = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < u8.length; i += step) {
    const slice = u8.subarray(i, Math.min(i + step, u8.length));
    let piece = '';
    for (let j = 0; j < slice.length; j++) piece += String.fromCharCode(slice[j]);
    binary += piece;
  }
  return btoa(binary);
}

export class GeminiLive {
  private websocket: WebSocket | null = null;
  private callbacks: GeminiCallbacks;

  constructor(callbacks: GeminiCallbacks) {
    this.callbacks = callbacks;
  }

  async connect(): Promise<void> {
    const response = await fetch('/api/token');
    if (!response.ok) throw new Error(`Token request failed (${response.status})`);
    const { token } = await response.json() as { token: string };
    if (!token) throw new Error('Gemini token was empty.');

    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    this.websocket = ws;

    await new Promise<void>((resolve, reject) => {
      let opened = false;
      ws.onopen = () => {
        opened = true;
        ws.send(JSON.stringify({
          setup: {
            model: `models/${MODEL}`,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: 'Puck' }
                }
              }
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            realtimeInputConfig: {
              automaticActivityDetection: {
                disabled: false,
                startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
                endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
                prefixPaddingMs: 200,
                silenceDurationMs: 650
              },
              activityHandling: 'START_OF_ACTIVITY_INTERRUPTS'
            },
            contextWindowCompression: {
              slidingWindow: {}
            },
            systemInstruction: {
              parts: [{
                text: [
                  'Bạn là một AI companion nói tiếng Việt tự nhiên.',
                  'Mục tiêu là tạo cảm giác như một cuộc trò chuyện thật giữa hai người.',
                  'Không nói kiểu trợ lý tổng đài, không trả lời dài dòng.',
                  'Thường trả lời 1-3 câu ngắn, nhưng không phải lúc nào cũng hỏi lại.',
                  'Chủ động duy trì chủ đề khi tự nhiên. Có thể hỏi tiếp khi người dùng bỏ lửng.',
                  'Cho phép người dùng ngắt lời. Khi người dùng chen ngang, dừng ý đang nói và lắng nghe.',
                  'Không cần chào lại ở mỗi lượt. Gọi người dùng là “bạn” và giữ giọng thân thiện, bình tĩnh.'
                ].join(' ')
              }]
            }
          }
        }));
        this.callbacks.onOpen?.();
        resolve();
      };

      ws.onerror = () => {
        const error = new Error('Gemini Live WebSocket error.');
        this.callbacks.onError?.(error);
        if (!opened) reject(error);
      };

      ws.onclose = e => {
        this.callbacks.onClose?.(e.reason || `code ${e.code}`);
        if (!opened) reject(new Error(`Gemini Live closed before setup (code ${e.code}).`));
      };

      ws.onmessage = e => this.handleMessage(e.data);
    });
  }

  private handleMessage(raw: string): void {
    let message: any;
    try { message = JSON.parse(raw); } catch { return; }

    if (message.setupComplete) return;
    if (message.goAway) {
      this.callbacks.onError?.(new Error('Gemini requested a reconnect soon.'));
    }

    const serverContent = message.serverContent;
    if (!serverContent) return;

    if (serverContent.interrupted) this.callbacks.onInterrupted?.();
    if (serverContent.turnComplete) this.callbacks.onTurnComplete?.();
    if (serverContent.inputTranscription?.text) {
      this.callbacks.onInputTranscript?.(serverContent.inputTranscription.text);
    }
    if (serverContent.outputTranscription?.text) {
      this.callbacks.onOutputTranscript?.(serverContent.outputTranscription.text);
    }
    if (serverContent.activityStart) this.callbacks.onActivityStart?.();
    if (serverContent.activityEnd) this.callbacks.onActivityEnd?.();

    for (const part of serverContent.modelTurn?.parts ?? []) {
      const audio = part.inlineData?.data;
      if (audio) this.callbacks.onAudio?.(audio);
    }
  }

  sendAudio(chunk: Int16Array): void {
    if (this.websocket?.readyState !== WebSocket.OPEN) return;
    this.websocket.send(JSON.stringify({
      realtimeInput: {
        audio: {
          data: bytesToBase64(chunk),
          mimeType: 'audio/pcm;rate=16000'
        }
      }
    }));
  }

  sendText(text: string): void {
    if (this.websocket?.readyState !== WebSocket.OPEN) return;
    this.websocket.send(JSON.stringify({ realtimeInput: { text } }));
  }

  close(): void {
    this.websocket?.close(1000, 'client closed');
    this.websocket = null;
  }
}
