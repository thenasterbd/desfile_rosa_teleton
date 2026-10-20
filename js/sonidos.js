// Sonidos sintetizados localmente: sin descargas ni grabaciones externas.
export function createEventAudio({ enabled = false, canPlay }) {
  let context, master, noise, timer, finishTimer, celebrationEnd = 0;
  const active = new Set();
  const allowed = () => enabled && canPlay() && context?.state === 'running';

  async function activate() {
    if (!enabled) return false;
    context ||= new (window.AudioContext || window.webkitAudioContext)();
    if (!master) {
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -20; limiter.ratio.value = 5;
      master = context.createGain(); master.gain.value = .65;
      master.connect(limiter); limiter.connect(context.destination);
      noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const samples = noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }
    await context.resume();
    return context.state === 'running';
  }

  function track(source, nodes, end) {
    const item = { source, nodes };
    active.add(item);
    source.onended = () => {
      active.delete(item);
      source.disconnect(); nodes.forEach(node => node.disconnect());
    };
    source.stop(end);
  }

  function noiseBurst(when, duration, volume, frequency, pan = 0) {
    const source = context.createBufferSource(), filter = context.createBiquadFilter();
    const gain = context.createGain(), stereo = context.createStereoPanner();
    source.buffer = noise; filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = .65;
    stereo.pan.value = pan;
    gain.gain.setValueAtTime(.0001, when);
    gain.gain.exponentialRampToValueAtTime(volume, when + Math.min(.015, duration * .12));
    gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
    source.connect(filter); filter.connect(gain); gain.connect(stereo); stereo.connect(master);
    source.start(when, Math.random() * Math.max(0, .9 - duration));
    track(source, [filter, gain, stereo], when + duration);
  }

  function tone(when, duration, frequency, volume, sweep = frequency) {
    const source = context.createOscillator(), gain = context.createGain();
    source.type = 'sine'; source.frequency.setValueAtTime(frequency, when);
    source.frequency.exponentialRampToValueAtTime(sweep, when + duration);
    gain.gain.setValueAtTime(.0001, when);
    gain.gain.exponentialRampToValueAtTime(volume, when + .035);
    gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
    source.connect(gain); gain.connect(master); source.start(when);
    track(source, [gain], when + duration);
  }

  function flutter() {
    if (!allowed()) return;
    // Evitar acumular aleteos si llegan muchos aportes juntos.
    if (active.size > 120) return;
    const start = context.currentTime;
    for (let i = 0; i < 9; i++) {
      noiseBurst(start + i * .16, .11, .15 - i * .008, 700 + i * 75, .75 - i * .18);
      noiseBurst(start + i * .16 + .055, .07, .07, 1500, .65 - i * .15);
    }
  }

  function stop() {
    clearInterval(timer); clearTimeout(finishTimer); timer = finishTimer = undefined;
    celebrationEnd = 0;
    for (const item of active) {
      try { item.source.stop(); } catch { /* Ya terminó. */ }
      item.source.disconnect(); item.nodes.forEach(node => node.disconnect());
    }
    active.clear();
  }

  function celebrate() {
    if (!allowed() || celebrationEnd) return;
    const start = context.currentTime;
    celebrationEnd = start + 60;
    let applauseAt = start, fanfareAt = start + .1, whistleAt = start + 2;
    function schedule() {
      if (!allowed()) { stop(); return; }
      const now = context.currentTime, horizon = Math.min(now + .7, celebrationEnd);
      // No reproducir de golpe sonidos atrasados si el navegador pausa una pestaña.
      applauseAt = Math.max(applauseAt, now);
      while (applauseAt < horizon) {
        const duration = Math.min(.08 + Math.random() * .09, celebrationEnd - applauseAt);
        if (duration > .02) noiseBurst(applauseAt, duration, .1 + Math.random() * .15, 1200 + Math.random() * 2300, Math.random() * 2 - 1);
        applauseAt += .035 + Math.random() * .045;
      }
      if (fanfareAt < horizon) {
        fanfareAt = Math.max(fanfareAt, now);
        [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].forEach((frequency, i) => {
          const when = fanfareAt + i * .18;
          const duration = Math.min(.38, celebrationEnd - when);
          if (duration > .05) tone(when, duration, frequency, .055);
        });
        fanfareAt += 8;
      }
      if (whistleAt < horizon) {
        whistleAt = Math.max(whistleAt, now);
        const duration = Math.min(.9, celebrationEnd - whistleAt);
        if (duration > .05) tone(whistleAt, duration, 900, .035, 1500);
        whistleAt += 6 + Math.random() * 3;
      }
    }
    schedule();
    timer = setInterval(schedule, 250);
    finishTimer = setTimeout(stop, 60000);
  }

  function setEnabled(value) { enabled = value; if (!value) stop(); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  addEventListener('pagehide', stop);
  return { activate, setEnabled, flutter, celebrate, stop };
}
