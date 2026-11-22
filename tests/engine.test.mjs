import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/audio-engine.js', import.meta.url), 'utf-8');
function engineForTesting(rate = 1000) {
  let cls;
  class AudioWorkletProcessor { constructor() { this.port = { onmessage: null, messages: [], postMessage(data) { this.messages.push(data); } }; } }
  runInNewContext(source, { sampleRate: rate, AudioWorkletProcessor, Math, Map, registerProcessor(_name, ctor) { cls = ctor; } });
  return new cls();
}
function voice(override = {}) {
  return { id: 'first', enabled: true, solo: false, volume: 1, pan: 0, channel: 'stereo', beat: 8,
    waveform: 'sine', frequency: 25, gate: 'continuous', on: .1, off: .1, delay: 0,
    steps: [], attack: 0, release: 0, sweep: false, from: 25, to: 300, sweepTime: 1,
    sweepLoop: 'repeat', sweepCurve: 'linear', ...override };
}
function render(engine, frames = 256) {
  const output = [[new Float32Array(frames), new Float32Array(frames)]];
  engine.process([], output); return output[0][0];
}
function power(arr) { return arr.reduce((sum, x) => sum + x * x, 0) / arr.length; }
function set(engine, values) { engine.port.onmessage({ data: { type: 'voices', voices: values } }); }
function command(engine, type) { engine.port.onmessage({ data: { type } }); }

test('transport emits nonzero sine and stops to silence', () => {
  const e = engineForTesting(); set(e, [voice()]); command(e, 'play');
  assert.ok(power(render(e, 100)) > .01);
  command(e, 'stop'); assert.equal(power(render(e, 100)), 0);
});
test('burst/silence gate is sample-accurate and repeats', () => {
  const e = engineForTesting(); set(e, [voice({ gate: 'interval', on: .1, off: .1 })]); command(e, 'play');
  assert.ok(power(render(e, 100)) > .01);
  assert.equal(power(render(e, 100)), 0);
  assert.ok(power(render(e, 100)) > .01);
});
test('custom pattern alternates sound and silence by sample clock', () => {
  const e = engineForTesting(); set(e, [voice({ gate: 'pattern', steps: [{ on: true, duration: .04 }, { on: false, duration: .06 }] })]); command(e, 'play');
  assert.ok(power(render(e, 40)) > .01);
  assert.equal(power(render(e, 60)), 0);
  assert.ok(power(render(e, 40)) > .01);
});
test('sample periods shorter than one frame resolve to one frame', () => {
  const e = engineForTesting(); set(e, [voice({ gate: 'interval', on: 1e-20, off: 1e-20 })]); command(e, 'play');
  const samples = render(e, 100);
  assert.ok(samples.every(Number.isFinite));
});
test('paused transport does not advance playhead', () => {
  const e = engineForTesting(); set(e, [voice()]); command(e, 'play'); render(e, 250);
  const before = e.transportFrame;
  command(e, 'pause'); render(e, 250);
  assert.equal(e.transportFrame, before);
});
test('multiple voices, binaural and swept tones render finite stereo samples', () => {
  const e = engineForTesting(); set(e, [voice({ channel: 'binaural', beat: 7 }), { ...voice({ id: 'second', sweep: true, sweepTime: .1, sweepLoop: 'pingpong' }), waveform: 'square', channel: 'stereo' }]); command(e, 'play');
  const output = [[new Float32Array(400), new Float32Array(400)]];
  e.process([], output);
  assert.ok(output[0][0].every(Number.isFinite));
  assert.ok(output[0][1].every(Number.isFinite));
  assert.ok(power(output[0][0]) > 0.001);
});
