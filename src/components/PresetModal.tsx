import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { Camera, Check, ChevronLeft, ChevronRight, Copy, Download, FileJson, ImageUp, Link as LinkIcon, Plus, ScanQrCode, Save, Trash2, Upload, X } from 'lucide-react';
import type { LibraryItem, Studio } from '../lib/model';
import { sanitizeStudio } from '../lib/model';
import { asQRFrames, decodePreset, decodeQRFrame, downloadBlob, encodePreset, slug } from '../lib/presets';

type Props = { studio: Studio; saved: LibraryItem[]; onLoad: (s: Studio) => void; onSave: () => void; onDelete: (id: string) => void; onClose: () => void; notify: (msg: string) => void; };

type Tab = 'share' | 'import' | 'library';

function CameraScanner({ onScanned, notify }: { onScanned: (qr: string) => void; notify: (msg: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const seen = useRef<string>('');
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    let raf = 0, stopped = false, last = 0;
    const start = async () => {
      try {
        const camera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) { camera.getTracks().forEach(t => t.stop()); return; }
        stream.current = camera;
        const v = video.current;
        if (v) { v.srcObject = camera; await v.play(); }
      } catch { notify('Camera unavailable. Use a QR image or paste a preset code.'); setIsOpen(false); }
    };
    const scan = (now: number) => {
      if (stopped) return;
      if (now - last > 180 && video.current?.readyState === 4) {
        last = now;
        const v = video.current;
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(1000, v.videoWidth); canvas.height = Math.floor(canvas.width * v.videoHeight / v.videoWidth);
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (context) {
          context.drawImage(v, 0, 0, canvas.width, canvas.height);
          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(image.data, image.width, image.height);
          if (code && code.data !== seen.current) { seen.current = code.data; onScanned(code.data); }
        }
      }
      raf = requestAnimationFrame(scan);
    };
    void start(); raf = requestAnimationFrame(scan);
    return () => { stopped = true; cancelAnimationFrame(raf); stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; };
  }, [isOpen, notify, onScanned]);
  return <div className="camera-wrap"><button className="outline-btn" onClick={() => setIsOpen(s => !s)}><Camera size={16}/>{isOpen ? 'Close camera' : 'Scan with camera'}</button>{isOpen && <video playsInline muted ref={video} className="camera-video"/>}</div>;
}

export default function PresetModal({ studio, saved, onLoad, onSave, onDelete, onClose, notify }: Props) {
  const [tab, setTab] = useState<Tab>('share');
  const [frames, setFrames] = useState<string[]>([]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [qrUrl, setQrUrl] = useState('');
  const [encoded, setEncoded] = useState('');
  const [paste, setPaste] = useState('');
  const [progress, setProgress] = useState('');
  const assembly = useRef<{ total: number; chunks: Record<number, string> }>({ total: 0, chunks: {} });

  useEffect(() => {
    let mounted = true;
    encodePreset(studio).then(s => {
      if (!mounted) return;
      setEncoded(s); setFrames(asQRFrames(s)); setFrameIndex(0);
    }).catch(e => notify(e.message));
    return () => { mounted = false; };
  }, [studio, notify]);
  useEffect(() => {
    let mounted = true;
    if (!frames.length) { setQrUrl(''); return; }
    QRCode.toDataURL(frames[frameIndex], { errorCorrectionLevel: 'M', margin: 2, width: 540, color: { dark: '#162a2b', light: '#ffffff' } }).then(url => { if (mounted) setQrUrl(url); }).catch(e => notify(e.message));
    return () => { mounted = false; };
  }, [frames, frameIndex, notify]);

  const importEncoded = useCallback(async (value: string) => {
    try {
      const preset = await decodePreset(value);
      onLoad(preset); notify(`Loaded “${preset.name}” (${preset.voices.length} layers).`); onClose();
    } catch (error) { notify(error instanceof Error ? error.message : 'Invalid preset'); }
  }, [onLoad, onClose, notify]);
  const importText = useCallback((value: string) => {
    const s = value.trim();
    if (s.startsWith('HZ2:')) {
      try {
        const frame = decodeQRFrame(s);
        if (assembly.current.total && assembly.current.total !== frame.total) assembly.current = { total: 0, chunks: {} };
        assembly.current.total = frame.total;
        assembly.current.chunks[frame.index] = frame.data;
        const count = Object.keys(assembly.current.chunks).length;
        setProgress(`${count} of ${frame.total} QR frames imported`);
        if (count === frame.total) {
          const full = Array.from({ length: frame.total }, (_, i) => assembly.current.chunks[i + 1]).join('');
          assembly.current = { total: 0, chunks: {} };
          void importEncoded(full);
        }
      } catch (error) { notify(error instanceof Error ? error.message : 'QR code not recognized'); }
      return;
    }
    const hash = s.match(/#hertz=([A-Za-z0-9_-]+)/);
    if (hash) { void importEncoded(hash[1]); return; }
    if (/^[GJ][A-Za-z0-9_-]+$/.test(s)) { void importEncoded(s); return; }
    try { onLoad(sanitizeStudio(JSON.parse(s))); onClose(); notify('Preset imported.'); }
    catch { notify('Paste a Hertz QR code, share URL, encoded preset, or JSON file.'); }
  }, [importEncoded, onClose, onLoad, notify]);
  const onScanned = useCallback((value: string) => { importText(value); }, [importText]);
  const importFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      try {
        if (file.name.toLowerCase().endsWith('.json')) { importText(await file.text()); continue; }
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Could not decode image.');
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const result = jsQR(image.data, image.width, image.height);
        if (!result) throw new Error(`No QR code found in ${file.name}.`);
        importText(result.data);
      } catch (error) { notify(error instanceof Error ? error.message : 'Import error'); }
    }
  };
  const copy = async (txt: string) => {
    try { await navigator.clipboard.writeText(txt); notify('Copied to clipboard.'); }
    catch { notify('Clipboard not available; copy the code manually.'); }
  };
  const saveQR = () => {
    if (!qrUrl) return;
    const a = document.createElement('a'); a.href = qrUrl;
    a.download = `${slug(studio.name)}-qr-${frameIndex + 1}-of-${frames.length}.png`; a.click();
  };
  const exportJSON = () => downloadBlob(new Blob([JSON.stringify(studio, null, 2)], { type: 'application/json' }), `${slug(studio.name)}.hertz.json`);
  const shareURL = `${location.origin}${location.pathname}#hertz=${encoded}`;

  return <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="modal" role="dialog" aria-modal="true" aria-label="Hertz presets">
      <div className="modal-top"><div><div className="eyebrow">PORTABLE SESSION</div><h2>Presets & sharing</h2></div><button className="icon-btn" onClick={onClose} title="Close" aria-label="Close"><X size={21}/></button></div>
      <div className="modal-tabs"><button className={tab === 'share' ? 'selected' : ''} onClick={() => setTab('share')}><ScanQrCode size={16}/> Share</button><button className={tab === 'import' ? 'selected' : ''} onClick={() => setTab('import')}><Upload size={16}/> Import</button><button className={tab === 'library' ? 'selected' : ''} onClick={() => setTab('library')}><Save size={16}/> My library ({saved.length})</button></div>
      {tab === 'share' && <div className="modal-content">
        <p className="subcopy">All oscillator settings, decimal timing strings, sweeps, and sequence steps travel with your preset. No account or server needed.</p>
        <div className="qr-layout"><div className="qr-preview">{qrUrl ? <img src={qrUrl} alt={`Hertz preset QR frame ${frameIndex + 1} of ${frames.length}`} /> : <div className="qr-skeleton">GENERATING QR…</div>}
          <div className="qr-pagination"><button disabled={frameIndex === 0} aria-label="Previous QR frame" onClick={() => setFrameIndex(i => i - 1)}><ChevronLeft size={16}/></button><span>QR {frameIndex + 1} / {frames.length || '…'}</span><button disabled={frameIndex >= frames.length - 1} aria-label="Next QR frame" onClick={() => setFrameIndex(i => i + 1)}><ChevronRight size={16}/></button></div></div>
          <div className="qr-details"><h3>{studio.name}</h3><p><b>{studio.voices.length}</b> sound layers · <b>{frames.length || '…'}</b> QR frame(s)</p><p>For a larger arrangement, scan every QR in order. A single QR cannot hold unlimited data; JSON export has no QR capacity limit.</p><button className="primary-btn full" onClick={saveQR} disabled={!qrUrl}><Download size={17}/> Download this QR</button><button className="outline-btn full" onClick={() => copy(frames[frameIndex] || '')} disabled={!frames.length}><Copy size={16}/> Copy QR text</button></div></div>
        <div className="modal-action-grid"><button className="outline-btn" onClick={exportJSON}><FileJson size={16}/> Export full JSON</button><button className="outline-btn" onClick={onSave}><Save size={16}/> Save to device</button><button className="outline-btn" onClick={() => { if (encoded.length > 7000) { notify('URL too large for reliable sharing. Export JSON or QR frames.'); return; } void copy(shareURL); }} disabled={!encoded}><LinkIcon size={16}/> Copy share link</button></div>
      </div>}
      {tab === 'import' && <div className="modal-content">
        <p className="subcopy">Paste a Hertz QR payload, a shared link, or JSON; upload one or more QR PNGs, or scan with your phone camera.</p>
        <label className="input-label">PASTE PRESET CODE OR LINK<textarea rows={4} value={paste} onChange={e => setPaste(e.target.value)} placeholder="HZ2:1:1:G... or https://.../#hertz=..."/></label>
        <button className="primary-btn" onClick={() => importText(paste)} disabled={!paste.trim()}><Check size={16}/> Import pasted preset</button>
        <div className="import-options"><label className="outline-btn file-button"><ImageUp size={17}/> Upload JSON / QR image(s)<input type="file" multiple accept=".json,.png,.jpg,.jpeg,.webp,image/*" onChange={e => { void importFiles(e.target.files); e.target.value = ''; }}/></label><CameraScanner onScanned={onScanned} notify={notify}/></div>
        {progress && <div className="scan-progress"><ScanQrCode size={16}/>{progress}<button onClick={() => { assembly.current = { total: 0, chunks: {} }; setProgress(''); }}>Reset</button></div>}
        <p className="hint">Camera access requires HTTPS or localhost. For multi-QR presets, scan all frames; duplicate scans are ignored.</p>
      </div>}
      {tab === 'library' && <div className="modal-content"><p className="subcopy">These presets are stored locally in this browser. Export JSON or QR for backup or transfer to another device.</p>
        <button className="primary-btn" onClick={onSave}><Plus size={16}/> Save current session</button>
        <div className="library-list">{saved.length === 0 && <div className="empty-library">No saved presets yet. Save the current session to start a collection.</div>}
          {saved.map(item => <div className="saved-preset" key={item.id}><div><b>{item.studio.name}</b><span>{item.studio.voices.length} layers · {new Date(item.savedAt).toLocaleString()}</span></div><div><button className="outline-btn small" onClick={() => { onLoad(sanitizeStudio(item.studio)); onClose(); notify('Preset loaded.'); }}>Load</button><button className="icon-btn" title="Remove preset" aria-label={`Delete ${item.studio.name}`} onClick={() => onDelete(item.id)}><Trash2 size={16}/></button></div></div>)}</div>
      </div>}
    </section>
  </div>;
}
