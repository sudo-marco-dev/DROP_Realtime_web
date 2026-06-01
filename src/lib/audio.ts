let audioCtx: AudioContext | null = null;
let sirenInterval: any = null;
let sirenOscillator: OscillatorNode | null = null;
let sirenGainNode: GainNode | null = null;

function getAudioContext(): AudioContext {
  if (typeof window === 'undefined') {
    throw new Error('Audio is only available in the browser.');
  }
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function playBeep(freq: number, durationMs: number) {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square'; // Square wave gives a nice retro piezo buzzer sound
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    // Fade out slightly at the end to prevent harsh popping sounds
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + durationMs / 1000);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
  } catch (e) {
    console.warn('Web Audio beep blocked or failed:', e);
  }
}

export function playInputBeep() {
  playBeep(2000, 20);
}

export function playSuccessBeep() {
  playBeep(2500, 80);
}

export function playErrorBeep() {
  playBeep(1500, 300);
}

export function playBootBeep() {
  playBeep(2000, 100);
  setTimeout(() => {
    playBeep(2500, 200);
  }, 150);
}

export function startSiren() {
  if (sirenInterval) return; // Already running

  try {
    const ctx = getAudioContext();
    sirenOscillator = ctx.createOscillator();
    sirenGainNode = ctx.createGain();

    sirenOscillator.type = 'square';
    sirenOscillator.frequency.setValueAtTime(3500, ctx.currentTime);

    sirenGainNode.gain.setValueAtTime(0.2, ctx.currentTime);

    sirenOscillator.connect(sirenGainNode);
    sirenGainNode.connect(ctx.destination);
    sirenOscillator.start();

    let toggle = false;
    sirenInterval = setInterval(() => {
      if (sirenOscillator && ctx.state === 'running') {
        const freq = toggle ? 3500 : 2500; // Alternate between 3500Hz and 2500Hz
        sirenOscillator.frequency.setValueAtTime(freq, ctx.currentTime);
        toggle = !toggle;
      }
    }, 150); // Original code uses 150ms siren alternation
  } catch (e) {
    console.warn('Failed to start siren audio:', e);
  }
}

export function stopSiren() {
  if (sirenInterval) {
    clearInterval(sirenInterval);
    sirenInterval = null;
  }
  try {
    if (sirenOscillator) {
      sirenOscillator.stop();
      sirenOscillator.disconnect();
      sirenOscillator = null;
    }
    if (sirenGainNode) {
      sirenGainNode.disconnect();
      sirenGainNode = null;
    }
  } catch (e) {
    console.warn('Error stopping siren audio:', e);
  }
}
