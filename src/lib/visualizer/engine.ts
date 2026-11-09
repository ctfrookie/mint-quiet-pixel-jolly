const MIN_HZ = 36;
const MAX_HZ = 14000;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private fileSource: MediaElementAudioSourceNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private freq = new Uint8Array(0);
  private time = new Uint8Array(0);
  private objectUrl: string | null = null;
  private monitoring = false;
  fileLoaded = false;

  constructor(readonly audio: HTMLAudioElement) {}

  private async context(): Promise<AudioContext> {
    if (!this.ctx) {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.62;
      this.ctx = ctx;
      this.analyser = analyser;
      this.freq = new Uint8Array(analyser.frequencyBinCount);
      this.time = new Uint8Array(analyser.fftSize);
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    return this.ctx;
  }

  private setMonitor(on: boolean) {
    const analyser = this.analyser;
    const ctx = this.ctx;
    if (!analyser || !ctx) return;
    if (on && !this.monitoring) {
      analyser.connect(ctx.destination);
      this.monitoring = true;
    } else if (!on && this.monitoring) {
      analyser.disconnect(ctx.destination);
      this.monitoring = false;
    }
  }

  private ensureFileGraph() {
    const ctx = this.ctx;
    const analyser = this.analyser;
    if (!ctx || !analyser || this.fileSource) return;
    this.fileSource = ctx.createMediaElementSource(this.audio);
    this.fileSource.connect(analyser);
  }

  stopMic() {
    this.micSource?.disconnect();
    this.micSource = null;
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
  }

  async startMic() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("unsupported");
    }
    await this.context();
    this.audio.pause();
    this.setMonitor(false);
    this.stopMic();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = this.ctx;
    const analyser = this.analyser;
    if (!ctx || !analyser) throw new Error("no-context");
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    this.stream = stream;
    this.micSource = source;
  }

  async loadFile(file: File) {
    await this.context();
    this.stopMic();
    this.ensureFileGraph();
    this.setMonitor(true);
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    const url = URL.createObjectURL(file);
    this.objectUrl = url;
    this.fileLoaded = true;
    this.audio.src = url;
    await this.audio.play();
  }

  async play() {
    if (!this.fileLoaded) return;
    await this.context();
    this.stopMic();
    this.ensureFileGraph();
    this.setMonitor(true);
    await this.audio.play();
  }

  pause() {
    this.audio.pause();
  }

  /** Writes 0–1 log-frequency bands and a −1..1 waveform. Returns false if silent graph. */
  read(levels: Float32Array, wave: Float32Array): boolean {
    const analyser = this.analyser;
    const ctx = this.ctx;
    if (!analyser || !ctx || this.freq.length === 0) return false;
    analyser.getByteFrequencyData(this.freq);
    sampleLog(this.freq, levels, ctx.sampleRate);
    analyser.getByteTimeDomainData(this.time);
    const step = this.time.length / wave.length;
    for (let i = 0; i < wave.length; i++) {
      const k = Math.min(this.time.length - 1, (i * step) | 0);
      wave[i] = (this.time[k]! - 128) / 128;
    }
    return true;
  }

  dispose() {
    this.stopMic();
    this.audio.pause();
    this.audio.removeAttribute("src");
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
    void this.ctx?.close();
    this.ctx = null;
    this.analyser = null;
  }
}

function sampleLog(freq: Uint8Array, out: Float32Array, sampleRate: number) {
  const bins = freq.length;
  const nyquist = sampleRate / 2;
  if (bins < 2 || nyquist <= 0) {
    out.fill(0);
    return;
  }
  const maxHz = Math.min(MAX_HZ, nyquist * 0.94);
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const f0 = MIN_HZ * Math.pow(maxHz / MIN_HZ, i / n);
    const f1 = MIN_HZ * Math.pow(maxHz / MIN_HZ, (i + 1) / n);
    let i0 = Math.floor((f0 / nyquist) * bins);
    let i1 = Math.ceil((f1 / nyquist) * bins);
    if (i0 < 1) i0 = 1;
    if (i1 <= i0) i1 = i0 + 1;
    if (i1 > bins) i1 = bins;
    let sum = 0;
    for (let k = i0; k < i1; k++) sum += freq[k]!;
    const avg = sum / (i1 - i0) / 255;
    const tilt = 1 + (i / n) * 0.9;
    out[i] = Math.min(1, avg * tilt);
  }
}

export function shapeBand(value: number, sensitivity: number): number {
  const gated = value < 0.04 ? 0 : (value - 0.04) / 0.96;
  return Math.min(1, 1 - Math.exp(-gated * sensitivity * 2.6));
}

export function idleTarget(out: Float32Array, time: number, reduced: boolean) {
  const spd = reduced ? 0.4 : 1;
  const t = time * spd;
  const last = Math.max(1, out.length - 1);
  for (let i = 0; i < out.length; i++) {
    const x = i / last;
    const bass = Math.exp(-x * 3.1) * (0.42 + 0.58 * Math.sin(t * 1.65) ** 2);
    const mid = Math.abs(Math.sin(x * 10.5 + t * 2.15) * Math.sin(x * 2.6 + t * 0.55));
    const pulse = 0.45 + 0.55 * Math.sin(t * 2.35 + x * 15);
    const env = Math.sin(Math.PI * x) ** 0.7;
    out[i] = Math.min(1, (0.1 + bass * 0.62 + mid * 0.42 * pulse) * (0.32 + 0.68 * env));
  }
}

export function idleWave(out: Float32Array, time: number, reduced: boolean) {
  const spd = reduced ? 0.4 : 1;
  const t = time * spd;
  const last = Math.max(1, out.length - 1);
  for (let i = 0; i < out.length; i++) {
    const x = i / last;
    const body = Math.sin(t * 2.1 + x * 8.2) * 0.34 + Math.sin(t * 4.8 + x * 19) * 0.1;
    out[i] = body * Math.sin(Math.PI * x);
  }
}
