/* Hertz: sample-clocked multi-oscillator AudioWorklet. MIT License.
 * All timing is resolved to physical sample frames — decimal strings are preserved in presets.
 * Audio output can never have more precision than one sample (20.83 microseconds at 48 kHz).
 */
const TAU = 2 * Math.PI;
const EPS = 1 / sampleRate;
const nyquist = sampleRate * 0.499;
function cl(x, a, b) { return Math.max(a, Math.min(b, x)); }
function positiveFrames(seconds) { return seconds > 0 ? Math.max(1, Math.round(seconds * sampleRate)) : 0; }
function frac(x) { return x - Math.floor(x); }
function blep(t, dt) {
  if (dt <= 0) return 0;
  if (t < dt) { const x = t / dt; return x + x - x * x - 1; }
  if (t > 1 - dt) { const x = (t - 1) / dt; return x * x + x + x + 1; }
  return 0;
}
function wave(type, t, dt, state) {
  switch (type) {
    case 'sine': return Math.sin(TAU * t);
    case 'triangle': return 1 - 4 * Math.abs(t - 0.5);
    case 'square': return (t < 0.5 ? 1 : -1) + blep(t, dt) - blep(frac(t + 0.5), dt);
    case 'saw': return (2 * t - 1) - blep(t, dt);
    case 'white': return Math.random() * 2 - 1;
    case 'pink': {
      // Paul Kellet's efficient pink-noise approximation.
      const white = Math.random() * 2 - 1;
      state.p0 = 0.99886 * state.p0 + white * 0.0555179;
      state.p1 = 0.99332 * state.p1 + white * 0.0750759;
      state.p2 = 0.969 * state.p2 + white * 0.153852;
      const output = (state.p0 + state.p1 + state.p2 + white * 0.1848) * 0.15;
      return cl(output, -1, 1);
    }
    case 'brown': {
      state.brown = cl((state.brown + (Math.random() * 2 - 1) * 0.02) * 0.999, -1, 1);
      return state.brown * 2.2;
    }
    default: return 0;
  }
}
function freshState() { return { phaseL: 0, phaseR: 0, elapsed: 0, env: 0, p0: 0, p1: 0, p2: 0, brown: 0 }; }
function normalizeVoice(input, old) {
  const v = { ...input, state: old ? old.state : freshState() };
  v.onFrames = positiveFrames(v.on);
  v.offFrames = positiveFrames(v.off);
  v.delayFrames = positiveFrames(v.delay);
  v.stepsFrames = v.steps.map(s => ({ on: s.on, frames: positiveFrames(s.duration) })).filter(s => s.frames > 0);
  v.patternFrames = v.stepsFrames.reduce((sum, s) => sum + s.frames, 0);
  v.sweepFrames = positiveFrames(v.sweepTime);
  v.attackFrames = positiveFrames(v.attack);
  v.releaseFrames = positiveFrames(v.release);
  v.frequency = cl(v.frequency, 0.001, nyquist);
  v.from = cl(v.from, 0.001, nyquist);
  v.to = cl(v.to, 0.001, nyquist);
  v.volume = cl(v.volume, 0, 1);
  v.pan = cl(v.pan, -1, 1);
  return v;
}
function gate(v) {
  if (v.gate === 'continuous') return true;
  const t = v.state.elapsed - v.delayFrames;
  if (t < 0) return false;
  if (v.gate === 'interval') {
    const period = v.onFrames + v.offFrames;
    return v.onFrames > 0 && period > 0 && t % period < v.onFrames;
  }
  if (v.gate === 'pattern') {
    if (v.patternFrames === 0) return false;
    let phase = t % v.patternFrames;
    for (const step of v.stepsFrames) {
      if (phase < step.frames) return step.on;
      phase -= step.frames;
    }
    return false;
  }
  return true;
}
function frequency(v) {
  if (!v.sweep || !v.sweepFrames) return v.frequency;
  const elapsed = v.state.elapsed;
  let unit;
  if (v.sweepLoop === 'hold') unit = Math.min(1, elapsed / v.sweepFrames);
  else if (v.sweepLoop === 'pingpong') {
    const phase = (elapsed % (v.sweepFrames * 2)) / v.sweepFrames;
    unit = phase <= 1 ? phase : 2 - phase;
  } else unit = (elapsed % v.sweepFrames) / v.sweepFrames;
  if (v.sweepCurve === 'log') return cl(v.from * Math.pow(v.to / v.from, unit), 0.001, nyquist);
  return cl(v.from + (v.to - v.from) * unit, 0.001, nyquist);
}
class HertzEngine extends AudioWorkletProcessor {
  constructor() {
    super();
    this.voices = [];
    this.playing = false;
    this.transportFrame = 0;
    this.statusFrame = 0;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'voices') {
        const previous = new Map(this.voices.map(v => [v.id, v]));
        this.voices = data.voices.map(v => normalizeVoice(v, previous.get(v.id)));
      } else if (data.type === 'play') this.playing = true;
      else if (data.type === 'pause') this.playing = false;
      else if (data.type === 'stop') {
        this.playing = false; this.transportFrame = 0;
        for (const v of this.voices) v.state = freshState();
        this.port.postMessage({ type: 'status', time: 0, active: 0, levels: {} });
      }
    };
  }
  process(_inputs, outputs) {
    const stereo = outputs[0];
    if (!stereo || !stereo[0]) return true;
    const left = stereo[0], right = stereo[1] || stereo[0];
    left.fill(0); if (stereo[1]) right.fill(0);
    const enabled = this.voices.filter(v => v.enabled && v.volume > 0);
    if (this.playing && enabled.length) {
      const mixGain = 0.9 / Math.sqrt(Math.max(1, enabled.length));
      for (let i = 0; i < left.length; i++) {
        let l = 0, r = 0;
        for (let j = 0; j < enabled.length; j++) {
          const v = enabled[j], st = v.state;
          const target = gate(v) ? 1 : 0;
          const fadeFrames = target ? v.attackFrames : v.releaseFrames;
          if (fadeFrames === 0) st.env = target;
          else st.env = cl(st.env + (target ? 1 : -1) / fadeFrames, 0, 1);
          if (st.env > 0) {
            const f = frequency(v), step = f / sampleRate;
            let vl, vr;
            if (v.channel === 'binaural' && !['white','pink','brown'].includes(v.waveform)) {
              const leftStep = cl(f - v.beat / 2, 0.001, nyquist) / sampleRate;
              const rightStep = cl(f + v.beat / 2, 0.001, nyquist) / sampleRate;
              vl = wave(v.waveform, st.phaseL, leftStep, st);
              vr = wave(v.waveform, st.phaseR, rightStep, st);
              st.phaseL = frac(st.phaseL + leftStep);
              st.phaseR = frac(st.phaseR + rightStep);
              l += vl * v.volume * st.env;
              r += vr * v.volume * st.env;
            } else {
              vl = wave(v.waveform, st.phaseL, step, st);
              st.phaseL = frac(st.phaseL + step);
              if (v.channel === 'left') { l += vl * v.volume * st.env; }
              else if (v.channel === 'right') { r += vl * v.volume * st.env; }
              else {
                const a = (v.pan + 1) * Math.PI / 4;
                l += vl * v.volume * st.env * Math.cos(a);
                r += vl * v.volume * st.env * Math.sin(a);
              }
            }
          } else {
            const f = frequency(v);
            st.phaseL = frac(st.phaseL + f / sampleRate);
            st.phaseR = frac(st.phaseR + f / sampleRate);
          }
          st.elapsed++;
        }
        left[i] = Math.tanh(l * mixGain);
        right[i] = Math.tanh(r * mixGain);
        this.transportFrame++;
      }
    } else if (this.playing) {
      this.transportFrame += left.length;
      for (const v of this.voices) if (v.enabled) v.state.elapsed += left.length;
    }
    this.statusFrame += left.length;
    if (this.statusFrame >= sampleRate / 9) {
      this.statusFrame %= sampleRate / 9;
      const levels = {};
      let active = 0;
      for (const v of this.voices) {
        const isActive = this.playing && v.enabled && v.volume > 0 && gate(v);
        levels[v.id] = isActive;
        if (isActive) active++;
      }
      this.port.postMessage({ type: 'status', time: this.transportFrame / sampleRate, active, levels });
    }
    return true;
  }
}
registerProcessor('hertz-engine', HertzEngine);
