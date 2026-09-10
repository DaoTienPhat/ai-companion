export type PCMChunkHandler = (chunk: Int16Array) => void;

function downsampleBuffer(buffer: Float32Array, inputSampleRate: number, outputSampleRate: number): Float32Array {
  if (outputSampleRate === inputSampleRate) return buffer;
  if (outputSampleRate > inputSampleRate) throw new Error('Output sample rate must be <= input sample rate');

  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

export class AudioPipeline {
  private stream: MediaStream | null = null;
  private inputContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private gain: GainNode | null = null;
  private outputContext: AudioContext | null = null;
  private nextOutputTime = 0;
  private outputSources = new Set<AudioBufferSourceNode>();
  private active = false;

  async start(onPcmChunk: PCMChunkHandler): Promise<void> {
    if (this.active) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone is unavailable in this browser.');

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    this.inputContext = new AudioContext();
    await this.inputContext.audioWorklet.addModule('/audio-processor.js');

    this.source = this.inputContext.createMediaStreamSource(this.stream);
    this.worklet = new AudioWorkletNode(this.inputContext, 'pcm-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      processorOptions: {}
    });
    this.gain = this.inputContext.createGain();
    this.gain.gain.value = 0;

    this.worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (!this.active) return;
      const downsampled = downsampleBuffer(event.data, this.inputContext!.sampleRate, 16000);
      const pcm = floatTo16BitPCM(downsampled);
      if (pcm.length) onPcmChunk(pcm);
    };

    this.source.connect(this.worklet);
    this.worklet.connect(this.gain);
    this.gain.connect(this.inputContext.destination);

    this.outputContext = new AudioContext({ sampleRate: 24000 });
    await this.outputContext.resume();
    await this.inputContext.resume();
    this.nextOutputTime = this.outputContext.currentTime;
    this.active = true;
  }

  async playPcm24k(base64: string): Promise<void> {
    if (!this.outputContext) return;
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const pcm = new Int16Array(bytes.buffer);
    const audioBuffer = this.outputContext.createBuffer(1, pcm.length, 24000);
    const channel = audioBuffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 32768;

    const source = this.outputContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.outputContext.destination);
    const startAt = Math.max(this.outputContext.currentTime + 0.01, this.nextOutputTime);
    source.start(startAt);
    this.nextOutputTime = startAt + audioBuffer.duration;
    this.outputSources.add(source);
    source.onended = () => this.outputSources.delete(source);
  }

  stopPlayback(): void {
    for (const source of this.outputSources) {
      try { source.stop(); } catch { /* already stopped */ }
    }
    this.outputSources.clear();
    if (this.outputContext) this.nextOutputTime = this.outputContext.currentTime;
  }

  async stop(): Promise<void> {
    this.active = false;
    this.stopPlayback();
    this.worklet?.disconnect();
    this.source?.disconnect();
    this.gain?.disconnect();
    this.stream?.getTracks().forEach(t => t.stop());
    await this.inputContext?.close().catch(() => undefined);
    await this.outputContext?.close().catch(() => undefined);
    this.worklet = null;
    this.source = null;
    this.gain = null;
    this.inputContext = null;
    this.outputContext = null;
    this.stream = null;
  }
}
