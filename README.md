# Hertz — Frequency Studio

**Free, open-source, privacy-first signal synthesis in your browser.**

Hertz is a responsive progressive web app for stacking independent tones, programming burst/silence intervals, exploring binaural offsets, sweeping frequencies, recording audio, and sharing complete configurations as QR codes. No signup, backend, paid tier, or telemetry.

## Main features

- Add and remove as many independent oscillator layers as your hardware can process (there is **no software-imposed voice count cap**, not literally infinite simultaneous sound).
- Frequencies from **0.001 Hz to just below half the device sample rate** (Nyquist; e.g., up to ~23,976 Hz at 48 kHz). Below-audible signals and very high frequencies may not be reproduced by typical speakers.
- Sine, triangle, square (polyBLEP), saw (polyBLEP), white/pink/brown noise.
- Per-voice gain, mute, solo, panning and stereo/left/right/binaural routing.
- Binaural center frequency and independently configurable left–right offset.
- Accurate repeating bursts (`sound x seconds / silence y seconds`), start delay, and multi-step ON/OFF sequencers. Each voice owns its own independent pattern.
- Accepts and preserves **arbitrary decimal strings** for durations. The AudioWorklet rounds playback to physical audio samples (e.g., 20.833 μs at 48 kHz). This is the smallest physically meaningful interval in the output buffer; arbitrary decimal text does **not** imply arbitrary physical timing precision.
- Adjustable attack/release, independent logarithmic or linear frequency sweeps with repeat/ping-pong/hold modes.
- Master transport and volume, output compressor, waveform oscilloscope and frequency spectrum.
- Record the mixed output to a browser-supported audio format via MediaRecorder.
- Local auto-save, named preset library, JSON import/export, compressed QR frames (single or multi-frame), camera/photo QR import, clipboard sharing, URL hash sharing.
- Installable/offline-capable PWA (once loaded online), GitHub Pages deployment, and automated Android debug APK builds on every main push.

## Quick start

Prerequisites: Node.js 20.19+ or 22+

```bash
npm install
npm run dev
```

Open the address printed by Vite. Audio requires an explicit **Play** gesture. Camera QR import and AudioWorklet require localhost or HTTPS. Built assets:

```bash
npm test
npm run build
npm run preview
```

## GitHub Pages deployment

1. Create a **public** GitHub repository named `hertz`.
2. Push all files, including `.github/workflows/deploy.yml`, to the `main` branch.
3. In **Settings → Pages**, choose **GitHub Actions** as the source.
4. The `Deploy Hertz to GitHub Pages` workflow builds with `GITHUB_PAGES=true` and serves at `https://<username>.github.io/hertz/`.

For other hosts, use `npm run build` and deploy `dist/` at the domain root. If hosting below a subpath, adjust Vite's `base` setting.

## Android APK — automatic on every main deployment

The independent workflow `.github/workflows/android-apk.yml` starts **on every push to `main`** (the same event that deploys GitHub Pages). No path filter excludes changes. It also supports **Run workflow** for a manual APK rebuild.

- GitHub Actions installs Node 22, Java 21, the Android SDK, and Capacitor 7.
- It runs audio/QR tests and produces an Android WebView application with bundled local assets (no remote website required for playback).
- It packages a **debug-signed installable APK** using `./gradlew assembleDebug`.
- The APK is uploaded in **Actions → Build Hertz Android APK → latest successful run → Artifacts**, retained for 90 days. You may need to permit installations from the browser/files app to sideload it.
- This is a debug-signed installer for testing and direct installation, **not a signed Google Play production release**. Release signing and Play Store submission require a persistent signing key and separate configuration.

To build locally with Node 22, Java 21, and Android SDK installed:

```bash
npm install
npm run android:add   # first time only, creates android/ locally
npm run android:apk
```

`capacitor.config.ts` declares the Android application ID `io.github.richmarin1985ce.hertz`. The generated `android/` directory is intentionally excluded from Git; CI generates it using the pinned Capacitor major/version so it can produce a fresh APK without checking in generated binaries. The browser PWA and Android package use the same source but different Vite base paths (`/hertz/` on Pages, `/` in Android).

**Limitations:** browsers and Android WebViews may suspend audio when the app is backgrounded or the screen is locked. Continuous playback in those states requires a future foreground-service implementation. Camera-based QR scanning depends on Android WebView permissions; image/JSON imports remain available.

## QR preset details

The `HZ2` format serializes and gzips the complete versioned session, encodes it as base64url, and divides it into QR frames as needed (`HZ2:<frame>:<total>:<data>`). For large sessions, scan or upload **every frame** into the same importer. Use JSON for arbitrarily large presets (subject to available memory). QR scanner does not upload images or send telemetry; all parsing is local. A long configuration may be unsuitable for URL sharing.

Users can edit timing fields with arbitrary decimal places; the preset preserves the exact entered strings. The DSP scheduler always quantizes durations to whole audio frames. Negative and invalid durations are treated as 0 in playback, and out-of-range frequencies are clamped. Non-sine waveforms at high frequencies can introduce aliasing; use laboratory instruments for calibrated measurements.

## Architecture

- `src/App.tsx` — React studio and transport controls.
- `src/components/VoiceCard.tsx` — signal layers and timing/sweep inspector.
- `src/components/PresetModal.tsx` — local library, QR import/export and camera reader.
- `src/lib/model.ts` — versioned data model and validation.
- `src/lib/presets.ts` — cross-device preset codec and multi-frame QR format.
- `src/lib/audio.ts` — AudioContext/AudioWorklet/limiter/recording graph.
- `public/audio-engine.js` — low-overhead realtime sample-clocked DSP (no setInterval timing).
- `public/sw.js` — service worker.

## Accessibility & hearing safety

Start quietly: high frequency and near-inaudible signals may play at unexpectedly high SPL, and multiple voices can sum constructively. Do not use this application for medical, hearing diagnostics, or animal repellent claims. Actual sound depends on speakers, DACs and audio drivers. Ultrasonic output is not possible through regular 44.1/48 kHz browser audio at frequency levels above Nyquist.

## License

MIT — see [LICENSE](LICENSE).
