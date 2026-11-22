import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, AudioLines, Bookmark, CircleHelp, CirclePause, CirclePlay, CircleStop, Clock3, Headphones, Layers3, Library, Plus, RotateCcw, ScanQrCode, ShieldAlert, SlidersHorizontal, Sparkles, Volume2, VolumeX, Waves } from 'lucide-react';
import VoiceCard from './components/VoiceCard';
import Visualizers from './components/Visualizers';
import PresetModal from './components/PresetModal';
import { defaultStudio, id, makeVoice, sanitizeStudio, type LibraryItem, type Studio, type Voice } from './lib/model';
import { HertzAudio, type AudioStatus } from './lib/audio';
import { decodePreset, downloadBlob, presetFromURL } from './lib/presets';

const SESSION_KEY = 'hertz.session.v2';
const LIBRARY_KEY = 'hertz.library.v2';
function getSession(): Studio {
  try {
    const saved = localStorage.getItem(SESSION_KEY);
    if (saved) return sanitizeStudio(JSON.parse(saved));
  } catch { /* private browsing or an older invalid format */ }
  return defaultStudio();
}
function getLibrary(): LibraryItem[] {
  try {
    const saved = JSON.parse(localStorage.getItem(LIBRARY_KEY) || '[]');
    return Array.isArray(saved) ? saved.filter(x => x && x.studio && x.id).slice(0, 200) : [];
  } catch { return []; }
}
function fmtTime(s: number) {
  if (!Number.isFinite(s)) return '00:00.000';
  const minutes = Math.floor(s / 60).toString().padStart(2, '0');
  const seconds = (s % 60).toFixed(3).padStart(6, '0');
  return `${minutes}:${seconds}`;
}
function AudioRecord({ isRecording }: { isRecording: boolean }) {
  return <><span className={`record-indicator ${isRecording ? 'record-active' : ''}`}/>{isRecording ? 'STOP RECORDING' : 'RECORD AUDIO'}</>;
}
export default function App() {
  const [studio, setStudio] = useState<Studio>(getSession);
  const [library, setLibrary] = useState<LibraryItem[]>(getLibrary);
  const [playing, setPlaying] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [recording, setRecording] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [status, setStatus] = useState<AudioStatus>({ time: 0, active: 0, levels: {}, sampleRate: 48000 });
  const audio = useRef<HertzAudio>(new HertzAudio());
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const toastRef = useRef<number | null>(null);
  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastRef.current !== null) window.clearTimeout(toastRef.current);
    toastRef.current = window.setTimeout(() => setToast(''), 4000);
  }, []);

  useEffect(() => { try { localStorage.setItem(SESSION_KEY, JSON.stringify(studio)); } catch { /* continue without persistence */ } }, [studio]);
  useEffect(() => { try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(library)); } catch { notify('Browser storage is full — export your presets as JSON.'); } }, [library, notify]);
  useEffect(() => { audio.current.setVoices(studio.voices); }, [studio.voices]);
  useEffect(() => { audio.current.setVolume(studio.masterVolume); }, [studio.masterVolume]);
  useEffect(() => {
    const engine = audio.current;
    engine.onStatus = setStatus;
    const encoded = presetFromURL();
    if (encoded) decodePreset(encoded).then(value => {
      setStudio(value); notify(`Loaded shared Hertz preset: ${value.name}`);
    }).catch(() => notify('The shared preset link could not be decoded.'));
    return () => { engine.onStatus = undefined; };
  }, [notify]);

  const start = async () => {
    try { await audio.current.play(); setInitialized(true); setPlaying(true); }
    catch (err) { notify(`Audio could not start: ${err instanceof Error ? err.message : 'Unsupported browser'}`); }
  };
  const pause = () => { audio.current.pause(); setPlaying(false); };
  const stop = () => { audio.current.stop(); setPlaying(false); setStatus(s => ({ ...s, time: 0, active: 0 })); };
  const toggleRecording = async () => {
    if (recording && recorder.current) { recorder.current.stop(); setRecording(false); return; }
    try {
      if (!playing) await start();
      if (!audio.current.stream) throw new Error('Audio engine is not available.');
      if (!('MediaRecorder' in window)) throw new Error('Your browser does not support recording.');
      const supported = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(audio.current.stream.stream, supported ? { mimeType: supported } : undefined);
      chunks.current = [];
      rec.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' });
        if (blob.size) downloadBlob(blob, `hertz-recording-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${rec.mimeType.includes('mp4') ? 'm4a' : rec.mimeType.includes('ogg') ? 'ogg' : 'webm'}`);
        recorder.current = null;
      };
      rec.start(300);
      recorder.current = rec; setRecording(true); notify('Recording started. Press the red button again to export audio.');
    } catch (err) { notify(err instanceof Error ? err.message : 'Recording unavailable'); }
  };
  const changeVoice = (id: string, updated: Voice) => setStudio(s => ({ ...s, voices: s.voices.map(v => v.id === id ? updated : v) }));
  const addVoice = (frequency = '440') => setStudio(s => ({ ...s, voices: [...s.voices, makeVoice(s.voices.length + 1, frequency)] }));
  const duplicateVoice = (v: Voice) => setStudio(s => ({ ...s, voices: [...s.voices, { ...v, id: id(), name: `${v.name} COPY`, steps: v.steps.map(step => ({ ...step, id: id() })) }] }));
  const removeVoice = (v: Voice) => setStudio(s => ({ ...s, voices: s.voices.filter(it => it.id !== v.id) }));
  const saveCurrent = useCallback(() => {
    const entry: LibraryItem = { id: id(), savedAt: new Date().toISOString(), studio: JSON.parse(JSON.stringify(studio)) };
    setLibrary(lib => [entry, ...lib]); notify(`Saved “${studio.name}” locally.`);
  }, [studio, notify]);
  const loadStudio = useCallback((next: Studio) => {
    audio.current.stop(); setPlaying(false); setStatus(s => ({ ...s, time: 0, active: 0 })); setStudio(next);
  }, []);
  const closePreset = useCallback(() => setPresetOpen(false), []);
  const deleteSaved = useCallback((presetId: string) => setLibrary(lib => lib.filter(v => v.id !== presetId)), []);
  const reset = () => { stop(); setStudio(defaultStudio()); notify('A fresh session is ready.'); };
  const activeCount = studio.voices.filter(v => v.enabled && (!studio.voices.some(x => x.solo && x.enabled) || v.solo)).length;
  const maxHz = status.sampleRate / 2;
  const hasOutOfBand = studio.voices.some(v => Number(v.frequency) >= maxHz || Number(v.frequency) < 0.001);

  return <div className="app-shell">
    <header className="site-header">
      <div className="brand"><div className="brand-icon"><Activity size={26} strokeWidth={2.4}/></div><div><strong>HERTZ<span className="brand-dot">.</span></strong><span className="brand-sub">FREQUENCY STUDIO</span></div></div>
      <nav className="top-nav"><span className="version-pill"><span className="green-dot"/> OPEN SOURCE · V 0.1</span><button onClick={() => setPresetOpen(true)}><Library size={16}/> Presets</button><button onClick={() => setAboutOpen(true)}><CircleHelp size={16}/> About</button></nav>
    </header>

    <main className="container">
      <div className="page-heading"><div><div className="eyebrow heading-overline"><span className="thin-line"/> WEB AUDIO SYNTHESIS ENVIRONMENT</div><h1>Shape every <em>frequency.</em></h1><p>Generate, layer, sequence, and share sound with sample-accurate control.</p></div><div className="heading-actions"><button className="outline-btn" onClick={() => setPresetOpen(true)}><ScanQrCode size={17}/> Share via QR</button><button className="subtle-btn" onClick={reset}><RotateCcw size={16}/> New session</button></div></div>

      <section className="master-console" aria-label="Master transport">
        <div className="master-top"><div className="console-title"><div className="eyebrow">MASTER TRANSPORT</div><div className="session-name"><input aria-label="Session name" maxLength={80} value={studio.name} onChange={e => setStudio(s => ({ ...s, name: e.target.value }))}/><span className="save-hint">AUTO-SAVED</span></div></div><div className="engine-status"><span className={`engine-light ${playing ? 'running' : ''}`}/><span>{playing ? 'ENGINE RUNNING' : initialized ? 'ENGINE STANDBY' : 'ENGINE OFFLINE'}</span><span className="sample-rate">{initialized ? `${(status.sampleRate / 1000).toFixed(1)} kHz` : 'READY TO INIT'}</span></div></div>
        <div className="transport-row"><div className="transport-buttons">
          <button className={`play-btn ${playing ? 'is-playing' : ''}`} onClick={playing ? pause : () => void start()} aria-label={playing ? 'Pause playback' : 'Start playback'}>{playing ? <CirclePause size={24}/> : <CirclePlay size={25}/>}<span>{playing ? 'PAUSE' : 'PLAY ALL'}</span></button>
          <button className="stop-btn" onClick={stop} aria-label="Stop and reset playback"><CircleStop size={22}/><span>STOP</span></button>
          <button className={`record-btn ${recording ? 'recording' : ''}`} onClick={() => void toggleRecording()}><AudioRecord isRecording={recording}/></button>
        </div><div className="transport-clock"><div className="eyebrow">ELAPSED</div><div className="timecode">{fmtTime(status.time)}</div><div className="time-sub">SAMPLE CLOCK</div></div><div className="transport-mixer"><div className="master-volume-title"><span><Volume2 size={17}/> MASTER OUTPUT</span><b>{Math.round(studio.masterVolume * 100)}%</b></div><input aria-label="Master output volume" type="range" min="0" max="1" step="0.005" value={studio.masterVolume} onChange={e => setStudio(s => ({ ...s, masterVolume: Number(e.target.value) }))}/><div className="master-volume-scale"><span>0</span><span>50</span><span>100</span></div></div></div>
        <div className="console-stats"><div><span className="stat-icon"><Layers3 size={15}/></span><b>{studio.voices.length}</b><span>LAYERS</span></div><div><span className="stat-icon"><Waves size={16}/></span><b>{activeCount}</b><span>ENABLED</span></div><div><span className="stat-icon"><Activity size={16}/></span><b>{status.active}</b><span>EMITTING</span></div><div><span className="stat-icon"><Clock3 size={16}/></span><b>1 / {status.sampleRate.toLocaleString()}</b><span>SEC / SAMPLE</span></div></div>
      </section>

      <Visualizers audio={audio.current} initialized={initialized}/>
      <div className="workbench">
        <section className="layers-section" aria-label="Frequency layers">
          <div className="section-header"><div><div className="eyebrow">01 — SIGNAL SOURCES</div><h2>Frequency layers <span className="count-badge">{studio.voices.length}</span></h2><p>Stack independent oscillators. Each voice has its own timing, routing, and sweep.</p></div><button className="primary-btn" onClick={() => addVoice()}><Plus size={18}/> Add frequency</button></div>
          <div className="layer-list">{studio.voices.map((v, index) => <VoiceCard key={v.id} voice={v} index={index} active={status.levels[v.id]} onChange={updated => changeVoice(v.id, updated)} onDelete={() => removeVoice(v)} onDuplicate={() => duplicateVoice(v)}/>)}</div>
          {studio.voices.length === 0 && <div className="empty-state"><Waves size={32}/><h3>Your sound canvas is empty</h3><p>Add a frequency or select a starting template below.</p></div>}
          <button className="add-layer-tile" onClick={() => addVoice()}><span><Plus size={22}/></span><div><b>Add another frequency</b><small>No fixed layer limit · Hardware performance varies</small></div></button>
        </section>
        <aside className="sidebar">
          <div className="sidebar-panel"><div className="eyebrow">QUICK START</div><h3>Signal recipes</h3><p>Add a calibrated starter layer to your session.</p>
            <div className="recipe-list"><button onClick={() => addVoice('40')}><span className="recipe-icon"><Waves size={17}/></span><span><b>Sub-bass</b><small>40 Hz · low-frequency test</small></span><Plus size={16}/></button><button onClick={() => addVoice('261.625565')}><span className="recipe-icon"><AudioLines size={17}/></span><span><b>Middle C</b><small>261.625565 Hz · C4</small></span><Plus size={16}/></button><button onClick={() => addVoice('1000')}><span className="recipe-icon"><SlidersHorizontal size={17}/></span><span><b>Reference tone</b><small>1,000 Hz · test signal</small></span><Plus size={16}/></button><button onClick={() => addVoice('12000')}><span className="recipe-icon"><Headphones size={17}/></span><span><b>High frequency</b><small>12,000 Hz · use low volume</small></span><Plus size={16}/></button></div>
          </div>
          <div className="sidebar-panel sharing-panel"><div className="eyebrow">PORTABLE PRESETS</div><div className="qr-deco"><ScanQrCode size={34}/></div><h3>Sound worth sharing.</h3><p>Save entire sessions, export JSON, or share all layers and their decimal-precision timing by QR code.</p><button className="primary-btn full" onClick={() => setPresetOpen(true)}><ScanQrCode size={17}/> Open preset library</button><button className="subtle-btn full" onClick={saveCurrent}><Bookmark size={16}/> Save to this device</button></div>
          <div className="sidebar-panel specs-panel"><div className="eyebrow">ENGINE SPECIFICATIONS</div><h3>Built for precision.</h3><div className="spec-row"><span>Render pipeline</span><b>AudioWorklet</b></div><div className="spec-row"><span>Frequency min.</span><b>0.001 Hz</b></div><div className="spec-row"><span>Frequency ceiling</span><b>{Math.floor(maxHz).toLocaleString()} Hz*</b></div><div className="spec-row"><span>Timing resolution</span><b>{(1e6 / status.sampleRate).toFixed(2)} µs*</b></div><div className="spec-row"><span>Voices</span><b>Dynamic / no cap</b></div><div className="spec-row"><span>Data storage</span><b>Local only</b></div><p className="spec-foot">*Depends on device sample rate. Frequencies are clamped below Nyquist; decimals are preserved exactly as text, with real durations quantized to samples.</p></div>
        </aside>
      </div>
      {(activeCount > 64 || hasOutOfBand) && <div className="notice warning"><ShieldAlert size={17}/>{hasOutOfBand ? `Some frequencies are outside your hardware range; the engine clamps playback to 0.001–${Math.floor(maxHz)} Hz.` : `${activeCount} voices enabled. Large sessions may overload some devices; reduce layers if audio crackles.`}</div>}
      <div className="notice safety"><VolumeX size={18}/><span>Start at low volume, especially with headphones, inaudible frequencies, and sweeps. Do not use as a medical treatment or hearing test; browsers and speakers have physical output limits.</span></div>
    </main>
    <footer className="footer"><div className="footer-brand"><Activity size={18}/> HERTZ <span>FREQUENCY STUDIO</span></div><div><span>MIT LICENSE · FREE FOREVER · NO LOGIN</span><button onClick={() => setAboutOpen(true)}>Technical notes</button></div></footer>
    {presetOpen && <PresetModal studio={studio} saved={library} onSave={saveCurrent} onLoad={loadStudio} onDelete={deleteSaved} onClose={closePreset} notify={notify}/>}
    {aboutOpen && <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setAboutOpen(false); }}><section className="modal about-modal" role="dialog" aria-modal="true" aria-label="About Hertz"><div className="modal-top"><div><div className="eyebrow">ABOUT THE ENGINE</div><h2>Hertz, explained.</h2></div><button className="icon-btn" onClick={() => setAboutOpen(false)}>×</button></div><div className="modal-content"><p>Hertz is a free, local-first audio lab built with the Web Audio API and a custom DSP AudioWorklet. It has seven waveform/noise options, layered voices, binaural offsets, stereo positioning, envelopes, pitch sweeps, sample-clocked burst/silence scheduling, custom patterns, recording, and portable JSON/QR presets.</p><h3>Timing precision</h3><p>Hertz stores interval values as the exact decimal strings entered. The audio engine converts durations to the nearest whole sample; sample rates of 44,100 and 48,000 Hz yield steps of about 22.68 and 20.83 microseconds. Input precision cannot override sample-grid or hardware limits.</p><h3>Frequency limits and performance</h3><p>The browser's actual sample rate determines Nyquist. Hertz constrains fundamental frequencies just below half the sample rate. Very low signals are often inaudible; near-Nyquist tones and non-sine shapes are not ideal measurement signals. There is no fixed software limit to layer count, but memory, CPU, and the audio driver bound real playback. Every audio signal can be distorted by output devices.</p><h3>Sharing and privacy</h3><p>Sessions and saved presets live in localStorage. QR frames contain compressed versioned session data, never data uploaded to a Hertz server. Large presets may span multiple QR codes; scan every frame or export a JSON file. QR scanning requires camera permissions and a secure origin (HTTPS or localhost). Browser recording exports a supported compressed audio format, not lossless WAV.</p><p>Designed for music, sound design, and engineering exploration, not clinical diagnosis or therapy. Begin with low output levels.</p><div className="modal-action-grid"><button className="outline-btn" onClick={() => { setAboutOpen(false); setPresetOpen(true); }}><ScanQrCode size={16}/> Share a preset</button><button className="outline-btn" onClick={() => { setAboutOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Sparkles size={16}/> Back to studio</button></div></div></section></div>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>;
}
