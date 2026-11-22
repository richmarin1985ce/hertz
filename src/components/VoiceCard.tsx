import { useState, type ReactNode } from 'react';
import { Activity, ChevronDown, ChevronUp, Copy, Headphones, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { id, type Voice, type Step, type Waveform, type Channel } from '../lib/model';

type Props = {
  voice: Voice; index: number; active?: boolean; onChange: (v: Voice) => void;
  onDelete: () => void; onDuplicate: () => void;
};
const waves: { value: Waveform; label: string }[] = [
  { value: 'sine', label: 'Sine' }, { value: 'triangle', label: 'Triangle' }, { value: 'square', label: 'Square' },
  { value: 'saw', label: 'Saw' }, { value: 'white', label: 'White noise' },
  { value: 'pink', label: 'Pink noise' }, { value: 'brown', label: 'Brown noise' },
];
const channels: {value: Channel, label: string}[] = [
  {value: 'stereo',label: 'Stereo'}, {value: 'left',label: 'Left'},
  {value: 'right',label: 'Right'}, {value: 'binaural',label: 'Binaural'},
];
const format = (n: number) => n.toFixed(0);
const numeric = (s: string) => /^\+?(?:\d+\.?\d*|\.\d+)$/.test(s) && Number.isFinite(Number(s));

export default function VoiceCard({ voice: v, index, active, onChange, onDelete, onDuplicate }: Props) {
  const [advanced, setAdvanced] = useState(false);
  const update = <K extends keyof Voice>(key: K, value: Voice[K]) => onChange({ ...v, [key]: value });
  const label = (caption: string, children: ReactNode, className = '') => (
    <label className={`input-label ${className}`}><span>{caption}</span>{children}</label>
  );
  const numberInput = (key: keyof Voice, value: string, suffix?: string) => (
    <div className="field-combo"><input aria-label={String(key)} className={!numeric(value) ? 'invalid-input' : ''} type="text" inputMode="decimal" spellCheck={false} value={value} onChange={e => update(key, e.target.value as never)}/>{suffix && <span>{suffix}</span>}</div>
  );
  const updateStep = (key: keyof Step, value: Step[keyof Step], at: number) => {
    const steps = v.steps.map((s, i) => i === at ? { ...s, [key]: value } : s);
    update('steps', steps);
  };

  return <article className={`voice-card ${v.enabled ? '' : 'disabled-voice'}`}>
    <div className="voice-top">
      <div className="voice-number"><span className={`live-dot ${active ? 'on' : ''}`}/>{String(index + 1).padStart(2, '0')}</div>
      <input className="voice-name" aria-label={`Name of oscillator ${index + 1}`} maxLength={80} value={v.name} onChange={e => update('name', e.target.value)} />
      <div className="voice-actions">
        <button className={`mini-btn ${v.solo ? 'selected' : ''}`} aria-label="Solo oscillator" title="Solo oscillator" onClick={() => update('solo', !v.solo)}>S</button>
        <button className={`mini-btn ${v.enabled ? 'selected' : ''}`} aria-label={v.enabled ? 'Mute oscillator' : 'Enable oscillator'} title="Enable / mute" onClick={() => update('enabled', !v.enabled)}>{v.enabled ? 'ON' : 'OFF'}</button>
        <button className="icon-btn" aria-label="Duplicate oscillator" title="Duplicate" onClick={onDuplicate}><Copy size={15}/></button>
        <button className="icon-btn danger-hover" aria-label="Delete oscillator" title="Delete" onClick={onDelete}><Trash2 size={15}/></button>
      </div>
    </div>

    <div className="voice-main">
      <div className="frequency-area">
        <label className="eyebrow" htmlFor={`freq-${v.id}`}>FREQUENCY</label>
        <div className="big-freq"><input id={`freq-${v.id}`} className={!numeric(v.frequency) || Number(v.frequency) <= 0 ? 'invalid-input' : ''} type="text" inputMode="decimal" aria-label="Frequency in hertz" value={v.frequency} onChange={e => update('frequency', e.target.value)} /><span>Hz</span></div>
        <div className="frequency-shortcuts"><button onClick={() => update('frequency', String(Math.max(0.001, Number(v.frequency || 440) / 2)))}>÷ 2</button><button onClick={() => update('frequency', String(Number(v.frequency || 440) * 2))}>× 2</button><button onClick={() => update('frequency', '440')}>A4</button></div>
      </div>
      <div className="waveform-area">
        <div className="eyebrow">WAVEFORM</div>
        <div className="wave-select-grid">{waves.map(w => <button key={w.value} className={`wave-chip ${v.waveform === w.value ? 'active' : ''}`} onClick={() => update('waveform', w.value)}>{w.label}</button>)}</div>
      </div>
      <div className="mix-area">
        <div className="eyebrow">MIXER</div>
        <div className="knob-label"><span>Level</span><b>{format(v.volume * 100)}%</b></div>
        <input type="range" min="0" max="1" step="0.005" value={v.volume} onChange={e => update('volume', Number(e.target.value))} aria-label={`${v.name} level`} />
        <div className="knob-label"><span>Pan</span><b>{v.pan === 0 ? 'C' : v.pan < 0 ? `L ${format(Math.abs(v.pan) * 100)}` : `R ${format(v.pan * 100)}`}</b></div>
        <input type="range" min="-1" max="1" step="0.01" value={v.pan} onChange={e => update('pan', Number(e.target.value))} disabled={v.channel !== 'stereo'} aria-label={`${v.name} pan`} />
      </div>
    </div>

    <div className="voice-bottom">
      <div className="gate-indicator"><Activity size={14}/><span>{v.gate === 'continuous' ? 'Continuous signal' : v.gate === 'interval' ? `${v.on}s ON · ${v.off}s OFF` : `${v.steps.length}-step pattern`}</span></div>
      <button className="advanced-toggle" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}><SlidersHorizontal size={15}/>{advanced ? 'Hide controls' : 'Advanced controls'}{advanced ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}</button>
    </div>

    {advanced && <div className="advanced-panel">
      <div className="advanced-section">
        <div className="section-label"><Activity size={15}/> TIMING & GATE</div>
        <div className="segmented" role="group" aria-label="Timing mode">
          {(['continuous','interval','pattern'] as const).map(g => <button className={v.gate === g ? 'active' : ''} key={g} onClick={() => update('gate', g)}>{g === 'continuous' ? 'Continuous' : g === 'interval' ? 'Burst / silence' : 'Step sequence'}</button>)}
        </div>
        {v.gate === 'interval' && <div className="fields-row">
          {label('SOUND / BURST', numberInput('on', v.on, 'sec'))}
          {label('SILENCE', numberInput('off', v.off, 'sec'))}
          {label('INITIAL DELAY', numberInput('delay', v.delay, 'sec'))}
        </div>}
        {v.gate === 'pattern' && <>
          <div className="step-list">{v.steps.map((step, stepIndex) => <div className="step-row" key={step.id}>
            <span className="step-n">{String(stepIndex + 1).padStart(2, '0')}</span>
            <button className={`step-state ${step.on ? 'step-on' : 'step-off'}`} onClick={() => updateStep('on', !step.on, stepIndex)}>{step.on ? 'SOUND' : 'SILENCE'}</button>
            <div className="field-combo"><input type="text" inputMode="decimal" aria-label={`Step ${stepIndex + 1} duration`} value={step.duration} onChange={e => updateStep('duration', e.target.value, stepIndex)}/><span>sec</span></div>
            <button className="icon-btn" disabled={v.steps.length < 2} title="Remove step" aria-label="Remove step" onClick={() => update('steps', v.steps.filter(s => s.id !== step.id))}><X size={15}/></button>
          </div>)}</div>
          <button className="subtle-btn" onClick={() => update('steps', [...v.steps, { id: id(), on: v.steps.at(-1)?.on === false, duration: '0.5' }])}><Plus size={14}/> Add step</button>
          <div className="fields-row single">{label('INITIAL DELAY', numberInput('delay', v.delay, 'sec'))}</div>
        </>}
        {v.gate === 'continuous' && <p className="hint">This voice plays until the transport is paused or stopped. Switch to burst mode for repeated ON/OFF timing or sequence mode for any repeating sound/silence pattern.</p>}
      </div>
      <div className="advanced-section">
        <div className="section-label"><Headphones size={15}/> SPATIAL & ENVELOPE</div>
        <div className="fields-row">
          {label('OUTPUT', <select value={v.channel} onChange={e => update('channel', e.target.value as Channel)}>{channels.map(ch => <option key={ch.value} value={ch.value}>{ch.label}</option>)}</select>)}
          {v.channel === 'binaural' ? label('BINAURAL OFFSET', numberInput('beat', v.beat, 'Hz')) : label('ATTACK', numberInput('attack', v.attack, 'sec'))}
          {label('RELEASE', numberInput('release', v.release, 'sec'))}
          {v.channel === 'binaural' && label('ATTACK', numberInput('attack', v.attack, 'sec'))}
        </div>
        {v.channel === 'binaural' && <p className="hint">Left = center − half the offset; right = center + half. Use headphones. Noise modes ignore binaural offset.</p>}
      </div>
      <div className="advanced-section last">
        <div className="section-label section-spread"><span><Activity size={15}/> FREQUENCY SWEEP</span><label className="switch"><input type="checkbox" checked={v.sweep} onChange={e => update('sweep', e.target.checked)}/><span className="switch-track"/> Enable</label></div>
        {v.sweep && <div className="fields-row">
          {label('START', numberInput('from', v.from, 'Hz'))}
          {label('END', numberInput('to', v.to, 'Hz'))}
          {label('DURATION', numberInput('sweepTime', v.sweepTime, 'sec'))}
          {label('CURVE', <select value={v.sweepCurve} onChange={e => update('sweepCurve', e.target.value as Voice['sweepCurve'])}><option value="linear">Linear</option><option value="log">Logarithmic</option></select>)}
          {label('AFTER SWEEP', <select value={v.sweepLoop} onChange={e => update('sweepLoop', e.target.value as Voice['sweepLoop'])}><option value="repeat">Repeat</option><option value="pingpong">Ping-pong</option><option value="hold">Hold at end</option></select>)}
        </div>}
      </div>
    </div>}
  </article>;
}
