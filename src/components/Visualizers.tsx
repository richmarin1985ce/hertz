import { useEffect, useRef } from 'react';
import type { HertzAudio } from '../lib/audio';

function plotGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.strokeStyle = '#27333a'; ctx.lineWidth = 1;
  for (let i = 1; i < 6; i++) {
    ctx.beginPath(); ctx.moveTo(w / 6 * i, 0); ctx.lineTo(w / 6 * i, h); ctx.stroke();
  }
  for (let i = 1; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(0, h / 4 * i); ctx.lineTo(w, h / 4 * i); ctx.stroke();
  }
}
export default function Visualizers({ audio, initialized }: { audio: HertzAudio; initialized: boolean }) {
  const osc = useRef<HTMLCanvasElement>(null), spectrum = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!initialized || !audio.analyser) return;
    const analyser = audio.analyser;
    let raf = 0;
    const time = new Uint8Array(analyser.fftSize);
    const freq = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      const c1 = osc.current, c2 = spectrum.current;
      if (!c1 || !c2) return;
      const a = c1.getContext('2d'), b = c2.getContext('2d');
      if (!a || !b) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (const c of [c1, c2]) {
        const w = Math.max(1, Math.floor(c.clientWidth * dpr)), h = Math.max(1, Math.floor(c.clientHeight * dpr));
        if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      }
      analyser.getByteTimeDomainData(time as Uint8Array<ArrayBuffer>);
      analyser.getByteFrequencyData(freq as Uint8Array<ArrayBuffer>);
      a.fillStyle = '#111b22'; a.fillRect(0, 0, c1.width, c1.height); plotGrid(a, c1.width, c1.height);
      a.lineWidth = 1.8 * dpr; a.strokeStyle = '#9ae5b8'; a.shadowColor = '#83f0af'; a.shadowBlur = 6 * dpr;
      a.beginPath();
      for (let i = 0; i < time.length; i++) {
        const x = i / (time.length - 1) * c1.width, y = time[i] / 255 * c1.height;
        if (i === 0) a.moveTo(x, y); else a.lineTo(x, y);
      }
      a.stroke(); a.shadowBlur = 0;
      b.fillStyle = '#111b22'; b.fillRect(0, 0, c2.width, c2.height); plotGrid(b, c2.width, c2.height);
      const bars = 96;
      for (let i = 0; i < bars; i++) {
        const normalized = i / bars;
        const bin = Math.max(1, Math.floor((Math.pow(10, normalized * 3) - 1) / 999 * freq.length));
        const height = Math.pow(freq[bin] / 255, 1.5) * c2.height;
        b.fillStyle = i > 78 ? '#e3bc80' : '#6cbaa1';
        b.fillRect(i / bars * c2.width, c2.height - height, Math.max(1, c2.width / bars - 1), height);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [audio, initialized]);
  return <div className="visualizers">
    <div className="visual-box"><div className="visual-heading"><span>OSCILLOSCOPE</span><span className="visual-tag">TIME DOMAIN</span></div><canvas ref={osc} aria-label="Live waveform"/></div>
    <div className="visual-box"><div className="visual-heading"><span>SPECTRUM</span><span className="visual-tag">FFT / LOG</span></div><canvas ref={spectrum} aria-label="Live frequency spectrum"/></div>
  </div>;
}
