import { describe, it, expect } from 'vitest';
import { asQRFrames, decodeQRFrame } from '../src/lib/presets';
import { defaultStudio, sanitizeStudio, toProcessorVoices } from '../src/lib/model';

describe('Hertz portable presets', () => {
  it('round-trips multi-frame QR chunks', () => {
    const text = 'G' + 'A'.repeat(3500);
    const frames = asQRFrames(text);
    expect(frames.length).toBeGreaterThan(1);
    const sorted = frames.map(decodeQRFrame).sort((a, b) => a.index - b.index);
    expect(sorted.map(x => x.data).join('')).toBe(text);
  });
  it('rejects corrupted QR prefixes and invalid chunks', () => {
    expect(() => decodeQRFrame('https://example.com')).toThrow();
    expect(() => decodeQRFrame('HZ2:8:2:ABC')).toThrow();
  });
  it('retains decimal durations without rounding in the saved preset', () => {
    const studio = defaultStudio();
    studio.voices[0].on = '0.000000123456789123456789';
    const parsed = sanitizeStudio(JSON.parse(JSON.stringify(studio)));
    expect(parsed.voices[0].on).toBe('0.000000123456789123456789');
  });
  it('clamps output to usable hardware range', () => {
    const v = defaultStudio().voices[0];
    v.frequency = '99999999';
    expect(toProcessorVoices([v], 24000)[0].frequency).toBeLessThan(24000);
  });
  it('solo overrides other enabled voices without mutating source', () => {
    const v = defaultStudio().voices;
    v[1].solo = true;
    const prepared = toProcessorVoices(v, 24000);
    expect(prepared[0].enabled).toBe(false);
    expect(prepared[1].enabled).toBe(true);
    expect(v[0].enabled).toBe(true);
  });
});
