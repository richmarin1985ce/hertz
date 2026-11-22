import { toProcessorVoices, type Voice } from './model';
export type AudioStatus = { time: number; active: number; levels: Record<string, boolean>; sampleRate: number };
export class HertzAudio {
  context: AudioContext | null = null;
  worklet: AudioWorkletNode | null = null;
  gain: GainNode | null = null;
  analyser: AnalyserNode | null = null;
  compressor: DynamicsCompressorNode | null = null;
  stream: MediaStreamAudioDestinationNode | null = null;
  initialized = false;
  onStatus?: (status: AudioStatus) => void;
  private lastVoices: Voice[] = [];
  private lastVolume = 0.5;

  async init() {
    if (this.initialized) return;
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    try {
      await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}audio-engine.js`);
      const node = new AudioWorkletNode(ctx, 'hertz-engine', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -6; compressor.knee.value = 4; compressor.ratio.value = 10;
      compressor.attack.value = 0.003; compressor.release.value = 0.12;
      const gain = ctx.createGain(); gain.gain.value = this.lastVolume;
      const analyser = ctx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.75;
      const stream = ctx.createMediaStreamDestination();
      node.connect(compressor).connect(gain).connect(analyser);
      analyser.connect(ctx.destination); analyser.connect(stream);
      this.context = ctx; this.worklet = node; this.gain = gain;
      this.analyser = analyser; this.compressor = compressor; this.stream = stream;
      node.port.onmessage = ({ data }) => {
        if (data?.type === 'status' && this.onStatus) this.onStatus({ ...data, sampleRate: ctx.sampleRate });
      };
      this.initialized = true;
      this.setVoices(this.lastVoices);
      this.setVolume(this.lastVolume);
    } catch (error) { await ctx.close(); throw error; }
  }
  setVoices(voices: Voice[]) {
    this.lastVoices = voices;
    if (this.worklet && this.context) this.worklet.port.postMessage({ type: 'voices', voices: toProcessorVoices(voices, this.context.sampleRate / 2) });
  }
  setVolume(volume: number) {
    this.lastVolume = volume;
    if (this.gain && this.context) this.gain.gain.setTargetAtTime(volume, this.context.currentTime, 0.012);
  }
  async play() {
    await this.init();
    await this.context!.resume();
    this.worklet!.port.postMessage({ type: 'play' });
  }
  pause() { this.worklet?.port.postMessage({ type: 'pause' }); }
  stop() { this.worklet?.port.postMessage({ type: 'stop' }); }
  async close() { if (this.context) await this.context.close(); this.initialized = false; }
}
