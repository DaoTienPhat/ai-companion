export type AudioPipelineCallbacks = {
  onPcm16k?: (base64: string) => void;
  onInputActivity?: (active: boolean) => void;
};

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

function resample(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (inputRate === outputRate) return input;
  const ratio = inputRate / outputRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const sourceIndex = i * ratio;
    const left = Math.floor(sourceIndex);
    const right = Math.min(left + 1, input.length - 1);
    const fraction = sourceIndex - left;
    output[i] = input[left] * (1 - fraction) + input[right] * fraction;
  }
  return output;
}

function int16ToBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

function base64ToInt16(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

export class AudioPipeline {
  private inputContext: AudioContext | null = null;
  private outputContext: AudioContext | null = null;
  private inputStream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private outputNextTime = 0;
  private callbacks: AudioPipelineCallbacks;

  constructor(callbacks: AudioPipelineCallbacks = {}) {
    this.callbacks = callbacks;
  }

  async start(): Promise<void> {
    if (this.inputContext) return;

    this.inputStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    this.inputContext = new AudioContext();
    this.outputContext = new AudioContext({ sampleRate: 24000 });
    await this.inputContext.resume();
    await this.outputContext.resume();

    this.source = this.inputContext.createMediaStreamSource(this.inputStream);
    this.processor = this.inputContext.createScriptProcessor(2048, 1, 1);

    this.processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const rms = Math.sqrt(input.reduce((sum, value) => sum + value * value, 0) / input.length);
      this.callbacks.onInputActivity?.(rms > 0.015);
      const pcm = floatTo16BitPCM(resample(input, this.inputContext!.sampleRate, 16000));
      this.callbacks.onPcm16k?.(int16ToBase64(pcm));
    };

    this.source.connect(this.processor);
    this.processor.connect(this.inputContext.destination);
  }

  playPcm24k(base64: string): void {
    if (!this.outputContext) return;
    const samples = base64ToInt16(base64);
    const buffer = this.outputContext.createBuffer(1, samples.length, 24000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768;

    const source = this.outputContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.outputContext.destination);

    const now = this.outputContext.currentTime;
    this.outputNextTime = Math.max(this.outputNextTime, now + 0.01);
    source.start(this.outputNextTime);
    this.outputNextTime += buffer.duration;
  }

  stopPlayback(): void {
    // Recreate the output context on demand to flush already-buffered model audio.
    if (this.outputContext) {
      void this.outputContext.close();
      this.outputContext = new AudioContext({ sampleRate: 24000 });
      this.outputNextTime = 0;
      void this.outputContext.resume();
    }
  }

  async stop(): Promise<void> {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.inputStream?.getTracks().forEach((track) => track.stop());

    if (this.inputContext) await this.inputContext.close().catch(() => undefined);
    if (this.outputContext) await this.outputContext.close().catch(() => undefined);

    this.inputContext = null;
    this.outputContext = null;
    this.inputStream = null;
    this.source = null;
    this.processor = null;
    this.outputNextTime = 0;
  }
}
