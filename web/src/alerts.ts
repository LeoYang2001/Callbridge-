/**
 * Getting the user's attention when the assistant is holding the line for them. Browsers only
 * allow sound after a user gesture, so primeAlerts() runs on the Start call tap. iOS has no
 * vibration API; the chime and the tab title cover it there.
 */
let ctx: AudioContext | null = null;

export function primeAlerts() {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
  } catch {
    /* no Web Audio */
  }
}

/** Two short rising tones. */
export function chime() {
  navigator.vibrate?.([200, 100, 200]);
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  [660, 880].forEach((freq, i) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t + i * 0.18);
    gain.gain.exponentialRampToValueAtTime(0.25, t + i * 0.18 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.16);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(t + i * 0.18);
    osc.stop(t + i * 0.18 + 0.17);
  });
}
