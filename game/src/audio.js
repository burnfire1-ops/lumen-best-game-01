// Every sound is synthesised with WebAudio: no audio files, nothing fetched. The context is
// created lazily on the first user gesture (browsers block audio before one) and every effect
// is a short oscillator or noise envelope. Crickets chirp on a slow ambient loop while playing.

export function createAudio() {
  let context = null;
  let muted = false;
  let cricketTimer = null;
  let orbCombo = 0;
  let orbComboAt = 0;

  function ensure() {
    if (context === null) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      context = new AudioContext();
    }
    if (context.state === 'suspended') context.resume();
    return context;
  }

  function tone(freqFrom, freqTo, seconds, type, gainValue, when = 0) {
    const audio = ensure();
    if (audio === null || muted) return;
    const start = audio.currentTime + when;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freqFrom, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), start + seconds);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + seconds + 0.05);
  }

  function thud() {
    const audio = ensure();
    if (audio === null || muted) return;
    const start = audio.currentTime;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(140, start);
    oscillator.frequency.exponentialRampToValueAtTime(45, start + 0.22);
    gain.gain.setValueAtTime(0.5, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.3);
  }

  function chirp() {
    // One faint cricket chirp: three quick high blips, barely audible.
    tone(4200, 3800, 0.05, 'sine', 0.02);
    tone(4300, 3900, 0.05, 'sine', 0.015, 0.07);
    tone(4100, 3700, 0.05, 'sine', 0.012, 0.14);
  }

  return {
    /** Call on any user gesture so later sounds are allowed. */
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    get muted() {
      return muted;
    },
    flap() {
      tone(620, 940, 0.09, 'sine', 0.12);
    },
    orb(now) {
      // The chime climbs with the combo: orbs in quick succession sound brighter.
      orbCombo = now - orbComboAt < 1.2 ? orbCombo + 1 : 0;
      orbComboAt = now;
      const base = 880 * 2 ** (Math.min(orbCombo, 8) / 12);
      tone(base, base * 1.5, 0.16, 'sine', 0.14);
      tone(base * 2, base * 2, 0.1, 'sine', 0.05);
    },
    power() {
      tone(520, 780, 0.12, 'triangle', 0.14);
      tone(780, 1170, 0.14, 'triangle', 0.12, 0.09);
    },
    hit() {
      thud();
    },
    over() {
      tone(392, 392, 0.22, 'triangle', 0.16);
      tone(330, 330, 0.22, 'triangle', 0.16, 0.2);
      tone(262, 220, 0.4, 'triangle', 0.16, 0.4);
    },
    win() {
      tone(523, 523, 0.16, 'triangle', 0.15);
      tone(659, 659, 0.16, 'triangle', 0.15, 0.14);
      tone(784, 784, 0.16, 'triangle', 0.15, 0.28);
      tone(1047, 1047, 0.34, 'triangle', 0.16, 0.42);
    },
    startCrickets() {
      if (cricketTimer !== null) return;
      cricketTimer = window.setInterval(() => {
        if (!muted && Math.random() < 0.7) chirp();
      }, 1400);
    },
    stopCrickets() {
      if (cricketTimer !== null) {
        window.clearInterval(cricketTimer);
        cricketTimer = null;
      }
    },
  };
}
