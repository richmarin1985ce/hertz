import { sanitizeStudio, type Studio } from './model';

/** Versioned portable preset payload. Gzip is supported in Chromium, Firefox and Safari. */
const prefix = 'HZ2:';

function toBlob(bytes: Uint8Array): Blob {
  // Explicit ArrayBuffer copy keeps TypeScript strict BlobPart types safe.
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  return new Blob([copy.buffer]);
}
function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid QR preset encoding.');
  const bytes = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bytes, ch => ch.charCodeAt(0));
}

export async function encodePreset(studio: Studio): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(studio));
  if (typeof CompressionStream === 'undefined') {
    return 'J' + toBase64Url(bytes);
  }
  const stream = toBlob(bytes).stream().pipeThrough(new CompressionStream('gzip'));
  const buffer = await new Response(stream).arrayBuffer();
  return 'G' + toBase64Url(new Uint8Array(buffer));
}
export async function decodePreset(encoded: string): Promise<Studio> {
  const kind = encoded[0];
  const bytes = fromBase64Url(encoded.slice(1));
  if (bytes.length > 1_500_000) throw new Error('Preset payload is too large.');
  let data: Uint8Array = bytes;
  if (kind === 'G') {
    if (typeof DecompressionStream === 'undefined') throw new Error('Compressed QR codes need a modern browser.');
    const stream = toBlob(bytes).stream().pipeThrough(new DecompressionStream('gzip'));
    const buffer = await new Response(stream).arrayBuffer();
    if (buffer.byteLength > 5_000_000) throw new Error('Decompressed preset is too large.');
    data = new Uint8Array(buffer);
  } else if (kind !== 'J') throw new Error('Unsupported Hertz preset version.');
  try { return sanitizeStudio(JSON.parse(new TextDecoder().decode(data))); }
  catch (e) { throw new Error(e instanceof Error ? e.message : 'Invalid preset data'); }
}

/** QR data is ASCII; chunking allows an arbitrary number of tracks across several QR frames. */
export function asQRFrames(encoded: string, size = 740): string[] {
  const chunks = encoded.match(new RegExp(`.{1,${size}}`, 'g')) || [];
  if (chunks.length > 200) throw new Error('Too many QR frames — use JSON export for large sessions.');
  return chunks.map((chunk, i) => `${prefix}${i + 1}:${chunks.length}:${chunk}`);
}
export function decodeQRFrame(text: string): { index: number; total: number; data: string } {
  const match = /^HZ2:(\d+):(\d+):([A-Za-z0-9_-]+)$/.exec(text.trim());
  if (!match) throw new Error('This is not a Hertz QR code.');
  const index = Number(match[1]), total = Number(match[2]);
  if (total < 1 || total > 200 || index < 1 || index > total) throw new Error('Invalid QR frame.');
  return { index, total, data: match[3] };
}
export function presetFromURL(): string | null {
  const match = /^#hertz=([A-Za-z0-9_-]+)$/.exec(window.location.hash);
  return match ? match[1] : null;
}
export function downloadBlob(data: Blob, filename: string) {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}
export function slug(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'preset'; }
