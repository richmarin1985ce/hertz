export type Waveform = 'sine' | 'triangle' | 'square' | 'saw' | 'white' | 'pink' | 'brown';
export type Channel = 'stereo' | 'left' | 'right' | 'binaural';
export type GateMode = 'continuous' | 'interval' | 'pattern';
export type SweepCurve = 'linear' | 'log';
export type SweepLoop = 'repeat' | 'pingpong' | 'hold';
export interface Step { id: string; on: boolean; duration: string; }
export interface Voice {
  id: string;
  name: string;
  enabled: boolean;
  solo: boolean;
  waveform: Waveform;
  frequency: string;
  volume: number;
  pan: number;
  channel: Channel;
  beat: string;
  gate: GateMode;
  on: string;
  off: string;
  delay: string;
  steps: Step[];
  attack: string;
  release: string;
  sweep: boolean;
  from: string;
  to: string;
  sweepTime: string;
  sweepCurve: SweepCurve;
  sweepLoop: SweepLoop;
}
export interface Studio {
  version: 2;
  name: string;
  voices: Voice[];
  masterVolume: number;
}
export interface LibraryItem { id: string; savedAt: string; studio: Studio; }

export const id = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
export const finite = (v: string | number, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function makeVoice(index = 1, frequency = '440'): Voice {
  return {
    id: id(), name: `OSC ${String(index).padStart(2, '0')}`, enabled: true, solo: false,
    waveform: 'sine', frequency, volume: 0.32, pan: 0, channel: 'stereo', beat: '8',
    gate: 'continuous', on: '0.5', off: '0.5', delay: '0',
    steps: [{ id: id(), on: true, duration: '0.5' }, { id: id(), on: false, duration: '0.5' }],
    attack: '0.005', release: '0.01', sweep: false,
    from: frequency, to: '880', sweepTime: '4', sweepCurve: 'log', sweepLoop: 'pingpong',
  };
}
export function defaultStudio(): Studio {
  return { version: 2, name: 'Untitled session', masterVolume: 0.5, voices: [makeVoice(1, '440'), makeVoice(2, '660')] };
}

const waves: Waveform[] = ['sine', 'triangle', 'square', 'saw', 'white', 'pink', 'brown'];
const channels: Channel[] = ['stereo', 'left', 'right', 'binaural'];
const gates: GateMode[] = ['continuous', 'interval', 'pattern'];
const curves: SweepCurve[] = ['linear', 'log'];
const loops: SweepLoop[] = ['repeat', 'pingpong', 'hold'];
const safeString = (x: unknown, fallback: string, max = 80): string => typeof x === 'string' ? x.slice(0, max) : fallback;
const safeNumber = (x: unknown, fallback: number, lo: number, hi: number): number => {
  const n = Number(x);
  return Number.isFinite(n) ? clamp(n, lo, hi) : fallback;
};
const safeEnum = <T extends string>(x: unknown, values: T[], fallback: T): T => values.includes(x as T) ? x as T : fallback;

export function sanitizeStudio(input: unknown): Studio {
  if (!input || typeof input !== 'object') throw new Error('Not a Hertz preset.');
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.voices)) throw new Error('Preset has no voices.');
  if (raw.voices.length > 20000) throw new Error('Preset is too large to import safely.');
  const voices = raw.voices.map((voice, i) => {
    const x = (voice && typeof voice === 'object' ? voice : {}) as Record<string, unknown>;
    const base = makeVoice(i + 1);
    const steps = Array.isArray(x.steps) ? x.steps.slice(0, 1000).map((st) => {
      const s = (st && typeof st === 'object' ? st : {}) as Record<string, unknown>;
      return { id: id(), on: s.on !== false, duration: safeString(s.duration, '0.5', 10000) };
    }) : base.steps;
    return {
      ...base,
      id: id(), name: safeString(x.name, base.name), enabled: x.enabled !== false, solo: x.solo === true,
      waveform: safeEnum(x.waveform, waves, base.waveform), channel: safeEnum(x.channel, channels, base.channel),
      gate: safeEnum(x.gate, gates, base.gate), sweepCurve: safeEnum(x.sweepCurve, curves, base.sweepCurve),
      sweepLoop: safeEnum(x.sweepLoop, loops, base.sweepLoop),
      frequency: safeString(x.frequency, base.frequency, 10000), volume: safeNumber(x.volume, base.volume, 0, 1),
      pan: safeNumber(x.pan, 0, -1, 1), beat: safeString(x.beat, '8', 10000),
      on: safeString(x.on, '0.5', 10000), off: safeString(x.off, '0.5', 10000),
      delay: safeString(x.delay, '0', 10000), steps, attack: safeString(x.attack, '0.005', 10000),
      release: safeString(x.release, '0.01', 10000), sweep: x.sweep === true,
      from: safeString(x.from, base.from, 10000), to: safeString(x.to, '880', 10000),
      sweepTime: safeString(x.sweepTime, '4', 10000),
    } satisfies Voice;
  });
  return { version: 2, name: safeString(raw.name, 'Imported preset'), masterVolume: safeNumber(raw.masterVolume, 0.5, 0, 1), voices };
}

export function toProcessorVoices(voices: Voice[], nyquist: number) {
  const anySolo = voices.some(v => v.solo && v.enabled);
  return voices.map(v => ({
    ...v,
    enabled: v.enabled && (!anySolo || v.solo),
    // The exact original decimal strings stay in the UI and exported preset.
    frequency: clamp(finite(v.frequency, 440), 0.001, nyquist * 0.999),
    beat: Math.max(0, finite(v.beat, 8)),
    on: Math.max(0, finite(v.on, 0.5)), off: Math.max(0, finite(v.off, 0.5)),
    delay: Math.max(0, finite(v.delay)), attack: Math.max(0, finite(v.attack, 0.005)),
    release: Math.max(0, finite(v.release, 0.01)),
    from: clamp(finite(v.from, 440), 0.001, nyquist * 0.999),
    to: clamp(finite(v.to, 880), 0.001, nyquist * 0.999),
    sweepTime: Math.max(0, finite(v.sweepTime, 4)),
    steps: v.steps.map(s => ({ on: s.on, duration: Math.max(0, finite(s.duration)) })),
  }));
}
