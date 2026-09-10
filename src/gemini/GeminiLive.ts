export type GeminiCallbacks = {
  onOpen?: () => void;
  onClose?: (reason: string) => void;
  onError?: (message: string) => void;
  onAudio?: (base64Pcm24k: string) => void;
  onInputTranscript?: (text: string, interim: boolean) => void;
  onOutputTranscript?: (text: string) => void;
  onTurnComplete?: () => void;
};

const MODEL = 'gemini-3.1-flash-live-preview';
const WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';

export class GeminiLive {
  private ws: WebSocket | null = null;
  private callbacks: GeminiCallbacks;

  constructor(callbacks: GeminiCallbacks = {}) {
    this.callbacks = callbacks;
  }

  async connect(): Promise<void> {
    this.close();

    const response = await fetch('/api/token');
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? `Token request failed (${response.status})`);
    }

    const { token } = (await response.json()) as { token: string };
    const url = `${WS_BASE}?access_token=${encodeURIComponent(token)}`;

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;

      let opened = false;

      ws.onopen = () => {
        opened = true;
        ws.send(JSON.stringify({
          setup: {
            model: `models/${MODEL}`,
            responseModalities: ['AUDIO'],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            contextWindowCompression: {
              slidingWindow: {}
            },
            systemInstruction: {
              parts: [{
                text: [
                  'Bạn là một AI companion nói tiếng Việt, thân thiện và tự nhiên.',
                  'Mục tiêu là trò chuyện như một người bạn thông minh trong đời thực, không phải chatbot đọc kịch bản.',
                  'Trả lời ngắn gọn khi câu hỏi đơn giản; chỉ giải thích dài khi cần.',
                  'Ưu tiên giọng nói tự nhiên, có nhịp nghỉ hợp lý, không lặp lại câu hỏi của người dùng.',
                  'Khi người dùng đang nói thì không cố tranh lời; hãy tận dụng cơ chế ngắt lời realtime.',
                  'Không tự giới thiệu dài dòng. Khi phiên bắt đầu, chỉ chào ngắn và mời người dùng nói chuyện.'
                ].join(' ')
              }]
            },
            generationConfig: {
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: 'Puck'
                  }
                }
              }
            },
            realtimeInputConfig: {
              automaticActivityDetection: {
                disabled: false,
                startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
                endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
                prefixPaddingMs: 200,
                silenceDurationMs: 650
              },
              activityHandling: 'START_OF_ACTIVITY_INTERRUPTS'
            }
          }
        }));
        this.callbacks.onOpen?.();
        resolve();
      };

      ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      ws.onerror = () => {
        const message = 'Gemini Live WebSocket error.';
        this.callbacks.onError?.(message);
        if (!opened) reject(new Error(message));
      };

      ws.onclose = (event) => {
        this.ws = null;
        const reason = event.reason || `WebSocket closed (${event.code})`;
        this.callbacks.onClose?.(reason);
        if (!opened) reject(new Error(reason));
      };
    });
  }

  sendAudio(base64Pcm16k: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      realtimeInput: {
        audio: {
          data: base64Pcm16k,
          mimeType: 'audio/pcm;rate=16000'
        }
      }
    }));
  }

  sendText(text: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ realtimeInput: { text } }));
  }

  close(): void {
    if (this.ws) {
      this.ws.close(1000, 'client closed');
      this.ws = null;
    }
  }

  private handleMessage(raw: string): void {
    let message: any;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    if (message.error) {
      this.callbacks.onError?.(message.error.message ?? 'Gemini Live returned an error.');
      return;
    }

    const content = message.serverContent;
    if (!content) return;

    if (content.modelTurn?.parts) {
      for (const part of content.modelTurn.parts) {
        if (part.inlineData?.data) {
          this.callbacks.onAudio?.(part.inlineData.data);
        }
      }
    }

    if (content.interimInputTranscription?.text) {
      this.callbacks.onInputTranscript?.(content.interimInputTranscription.text, true);
    }
    if (content.inputTranscription?.text) {
      this.callbacks.onInputTranscript?.(content.inputTranscription.text, false);
    }
    if (content.outputTranscription?.text) {
      this.callbacks.onOutputTranscript?.(content.outputTranscription.text);
    }
    if (content.turnComplete) {
      this.callbacks.onTurnComplete?.();
    }
  }
}
